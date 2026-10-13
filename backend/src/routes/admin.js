/** People and teams, for administrators. */
import { Router } from 'express';
import { User, Team, Enrolment, TeamCourse, ROLES } from '../models/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { applyTeamCourses } from '../services/progress.js';
import { memoryUpload } from '../services/files.js';
import { parseCsv, detectDelimiter } from '../utils/csv.js';
import { hashPassword, randomPassword } from '../utils/password.js';
import { fail, invalid, findOr404, str, bool, isId, plural, isEmail, sameId, toId } from '../utils/http.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const teamList = () => Team.find({}, 'name campaign').sort({ name: 1 }).lean();
const leadList = () => User.find({ active: true, role: { $in: ['team_lead', 'admin', 'trainer'] } }, 'name role').sort({ name: 1 }).lean();

// ---- people -------------------------------------------------------------------

router.get('/users', async (req, res) => {
  const q = str(req.query.q);
  const role = str(req.query.role);
  const team = str(req.query.team);
  const status = str(req.query.status) || 'active';
  const filter = {};
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { employeeId: rx }];
  }
  if (ROLES[role]) filter.role = role;
  if (isId(team)) filter.team = team;
  if (status === 'active') filter.active = true;
  else if (status === 'inactive') filter.active = false;

  const users = await User.find(filter).populate('team', 'name').sort({ name: 1 }).lean();
  const stats = await Enrolment.aggregate([
    { $match: { user: { $in: users.map((u) => u._id) } } },
    { $group: { _id: '$user', n: { $sum: 1 }, done: { $sum: { $cond: [{ $ne: ['$completedAt', null] }, 1, 0] } } } },
  ]);
  const s = new Map(stats.map((r) => [String(r._id), r]));
  res.json({
    users: users.map((u) => ({
      _id: u._id, name: u.name, email: u.email, role: u.role, employeeId: u.employeeId, active: u.active,
      lastLoginAt: u.lastLoginAt, teamName: u.team?.name || null,
      enrolments: s.get(String(u._id))?.n || 0, completed: s.get(String(u._id))?.done || 0,
    })),
    teams: await teamList(),
  });
});

router.get('/user-form', async (req, res) => res.json({ teams: await teamList() }));

router.get('/users/:id', async (req, res) => {
  const user = await findOr404(User, req.params.id, 'This person does not exist.');
  res.json({ user, teams: await teamList() });
});

/** Create (existing = null) or update a person. */
async function saveUser(req, res, existing) {
  const b = req.body || {};
  const data = {
    name: str(b.name, 120),
    email: str(b.email, 190).toLowerCase(),
    role: ROLES[b.role] ? b.role : 'agent',
    team: isId(String(b.team || '')) ? toId(b.team) : null,
    employeeId: str(b.employeeId, 50) || null,
    active: existing ? bool(b.active) : true,
  };
  const password = String(b.password ?? '');
  const errors = [];
  if (!data.name) errors.push('Enter a name.');
  if (!isEmail(data.email)) errors.push('Enter a valid email address.');
  else if (await User.exists({ email: data.email, _id: { $ne: existing?._id || null } })) errors.push('Another person already uses that email address.');
  if (password !== '' && password.length < 8) errors.push('Passwords must be at least 8 characters.');
  if (data.team && !(await Team.exists({ _id: data.team }))) data.team = null;
  if (existing && sameId(existing, req.user) && (data.role !== 'admin' || !data.active)) {
    errors.push('You cannot remove your own administrator role or deactivate your own account.');
  }
  if (errors.length) invalid(errors);

  let generated = null;
  let user;
  if (existing) {
    Object.assign(existing, data);
    if (password !== '') {
      existing.passwordHash = await hashPassword(password);
      existing.mustChangePassword = true;
      existing.tokenVersion = (existing.tokenVersion || 0) + 1;
    }
    if (!data.active) existing.tokenVersion = (existing.tokenVersion || 0) + 1;
    user = await existing.save();
  } else {
    const plain = password || (generated = randomPassword());
    user = await User.create({ ...data, passwordHash: await hashPassword(plain), mustChangePassword: true });
  }
  const added = await applyTeamCourses(user._id);

  const messages = [];
  if (generated) {
    messages.push({ type: 'success', message: `Account created for ${data.name}. Temporary password: ${generated} — share it privately; they will be asked to change it at first sign-in.` });
  } else {
    messages.push({ type: 'success', message: `Saved ${data.name}.${password !== '' ? ' They will be asked to change the new password at next sign-in.' : ''}` });
  }
  if (added) messages.push({ type: 'info', message: `${plural(added, 'team course')} assigned automatically.` });
  res.status(existing ? 200 : 201).json({ user: { _id: user._id, name: user.name, email: user.email }, temporaryPassword: generated, messages });
}

router.post('/users', async (req, res) => saveUser(req, res, null));

router.put('/users/:id', async (req, res) => {
  const existing = await User.findById(req.params.id).select('+tokenVersion').catch(() => null);
  if (!existing) fail(404, 'This person does not exist.');
  await saveUser(req, res, existing);
});

