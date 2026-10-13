import { Router } from 'express';
import { config } from '../config.js';
import { User, LoginAttempt } from '../models/index.js';
import { requireAuth, signToken, publicUser, loadUser } from '../middleware/auth.js';
import { applyTeamCourses } from '../services/progress.js';
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
  if (!u.active) fail(403, 'Your account is deactivated. Please contact your administrator.');

  await LoginAttempt.deleteMany({ email });
  u.lastLoginAt = new Date();
  await u.save();
  await applyTeamCourses(u._id);

  const full = await loadUser(u._id);
  res.json({ token: signToken(u), user: publicUser(full) });
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
  const full = await loadUser(u._id);
  res.json({ message: 'Your password has been changed.', token: signToken(u), user: publicUser(full) });
});

export default router;
