/**
 * Learning progress, enrolment and certification rules.
 *
 * A course is complete when the learner has finished every lesson and passed
 * every quiz in it. Completion then issues a certificate (if the course has
 * certificates switched on).
 */
import crypto from 'node:crypto';
import {
  Course, Module, Lesson, Quiz, Question, QuizAttempt, Enrolment, TeamCourse, LessonProgress, Certificate, User,
} from '../models/index.js';
import { toId } from '../utils/http.js';
import { today, addDays } from '../utils/dates.js';
import { notifyTalentPool } from './integration.js';

const k = (id) => String(id);
const oids = (ids) => ids.map((i) => toId(i));
const EMPTY_TOTAL = { lessons: 0, quizzes: 0, total: 0 };

/** Number of lessons and quizzes per course: { [courseId]: {lessons, quizzes, total} } */
export async function courseTotals(courseIds = null) {
  const match = courseIds ? { course: { $in: oids(courseIds) } } : {};
  const [lessons, quizzes] = await Promise.all([
    Lesson.aggregate([{ $match: match }, { $group: { _id: '$course', n: { $sum: 1 } } }]),
    Quiz.aggregate([{ $match: match }, { $group: { _id: '$course', n: { $sum: 1 } } }]),
  ]);
  const out = {};
  const ensure = (id) => (out[k(id)] ??= { lessons: 0, quizzes: 0, total: 0 });
  for (const id of courseIds || []) ensure(id);
  for (const r of lessons) ensure(r._id).lessons = r.n;
  for (const r of quizzes) ensure(r._id).quizzes = r.n;
  for (const t of Object.values(out)) t.total = t.lessons + t.quizzes;
  return out;
}

export const totalFor = (totals, courseId) => totals[k(courseId)] || EMPTY_TOTAL;

export const emptyProgress = (total = 0) => ({ lessonsDone: 0, quizzesPassed: 0, done: 0, total, pct: 0, avgScore: null });

/**
 * Progress for many learners at once.
 * Returns { [userId]: { [courseId]: {lessonsDone, quizzesPassed, done, total, pct, avgScore} } }
 * avgScore = average of the learner's best score on each quiz in the course.
 */
export async function progressMap(userIds, courseIds = null) {
  if (!userIds.length) return {};
  const totals = await courseTotals(courseIds);
  const match = { user: { $in: oids(userIds) } };
  if (courseIds) match.course = { $in: oids(courseIds) };

  const [lessonRows, quizRows] = await Promise.all([
    LessonProgress.aggregate([{ $match: match }, { $group: { _id: { u: '$user', c: '$course' }, n: { $sum: 1 } } }]),
    QuizAttempt.aggregate([
      { $match: { ...match, status: 'submitted' } },
      { $group: { _id: { u: '$user', c: '$course', q: '$quiz' }, best: { $max: '$percent' }, passed: { $max: '$passed' } } },
    ]),
  ]);

  const out = {};
  const ensure = (u, c) => {
    out[k(u)] ??= {};
    return (out[k(u)][k(c)] ??= { ...emptyProgress(totalFor(totals, c).total), _scores: [] });
  };
  for (const r of lessonRows) ensure(r._id.u, r._id.c).lessonsDone = r.n;
  for (const r of quizRows) {
    const p = ensure(r._id.u, r._id.c);
    if (r.passed) p.quizzesPassed++;
    p._scores.push(r.best);
  }
  for (const courses of Object.values(out)) {
    for (const p of Object.values(courses)) {
      p.done = p.lessonsDone + p.quizzesPassed;
      p.pct = p.total > 0 ? Math.floor(Math.min(100, (p.done * 100) / p.total)) : 0;
      p.avgScore = p._scores.length ? Math.round(p._scores.reduce((a, b) => a + b, 0) / p._scores.length) : null;
      delete p._scores;
    }
  }
  return out;
}

export const progressOf = (map, userId, courseId, total = 0) => map[k(userId)]?.[k(courseId)] || emptyProgress(total);

