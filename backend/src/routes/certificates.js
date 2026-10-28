import { Router } from 'express';
import { Certificate, Course, Enrolment, ISSUED } from '../models/index.js';
import {
  requireAuth, canSeePerson, hasRole, canAuthorizeCertificates, assignedDepartmentIds, registrationScope,
} from '../middleware/auth.js';
import { getSettings, publicBranding } from '../services/settings.js';
import { audit } from '../services/audit.js';
import { notify } from '../services/notify.js';
import { notifyTalentPool } from '../services/integration.js';
import { fail, str, isId, toId } from '../utils/http.js';

const router = Router();

const statusOf = (c) => c.status || 'issued';

async function find(code) {
  const c = await Certificate.findOne({ code: str(code).toUpperCase() })
    .populate({ path: 'course', select: 'title department', populate: { path: 'department', select: 'name' } })
    .populate('user', 'name employeeId')
    .populate('authorizedBy', 'name')
    .lean();
  if (!c || !c.course || !c.user) return null;
  let completedAt = c.completedAt;
  if (!completedAt) completedAt = (await Enrolment.findOne({ user: c.user._id, course: c.course._id }, 'completedAt').lean())?.completedAt || null;
  return {
    _id: c._id,
    code: c.code,
    status: statusOf(c),
    issuedAt: c.issuedAt,
    completedAt: completedAt || c.issuedAt,
    authorizedByName: c.authorizedBy?.name || null,
    authorizedAt: c.authorizedAt || null,
    revokedAt: c.revokedAt || null,
    userId: c.user._id,
    learnerName: c.user.name,
    employeeId: c.user.employeeId,
    courseId: c.course._id,
    courseTitle: c.course.title,
    departmentId: c.course.department?._id || null,
    departmentName: c.course.department?.name || null,
  };
}

router.get('/certificates', requireAuth, async (req, res) => {
  const certs = await Certificate.find({ user: req.user._id, ...ISSUED }).populate('course', 'title category').sort({ issuedAt: -1 }).lean();
  const pending = await Certificate.countDocuments({ user: req.user._id, status: 'pending' });
  res.json({
    certificates: certs.filter((c) => c.course).map((c) => ({
      _id: c._id, code: c.code, issuedAt: c.issuedAt, title: c.course.title, category: c.course.category,
    })),
    pending,
  });
});

/**
 * Certificate (preview, PDF, print). Learners only see issued certificates; staff who can see
 * the learner also see pending ones (marked as such) so they can check them before authorizing.
 */
router.get('/certificates/:code', requireAuth, async (req, res) => {
  const cert = await find(req.params.code);
  if (!cert) fail(404, 'Certificate not found.');
  if (!(await canSeePerson(req.user, cert.userId))) fail(403, 'You do not have permission to open this certificate.');
  const own = String(cert.userId) === String(req.user._id);
  if (own && cert.status === 'pending') fail(403, 'This certificate is waiting for authorization by your department. You will be notified when it is issued.', { code: 'CERTIFICATE_PENDING' });
  if (own && cert.status === 'revoked') fail(410, 'This certificate has been revoked.');
  const settings = await getSettings();
  const branding = publicBranding(settings);
  res.json({ certificate: cert, company: branding.institutionName, appName: branding.appName, branding });
});

/** Public: anyone can check that a certificate number is genuine. Shows only what a verifier needs. */
router.get('/verify', async (req, res) => {
  const code = str(req.query.code);
  const cert = code ? await find(code) : null;
  const valid = !!cert && cert.status === 'issued';
  res.json({
    code,
    valid,
    revoked: !!cert && cert.status === 'revoked',
    certificate: valid ? {
      code: cert.code, learnerName: cert.learnerName, courseTitle: cert.courseTitle, issuedAt: cert.issuedAt,
      departmentName: cert.departmentName,
    } : null,
  });
});

// ---- authorization by the issuing authority -----------------------------------------

/** Course filter for certificates the user may authorize. null = all. */
function authorityCourseScope(user) {
  if (hasRole(user, 'admin')) return null;
  if (hasRole(user, 'department_head')) return { department: { $in: assignedDepartmentIds(user).map(toId) } };
  if (user.permissions?.authorizeCertificates) {
    if (hasRole(user, 'trainer')) return null;
    const scope = registrationScope(user);
    return scope === null ? null : { department: { $in: scope.map(toId) } };
  }
  return false;
}

