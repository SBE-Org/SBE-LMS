/**
 * Training reports. Admins and trainers see everyone; team leads see only the
 * teams they lead.
 */
import { Router } from 'express';
import { Course, Quiz, Question, QuizAttempt, Enrolment, Certificate, User } from '../models/index.js';
import { requireAuth, requireRole, visibleTeamIds } from '../middleware/auth.js';
import { progressMap, progressOf, courseTotals, totalFor } from '../services/progress.js';
import { scopedUserIds, scopedEnrolments, summary, teamOptions, avg } from '../services/reports.js';
import { today, csvDateTime } from '../utils/dates.js';
import { toCsv } from '../utils/csv.js';
import { fail, findOr404, isId, toId, str } from '../utils/http.js';

const router = Router();
router.use(requireAuth, requireRole('admin', 'trainer', 'team_lead'));

/** Team filter from ?team=, limited to what the viewer may see. Returns [teamIds|null, visible, team]. */
async function teamFilter(req) {
  const visible = await visibleTeamIds(req.user);
  const team = isId(str(req.query.team)) ? str(req.query.team) : null;
  if (team) {
    if (visible !== null && !visible.includes(team)) fail(403, 'You can only view reports for the teams you lead.');
    return { teamIds: [team], visible, team };
  }
  return { teamIds: visible, visible, team: null };
}

async function quizStats(quizId, userIds) {
  if (!userIds.length) return { attempts: 0, learners: 0, passed: 0, avg: null, passRate: 0 };
  const match = { quiz: toId(quizId), status: 'submitted', user: { $in: userIds.map(toId) } };
  const [row] = await QuizAttempt.aggregate([
    { $match: match },
    { $group: { _id: null, attempts: { $sum: 1 }, learners: { $addToSet: '$user' }, avg: { $avg: '$percent' } } },
  ]);
  const passed = (await QuizAttempt.distinct('user', { ...match, passed: true })).length;
  const learners = row ? row.learners.length : 0;
  return {
    attempts: row?.attempts || 0,
    learners,
    passed,
    avg: row?.avg != null ? Math.round(row.avg) : null,
    passRate: learners ? Math.round((passed * 100) / learners) : 0,
  };
}

