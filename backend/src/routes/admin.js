/** People, teams, departments, settings and the audit log — for administrators. */
import { Router } from 'express';
import {
  User, Team, Department, Course, Enrolment, TeamCourse, AuditLog, ROLES, STUDENT_ROLE, ACCOUNT_STATUSES,
} from '../models/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { applyTeamCourses } from '../services/progress.js';
import { memoryUpload } from '../services/files.js';
import { audit } from '../services/audit.js';
import { generateStudentId } from '../services/registration.js';
import { parseCsv, detectDelimiter } from '../utils/csv.js';
import { hashPassword, randomPassword } from '../utils/password.js';
import { fail, invalid, findOr404, str, bool, arr, intOr, isId, plural, isEmail, sameId, toId } from '../utils/http.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const teamList = () => Team.find({}, 'name campaign').sort({ name: 1 }).lean();
const leadList = () => User.find({ active: true, role: { $in: ['team_lead', 'admin', 'trainer'] } }, 'name role').sort({ name: 1 }).lean();
const departmentList = () => Department.find({}, 'name code active programs').sort({ name: 1 }).lean();
const ACCOUNT_LABELS = { active: 'Active', suspended: 'Suspended', deactivated: 'Deactivated' };

// ---- people -------------------------------------------------------------------

router.get('/users', async (req, res) => {
  const q = str(req.query.q);
  const role = str(req.query.role);
  const team = str(req.query.team);
  const department = str(req.query.department);
  const status = str(req.query.status) || 'active';
  const filter = {};
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { employeeId: rx }];
  }
  if (ROLES[role]) filter.role = role;
  if (isId(team)) filter.team = team;
  if (isId(department)) filter.$and = [{ $or: [{ department }, { departments: department }] }];
  if (status === 'active') filter.active = true;
  else if (status === 'inactive') filter.active = false;
  else if (status === 'suspended') filter.accountStatus = 'suspended';

  const users = await User.find(filter).populate('team', 'name').populate('department', 'name').sort({ name: 1 }).lean();
  const stats = await Enrolment.aggregate([
    { $match: { user: { $in: users.map((u) => u._id) } } },
    { $group: { _id: '$user', n: { $sum: 1 }, done: { $sum: { $cond: [{ $ne: ['$completedAt', null] }, 1, 0] } } } },
  ]);
  const s = new Map(stats.map((r) => [String(r._id), r]));
  res.json({
    users: users.map((u) => ({
      _id: u._id, name: u.name, email: u.email, role: u.role, employeeId: u.employeeId, active: u.active,
      accountStatus: u.accountStatus || (u.active ? 'active' : 'deactivated'),
      registrationStatus: u.role === STUDENT_ROLE ? u.registration?.status || null : null,
      lastLoginAt: u.lastLoginAt, teamName: u.team?.name || null, departmentName: u.department?.name || null,
      enrolments: s.get(String(u._id))?.n || 0, completed: s.get(String(u._id))?.done || 0,
    })),
    teams: await teamList(),
    departments: await departmentList(),
  });
});

router.get('/user-form', async (req, res) => res.json({ teams: await teamList(), departments: await departmentList(), roles: ROLES, accountStatuses: ACCOUNT_LABELS }));

router.get('/users/:id', async (req, res) => {
  const user = await findOr404(User, req.params.id, 'This person does not exist.');
  const u = user.toObject();
  if (!u.active && u.accountStatus === 'active') u.accountStatus = 'deactivated';
  res.json({ user: u, teams: await teamList(), departments: await departmentList(), roles: ROLES, accountStatuses: ACCOUNT_LABELS });
});

