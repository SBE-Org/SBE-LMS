/**
 * Student registration: one set of fields and validation rules shared by
 * self-registration, registrar-created accounts and later corrections, plus the
 * approval workflow (pending → approved / rejected / correction requested).
 */
import { User, Department, STUDENT_ROLE, nextSequence } from '../models/index.js';
import { hasRole, registrationScope, reviewScope, inScope } from '../middleware/auth.js';
import { getSettings } from './settings.js';
import { audit } from './audit.js';
import { notify, notifyDepartmentHeads } from './notify.js';
import { checkBufferUpload, storeBuffer, deleteBucketFile } from './files.js';
import { applyTeamCourses } from './progress.js';
import { fail, str, bool, arr, isEmail, isId, toId } from '../utils/http.js';
import { isYmd, today } from '../utils/dates.js';

export const REG_BUCKET = 'registrationFiles';
export const STATUS_LABELS = {
  pending: 'Pending review',
  correction_requested: 'Correction requested',
  approved: 'Approved',
  rejected: 'Rejected',
};
export const GENDERS = { female: 'Female', male: 'Male', other: 'Other', prefer_not_to_say: 'Prefer not to say' };

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Accepts +251 911 234567, 0911-234-567, (011) 123 4567… : 7–15 digits. */
export function isPhone(v) {
  const s = String(v || '').trim();
  if (!/^\+?[0-9\s\-().]{7,25}$/.test(s)) return false;
  const digits = s.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15;
}

/** Fields a student may still change after approval (contact details only). */
export const SELF_EDITABLE_AFTER_APPROVAL = ['phone', 'address', 'emergencyContact', 'photo'];

/**
 * Reads and validates registration fields.
 *
 * mode:
 *   'self'     — public self-registration (needs password + terms)
 *   'staff'    — registrar/admin creating or correcting a student (no password; consent confirmation on create)
 *   'student'  — a student correcting their own pending/returned application
 *   'profile'  — an approved student updating permitted contact details only
 *
 * Returns { data, errors, files: { photo, documents: [{file, label}] } } without saving anything.
 */