export async function progressFor(userId, courseId) {
  const [map, totals] = await Promise.all([progressMap([userId], [courseId]), courseTotals([courseId])]);
  return progressOf(map, userId, courseId, totalFor(totals, courseId).total);
}

export async function isEnrolled(userId, courseId) {
  return !!(await Enrolment.exists({ user: userId, course: courseId }));
}

function newCertificateCode() {
  const year = new Date().getFullYear();
  return `SHG-${year}-${crypto.randomBytes(6).toString('hex').slice(0, 10).toUpperCase()}`;
}

/**
 * Creates the learner's certificate for a course (never a second one).
 * With `pending`, it waits for the issuing authority (Department Head / administrator) to authorise it.
 */
export async function issueCertificate(userId, courseId, { pending = false, completedAt = new Date() } = {}) {
  const existing = await Certificate.findOne({ user: userId, course: courseId });
  if (existing) return existing.code;
  for (let i = 0; i < 5; i++) {
    try {
      const c = await Certificate.create({
        user: userId, course: courseId, code: newCertificateCode(), status: pending ? 'pending' : 'issued', completedAt,
      });
      if (pending) await announcePendingCertificate(c);
      return c.code;
    } catch (e) {
      if (e?.code !== 11000) throw e;
      const again = await Certificate.findOne({ user: userId, course: courseId });
      if (again) return again.code; // issued concurrently
    }
  }
  throw new Error('Could not issue certificate.');
}

/** Marks the enrolment complete and issues a certificate when everything is done. */
export async function checkCompletion(userId, courseId) {
  const enrol = await Enrolment.findOne({ user: userId, course: courseId });
  if (!enrol) return false;
  const [p, quizCount] = await Promise.all([progressFor(userId, courseId), Quiz.countDocuments({ course: courseId })]);
  const lessonCount = p.total - quizCount;
  const complete = p.total > 0 && p.lessonsDone >= lessonCount && p.quizzesPassed >= quizCount;

  if (complete && !enrol.completedAt) {
    const updated = await Enrolment.findOneAndUpdate({ _id: enrol._id, completedAt: null }, { completedAt: new Date() });
    if (updated) {
      const course = await Course.findById(courseId, 'certificateEnabled certificateRequiresApproval');
      if (course?.certificateEnabled) {
        await issueCertificate(userId, courseId, { pending: !!course.certificateRequiresApproval, completedAt: updated.completedAt || new Date() });
      }
    }
    if (enrol.via) notifyTalentPool(userId);
    return true;
  }
  if (enrol.via) notifyTalentPool(userId); // progress changed: the Talent Pool shows it
  return complete;
}

/** Tells the people who can authorise it that a certificate is waiting. */
async function announcePendingCertificate(cert) {
  const [course, learner] = await Promise.all([
    Course.findById(cert.course, 'title department').lean(),
    User.findById(cert.user, 'name').lean(),
  ]);
  const { notifyDepartmentHeads, notify } = await import('./notify.js');
  const message = {
    type: 'certificate',
    title: 'Certificate waiting for authorisation',
    body: `${learner?.name || 'A learner'} completed “${course?.title || 'a course'}”.`,
    link: '/manage/certificates',
  };
  if (course?.department) await notifyDepartmentHeads(course.department, message);
  else await notify((await User.find({ role: 'admin', active: true }, '_id').lean()).map((u) => u._id), message);
}

/** Enrols a user if not already enrolled. Returns true if a new enrolment was created. */
export async function enrol(userId, courseId, assignedBy = null, dueDate = null) {
  const existing = await Enrolment.findOne({ user: userId, course: courseId });
  if (existing) {
    if (dueDate) await Enrolment.updateOne({ _id: existing._id }, { dueDate });
    return false;
  }
  try {
    await Enrolment.create({ user: userId, course: courseId, assignedBy, dueDate: dueDate || null });
  } catch (e) {
    if (e?.code === 11000) return false;
    throw e;
  }
  // Work already done (e.g. after re-enrolment) still counts
  await checkCompletion(userId, courseId);
  return true;
}