/** Create (existing = null) or update a person. Role and permission changes are audited. */
async function saveUser(req, res, existing) {
  const b = req.body || {};
  const role = ROLES[b.role] ? b.role : 'agent';
  // Account status: new "accountStatus", or the original "active" checkbox.
  let accountStatus = ACCOUNT_STATUSES.includes(b.accountStatus) ? b.accountStatus : null;
  if (!accountStatus) accountStatus = existing ? (bool(b.active) ? 'active' : 'deactivated') : 'active';
  const deptIds = [];
  for (const d of arr(b.departments)) if (isId(String(d)) && !deptIds.includes(String(d))) deptIds.push(String(d));
  const data = {
    name: str(b.name, 120),
    email: str(b.email, 190).toLowerCase(),
    role,
    team: b.team === undefined && existing ? existing.team : isId(String(b.team || '')) ? toId(b.team) : null,
    // Fields left out of the request keep their current value (older clients do not send them).
    department: b.department === undefined ? existing?.department ?? null : isId(String(b.department || '')) ? toId(b.department) : null,
    // Only Department Heads and Registrars carry a list of authorized departments.
    departments: !['department_head', 'registrar'].includes(role) ? []
      : b.departments === undefined ? existing?.departments ?? [] : deptIds.map(toId),
    permissions: {
      approveRegistrations: role === 'registrar' && bool(b.permApproveRegistrations ?? b.permissions?.approveRegistrations ?? existing?.permissions?.approveRegistrations),
      authorizeCertificates: ['registrar', 'trainer'].includes(role) && bool(b.permAuthorizeCertificates ?? b.permissions?.authorizeCertificates ?? existing?.permissions?.authorizeCertificates),
    },
    employeeId: b.employeeId === undefined && existing ? existing.employeeId : str(b.employeeId, 50) || null,
    accountStatus,
    active: accountStatus === 'active',
  };
  const password = String(b.password ?? '');
  const errors = [];
  if (!data.name) errors.push('Enter a name.');
  if (!isEmail(data.email)) errors.push('Enter a valid email address.');
  else if (await User.exists({ email: data.email, _id: { $ne: existing?._id || null } })) errors.push('Another person already uses that email address.');
  if (password !== '' && password.length < 8) errors.push('Passwords must be at least 8 characters.');
  if (data.team && !(await Team.exists({ _id: data.team }))) data.team = null;
  if (data.department && !(await Department.exists({ _id: data.department }))) data.department = null;
  if (data.departments.length && (await Department.countDocuments({ _id: { $in: data.departments } })) !== data.departments.length) {
    errors.push('One of the selected departments no longer exists.');
  }
  if (role === 'department_head' && !data.departments.length) errors.push('Assign at least one department to the Department Head.');
  if (!existing && role === STUDENT_ROLE && !data.department) errors.push('Choose the student’s department.');
  if (data.employeeId && data.employeeId !== existing?.employeeId && (await User.exists({ employeeId: data.employeeId, _id: { $ne: existing?._id || null } }))) {
    errors.push('Another person already has this employee / student ID.');
  }
  if (existing && sameId(existing, req.user) && (data.role !== 'admin' || !data.active)) {
    errors.push('You cannot remove your own administrator role or deactivate your own account.');
  }
  const approveNow = !existing && role === STUDENT_ROLE && bool(b.approveRegistration);
  const overrideReason = str(b.overrideReason, 500);
  if (approveNow && overrideReason.length < 5) errors.push('Give a reason for approving this registration directly (administrator override).');
  if (errors.length) invalid(errors);

  const before = existing ? {
    role: existing.role, accountStatus: existing.accountStatus || (existing.active ? 'active' : 'deactivated'),
    departments: (existing.departments || []).map(String).sort().join(','), permissions: JSON.stringify(existing.permissions || {}),
  } : null;

  let generated = null;
  let user;
  if (existing) {
    // A student who becomes staff (or the reverse) keeps their registration record untouched.
    Object.assign(existing, data);
    if (password !== '') {
      existing.passwordHash = await hashPassword(password);
      existing.mustChangePassword = true;
      existing.tokenVersion = (existing.tokenVersion || 0) + 1;
    }
    if (!data.active) existing.tokenVersion = (existing.tokenVersion || 0) + 1;
    if (role === STUDENT_ROLE && !existing.registration?.status) {
      // Staff turned into a student: their registration must be reviewed like anyone else's.
      existing.registration = { status: 'pending', source: 'admin', submittedAt: new Date(), createdBy: req.user._id, history: [{ status: 'pending', action: 'created_by_staff', by: req.user._id, byName: req.user.name, byRole: req.user.role, at: new Date() }] };
    }
    user = await existing.save();
  } else {
    const plain = password || (generated = randomPassword());
    const now = new Date();
    const registration = role === STUDENT_ROLE ? {
      status: approveNow ? 'approved' : 'pending',
      source: 'admin',
      submittedAt: now,
      createdBy: req.user._id,
      reviewedBy: approveNow ? req.user._id : null,
      reviewedAt: approveNow ? now : null,
      reason: approveNow ? overrideReason : null,
      history: [
        { status: 'pending', action: 'created_by_staff', by: req.user._id, byName: req.user.name, byRole: req.user.role, at: now },
        ...(approveNow ? [{ status: 'approved', action: 'approved', by: req.user._id, byName: req.user.name, byRole: req.user.role, reason: overrideReason, override: true, at: now }] : []),
      ],
    } : undefined;
    if (approveNow && !data.employeeId) data.employeeId = await generateStudentId();
    user = await User.create({ ...data, ...(registration ? { registration } : {}), passwordHash: await hashPassword(plain), mustChangePassword: true });
  }
  const added = await applyTeamCourses(user._id);

  // Audit trail: creation, role/permission/department/status changes.
  if (!existing) {
    await audit(req, 'user.created', { targetType: 'User', targetId: user._id, targetLabel: user.name, department: user.department, details: { role, accountStatus } });
    if (approveNow) await audit(req, 'registration.override', { targetType: 'User', targetId: user._id, targetLabel: user.name, department: user.department, details: { to: 'approved', reason: overrideReason, override: true } });
  } else {
    const after = { role: user.role, accountStatus: user.accountStatus, departments: (user.departments || []).map(String).sort().join(','), permissions: JSON.stringify(user.permissions || {}) };
    const changes = Object.keys(after).filter((k) => after[k] !== before[k]);
    await audit(req, 'user.updated', { targetType: 'User', targetId: user._id, targetLabel: user.name, department: user.department, details: { changed: changes, passwordReset: password !== '' } });
    if (changes.includes('role')) await audit(req, 'user.role_changed', { targetType: 'User', targetId: user._id, targetLabel: user.name, details: { from: before.role, to: after.role } });
    if (changes.includes('permissions') || changes.includes('departments')) await audit(req, 'user.permissions_changed', { targetType: 'User', targetId: user._id, targetLabel: user.name, details: { permissions: user.permissions, departments: after.departments } });
    if (changes.includes('accountStatus')) {
      await audit(req, `user.${after.accountStatus === 'active' ? 'activated' : after.accountStatus}`, { targetType: 'User', targetId: user._id, targetLabel: user.name, details: { from: before.accountStatus, to: after.accountStatus } });
    }
  }

  const messages = [];
  if (generated) {
    messages.push({ type: 'success', message: `Account created for ${data.name}. Temporary password: ${generated} — share it privately; they will be asked to change it at first sign-in.` });
  } else {
    messages.push({ type: 'success', message: `Saved ${data.name}.${password !== '' ? ' They will be asked to change the new password at next sign-in.' : ''}` });
  }
  if (!existing && role === STUDENT_ROLE && !approveNow) messages.push({ type: 'info', message: 'The student’s registration is pending until their Department Head approves it.' });
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
 * CSV columns (header row required): name, email, role, team, campaign, employee_id, password, department
 * Only name and email are required. Unknown teams are created. "department" is a department name or code.
 * New students are created with a PENDING registration, unless the administrator ticks
 * "approve imported students" (an audited override with a reason).
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

  const approveAll = bool(req.body?.approveStudents);
  const overrideReason = str(req.body?.overrideReason, 500);
  if (approveAll && overrideReason.length < 5) invalid(['Give a reason for approving imported students directly (administrator override).']);
  const departments = await Department.find({}, 'name code').lean();
  const findDept = (v) => {
    const t = String(v || '').trim().toLowerCase();
    return t ? departments.find((d) => d.name.toLowerCase() === t || d.code.toLowerCase() === t) || null : null;
  };

  const results = [];
  let line = 1;
  let createdStudents = 0;
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
    let roleKey = (r.role || '').toLowerCase().replace(/[ -]/g, '_');
    if (roleKey === 'student') roleKey = STUDENT_ROLE;
    // Administrator rights are never granted through a file import.
    const role = ROLES[roleKey] && roleKey !== 'admin' ? roleKey : 'agent';
    const dept = findDept(r.department);
    if (r.department && !dept) {
      results.push({ ...result, status: `Skipped: unknown department “${r.department}”` });
      continue;
    }

    const existing = await User.findOne({ email });
    if (existing) {
      if (existing.role === 'admin' || sameId(existing, req.user)) {
        results.push({ ...result, status: 'Skipped: administrator accounts cannot be changed by import' });
        continue;
      }
      existing.name = name.slice(0, 120);
      existing.role = role;
      if (teamId) existing.team = teamId;
      if (dept) existing.department = dept._id;
      if (role === STUDENT_ROLE && !existing.registration?.status) {
        existing.registration = { status: 'pending', source: 'import', submittedAt: new Date(), createdBy: req.user._id, history: [{ status: 'pending', action: 'created_by_staff', by: req.user._id, byName: req.user.name, byRole: req.user.role, at: new Date() }] };
      }
      if (r.employee_id) existing.employeeId = r.employee_id.slice(0, 50);
      await existing.save();
      await applyTeamCourses(existing._id);
      results.push({ ...result, status: 'Updated' });
    } else {
      const pw = r.password && r.password.length >= 8 ? r.password : randomPassword();
      const now = new Date();
      const isStudentRow = role === STUDENT_ROLE;
      const registration = isStudentRow ? {
        status: approveAll ? 'approved' : 'pending',
        source: 'import',
        submittedAt: now,
        createdBy: req.user._id,
        reviewedBy: approveAll ? req.user._id : null,
        reviewedAt: approveAll ? now : null,
        reason: approveAll ? overrideReason : null,
        history: [
          { status: 'pending', action: 'created_by_staff', by: req.user._id, byName: req.user.name, byRole: req.user.role, at: now },
          ...(approveAll ? [{ status: 'approved', action: 'approved', by: req.user._id, byName: req.user.name, byRole: req.user.role, reason: overrideReason, override: true, at: now }] : []),
        ],
      } : undefined;
      const u = await User.create({
        name: name.slice(0, 120), email, role, team: teamId, department: dept?._id || null,
        employeeId: (r.employee_id || '').slice(0, 50) || null,
        active: true, accountStatus: 'active', passwordHash: await hashPassword(pw), mustChangePassword: true,
        ...(registration ? { registration } : {}),
      });
      if (isStudentRow) createdStudents++;
      await applyTeamCourses(u._id);
      results.push({ ...result, status: 'Created', password: pw });
    }
  }
  await audit(req, 'user.imported', {
    details: {
      created: results.filter((x) => x.status === 'Created').length,
      updated: results.filter((x) => x.status === 'Updated').length,
      skipped: results.filter((x) => x.status.startsWith('Skipped')).length,
      studentsApprovedByOverride: approveAll ? createdStudents : 0,
      reason: approveAll ? overrideReason : null,
    },
  });
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
  await audit(req, 'team.created', { targetType: 'Team', targetId: team._id, targetLabel: team.name });
  res.status(201).json({ team, message: `Team “${data.name}” saved.` });
});

