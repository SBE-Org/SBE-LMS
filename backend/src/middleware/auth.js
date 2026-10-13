import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User, Team } from '../models/index.js';
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

/** Loads the active user for an id, with team name. */
export async function loadUser(id) {
  const u = await User.findOne({ _id: id, active: true }).select('+tokenVersion').populate('team', 'name').lean();
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
  employeeId: u.employeeId || null,
  mustChangePassword: !!u.mustChangePassword,
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

/** True if `viewer` may see records of the person with id `ownerId`. */
export async function canSeePerson(viewer, ownerId) {
  if (String(viewer._id) === String(ownerId) || isStaff(viewer)) return true;
  if (!hasRole(viewer, 'team_lead')) return false;
  const owner = await User.findById(ownerId, 'team').lean();
  const visible = await visibleTeamIds(viewer);
  return !!owner?.team && visible.includes(String(owner.team));
}