router.get('/', async (req, res) => {
  const { teamIds, visible, team } = await teamFilter(req);
  const userIds = await scopedUserIds(teamIds);
  const [enrolments, progress] = await Promise.all([scopedEnrolments(userIds), progressMap(userIds)]);
  const t = today();

  const courses = {};
  const teams = {};
  const learners = {};
  for (const e of enrolments) {
    const p = progressOf(progress, e.userId, e.courseId);
    const overdue = !e.completedAt && !!e.dueDate && e.dueDate < t;
    const state = e.completedAt ? 'completed' : p.pct > 0 ? 'inProgress' : 'notStarted';

    const c = (courses[e.courseId] ??= { _id: e.courseId, title: e.courseTitle, status: e.courseStatus, enrolled: 0, completed: 0, inProgress: 0, notStarted: 0, overdue: 0, scores: [] });
    c.enrolled++;
    c[state]++;
    if (overdue) c.overdue++;
    if (p.avgScore !== null) c.scores.push(p.avgScore);

    const tk = e.teamId || '';
    const tm = (teams[tk] ??= { _id: e.teamId, name: e.teamName || 'No team', people: new Set(), enrolled: 0, completed: 0, overdue: 0, scores: [] });
    tm.people.add(e.userId);
    tm.enrolled++;
    if (e.completedAt) tm.completed++;
    if (overdue) tm.overdue++;
    if (p.avgScore !== null) tm.scores.push(p.avgScore);

    const l = (learners[e.userId] ??= { _id: e.userId, name: e.name, team: e.teamName, lastLoginAt: e.lastLoginAt, enrolled: 0, completed: 0, overdue: 0, pcts: [], scores: [] });
    l.enrolled++;
    if (e.completedAt) l.completed++;
    if (overdue) l.overdue++;
    l.pcts.push(e.completedAt ? 100 : p.pct);
    if (p.avgScore !== null) l.scores.push(p.avgScore);
  }

  const courseRows = Object.values(courses)
    .map(({ scores, ...c }) => ({ ...c, rate: c.enrolled ? Math.round((c.completed * 100) / c.enrolled) : 0, avgScore: avg(scores) }))
    .sort((a, b) => a.title.localeCompare(b.title));
  const teamRows = Object.values(teams)
    .map(({ scores, people, ...x }) => ({ ...x, people: people.size, rate: x.enrolled ? Math.round((x.completed * 100) / x.enrolled) : 0, avgScore: avg(scores) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const learnerRows = Object.values(learners)
    .map(({ pcts, scores, ...l }) => ({ ...l, progress: avg(pcts) ?? 0, avgScore: avg(scores) }))
    // Overdue first, then least progress
    .sort((a, b) => b.overdue - a.overdue || a.progress - b.progress);

  res.json({
    summary: await summary(teamIds),
    courses: courseRows,
    teams: teamRows,
    learners: learnerRows,
    teamOptions: await teamOptions(visible),
    team,
    isTeamLead: req.user.role === 'team_lead',
  });
});

router.get('/courses/:id', async (req, res) => {
  const course = await findOr404(Course, req.params.id, 'This course does not exist.');
  const { teamIds, visible, team } = await teamFilter(req);
  const userIds = await scopedUserIds(teamIds);
  const enrolments = await scopedEnrolments(userIds, course._id);
  const ids = enrolments.map((e) => e.userId);
  const [progress, totals, quizzes] = await Promise.all([
    progressMap(ids, [course._id]),
    courseTotals([course._id]),
    Quiz.find({ course: course._id }).sort({ position: 1, _id: 1 }).lean(),
  ]);
  const t = today();
  for (const q of quizzes) q.stats = await quizStats(q._id, ids);
  res.json({
    course,
    totals: totalFor(totals, course._id),
    quizzes,
    enrolments: enrolments.map((e) => ({ ...e, p: progressOf(progress, e.userId, course._id), overdue: !e.completedAt && !!e.dueDate && e.dueDate < t })),
    teamOptions: await teamOptions(visible),
    team,
    isTeamLead: req.user.role === 'team_lead',
  });
});

router.get('/quizzes/:id', async (req, res) => {
  const quiz = await findOr404(Quiz, req.params.id, 'This quiz does not exist.');
  const course = await Course.findById(quiz.course, 'title').lean();
  const { teamIds } = await teamFilter(req);
  const userIds = await scopedUserIds(teamIds);
  const stats = await quizStats(quiz._id, userIds);

  let questions = [];
  let attempts = [];
  const qs = await Question.find({ quiz: quiz._id }, 'body type points position').sort({ position: 1, _id: 1 }).lean();
  if (userIds.length) {
    const match = { quiz: quiz._id, status: 'submitted', user: { $in: userIds.map(toId) } };
    const rows = await QuizAttempt.aggregate([
      { $match: match },
      { $unwind: '$answers' },
      { $group: { _id: '$answers.question', answered: { $sum: 1 }, correct: { $sum: { $cond: ['$answers.correct', 1, 0] } } } },
    ]);
    const byQ = new Map(rows.map((r) => [String(r._id), r]));
    questions = qs.map((q) => {
      const r = byQ.get(String(q._id));
      const answered = r?.answered || 0;
      return { ...q, answered, correct: r?.correct || 0, rate: answered ? Math.round((r.correct * 100) / answered) : null };
    });
    attempts = (await QuizAttempt.find(match, '-answers -questionOrder')
      .populate({ path: 'user', select: 'name team', populate: { path: 'team', select: 'name' } })
      .sort({ submittedAt: -1 }).limit(200).lean())
      .filter((a) => a.user)
      .map((a) => ({ _id: a._id, userId: a.user._id, name: a.user.name, teamName: a.user.team?.name || null, submittedAt: a.submittedAt, percent: a.percent, passed: a.passed }));
  }
  res.json({ quiz, course, stats, questions, attempts });
});

router.get('/users/:id', async (req, res) => {
  const person = await User.findById(req.params.id).populate('team', 'name').lean().catch(() => null);
  if (!person) fail(404, 'This person does not exist.');
  const visible = await visibleTeamIds(req.user);
  if (visible !== null && !(person.team && visible.includes(String(person.team._id)))) {
    fail(403, 'You can only view people in the teams you lead.');
  }
  const rows = (await Enrolment.find({ user: person._id }).populate('course', 'title').lean()).filter((e) => e.course);
  rows.sort((a, b) => a.course.title.localeCompare(b.course.title));
  const [progress, totals] = await Promise.all([progressMap([person._id]), courseTotals()]);
  const t = today();
  const attempts = (await QuizAttempt.find({ user: person._id, status: 'submitted' }, '-answers -questionOrder')
    .populate('quiz', 'title').populate('course', 'title').sort({ submittedAt: -1 }).lean())
    .filter((a) => a.quiz && a.course)
    .map((a) => ({ _id: a._id, quizTitle: a.quiz.title, courseTitle: a.course.title, percent: a.percent, passed: a.passed, submittedAt: a.submittedAt }));
  const certificates = (await Certificate.find({ user: person._id }).populate('course', 'title').sort({ issuedAt: -1 }).lean())
    .filter((c) => c.course)
    .map((c) => ({ _id: c._id, code: c.code, issuedAt: c.issuedAt, title: c.course.title }));
  res.json({
    person: {
      _id: person._id, name: person.name, email: person.email, role: person.role, employeeId: person.employeeId,
      lastLoginAt: person.lastLoginAt, teamName: person.team?.name || null, active: person.active,
    },
    enrolments: rows.map((e) => ({
      _id: e._id, courseId: e.course._id, title: e.course.title, dueDate: e.dueDate, enrolledAt: e.enrolledAt, completedAt: e.completedAt,
      p: progressOf(progress, person._id, e.course._id, totalFor(totals, e.course._id).total),
      overdue: !e.completedAt && !!e.dueDate && e.dueDate < t,
    })),
    attempts,
    certificates,
  });
});

router.get('/export', async (req, res) => {
  const { teamIds } = await teamFilter(req);
  const userIds = await scopedUserIds(teamIds);
  const type = req.query.type === 'attempts' ? 'attempts' : 'enrolments';
  const stamp = today();
  const send = (filename, csv) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  };

  if (type === 'attempts') {
    const rows = userIds.length
      ? await QuizAttempt.find({ status: 'submitted', user: { $in: userIds.map(toId) } }, '-answers -questionOrder')
        .populate({ path: 'user', select: 'name email employeeId team', populate: { path: 'team', select: 'name' } })
        .populate('quiz', 'title').populate('course', 'title').sort({ submittedAt: -1 }).lean()
      : [];
    return send(
      `quiz-attempts-${stamp}.csv`,
      toCsv(
        ['Name', 'Email', 'Employee ID', 'Team', 'Course', 'Quiz', 'Started', 'Submitted', 'Score', 'Max score', 'Percent', 'Passed'],
        rows.filter((a) => a.user && a.quiz && a.course).map((a) => [
          a.user.name, a.user.email, a.user.employeeId, a.user.team?.name || '', a.course.title, a.quiz.title,
          csvDateTime(a.startedAt), csvDateTime(a.submittedAt), a.score, a.maxScore, a.percent, a.passed ? 'Yes' : 'No',
        ])
      )
    );
  }

  const [enrolments, progress] = await Promise.all([scopedEnrolments(userIds), progressMap(userIds)]);
  const t = today();
  const out = enrolments.map((e) => {
    const p = progressOf(progress, e.userId, e.courseId);
    const status = e.completedAt ? 'Completed' : e.dueDate && e.dueDate < t ? 'Overdue' : p.pct > 0 ? 'In progress' : 'Not started';
    return [e.name, e.email, e.employeeId, e.teamName || '', e.courseTitle, csvDateTime(e.enrolledAt), e.dueDate || '', csvDateTime(e.completedAt),
      e.completedAt ? 100 : p.pct, p.avgScore ?? '', status];
  });
  send(
    `training-progress-${stamp}.csv`,
    toCsv(['Name', 'Email', 'Employee ID', 'Team', 'Course', 'Enrolled', 'Due date', 'Completed', 'Progress %', 'Avg quiz score %', 'Status'], out)
  );
});

export default router;
