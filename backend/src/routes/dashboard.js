import { Router } from 'express';
import {
  Enrolment, Certificate, Course, Department, User, QuizAttempt, AuditLog, Notification, STUDENT_ROLE, ISSUED,
} from '../models/index.js';
import {
  requireAuth, hasRole, visibleScope, learningBlock, assignedDepartmentIds, registrationScope,
} from '../middleware/auth.js';
import { progressMap, progressOf, courseTotals, totalFor, outline } from '../services/progress.js';
import { summary } from '../services/reports.js';
import { getSettings } from '../services/settings.js';
import { missingFields, STATUS_LABELS } from '../services/registration.js';
import { today, addDays } from '../utils/dates.js';
import { toId } from '../utils/http.js';

const router = Router();

const statusCounts = async (match) => {
  const rows = await User.aggregate([{ $match: match }, { $group: { _id: '$registration.status', n: { $sum: 1 } } }]);
  const out = { pending: 0, correction_requested: 0, approved: 0, rejected: 0 };
  for (const r of rows) if (r._id in out) out[r._id] = r.n;
  return out;
};

/** Applications submitted and decided per month, for the last 6 months. */
async function registrationTrend(match) {
  const since = new Date();
  since.setMonth(since.getMonth() - 5, 1);
  since.setHours(0, 0, 0, 0);
  const [submitted, decided] = await Promise.all([
    User.aggregate([
      { $match: { ...match, 'registration.submittedAt': { $gte: since }, 'registration.source': { $ne: 'legacy' } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$registration.submittedAt' } }, n: { $sum: 1 } } },
    ]),
    User.aggregate([
      { $match: { ...match, 'registration.reviewedAt': { $gte: since }, 'registration.status': { $in: ['approved', 'rejected'] }, 'registration.source': { $ne: 'legacy' } } },
      { $group: { _id: { m: { $dateToString: { format: '%Y-%m', date: '$registration.reviewedAt' } }, s: '$registration.status' }, n: { $sum: 1 } } },
    ]),
  ]);
  const months = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(since);
    d.setMonth(since.getMonth() + i);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const sub = new Map(submitted.map((r) => [r._id, r.n]));
  return months.map((m) => ({
    month: m,
    submitted: sub.get(m) || 0,
    approved: decided.find((r) => r._id.m === m && r._id.s === 'approved')?.n || 0,
    rejected: decided.find((r) => r._id.m === m && r._id.s === 'rejected')?.n || 0,
  }));
}

const appRow = (u) => ({
  _id: u._id, name: u.name, departmentName: u.department?.name || null, status: u.registration?.status,
  statusLabel: STATUS_LABELS[u.registration?.status], submittedAt: u.registration?.submittedAt, source: u.registration?.source,
});

async function adminBlock() {
  const studentMatch = { role: STUDENT_ROLE, 'registration.status': { $ne: null } };
  const [counts, students, departments, courses, certificates, pendingCertificates, trend, recentAudit, deptRows, pendingDept, courseDept] = await Promise.all([
    statusCounts(studentMatch),
    User.countDocuments({ role: STUDENT_ROLE, active: true }),
    Department.countDocuments({ active: true }),
    Course.countDocuments({ status: 'published' }),
    Certificate.countDocuments(ISSUED),
    Certificate.countDocuments({ status: 'pending' }),
    registrationTrend(studentMatch),
    AuditLog.find({}).sort({ at: -1 }).limit(8).lean(),
    Department.find({}, 'name code active').sort({ name: 1 }).lean(),
    User.aggregate([{ $match: { role: STUDENT_ROLE, active: true } }, { $group: { _id: { d: '$department', s: '$registration.status' }, n: { $sum: 1 } } }]),
    Course.aggregate([{ $match: { status: 'published' } }, { $group: { _id: '$department', n: { $sum: 1 } } }]),
  ]);
  const byDept = (id, st) => pendingDept.filter((r) => String(r._id.d) === String(id) && (!st || st.includes(r._id.s))).reduce((a, r) => a + r.n, 0);
  return {
    totals: { students, departments, courses, certificates, pendingCertificates, ...counts },
    trend,
    departments: deptRows.map((d) => ({
      _id: d._id, name: d.name, code: d.code, active: d.active,
      students: byDept(d._id), pending: byDept(d._id, ['pending', 'correction_requested']),
      courses: courseDept.find((c) => String(c._id) === String(d._id))?.n || 0,
    })),
    recentAudit: recentAudit.map((a) => ({ _id: a._id, at: a.at, actorName: a.actorName, action: a.action, targetLabel: a.targetLabel })),
  };
}

async function departmentHeadBlock(u) {
  const ids = assignedDepartmentIds(u).map(toId);
  const match = { role: STUDENT_ROLE, department: { $in: ids }, 'registration.status': { $ne: null } };
  const [counts, departments, pending, courses, attempts, pendingCertificates] = await Promise.all([
    statusCounts(match),
    Department.find({ _id: { $in: ids } }, 'name code').sort({ name: 1 }).lean(),
    User.find({ ...match, 'registration.status': 'pending' }).populate('department', 'name').sort({ 'registration.submittedAt': 1 }).limit(8).lean(),
    Course.find({ department: { $in: ids }, status: { $ne: 'archived' } }, 'title status').sort({ title: 1 }).lean(),
    QuizAttempt.aggregate([
      { $match: { status: 'submitted', course: { $in: (await Course.find({ department: { $in: ids } }, '_id').lean()).map((c) => c._id) } } },
      { $group: { _id: null, attempts: { $sum: 1 }, avg: { $avg: '$percent' }, passed: { $sum: { $cond: ['$passed', 1, 0] } } } },
    ]),
    Certificate.countDocuments({ status: 'pending', course: { $in: (await Course.find({ department: { $in: ids } }, '_id').lean()).map((c) => c._id) } }),
  ]);
  const courseIds = courses.map((c) => c._id);
  const enrolStats = await Enrolment.aggregate([
    { $match: { course: { $in: courseIds } } },
    { $group: { _id: '$course', enrolled: { $sum: 1 }, completed: { $sum: { $cond: [{ $ne: ['$completedAt', null] }, 1, 0] } } } },
  ]);
  const es = new Map(enrolStats.map((r) => [String(r._id), r]));
  const a = attempts[0];
  return {
    departments,
    counts,
    pending: pending.map(appRow),
    courses: courses.map((c) => ({ _id: c._id, title: c.title, status: c.status, enrolled: es.get(String(c._id))?.enrolled || 0, completed: es.get(String(c._id))?.completed || 0 })),
    assessments: a ? { attempts: a.attempts, avgScore: Math.round(a.avg), passRate: Math.round((a.passed * 100) / a.attempts) } : { attempts: 0, avgScore: null, passRate: null },
    pendingCertificates,
  };
}

async function registrarBlock(u) {
  const scope = registrationScope(u);
  const match = { role: STUDENT_ROLE, 'registration.status': { $ne: null } };
  if (scope !== null) match.department = { $in: scope.map(toId) };
  const settings = await getSettings();
  const since = new Date(Date.now() - 30 * 86400000);
  const [counts, recent, open] = await Promise.all([
    statusCounts(match),
    User.find({ ...match, createdAt: { $gte: since }, 'registration.source': { $ne: 'legacy' } }).populate('department', 'name').sort({ createdAt: -1 }).limit(8).lean(),
    User.find({ ...match, 'registration.status': { $in: ['pending', 'correction_requested'] } }).populate('department', 'name').sort({ 'registration.submittedAt': 1 }).limit(200).lean(),
  ]);
  const incomplete = open.filter((x) => x.registration.status === 'correction_requested' || missingFields(x, settings).length);
  return {
    counts,
    createdLast30Days: await User.countDocuments({ ...match, createdAt: { $gte: since }, 'registration.source': { $ne: 'legacy' } }),
    recent: recent.map(appRow),
    incomplete: incomplete.slice(0, 8).map((x) => ({ ...appRow(x), missing: missingFields(x, settings), reason: x.registration.reason })),
    incompleteCount: incomplete.length,
    pendingReview: open.filter((x) => x.registration.status === 'pending').slice(0, 8).map(appRow),
    canApprove: !!u.permissions?.approveRegistrations,
  };
}

router.get('/', requireAuth, async (req, res) => {
  const u = req.user;
  const block = learningBlock(u);

  // ---- personal learning (everyone who learns) ----
  const rows = block ? [] : (await Enrolment.find({ user: u._id }).populate('course', 'title summary category status').lean())
    .filter((e) => e.course && e.course.status === 'published');
  // Unfinished first, then by due date, then title
  rows.sort((a, b) =>
    (a.completedAt ? 1 : 0) - (b.completedAt ? 1 : 0)
    || String(a.dueDate || '').localeCompare(String(b.dueDate || ''))
    || a.course.title.localeCompare(b.course.title));

  const courseIds = rows.map((e) => String(e.course._id));
  const [progress, totals] = await Promise.all([progressMap([u._id], courseIds), courseTotals(courseIds)]);
  const t = today();

  const active = [];
  const completed = [];
  for (const e of rows) {
    const item = {
      _id: e._id,
      courseId: e.course._id,
      title: e.course.title,
      summary: e.course.summary,
      category: e.course.category,
      dueDate: e.dueDate,
      completedAt: e.completedAt,
      progress: progressOf(progress, u._id, e.course._id, totalFor(totals, e.course._id).total),
      overdue: !e.completedAt && !!e.dueDate && e.dueDate < t,
    };
    (e.completedAt ? completed : active).push(item);
  }

  // "Continue where you left off": the first active course that has been started
  let resume = null;
  for (const e of active) {
    const o = await outline(e.courseId, u._id);
    if (o.next) {
      resume = { course: e, next: o.next };
      if (e.progress.pct > 0) break;
    }
  }

  const certificates = (await Certificate.find({ user: u._id, ...ISSUED }).populate('course', 'title').sort({ issuedAt: -1 }).limit(4).lean())
    .filter((c) => c.course)
    .map((c) => ({ _id: c._id, code: c.code, issuedAt: c.issuedAt, title: c.course.title }));

  const snapshot = hasRole(u, 'admin', 'trainer', 'team_lead', 'department_head') ? await summary(await visibleScope(u)) : null;

  // ---- student extras ----
  let student = null;
  if (hasRole(u, STUDENT_ROLE)) {
    const soon = addDays(t, 14);
    const recentResults = block ? [] : (await QuizAttempt.find({ user: u._id, status: 'submitted' }, 'quiz course percent passed submittedAt')
      .populate('quiz', 'title').populate('course', 'title').sort({ submittedAt: -1 }).limit(5).lean())
      .filter((a) => a.quiz && a.course)
      .map((a) => ({ _id: a._id, quizTitle: a.quiz.title, courseTitle: a.course.title, percent: a.percent, passed: a.passed, submittedAt: a.submittedAt }));
    const last = (u.registration?.history || []).slice(-1)[0] || null;
    student = {
      registration: {
        status: u.registration?.status || null,
        statusLabel: STATUS_LABELS[u.registration?.status] || null,
        reason: u.registration?.reason || null,
        reviewedAt: u.registration?.reviewedAt || null,
        submittedAt: u.registration?.submittedAt || null,
        lastAction: last ? { action: last.action, at: last.at } : null,
        studentId: u.employeeId || null,
        departmentName: u.department?.name || null,
      },
      blocked: block,
      deadlines: active.filter((e) => e.dueDate && e.dueDate <= soon).map((e) => ({ courseId: e.courseId, title: e.title, dueDate: e.dueDate, overdue: e.overdue })),
      recentResults,
      pendingCertificates: await Certificate.countDocuments({ user: u._id, status: 'pending' }),
    };
  }

  const roleData = {};
  if (hasRole(u, 'admin')) roleData.admin = await adminBlock();
  if (hasRole(u, 'department_head')) roleData.departmentHead = await departmentHeadBlock(u);
  if (hasRole(u, 'registrar')) roleData.registrar = await registrarBlock(u);

  const unreadNotifications = await Notification.countDocuments({ user: u._id, readAt: null });

  res.json({ active, completed, resume, certificates, snapshot, student, ...roleData, unreadNotifications });
});

export default router;
