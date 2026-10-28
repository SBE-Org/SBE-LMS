/**
 * Student registration records and the approval workflow.
 *
 *   /api/registration/me …        the signed-in student's own application
 *   /api/registrations …          registrars, Department Heads and administrators (scoped by department)
 *
 * Every permission is checked here on the server; the frontend only hides buttons.
 */
import { Router } from 'express';
import { User, Department, STUDENT_ROLE } from '../models/index.js';
import {
  requireAuth, requireRole, hasRole, registrationScope, inScope, isStudent,
} from '../middleware/auth.js';
import { registrationUpload, sendStoredFile, deleteBucketFile } from '../services/files.js';
import { getBucket } from '../db.js';
import {
  readRegistration, createStudent, applyRegistrationEdits, decide, decisionRights, registrationFilter, missingFields,
  STATUS_LABELS, GENDERS, REG_BUCKET,
} from '../services/registration.js';
import { getSettings, publicRegistration } from '../services/settings.js';
import { audit } from '../services/audit.js';
import { notifyDepartmentHeads } from '../services/notify.js';
import { hashPassword, randomPassword } from '../utils/password.js';
import { toCsv } from '../utils/csv.js';
import { csvDateTime, today } from '../utils/dates.js';
import { fail, invalid, str, bool, intOr, isId } from '../utils/http.js';

const router = Router();

const departmentsFor = async (scope) => {
  const filter = { active: true };
  if (scope !== null) filter._id = { $in: scope };
  return Department.find(filter, 'name code programs').sort({ name: 1 }).lean();
};

/** Full application as shown to staff and to the student. Sensitive details only go to authorized viewers. */
function shape(u, settings, { forStaff = false } = {}) {
  const reg = u.registration || {};
  const docUrl = (d) => (forStaff ? `/registrations/${u._id}/documents/${d._id}` : `/registration/me/documents/${d._id}`);
  return {
    _id: u._id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    studentId: u.employeeId,
    department: u.department?._id || u.department || null,
    departmentName: u.department?.name || null,
    accountStatus: u.accountStatus || (u.active ? 'active' : 'deactivated'),
    profile: { ...(u.profile || {}), photo: undefined },
    photoUrl: u.profile?.photo?.fileId ? (forStaff ? `/registrations/${u._id}/photo` : '/registration/me/photo') : null,
    createdAt: u.createdAt,
    registration: {
      status: reg.status,
      statusLabel: STATUS_LABELS[reg.status] || null,
      source: reg.source,
      submittedAt: reg.submittedAt,
      reviewedAt: reg.reviewedAt,
      reviewedByName: reg.reviewedBy?.name || null,
      reason: reg.reason,
      createdByName: reg.createdBy?.name || null,
      termsAcceptedAt: reg.termsAcceptedAt,
      documents: (reg.documents || []).map((d) => ({
        _id: d._id, name: d.name, label: d.label, contentType: d.contentType, size: d.size, uploadedAt: d.uploadedAt, url: docUrl(d),
      })),
      history: (reg.history || []).map((h) => ({
        status: h.status, action: h.action, byName: h.byName, byRole: h.byRole, reason: h.reason, override: !!h.override, at: h.at,
      })),
    },
    missing: missingFields(u, settings),
  };
}

const loadFull = (filter) => User.findOne(filter)
  .populate('department', 'name code programs')
  .populate('registration.reviewedBy', 'name')
  .populate('registration.createdBy', 'name');

async function sendRegFile(req, res, ref, download = false) {
  if (!ref?.fileId) fail(404, 'File not found.');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  await sendStoredFile(req, res, { id: ref.fileId, name: ref.name, contentType: ref.contentType }, download, getBucket(REG_BUCKET));
}

// ---- the student's own application -------------------------------------------------

const requireStudent = (req, res, next) => {
  if (!isStudent(req.user)) fail(403, 'Only students have a registration.');
  next();
};

router.get('/registration/me', requireAuth, requireStudent, async (req, res) => {
  const [u, settings] = await Promise.all([loadFull({ _id: req.user._id }), getSettings()]);
  res.json({
    application: shape(u.toObject(), settings),
    departments: await departmentsFor(null),
    form: publicRegistration(settings),
    genders: GENDERS,
    editable: ['pending', 'correction_requested'].includes(u.registration?.status) ? 'full' : u.registration?.status === 'approved' ? 'contact' : 'none',
  });
});

