import { Router } from 'express';
import { config } from '../config.js';
import { User, LoginAttempt } from '../models/index.js';
import { requireAuth, signToken, publicUser, loadUser } from '../middleware/auth.js';
import { applyTeamCourses } from '../services/progress.js';
import { registrationUpload } from '../services/files.js';
import { readRegistration, createStudent } from '../services/registration.js';
import { getSettings } from '../services/settings.js';
import { audit } from '../services/audit.js';
import { checkPassword, hashPassword } from '../utils/password.js';
import { fail, invalid, str } from '../utils/http.js';

const router = Router();

router.post('/login', async (req, res) => {
  const email = str(req.body.email).toLowerCase();
  const password = String(req.body.password ?? '');
  const ip = String(req.ip || '').slice(0, 45);

  const fails = await LoginAttempt.countDocuments({ email, ip, createdAt: { $gt: new Date(Date.now() - 15 * 60 * 1000) } });
  if (fails >= config.loginMaxAttempts) fail(429, 'Too many failed attempts. Please wait 15 minutes and try again.');

  const u = await User.findOne({ email }).select('+passwordHash +tokenVersion');
  if (!u || !(await checkPassword(password, u.passwordHash))) {
    await LoginAttempt.create({ email, ip });
    fail(401, 'That email and password do not match.');
  }
  if (u.accountStatus === 'suspended') fail(403, 'Your account is suspended. Please contact your administrator.');
  if (!u.active) fail(403, 'Your account is deactivated. Please contact your administrator.');

  await LoginAttempt.deleteMany({ email });
  u.lastLoginAt = new Date();
  await u.save();
  await applyTeamCourses(u._id);

  const full = await loadUser(u._id);
  res.json({ token: signToken(u), user: publicUser(full) });
});

/**
 * Public self-registration. Creates the student's account with a PENDING application:
 * they can sign in and follow their status, but course content stays locked until
 * the Department Head approves the registration.
 */
router.post('/register', registrationUpload, async (req, res) => {
  const settings = await getSettings();
  if (settings.registration.allowSelfRegistration === false) fail(403, 'Self-registration is closed. Please contact the registrar.');

  // Simple abuse protection: at most 10 registrations per IP address every 15 minutes.
  const ip = String(req.ip || '').slice(0, 45);
  const key = '__register__';
  if ((await LoginAttempt.countDocuments({ email: key, ip })) >= 10) fail(429, 'Too many registrations from this connection. Please wait 15 minutes and try again.');

  const { data, errors, files } = await readRegistration(req, { mode: 'self' });
  if (errors.length) invalid(errors);
  await LoginAttempt.create({ email: key, ip });
  const user = await createStudent(req, {
    data, files, source: 'self', passwordHash: await hashPassword(data.password), mustChangePassword: false,
  });
  const full = await loadUser(user._id);
  res.status(201).json({
    message: 'Thank you — your registration has been submitted. You will be notified when your department has reviewed it.',
    token: signToken(user),
    user: publicUser(full),
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// Tokens are stateless; the client simply forgets the token. Kept for symmetry.
router.post('/logout', (req, res) => res.json({ ok: true }));

router.post('/password', requireAuth, async (req, res) => {
  const current = String(req.body.current ?? '');
  const next = String(req.body.new ?? '');
  const confirm = String(req.body.confirm ?? '');
  const u = await User.findById(req.user._id).select('+passwordHash +tokenVersion');

  const errors = [];
  if (!(await checkPassword(current, u.passwordHash))) errors.push('Your current password is not correct.');
  if (next.length < 8) errors.push('The new password must be at least 8 characters.');
  if (next !== confirm) errors.push('The two new passwords do not match.');
  if (next !== '' && next === current) errors.push('Choose a password different from the current one.');
  if (errors.length) invalid(errors);

  u.passwordHash = await hashPassword(next);
  u.mustChangePassword = false;
  u.tokenVersion = (u.tokenVersion || 0) + 1; // signs out other devices
  await u.save();
  await audit(req, 'account.password_changed', { targetType: 'User', targetId: u._id, targetLabel: u.name });
  const full = await loadUser(u._id);
  res.json({ message: 'Your password has been changed.', token: signToken(u), user: publicUser(full) });
});

export default router;
