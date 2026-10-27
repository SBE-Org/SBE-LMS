/**
 * API used by the Shaggar BPO Talent Pool (server to server). Every call carries the shared INTEGRATION_KEY
 * in the X-Integration-Key header; without INTEGRATION_KEY set, these addresses do not exist.
 *
 *   GET  /api/integration/ping            is the connection working
 *   GET  /api/integration/courses         published courses to choose from
 *   POST /api/integration/enrol           enrol a person by email (creates their student account if needed)
 *   GET  /api/integration/status?email=   their progress in the courses the Talent Pool assigned
 *   POST /api/integration/new-password    a new temporary password, for someone who never signed in
 */
import { Router } from 'express';
import { config } from '../config.js';
import { Course, Department, Enrolment, User, STUDENT_ROLE } from '../models/index.js';
import { fail, isId, str } from '../utils/http.js';
import { hashPassword, randomPassword } from '../utils/password.js';
import { courseTotals, totalFor, enrol } from '../services/progress.js';
import { generateStudentId } from '../services/registration.js';
import { certificateRule } from '../services/trainingRules.js';
import { integrationOn, keyMatches, trainingStatus, VIA } from '../services/integration.js';
import { notify } from '../services/notify.js';
import { audit } from '../services/audit.js';

const router = Router();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Shown as the one who acted in the audit log. */
const actor = (req) => ({ ip: req.ip, user: { _id: null, name: 'Talent Pool', role: null } });

router.use((req, res, next) => {
  if (!integrationOn()) fail(404, 'We could not find that page.');
  if (!keyMatches(req.get('x-integration-key'))) fail(401, 'The integration key is not correct.');
  next();
});

router.get('/ping', async (req, res) => {
  res.json({ ok: true, appName: config.appName, courses: await Course.countDocuments({ status: 'published' }) });
});

router.get('/courses', async (req, res) => {
  const courses = await Course.find({ status: 'published' }, 'title summary category certificateEnabled certificateRequiresApproval').sort({ title: 1 }).lean();
  const totals = await courseTotals(courses.map((c) => c._id));
  res.json({
    courses: courses.map((c) => {
      const t = totalFor(totals, c._id);
      return { id: String(c._id), title: c.title, summary: (c.summary || '').slice(0, 300), category: c.category || '', lessons: t.lessons, quizzes: t.quizzes, certificate: certificateRule(c) };
    }),
  });
});

const findByEmail = async (v) => {
  const email = str(v, 190).toLowerCase();
  if (!EMAIL.test(email)) fail(422, 'A valid email address is needed.');
  return { email, user: await User.findOne({ email }) };
};

router.post('/enrol', async (req, res) => {
  const b = req.body || {};
  const { email, user: found } = await findByEmail(b.email);
  const ids = [...new Set((Array.isArray(b.courses) ? b.courses : []).map(String))].filter(isId).slice(0, 20);
  if (!ids.length) fail(422, 'Pick at least one course.');
  const courses = await Course.find({ _id: { $in: ids }, status: 'published' }, 'title').lean();
  if (courses.length !== ids.length) fail(422, 'One of the chosen courses is not published in Shaggar Academy any more. Pick again.');
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.dueDate || '')) ? b.dueDate : null;

  let user = found; let tempPassword = null; let created = false;
  if (user && user.accountStatus && user.accountStatus !== 'active') fail(409, `${user.name}'s Shaggar Academy account is ${user.accountStatus}. An administrator there has to reactivate it first.`);
  if (!user) {
    // A new student account, already approved: the Talent Pool team has vetted this person.
    tempPassword = randomPassword(10);
    const dept = config.talentPoolDepartment ? await Department.findOne({ code: config.talentPoolDepartment.toUpperCase() }, '_id').lean() : null;
    const now = new Date();
    try {
      user = await User.create({
        name: str(b.name, 120) || email.split('@')[0], email, phone: str(b.phone, 30) || null,
        passwordHash: await hashPassword(tempPassword), role: STUDENT_ROLE, mustChangePassword: true, active: true, accountStatus: 'active',
        department: dept?._id || null, employeeId: await generateStudentId(),
        registration: { status: 'approved', source: 'talent_pool', submittedAt: now, reviewedAt: now, history: [{ status: 'approved', action: 'created_by_talent_pool', byName: 'Talent Pool', at: now }] },
      });
    } catch (e) {
      if (e?.code === 11000) fail(409, 'An account with this email was just created. Try again.');
      throw e;
    }
    created = true;
    await audit(actor(req), 'user.created', { targetType: 'User', targetId: user._id, targetLabel: user.name, department: user.department, details: { source: 'talent_pool', email } });
  }

  const added = [];
  for (const c of courses) {
    if (await enrol(user._id, c._id, null, dueDate)) added.push(c.title);
    await Enrolment.updateOne({ user: user._id, course: c._id }, { via: VIA });
  }
  if (added.length) {
    await notify(user._id, { type: 'course', title: added.length > 1 ? 'New courses assigned' : 'New course assigned', body: `You were enrolled in ${added.map((t) => `“${t}”`).join(', ')} by the Talent Pool team${dueDate ? `. Please finish by ${dueDate}` : ''}.`, link: '/courses' });
    await audit(actor(req), 'enrolment.created', { targetType: 'User', targetId: user._id, targetLabel: user.name, department: user.department, details: { courses: added, dueDate, via: VIA } });
  }
  res.status(created ? 201 : 200).json({ created, tempPassword, ...(await trainingStatus(user)) });
});

router.get('/status', async (req, res) => {
  const { user } = await findByEmail(req.query.email);
  if (!user) fail(404, 'No Shaggar Academy account with this email.');
  res.json(await trainingStatus(user));
});

router.post('/new-password', async (req, res) => {
  const { user: u } = await findByEmail(req.body?.email);
  if (!u) fail(404, 'No Shaggar Academy account with this email.');
  if (u.lastLoginAt) fail(409, `${u.name} has already signed in to Shaggar Academy and chose their own password. An administrator there can reset it if they forgot it.`);
  const tempPassword = randomPassword(10);
  await User.updateOne({ _id: u._id }, { passwordHash: await hashPassword(tempPassword), mustChangePassword: true, $inc: { tokenVersion: 1 } });
  await audit(actor(req), 'user.password_reset', { targetType: 'User', targetId: u._id, targetLabel: u.name, department: u.department, details: { via: VIA } });
  res.json({ email: u.email, tempPassword });
});

export default router;