router.put('/teams/:id', async (req, res) => {
  const team = await findOr404(Team, req.params.id, 'This team does not exist.');
  const data = teamData(req.body);
  if (!data.name) invalid(['Enter a team name.']);
  Object.assign(team, data);
  await team.save();
  await audit(req, 'team.updated', { targetType: 'Team', targetId: team._id, targetLabel: team.name });
  res.json({ team, message: `Team “${data.name}” saved.` });
});

router.delete('/teams/:id', async (req, res) => {
  const team = await findOr404(Team, req.params.id, 'This team does not exist.');
  await User.updateMany({ team: team._id }, { team: null });
  await TeamCourse.deleteMany({ team: team._id });
  await Team.deleteOne({ _id: team._id });
  await audit(req, 'team.deleted', { targetType: 'Team', targetId: team._id, targetLabel: team.name });
  res.json({ message: `Team “${team.name}” deleted. Its members are now without a team; their courses and progress are kept.` });
});

// ---- departments ----------------------------------------------------------------

router.get('/departments', async (req, res) => {
  const depts = await Department.find().sort({ name: 1 }).lean();
  const ids = depts.map((d) => d._id);
  const [students, pending, staff, courses] = await Promise.all([
    User.aggregate([{ $match: { role: STUDENT_ROLE, active: true, department: { $in: ids } } }, { $group: { _id: '$department', n: { $sum: 1 } } }]),
    User.aggregate([{ $match: { role: STUDENT_ROLE, department: { $in: ids }, 'registration.status': { $in: ['pending', 'correction_requested'] } } }, { $group: { _id: '$department', n: { $sum: 1 } } }]),
    User.find({ active: true, role: { $in: ['department_head', 'registrar'] }, departments: { $in: ids } }, 'name role departments').lean(),
    Course.aggregate([{ $match: { department: { $in: ids } } }, { $group: { _id: '$department', n: { $sum: 1 } } }]),
  ]);
  const map = (rows) => new Map(rows.map((r) => [String(r._id), r.n]));
  const [st, pe, co] = [map(students), map(pending), map(courses)];
  res.json({
    departments: depts.map((d) => {
      const k = String(d._id);
      const people = staff.filter((u) => (u.departments || []).some((x) => String(x) === k));
      return {
        ...d,
        students: st.get(k) || 0,
        pending: pe.get(k) || 0,
        courses: co.get(k) || 0,
        heads: people.filter((u) => u.role === 'department_head').map((u) => ({ _id: u._id, name: u.name })),
        registrars: people.filter((u) => u.role === 'registrar').map((u) => ({ _id: u._id, name: u.name })),
      };
    }),
  });
});