export async function readRegistration(req, { mode, existing = null }) {
  const b = req.body || {};
  const settings = await getSettings();
  const cfg = settings.registration.fields;
  const errors = [];
  const isNew = !existing;
  const limited = mode === 'profile';
  const allowed = (key) => !limited || SELF_EDITABLE_AFTER_APPROVAL.includes(key);
  const state = (key) => cfg[key] || 'off';
  const on = (key) => state(key) !== 'off' && allowed(key);
  const required = (key) => state(key) === 'required';
  const prev = existing?.profile || {};
  const data = { profile: {} };

  if (!limited) {
    data.name = str(b.name, 120);
    data.email = str(b.email, 190).toLowerCase();
    if (!data.name) errors.push('Enter the full legal name.');
    else if (data.name.split(/\s+/).length < 2) errors.push('Enter the full name (first and last name).');
    if (!isEmail(data.email)) errors.push('Enter a valid email address.');
    else if (await User.exists({ email: data.email, _id: { $ne: existing?._id || null } })) {
      errors.push('An account with this email address already exists. Sign in instead, or use a different email.');
    }

    // Department: required, must be active, and (for staff) inside their scope.
    const deptId = str(b.department);
    const dept = isId(deptId) ? await Department.findOne({ _id: deptId, active: true }).lean() : null;
    if (!dept) errors.push('Choose a department.');
    else if (mode === 'staff' && !inScope(registrationScope(req.user), dept._id)) {
      errors.push('You can only register students in the departments assigned to you.');
    } else data.department = dept._id;

    // Program: must be one the department offers, when it lists any.
    if (on('program')) {
      const program = str(b.program, 160);
      if (program && dept?.programs?.length && !dept.programs.includes(program)) errors.push('Choose a program offered by the selected department.');
      if (!program && required('program')) errors.push('Choose a program.');
      data.profile.program = program || null;
    }
    if (on('trainingCategory')) {
      const v = str(b.trainingCategory, 120);
      if (!v && required('trainingCategory')) errors.push('Enter the training category.');
      data.profile.trainingCategory = v || null;
    }
    if (on('dateOfBirth')) {
      const v = str(b.dateOfBirth);
      if (v && (!isYmd(v) || v >= today() || v < '1900-01-01')) errors.push('Enter a valid date of birth.');
      else if (!v && required('dateOfBirth')) errors.push('Enter the date of birth.');
      data.profile.dateOfBirth = v || null;
    }
    if (on('gender')) {
      const v = str(b.gender);
      if (v && !GENDERS[v]) errors.push('Choose a gender from the list.');
      else if (!v && required('gender')) errors.push('Choose a gender.');
      data.profile.gender = GENDERS[v] ? v : null;
    }
    if (on('educationLevel')) {
      const v = str(b.educationLevel, 120);
      if (!v && required('educationLevel')) errors.push('Enter the highest education level.');
      data.profile.educationLevel = v || null;
    }
    if (on('qualifications')) {
      const v = str(b.qualifications, 1000);
      if (!v && required('qualifications')) errors.push('Enter the qualifications.');
      data.profile.qualifications = v || null;
    }
  }

  if (on('phone')) {
    const v = str(b.phone, 30);
    if (v && !isPhone(v)) errors.push('Enter a valid phone number (7–15 digits, for example +251 911 234567).');
    else if (!v && required('phone')) errors.push('Enter a phone number.');
    data.phone = v || null;
  }
  if (on('address')) {
    const v = str(b.address, 300);
    if (!v && required('address')) errors.push('Enter the address or location.');
    data.profile.address = v || null;
  }
  if (on('emergencyContact')) {
    const n = str(b.emergencyContactName, 120);
    const p = str(b.emergencyContactPhone, 30);
    if (p && !isPhone(p)) errors.push('Enter a valid emergency contact phone number.');
    if ((!n || !p) && required('emergencyContact')) errors.push('Enter the emergency contact name and phone number.');
    data.profile.emergencyContactName = n || null;
    data.profile.emergencyContactPhone = p || null;
  }

  // Student ID: assigned by staff (optional — one is generated on approval otherwise).
  if (mode === 'staff' && b.studentId !== undefined) {
    const sid = str(b.studentId, 50);
    if (sid && !/^[A-Za-z0-9][A-Za-z0-9\-/_.]{1,49}$/.test(sid)) errors.push('The student ID may only contain letters, numbers, - / _ and .');
    else if (sid && (await User.exists({ employeeId: sid, _id: { $ne: existing?._id || null } }))) errors.push('Another person already has this student ID.');
    data.employeeId = sid || existing?.employeeId || null;
  }

  // Password (self-registration only).
  if (mode === 'self') {
    const pw = String(b.password ?? '');
    if (pw.length < 8) errors.push('Choose a password of at least 8 characters.');
    else if (pw !== String(b.passwordConfirm ?? '')) errors.push('The two passwords do not match.');
    data.password = pw;
  }

  // Terms and privacy notice.
  if (isNew || mode === 'student') {
    if (!bool(b.termsAccepted)) {
      errors.push(mode === 'staff'
        ? 'Confirm that the student has read and accepted the terms and privacy notice.'
        : 'Please accept the terms and privacy notice.');
    }
  }

  // Duplicate registration: same name and phone already registered as a student.
  if (!limited && data.name && data.phone) {
    const dup = await User.exists({
      role: STUDENT_ROLE,
      _id: { $ne: existing?._id || null },
      phone: data.phone,
      name: new RegExp(`^${escapeRegex(data.name)}$`, 'i'),
    });
    if (dup) errors.push('A student with this name and phone number is already registered. Ask the registrar for help instead of registering again.');
  }

  // Files: validate now, store only after everything else is valid.
  const files = { photo: null, documents: [] };
  const upl = req.files || {};
  const photo = upl.photo?.[0] || null;
  if (photo) {
    if (!on('photo')) errors.push('A profile photograph is not accepted on this form.');
    else {
      try {
        files.photo = { file: photo, kind: checkBufferUpload(photo, ['png', 'jpg'], 5, 'photograph') };
      } catch (e) {
        errors.push(e.message);
      }
    }
  } else if (on('photo') && required('photo') && !prev.photo?.fileId) {
    errors.push('Add a profile photograph (PNG or JPG).');
  }

  const docs = upl.documents || [];
  const labels = arr(b.documentLabels);
  if (docs.length) {
    if (!on('documents') && !limited) errors.push('Supporting documents are not accepted on this form.');
    else if (limited) errors.push('Supporting documents can no longer be changed after approval.');
    else {
      docs.forEach((file, i) => {
        try {
          files.documents.push({ file, kind: checkBufferUpload(file, ['pdf', 'png', 'jpg'], 5, `document “${file.originalname}”`), label: str(labels[i], 120) || null });
        } catch (e) {
          errors.push(e.message);
        }
      });
    }
  } else if (on('documents') && required('documents') && !(existing?.registration?.documents || []).length) {
    errors.push('Upload at least one supporting document (PDF, PNG or JPG).');
  }
  if ((existing?.registration?.documents || []).length + files.documents.length > 10) errors.push('You can keep at most 10 documents.');

  return { data, errors, files };
}