/** Enrols a user in every course assigned to their team. Returns the number of new enrolments. */
export async function applyTeamCourses(userId) {
  const u = await User.findById(userId, 'team');
  if (!u?.team) return 0;
  let n = 0;
  for (const tc of await TeamCourse.find({ team: u.team })) {
    if (await isEnrolled(userId, tc.course)) continue;
    const due = tc.dueDays ? addDays(today(), tc.dueDays) : null;
    if (await enrol(userId, tc.course, tc.assignedBy, due)) n++;
  }
  return n;
}

/** Re-checks unfinished learners after content was removed from a course. */
export async function recheckCourse(courseId) {
  for (const e of await Enrolment.find({ course: courseId, completedAt: null }, 'user')) {
    await checkCompletion(e.user, courseId);
  }
}

/** Modules (sorted) and lessons sorted by module order, then lesson order. */
export async function courseStructure(courseId) {
  const modules = await Module.find({ course: courseId }).sort({ position: 1, _id: 1 }).lean();
  const order = new Map(modules.map((m, i) => [k(m._id), i]));
  const lessons = (await Lesson.find({ course: courseId }).sort({ position: 1, _id: 1 }).lean())
    .filter((l) => order.has(k(l.module)))
    .sort((a, b) => order.get(k(a.module)) - order.get(k(b.module)));
  return { modules, lessons };
}

/**
 * Course structure with the learner's status on every item, plus the next item to do.
 * { modules: [...with lessons], quizzes: [...], lessons: [...flat], next: {type, id, title} | null }
 */
export async function outline(courseId, userId) {
  const { modules, lessons } = await courseStructure(courseId);
  const [done, quizzes] = await Promise.all([
    LessonProgress.find({ user: userId, course: courseId }, 'lesson completedAt').lean(),
    Quiz.find({ course: courseId }).sort({ position: 1, _id: 1 }).lean(),
  ]);
  const doneAt = new Map(done.map((d) => [k(d.lesson), d.completedAt]));

  const flat = lessons.map((l) => ({
    _id: l._id, module: l.module, title: l.title, type: l.type, durationMin: l.durationMin,
    fileName: l.file?.name || null, completedAt: doneAt.get(k(l._id)) || null,
  }));
  const byModule = {};
  for (const l of flat) (byModule[k(l.module)] ??= []).push(l);
  const mods = modules.map((m) => ({ ...m, lessons: byModule[k(m._id)] || [] }));

  const quizIds = quizzes.map((q) => q._id);
  const [qCounts, stats] = await Promise.all([
    Question.aggregate([{ $match: { quiz: { $in: quizIds } } }, { $group: { _id: '$quiz', n: { $sum: 1 } } }]),
    QuizAttempt.aggregate([
      { $match: { quiz: { $in: quizIds }, user: toId(userId), status: 'submitted' } },
      { $group: { _id: '$quiz', best: { $max: '$percent' }, passed: { $max: '$passed' }, attempts: { $sum: 1 } } },
    ]),
  ]);
  const qc = new Map(qCounts.map((r) => [k(r._id), r.n]));
  const st = new Map(stats.map((r) => [k(r._id), r]));
  const qz = quizzes.map((q) => ({
    ...q,
    questionCount: qc.get(k(q._id)) || 0,
    best: st.get(k(q._id))?.best ?? null,
    passed: !!st.get(k(q._id))?.passed,
    attempts: st.get(k(q._id))?.attempts || 0,
  }));

  let next = null;
  const l = flat.find((x) => !x.completedAt);
  if (l) next = { type: 'lesson', id: k(l._id), title: l.title };
  else {
    const q = qz.find((x) => !x.passed);
    if (q) next = { type: 'quiz', id: k(q._id), title: q.title };
  }
  return { modules: mods, quizzes: qz, lessons: flat, next };
}