router.get('/departments/:id', async (req, res) => {
  const department = await findOr404(Department, req.params.id, 'This department does not exist.');
  const heads = await User.find({ role: 'department_head', departments: department._id }, 'name email active').sort({ name: 1 }).lean();
  res.json({ department, heads });
});

function departmentData(b) {
  const programs = [];
  for (const p of (Array.isArray(b.programs) ? b.programs : String(b.programs || '').split('\n'))) {
    const v = str(p, 160);
    if (v && !programs.includes(v)) programs.push(v);
  }
  return {
    name: str(b.name, 120),
    code: str(b.code, 20).toUpperCase().replace(/[^A-Z0-9_-]/g, ''),
    description: str(b.description, 1000),
    programs: programs.slice(0, 100),
    active: b.active === undefined ? true : bool(b.active),
  };
}

async function checkDepartment(data, id = null) {
  const errors = [];
  if (!data.name) errors.push('Enter a department name.');
  if (!data.code) errors.push('Enter a short department code (letters and numbers), e.g. CS or SALES.');
  else if (await Department.exists({ code: data.code, _id: { $ne: id } })) errors.push('Another department already uses this code.');
  if (errors.length) invalid(errors);
}

router.post('/departments', async (req, res) => {
  const data = departmentData(req.body);
  await checkDepartment(data);
  const department = await Department.create(data);
  await audit(req, 'department.created', { targetType: 'Department', targetId: department._id, targetLabel: department.name, department: department._id });
  res.status(201).json({ department, message: `Department “${department.name}” created. Now assign its Department Head on the People page.` });
});

