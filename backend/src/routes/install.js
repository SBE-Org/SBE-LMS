import { Router } from 'express';
import { config } from '../config.js';
import { User } from '../models/index.js';
import { signToken, publicUser, loadUser } from '../middleware/auth.js';
import { createAdmin, seedDemo } from '../seed/demoData.js';
import { fail, invalid, str, bool, isEmail } from '../utils/http.js';

/** First-run setup: creates the first administrator (and optional demo data). */
const router = Router();

const installed = async () => !!(await User.exists({}));

router.get('/', async (req, res) => {
  res.json({ installed: !!(await installed()) });
});

router.post('/', async (req, res) => {
  if (await installed()) fail(404, 'The platform is already installed.');
  const name = str(req.body.name, 120);
  const email = str(req.body.email).toLowerCase();
  const password = String(req.body.password ?? '');
  const errors = [];
  if (!name) errors.push('Enter the administrator name.');
  if (!isEmail(email)) errors.push('Enter a valid email address.');
  if (password.length < 8) errors.push('The password must be at least 8 characters.');
  if (errors.length) invalid(errors);

  const admin = await createAdmin(name, email, password);
  if (bool(req.body.demo)) await seedDemo(admin._id);
  const full = await loadUser(admin._id);
  res.status(201).json({
    message: `Installation complete. Welcome to ${config.appName}!`,
    token: signToken(admin),
    user: publicUser(full),
  });
});

export default router;