/** Stores validated files and returns the sub-documents to save. */
export async function storeRegistrationFiles(files, uploadedBy) {
  const out = { photo: null, documents: [] };
  if (files.photo) out.photo = { ...(await storeBuffer(REG_BUCKET, files.photo.file, files.photo.kind)), uploadedBy };
  for (const d of files.documents) {
    out.documents.push({ ...(await storeBuffer(REG_BUCKET, d.file, d.kind)), label: d.label, uploadedBy });
  }
  return out;
}

const historyEntry = (req, status, action, reason = null, override = false) => ({
  status,
  action,
  by: req.user?._id || null,
  byName: req.user?.name || null,
  byRole: req.user?.role || null,
  reason,
  override,
  at: new Date(),
});

/** Required fields (per settings) still missing — "incomplete" applications. */
export function missingFields(u, settings) {
  const cfg = settings.registration.fields;
  const p = u.profile || {};
  const miss = [];
  const need = (k) => cfg[k] === 'required';
  if (!u.department) miss.push('department');
  if (need('phone') && !u.phone) miss.push('phone');
  for (const k of ['program', 'trainingCategory', 'dateOfBirth', 'gender', 'address', 'educationLevel', 'qualifications']) {
    if (need(k) && !p[k]) miss.push(k);
  }
  if (need('emergencyContact') && (!p.emergencyContactName || !p.emergencyContactPhone)) miss.push('emergencyContact');
  if (need('photo') && !p.photo?.fileId) miss.push('photo');
  if (need('documents') && !(u.registration?.documents || []).length) miss.push('documents');
  return miss;
}

/**
 * Creates a student account with a pending application.
 * Creating an account never approves the registration.
 */
export async function createStudent(req, { data, files, source, passwordHash, mustChangePassword }) {
  const stored = await storeRegistrationFiles(files, req.user?._id || null);
  const now = new Date();
  let user;
  try {
    user = await User.create({
      name: data.name,
      email: data.email,
      passwordHash,
      role: STUDENT_ROLE,
      department: data.department,
      employeeId: data.employeeId || null,
      phone: data.phone ?? null,
      profile: { ...data.profile, photo: stored.photo },
      active: true,
      accountStatus: 'active',
      mustChangePassword: !!mustChangePassword,
      registration: {
        status: 'pending',
        source,
        submittedAt: now,
        createdBy: req.user?._id || null,
        termsAcceptedAt: now,
        documents: stored.documents,
        history: [historyEntry(req, 'pending', source === 'self' ? 'submitted' : 'created_by_staff')],
      },
    });
  } catch (e) {
    // Do not leave orphaned files behind if the account could not be saved (e.g. a duplicate email race).
    await Promise.all([stored.photo, ...stored.documents].filter(Boolean).map((f) => deleteBucketFile(REG_BUCKET, f.fileId)));
    if (e?.code === 11000) fail(422, 'An account with this email address already exists.');
    throw e;
  }

  const dept = await Department.findById(data.department, 'name').lean();
  const actorReq = source === 'self' ? { ip: req.ip, user: { _id: user._id, name: user.name, role: user.role } } : req;
  await audit(actorReq, 'registration.submitted', {
    targetType: 'User', targetId: user._id, targetLabel: user.name, department: user.department,
    details: { source, department: dept?.name, documents: stored.documents.length },
  });
  await notifyDepartmentHeads(user.department, {
    type: 'registration',
    title: 'New registration to review',
    body: `${user.name} applied to ${dept?.name || 'your department'}.`,
    link: `/registrations/${user._id}`,
  });
  if (source !== 'self') {
    await notify(user._id, {
      type: 'registration',
      title: 'Your account was created',
      body: `The registrar created your account for ${dept?.name || 'your department'}. Your registration is now waiting for review.`,
      link: '/registration',
    });
  }
  return user;
}