/**
 * CSV columns (header row required): name, email, role, team, campaign, employee_id, password
 * Only name and email are required. Unknown teams are created.
 */
router.post('/users/import', memoryUpload.single('csv'), async (req, res) => {
  if (!req.file) invalid(['Choose a CSV file to upload.']);
  const text = req.file.buffer.toString('utf8').replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const rows = parseCsv(text, detectDelimiter(firstLine));
  const header = (rows.shift() || []).map((h) => h.trim().toLowerCase());
  if (!header.includes('name') || !header.includes('email')) {
    invalid(['The first row must contain column names, including “name” and “email”.']);
  }

  const results = [];
  let line = 1;
  for (const row of rows) {
    line++;
    if (!row.some((v) => v.trim() !== '')) continue;
    const r = Object.fromEntries(header.map((h, i) => [h, (row[i] ?? '').trim()]));
    const email = (r.email || '').toLowerCase();
    const name = r.name || '';
    const result = { line, name, email, status: '', password: null };
    if (!name || !isEmail(email)) {
      results.push({ ...result, status: 'Skipped: missing name or invalid email' });
      continue;
    }
    let teamId = null;
    if (r.team) {
      const t = (await Team.findOne({ name: r.team }, '_id')) || (await Team.create({ name: r.team.slice(0, 120), campaign: r.campaign || null }));
      teamId = t._id;
    }
    const roleKey = (r.role || '').toLowerCase().replace(/[ -]/g, '_');
    const role = ROLES[roleKey] ? roleKey : 'agent';

    const existing = await User.findOne({ email });
    if (existing) {
      existing.name = name.slice(0, 120);
      existing.role = role;
      if (teamId) existing.team = teamId;
      if (r.employee_id) existing.employeeId = r.employee_id.slice(0, 50);
      await existing.save();
      await applyTeamCourses(existing._id);
      results.push({ ...result, status: 'Updated' });
    } else {
      const pw = r.password && r.password.length >= 8 ? r.password : randomPassword();
      const u = await User.create({
        name: name.slice(0, 120), email, role, team: teamId, employeeId: (r.employee_id || '').slice(0, 50) || null,
        active: true, passwordHash: await hashPassword(pw), mustChangePassword: true,
      });
      await applyTeamCourses(u._id);
      results.push({ ...result, status: 'Created', password: pw });
    }
  }
  res.json({ results });
});

// ---- teams --------------------------------------------------------------------

router.get('/teams', async (req, res) => {
  const teams = await Team.find().populate('lead', 'name').sort({ name: 1 }).lean();
  const ids = teams.map((t) => t._id);
  const [members, courses] = await Promise.all([
    User.aggregate([{ $match: { active: true, team: { $in: ids } } }, { $group: { _id: '$team', n: { $sum: 1 } } }]),
    TeamCourse.aggregate([{ $match: { team: { $in: ids } } }, { $group: { _id: '$team', n: { $sum: 1 } } }]),
  ]);
  const m = new Map(members.map((r) => [String(r._id), r.n]));
  const c = new Map(courses.map((r) => [String(r._id), r.n]));
  res.json({
    teams: teams.map((t) => ({
      _id: t._id, name: t.name, campaign: t.campaign, leadName: t.lead?.name || null,
      members: m.get(String(t._id)) || 0, courses: c.get(String(t._id)) || 0,
    })),
  });
});

router.get('/team-form', async (req, res) => res.json({ leads: await leadList() }));

router.get('/teams/:id', async (req, res) => {
  const team = await findOr404(Team, req.params.id, 'This team does not exist.');
  const members = await User.find({ team: team._id }, 'name email role').sort({ name: 1 }).lean();
  res.json({ team, leads: await leadList(), members });
});

function teamData(b) {
  return {
    name: str(b.name, 120),
    campaign: str(b.campaign, 120) || null,
    lead: isId(String(b.lead || '')) ? toId(b.lead) : null,
  };
}

router.post('/teams', async (req, res) => {
  const data = teamData(req.body);
  if (!data.name) invalid(['Enter a team name.']);
  const team = await Team.create(data);
  res.status(201).json({ team, message: `Team “${data.name}” saved.` });
});

router.put('/teams/:id', async (req, res) => {
  const team = await findOr404(Team, req.params.id, 'This team does not exist.');
  const data = teamData(req.body);
  if (!data.name) invalid(['Enter a team name.']);
  Object.assign(team, data);
  await team.save();
  res.json({ team, message: `Team “${data.name}” saved.` });
});

router.delete('/teams/:id', async (req, res) => {
  const team = await findOr404(Team, req.params.id, 'This team does not exist.');
  await User.updateMany({ team: team._id }, { team: null });
  await TeamCourse.deleteMany({ team: team._id });
  await Team.deleteOne({ _id: team._id });
  res.json({ message: `Team “${team.name}” deleted. Its members are now without a team; their courses and progress are kept.` });
});

export default router;