/** Student corrects (and resubmits) their application, or updates contact details once approved. */
router.put('/registration/me', requireAuth, requireStudent, registrationUpload, async (req, res) => {
  const user = await User.findById(req.user._id);
  const status = user.registration?.status;
  if (status === 'rejected') fail(403, 'This registration was rejected and can no longer be changed. Please contact the registrar.');
  const mode = status === 'approved' ? 'profile' : 'student';
  const { data, errors, files } = await readRegistration(req, { mode, existing: user });
  if (errors.length) invalid(errors);
  const deptBefore = String(user.department || '');
  const changed = await applyRegistrationEdits(req, user, { data, files }, { resubmit: mode === 'student' });
  if (mode === 'student' && String(user.department || '') !== deptBefore) {
    await notifyDepartmentHeads(user.department, {
      type: 'registration', title: 'New registration to review', body: `${user.name} moved their application to your department.`, link: `/registrations/${user._id}`,
    });
  }
  res.json({
    message: mode === 'student'
      ? (status === 'correction_requested' ? 'Thank you — your corrected registration has been sent for review.' : 'Your registration was updated.')
      : changed.length ? 'Your contact details were updated.' : 'Nothing was changed.',
  });
});

router.get('/registration/me/documents/:docId', requireAuth, requireStudent, async (req, res) => {
  const u = await User.findById(req.user._id, 'registration.documents').lean();
  const doc = (u.registration?.documents || []).find((d) => String(d._id) === req.params.docId);
  await sendRegFile(req, res, doc, req.query.download === '1');
});

router.get('/registration/me/photo', requireAuth, requireStudent, async (req, res) => {
  const u = await User.findById(req.user._id, 'profile.photo').lean();
  await sendRegFile(req, res, u.profile?.photo);
});

router.delete('/registration/me/documents/:docId', requireAuth, requireStudent, async (req, res) => {
  const u = await User.findById(req.user._id);
  if (!['pending', 'correction_requested'].includes(u.registration?.status)) fail(403, 'Documents can only be removed while the application is under review.');
  const doc = u.registration.documents.id(req.params.docId);
  if (!doc) fail(404, 'Document not found.');
  const fileId = doc.fileId;
  doc.deleteOne();
  await u.save();
  await deleteBucketFile(REG_BUCKET, fileId);
  await audit(req, 'registration.document_removed', { targetType: 'User', targetId: u._id, targetLabel: u.name, details: { document: doc.name } });
  res.json({ message: 'Document removed.' });
});

// ---- staff: registrars, Department Heads, administrators -----------------------------

const staff = [requireAuth, requireRole('admin', 'registrar', 'department_head')];

/** Loads an application the user may see, or stops with 403/404. */
async function visibleApplication(req, id) {
  if (!isId(String(id))) fail(404, 'This application does not exist.');
  const u = await loadFull({ _id: id, role: STUDENT_ROLE });
  if (!u || !u.registration?.status) fail(404, 'This application does not exist.');
  if (!inScope(registrationScope(req.user), u.department)) fail(403, 'This student belongs to a department you are not assigned to.');
  return u;
}