router.get('/certificate-approvals', requireAuth, async (req, res) => {
  const scope = authorityCourseScope(req.user);
  if (scope === false) fail(403, 'You do not have permission to authorize certificates.');
  const status = ['pending', 'issued', 'revoked'].includes(req.query.status) ? req.query.status : 'pending';
  const courseIds = scope === null ? null : (await Course.find(scope, '_id').lean()).map((c) => c._id);
  const filter = status === 'issued' ? { ...ISSUED } : { status };
  if (courseIds) filter.course = { $in: courseIds };
  const rows = await Certificate.find(filter)
    .populate({ path: 'course', select: 'title department', populate: { path: 'department', select: 'name' } })
    .populate('user', 'name email employeeId')
    .populate('authorizedBy', 'name')
    .sort({ completedAt: -1, issuedAt: -1 })
    .limit(300)
    .lean();
  res.json({
    status,
    certificates: rows.filter((c) => c.course && c.user).map((c) => ({
      _id: c._id, code: c.code, status: statusOf(c), learnerName: c.user.name, learnerEmail: c.user.email, studentId: c.user.employeeId,
      userId: c.user._id, courseTitle: c.course.title, departmentName: c.course.department?.name || null,
      completedAt: c.completedAt, issuedAt: c.issuedAt, authorizedByName: c.authorizedBy?.name || null,
    })),
    canRevoke: hasRole(req.user, 'admin'),
  });
});

async function loadForAuthority(req) {
  if (!isId(req.params.id)) fail(404, 'Certificate not found.');
  const cert = await Certificate.findById(req.params.id).populate('course', 'title department').populate('user', 'name');
  if (!cert || !cert.course || !cert.user) fail(404, 'Certificate not found.');
  if (!canAuthorizeCertificates(req.user, cert.course.department)) fail(403, 'You cannot authorize certificates for this course.');
  return cert;
}

router.post('/certificate-approvals/:id/authorize', requireAuth, async (req, res) => {
  const cert = await loadForAuthority(req);
  // The completion requirements must (still) be met.
  const enrol = await Enrolment.findOne({ user: cert.user._id, course: cert.course._id }, 'completedAt').lean();
  if (!enrol?.completedAt) fail(422, 'This learner has not completed the course, so the certificate cannot be issued.');
  const now = new Date();
  const updated = await Certificate.findOneAndUpdate(
    { _id: cert._id, status: 'pending' },
    { status: 'issued', issuedAt: now, authorizedBy: req.user._id, authorizedAt: now },
    { new: true }
  );
  if (!updated) fail(409, 'This certificate is not waiting for authorization (it may already be issued).');
  await audit(req, 'certificate.authorized', { targetType: 'Certificate', targetId: cert._id, targetLabel: `${cert.code} · ${cert.user.name}`, department: cert.course.department, details: { course: cert.course.title } });
  await notify(cert.user._id, { type: 'certificate', title: 'Your certificate is ready', body: `Your certificate for “${cert.course.title}” has been issued.`, link: `/certificates/${cert.code}` });
  notifyTalentPool(cert.user._id);
  res.json({ message: `Certificate issued to ${cert.user.name}.` });
});

/** Administrators can withdraw a certificate (e.g. issued in error). The record is kept and the verify page shows it as revoked. */
router.post('/certificate-approvals/:id/revoke', requireAuth, async (req, res) => {
  if (!hasRole(req.user, 'admin')) fail(403, 'Only administrators can revoke certificates.');
  const cert = await loadForAuthority(req);
  const reason = str(req.body?.reason, 500);
  if (reason.length < 5) fail(422, 'Give the reason for revoking this certificate.');
  if (cert.status === 'revoked') fail(409, 'This certificate is already revoked.');
  cert.status = 'revoked';
  cert.revokedBy = req.user._id;
  cert.revokedAt = new Date();
  cert.revokeReason = reason;
  await cert.save();
  await audit(req, 'certificate.revoked', { targetType: 'Certificate', targetId: cert._id, targetLabel: `${cert.code} · ${cert.user.name}`, department: cert.course.department, details: { reason } });
  notifyTalentPool(cert.user._id);
  res.json({ message: 'Certificate revoked.' });
});

export default router;
