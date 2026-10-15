import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User, Team, STUDENT_ROLE } from '../models/index.js';
import { fail } from '../utils/http.js';

export function signToken(user) {
  return jwt.sign({ sub: String(user._id), v: user.tokenVersion || 0 }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

/** Short-lived token for opening a lesson file in <video>, <iframe> or a download link. */
export function signFileToken(userId, lessonId) {
  return jwt.sign({ sub: String(userId), lesson: String(lessonId), purpose: 'file' }, config.jwtSecret, { expiresIn: '12h' });
}

export function verifyFileToken(token, lessonId) {
  try {
    const p = jwt.verify(String(token || ''), config.jwtSecret);
    return p.purpose === 'file' && p.lesson === String(lessonId) ? p.sub : null;
  } catch {
    return null;
  }
}

/** Loads the active user for an id, with team and department names. */
export async function loadUser(id) {
  const u = await User.findOne({ _id: id, active: true })
    .select('+tokenVersion')
    .populate('team', 'name')
    .populate('department', 'name code')
    .lean();
  return u || null;
}

/** Public shape of the signed-in user. */
export const publicUser = (u) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  team: u.team?._id || u.team || null,
  teamName: u.team?.name || null,
  department: u.department?._id || u.department || null,
  departmentName: u.department?.name || null,
  departments: (u.departments || []).map(String),
  permissions: {
    approveRegistrations: !!u.permissions?.approveRegistrations,
    authorizeCertificates: !!u.permissions?.authorizeCertificates,
  },
  employeeId: u.employeeId || null,
  mustChangePassword: !!u.mustChangePassword,
  registrationStatus: u.role === STUDENT_ROLE ? u.registration?.status || null : null,
});

/**
 * Requires a valid "Authorization: Bearer <token>" header.
 * People with a temporary password can only reach /api/auth/* until they change it.
 */
export async function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) fail(401, 'Please sign in.');
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    fail(401, 'Your session has expired. Please sign in again.');
  }
  if (payload.purpose) fail(401, 'Please sign in.');
  const u = await loadUser(payload.sub);
  if (!u || (u.tokenVersion || 0) !== payload.v) fail(401, 'Your session has expired. Please sign in again.');
  req.user = u;
  if (u.mustChangePassword && !req.originalUrl.startsWith('/api/auth/')) {
    fail(403, 'Please choose a new password before you continue.', { code: 'PASSWORD_CHANGE_REQUIRED' });
  }
  next();
}

export const hasRole = (user, ...roles) => !!user && roles.includes(user.role);
export const isStaff = (user) => hasRole(user, 'admin', 'trainer');

export const requireRole = (...roles) => (req, res, next) => {
  if (!hasRole(req.user, ...roles)) fail(403, 'You do not have permission to open this page.');
  next();
};

/**
 * Team ids (strings) whose people the user may see in reports.
 * null = every team (admin and trainer).
 */
export async function visibleTeamIds(user) {
  if (hasRole(user, 'admin', 'trainer')) return null;
  if (hasRole(user, 'team_lead')) return (await Team.find({ lead: user._id }, '_id').lean()).map((t) => String(t._id));
  return [];
}

// ---- departments and scoping --------------------------------------------------

/** Department ids (strings) assigned to a Department Head or Registrar. */
export const assignedDepartmentIds = (user) => (user?.departments || []).map((d) => String(d._id ?? d));

export const isStudent = (user) => hasRole(user, STUDENT_ROLE);

/**
 * Departments whose registration records the user may see.
 * null = all departments; [] = none.
 */
export function registrationScope(user) {
  if (hasRole(user, 'admin')) return null;
  if (hasRole(user, 'registrar')) {
    const d = assignedDepartmentIds(user);
    return d.length ? d : null; // a registrar with no departments assigned works institution-wide
  }
  if (hasRole(user, 'department_head')) return assignedDepartmentIds(user);
  return [];
}

/**
 * Departments in which the user may approve/reject registrations.
 * Department Heads: their departments. Registrars: only when an administrator granted the permission.
 * Administrators can decide anywhere, but only as a recorded override (see services/registration.js).
 */
export function reviewScope(user) {
  if (hasRole(user, 'department_head')) return assignedDepartmentIds(user);
  if (hasRole(user, 'registrar') && user.permissions?.approveRegistrations) return registrationScope(user);
  if (hasRole(user, 'admin')) return null;
  return [];
}

export const inScope = (scope, departmentId) => scope === null || (!!departmentId && scope.includes(String(departmentId._id ?? departmentId)));

/** Departments whose courses the user may build. null = all (admin, trainer). */
export function courseScope(user) {
  if (hasRole(user, 'admin', 'trainer')) return null;
  if (hasRole(user, 'department_head')) return assignedDepartmentIds(user);
  return [];
}

/** True if the user may edit this course (and its modules, lessons, quizzes and enrolments). */
export function canManageCourse(user, course) {
  const scope = courseScope(user);
  if (scope === null) return true;
  return !!course?.department && scope.includes(String(course.department._id ?? course.department));
}

/** True if the user may authorise certificates for a course in this department. */
export function canAuthorizeCertificates(user, departmentId) {
  if (hasRole(user, 'admin')) return true;
  if (hasRole(user, 'department_head')) return inScope(assignedDepartmentIds(user), departmentId);
  if (user?.permissions?.authorizeCertificates) return hasRole(user, 'trainer') || inScope(registrationScope(user), departmentId);
  return false;
}

/**
 * Report scope: null (everyone), or { teamIds, departmentIds } — people in any of them are visible.
 */
export async function visibleScope(user) {
  if (hasRole(user, 'admin', 'trainer')) return null;
  if (hasRole(user, 'department_head')) return { teamIds: [], departmentIds: assignedDepartmentIds(user) };
  if (hasRole(user, 'team_lead')) return { teamIds: await visibleTeamIds(user), departmentIds: [] };
  return { teamIds: [], departmentIds: [] };
}

/**
 * Why a learner may not use course content yet, or null when they may.
 * Only students need an approved registration; staff are never blocked here.
 */
export function learningBlock(user) {
  if (!isStudent(user)) return null;
  const st = user.registration?.status;
  if (st === 'approved') return null;
  const messages = {
    pending: 'Your registration is waiting for review by your department. You can start learning once it is approved.',
    correction_requested: 'Your department asked you to correct your registration. Open “My registration” to see what is needed.',
    rejected: 'Your registration was not approved, so course content is not available. Open “My registration” for the reason.',
  };
  return { status: st || 'pending', message: messages[st] || messages.pending };
}

/** Stops with 403 if the signed-in student is not approved yet. */
export function assertCanLearn(user) {
  const b = learningBlock(user);
  if (b) fail(403, b.message, { code: 'REGISTRATION_NOT_APPROVED', registrationStatus: b.status });
}

/** True if `viewer` may see academic records (results, certificates) of the person with id `ownerId`. */
export async function canSeePerson(viewer, ownerId) {
  if (String(viewer._id) === String(ownerId) || isStaff(viewer)) return true;
  if (hasRole(viewer, 'department_head')) {
    const owner = await User.findById(ownerId, 'department').lean();
    return !!owner?.department && assignedDepartmentIds(viewer).includes(String(owner.department));
  }
  if (!hasRole(viewer, 'team_lead')) return false;
  const owner = await User.findById(ownerId, 'team').lean();
  const visible = await visibleTeamIds(viewer);
  return !!owner?.team && visible.includes(String(owner.team));
}