router.get('/registrations', ...staff, async (req, res) => {
  const q = { status: str(req.query.status), department: str(req.query.department), source: str(req.query.source), q: str(req.query.q) };
  const filter = registrationFilter(req.user, q);
  const page = Math.max(1, intOr(req.query.page, 1));
  const limit = 50;
  const settings = await getSettings();
  const scope = registrationScope(req.user);
  const [rows, total, counts] = await Promise.all([
    User.find(filter).populate('department', 'name').sort({ 'registration.submittedAt': -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
    User.aggregate([
      { $match: registrationFilter(req.user, { department: q.department }) },
      { $group: { _id: '$registration.status', n: { $sum: 1 } } },
    ]),
  ]);
  res.json({
    applications: rows.map((u) => ({
      _id: u._id, name: u.name, email: u.email, phone: u.phone, studentId: u.employeeId,
      departmentName: u.department?.name || null, status: u.registration.status, statusLabel: STATUS_LABELS[u.registration.status],
      source: u.registration.source, submittedAt: u.registration.submittedAt, reviewedAt: u.registration.reviewedAt,
      documents: (u.registration.documents || []).length, missing: missingFields(u, settings),
    })),
    counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    departments: await departmentsFor(scope),
    statuses: STATUS_LABELS,
    canCreate: hasRole(req.user, 'admin', 'registrar'),
  });
});

router.get('/registrations/export', ...staff, async (req, res) => {
  const q = { status: str(req.query.status), department: str(req.query.department), source: str(req.query.source), q: str(req.query.q) };
  const rows = await User.find(registrationFilter(req.user, q)).populate('department', 'name').sort({ name: 1 }).lean();
  await audit(req, 'registration.exported', { details: { rows: rows.length, filters: q } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="student-registrations-${today()}.csv"`);
  res.send(toCsv(
    ['Name', 'Email', 'Phone', 'Student ID', 'Department', 'Program', 'Training category', 'Status', 'Source', 'Submitted', 'Reviewed', 'Reason / feedback'],
    rows.map((u) => [
      u.name, u.email, u.phone || '', u.employeeId || '', u.department?.name || '', u.profile?.program || '', u.profile?.trainingCategory || '',
      STATUS_LABELS[u.registration.status] || '', u.registration.source || '', csvDateTime(u.registration.submittedAt), csvDateTime(u.registration.reviewedAt),
      u.registration.reason || '',
    ])
  ));
});

/** Data for the registration form when a registrar fills it in for a student. */
router.get('/registrations/form', requireAuth, requireRole('admin', 'registrar'), async (req, res) => {
  const settings = await getSettings();
  res.json({ departments: await departmentsFor(registrationScope(req.user)), form: publicRegistration(settings), genders: GENDERS });
});

/** Registrar/administrator registers a student with the same form and rules as self-registration. */
router.post('/registrations', requireAuth, requireRole('admin', 'registrar'), registrationUpload, async (req, res) => {
  const { data, errors, files } = await readRegistration(req, { mode: 'staff' });
  if (errors.length) invalid(errors);
  const temporaryPassword = randomPassword();
  const user = await createStudent(req, {
    data, files, source: hasRole(req.user, 'admin') ? 'admin' : 'registrar',
    passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true,
  });
  res.status(201).json({
    application: { _id: user._id, name: user.name, email: user.email },
    temporaryPassword,
    messages: [
      { type: 'success', message: `Student account created for ${user.name}. Temporary password: ${temporaryPassword} — share it privately; they will choose their own at first sign-in.` },
      { type: 'info', message: 'The registration is pending until the Department Head reviews it.' },
    ],
  });
});

router.get('/registrations/:id', ...staff, async (req, res) => {
  const u = await visibleApplication(req, req.params.id);
  const settings = await getSettings();
  const rights = decisionRights(req.user, u);
  const canEdit = hasRole(req.user, 'admin', 'registrar');
  res.json({
    application: shape(u.toObject(), settings, { forStaff: true }),
    canDecide: rights.allowed,
    decisionNeedsOverride: !!rights.override,
    decisionBlockedReason: rights.allowed ? null : rights.reason,
    canEdit,
    departments: canEdit ? await departmentsFor(registrationScope(req.user)) : [],
    form: publicRegistration(settings),
    genders: GENDERS,
  });
});

/** Registrar/administrator corrects permitted student information (audited). */
router.put('/registrations/:id', requireAuth, requireRole('admin', 'registrar'), registrationUpload, async (req, res) => {
  const found = await visibleApplication(req, req.params.id);
  const user = await User.findById(found._id);
  const { data, errors, files } = await readRegistration(req, { mode: 'staff', existing: user });
  if (user.registration.status === 'approved' && data.department && String(data.department) !== String(user.department) && !hasRole(req.user, 'admin')) {
    errors.push('This student is already approved. Only an administrator can move them to another department.');
  }
  if (errors.length) invalid(errors);
  const resubmit = bool(req.body.resubmit) && user.registration.status === 'correction_requested';
  const changed = await applyRegistrationEdits(req, user, { data, files }, { resubmit });
  res.json({ message: changed.length || resubmit ? `Saved${resubmit ? ' and sent back for review' : ''}. Changes are recorded in the history.` : 'Nothing was changed.' });
});

router.post('/registrations/:id/decision', ...staff, async (req, res) => {
  await visibleApplication(req, req.params.id);
  const saved = await decide(req, req.params.id, {
    decision: str(req.body.decision), reason: req.body.reason, override: req.body.override,
  });
  res.json({ message: `Registration ${STATUS_LABELS[saved.registration.status].toLowerCase()}. The student has been notified.`, status: saved.registration.status });
});

router.get('/registrations/:id/documents/:docId', ...staff, async (req, res) => {
  const u = await visibleApplication(req, req.params.id);
  const doc = (u.registration.documents || []).find((d) => String(d._id) === req.params.docId);
  await audit(req, 'registration.document_viewed', { targetType: 'User', targetId: u._id, targetLabel: u.name, details: { document: doc?.name || null } });
  await sendRegFile(req, res, doc, req.query.download === '1');
});

router.get('/registrations/:id/photo', ...staff, async (req, res) => {
  const u = await visibleApplication(req, req.params.id);
  await sendRegFile(req, res, u.profile?.photo);
});

router.delete('/registrations/:id/documents/:docId', requireAuth, requireRole('admin', 'registrar'), async (req, res) => {
  const found = await visibleApplication(req, req.params.id);
  const u = await User.findById(found._id);
  if (u.registration.status === 'approved' && !hasRole(req.user, 'admin')) fail(403, 'Documents of approved students can only be removed by an administrator.');
  const doc = u.registration.documents.id(req.params.docId);
  if (!doc) fail(404, 'Document not found.');
  const { fileId, name } = doc;
  doc.deleteOne();
  await u.save();
  await deleteBucketFile(REG_BUCKET, fileId);
  await audit(req, 'registration.document_removed', { targetType: 'User', targetId: u._id, targetLabel: u.name, department: u.department, details: { document: name } });
  res.json({ message: 'Document removed.' });
});

export default router;