/**
 * Applies validated edits to an application (student correction, registrar correction or
 * approved student's contact update). Returns the list of changed field names.
 */
export async function applyRegistrationEdits(req, user, { data, files }, { resubmit = false } = {}) {
  const changed = [];
  const set = (path, value) => {
    const cur = path.split('.').reduce((o, k) => (o == null ? o : o[k]), user);
    const a = cur && cur._id ? String(cur._id) : cur == null ? null : String(cur);
    const b = value == null ? null : String(value);
    if (a !== b) {
      user.set(path, value);
      changed.push(path.replace(/^profile\./, ''));
    }
  };
  for (const k of ['name', 'email', 'phone', 'department', 'employeeId']) if (k in data) set(k, data[k]);
  for (const [k, v] of Object.entries(data.profile || {})) set(`profile.${k}`, v);

  const stored = await storeRegistrationFiles(files, req.user._id);
  if (stored.photo) {
    const old = user.profile?.photo?.fileId;
    user.set('profile.photo', stored.photo);
    if (old) await deleteBucketFile(REG_BUCKET, old);
    changed.push('photo');
  }
  if (stored.documents.length) {
    user.registration.documents.push(...stored.documents);
    changed.push('documents');
  }

  const wasStatus = user.registration?.status;
  if (resubmit && ['correction_requested', 'pending'].includes(wasStatus)) {
    user.registration.status = 'pending';
    user.registration.submittedAt = new Date();
    user.registration.history.push(historyEntry(req, 'pending', wasStatus === 'correction_requested' ? 'resubmitted' : 'updated'));
  } else if (changed.length) {
    user.registration.history.push(historyEntry(req, wasStatus || 'pending', 'edited', `Changed: ${changed.join(', ')}`));
  }
  await user.save();

  if (changed.length || resubmit) {
    await audit(req, resubmit && wasStatus === 'correction_requested' ? 'registration.resubmitted' : 'registration.edited', {
      targetType: 'User', targetId: user._id, targetLabel: user.name, department: user.department,
      details: { changedFields: changed },
    });
  }
  if (resubmit && wasStatus === 'correction_requested') {
    await notifyDepartmentHeads(user.department, {
      type: 'registration',
      title: 'Corrected registration to review',
      body: `${user.name} updated their registration after your correction request.`,
      link: `/registrations/${user._id}`,
    });
  }
  return changed;
}

/** Student ID such as STU-2026-00042, unique across all people. */
export async function generateStudentId() {
  const settings = await getSettings();
  const prefix = (settings.registration.studentIdPrefix || 'STU').replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'STU';
  const year = new Date().getFullYear();
  for (let i = 0; i < 20; i++) {
    const n = await nextSequence(`studentId-${prefix}-${year}`);
    const id = `${prefix}-${year}-${String(n).padStart(5, '0')}`;
    if (!(await User.exists({ employeeId: id }))) return id;
  }
  throw new Error('Could not generate a unique student ID.');
}

export const DECISIONS = {
  approve: { status: 'approved', title: 'Registration approved', verb: 'approved' },
  reject: { status: 'rejected', title: 'Registration not approved', verb: 'rejected' },
  correction: { status: 'correction_requested', title: 'Correction requested', verb: 'returned for correction' },
};

/**
 * Who may decide on this application, and whether it counts as an administrator override.
 * Returns { allowed, override, reason }.
 */