router.put('/departments/:id', async (req, res) => {
  const department = await findOr404(Department, req.params.id, 'This department does not exist.');
  const data = departmentData(req.body);
  await checkDepartment(data, department._id);
  Object.assign(department, data);
  await department.save();
  await audit(req, 'department.updated', { targetType: 'Department', targetId: department._id, targetLabel: department.name, department: department._id, details: { active: data.active } });
  res.json({ department, message: `Department “${department.name}” saved.` });
});

/** Departments with students or courses are deactivated instead of deleted, so no record loses its department. */
router.delete('/departments/:id', async (req, res) => {
  const department = await findOr404(Department, req.params.id, 'This department does not exist.');
  const inUse = (await User.exists({ $or: [{ department: department._id }, { departments: department._id }] })) || (await Course.exists({ department: department._id }));
  if (inUse) fail(409, 'This department still has people or courses. Deactivate it instead, so their records keep their department.');
  await Department.deleteOne({ _id: department._id });
  await audit(req, 'department.deleted', { targetType: 'Department', targetId: department._id, targetLabel: department.name });
  res.json({ message: `Department “${department.name}” deleted.` });
});

// ---- audit log ------------------------------------------------------------------

router.get('/audit', async (req, res) => {
  const filter = {};
  const action = str(req.query.action);
  const actor = str(req.query.actor);
  const target = str(req.query.target);
  if (action) filter.action = new RegExp(`^${escapeRegex(action)}`);
  if (isId(actor)) filter.actor = toId(actor);
  if (isId(target)) filter.targetId = toId(target);
  const page = Math.max(1, intOr(req.query.page, 1));
  const limit = 50;
  const [rows, total, actions] = await Promise.all([
    AuditLog.find(filter).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
    AuditLog.distinct('action'),
  ]);
  res.json({ entries: rows, total, page, pages: Math.max(1, Math.ceil(total / limit)), actions: actions.sort() });
});

export default router;