export function decisionRights(user, student) {
  const dept = student.department?._id ?? student.department;
  const open = ['pending', 'correction_requested'].includes(student.registration?.status);
  const scope = reviewScope(user);
  let reviewer = false;
  if (hasRole(user, 'department_head')) reviewer = inScope(scope, dept);
  else if (hasRole(user, 'registrar') && user.permissions?.approveRegistrations) reviewer = inScope(scope, dept);
  if (reviewer && open) return { allowed: true, override: false };
  if (hasRole(user, 'admin')) return { allowed: true, override: true };
  if (reviewer && !open) return { allowed: false, reason: 'This application has already been decided. Only an administrator can change the decision.' };
  if (hasRole(user, 'registrar')) return { allowed: false, reason: 'Registrars cannot approve registrations unless an administrator grants that permission.' };
  return { allowed: false, reason: 'You can only review applications for the departments assigned to you.' };
}

/** Approve, reject or request a correction. All checks happen here, on the server. */
export async function decide(req, studentId, { decision, reason, override }) {
  const d = DECISIONS[decision];
  if (!d) fail(422, 'Choose approve, reject or request correction.');
  const student = await User.findOne({ _id: studentId, role: STUDENT_ROLE }).catch(() => null);
  if (!student || !student.registration?.status) fail(404, 'This application does not exist.');

  const rights = decisionRights(req.user, student);
  if (!rights.allowed) fail(403, rights.reason);
  const why = str(reason, 2000);
  if (rights.override) {
    if (!bool(override)) fail(403, 'Registration decisions belong to the Department Head. As an administrator you can override, but you must confirm the override and give a reason.', { code: 'OVERRIDE_REQUIRED' });
    if (why.length < 5) fail(422, 'Give a reason for the override (at least 5 characters).');
  }
  if (decision !== 'approve' && why.length < 5) fail(422, decision === 'reject' ? 'Give the reason for rejecting this registration.' : 'Explain what the student needs to correct.');
  const from = student.registration.status;
  if (from === d.status) fail(422, `This application is already ${STATUS_LABELS[from].toLowerCase()}.`);

  // Atomic: only one reviewer can move the application out of its current state.
  const update = {
    $set: {
      'registration.status': d.status,
      'registration.reviewedBy': req.user._id,
      'registration.reviewedAt': new Date(),
      'registration.reason': why || null,
    },
    $push: { 'registration.history': historyEntry(req, d.status, decision === 'correction' ? 'correction_requested' : d.status, why || null, rights.override) },
  };
  if (decision === 'approve' && !student.employeeId) update.$set.employeeId = await generateStudentId();
  const saved = await User.findOneAndUpdate({ _id: student._id, 'registration.status': from }, update, { new: true });
  if (!saved) fail(409, 'Someone else updated this application at the same time. Reload the page and check its status.');

  if (decision === 'approve') await applyTeamCourses(saved._id);

  await audit(req, rights.override ? 'registration.override' : `registration.${decision === 'correction' ? 'correction_requested' : d.status}`, {
    targetType: 'User', targetId: saved._id, targetLabel: saved.name, department: saved.department,
    details: { from, to: d.status, reason: why || null, override: rights.override, studentId: saved.employeeId },
  });
  const bodies = {
    approve: `Your registration was approved${saved.employeeId ? `. Your student ID is ${saved.employeeId}` : ''}. You can now access your courses.`,
    reject: `Your registration was not approved. Reason: ${why}`,
    correction: `Please update your registration: ${why}`,
  };
  await notify(saved._id, { type: 'registration', title: d.title, body: bodies[decision], link: '/registration' });
  return saved;
}

/** Mongo filter for applications visible to the user, combined with list filters. */
export function registrationFilter(user, q = {}) {
  const scope = registrationScope(user);
  const filter = { role: STUDENT_ROLE, 'registration.status': { $ne: null } };
  if (scope !== null) filter.department = { $in: scope.map(toId) };
  if (q.status && STATUS_LABELS[q.status]) filter['registration.status'] = q.status;
  if (q.department && isId(q.department)) {
    if (scope !== null && !scope.includes(q.department)) fail(403, 'You can only view the departments assigned to you.');
    filter.department = toId(q.department);
  }
  if (q.source && ['self', 'registrar', 'admin', 'import', 'legacy', 'talent_pool'].includes(q.source)) filter['registration.source'] = q.source;
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { employeeId: rx }, { phone: rx }];
  }
  return filter;
}
