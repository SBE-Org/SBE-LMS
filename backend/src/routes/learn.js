import { Router } from 'express';
import { Course, Lesson, Module, Enrolment, LessonProgress, Certificate } from '../models/index.js';
import { requireAuth, isStaff, signFileToken, verifyFileToken, loadUser } from '../middleware/auth.js';
import {
  progressMap, progressOf, progressFor, courseTotals, totalFor, outline, enrol, isEnrolled, checkCompletion,
} from '../services/progress.js';
import { sendStoredFile } from '../services/files.js';
import { fail, findOr404, str } from '../utils/http.js';

const router = Router();

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Loads a course the user may view, or stops with 403/404. */
export async function viewableCourse(user, courseId) {
  const course = await findOr404(Course, courseId, 'This course does not exist.');
  if (isStaff(user)) return course;
  if (course.status !== 'published') fail(404, 'This course is not available.');
  if (!(await isEnrolled(user._id, course._id)) && !course.selfEnrol) {
    fail(403, 'You are not enrolled in this course. Ask your trainer or team lead to assign it to you.');
  }
  return course;
}

router.get('/courses', requireAuth, async (req, res) => {
  const u = req.user;
  const q = str(req.query.q);
  const category = str(req.query.category);
  const filter = { status: 'published' };
  if (q) filter.$or = [{ title: new RegExp(escapeRegex(q), 'i') }, { summary: new RegExp(escapeRegex(q), 'i') }];
  if (category) filter.category = category;

  const [all, mine] = await Promise.all([
    Course.find(filter).sort({ title: 1 }).lean(),
    Enrolment.find({ user: u._id }).lean(),
  ]);
  const byCourse = new Map(mine.map((e) => [String(e.course), e]));
  // Learners only see courses they are in, plus courses open to everyone.
  const courses = all.filter((c) => byCourse.has(String(c._id)) || c.selfEnrol);
  const ids = courses.map((c) => String(c._id));
  const [progress, totals, categories] = await Promise.all([
    progressMap([u._id], ids),
    courseTotals(ids),
    Course.distinct('category', { status: 'published', category: { $nin: [null, ''] } }),
  ]);

  res.json({
    courses: courses.map((c) => {
      const e = byCourse.get(String(c._id));
      return {
        ...c,
        enrolmentId: e?._id || null,
        completedAt: e?.completedAt || null,
        dueDate: e?.dueDate || null,
        pct: progressOf(progress, u._id, c._id).pct,
        items: totalFor(totals, c._id).total,
      };
    }),
    categories: categories.sort((a, b) => a.localeCompare(b)),
  });
});

router.get('/courses/:id', requireAuth, async (req, res) => {
  const u = req.user;
  const course = await viewableCourse(u, req.params.id);
  const [enrolment, out, progress, certificate] = await Promise.all([
    Enrolment.findOne({ user: u._id, course: course._id }).lean(),
    outline(course._id, u._id),
    progressFor(u._id, course._id),
    Certificate.findOne({ user: u._id, course: course._id }).lean(),
  ]);
  res.json({ course, enrolment, outline: out, progress, certificate });
});

router.post('/courses/:id/enrol', requireAuth, async (req, res) => {
  const course = await Course.findOne({ _id: req.params.id, status: 'published' }).catch(() => null);
  if (!course || !course.selfEnrol) fail(403, 'This course is not open for self-enrolment.');
  await enrol(req.user._id, course._id);
  res.json({ message: `You are now enrolled in “${course.title}”.` });
});

async function loadLesson(id) {
  const lesson = await findOr404(Lesson, id, 'This lesson does not exist.');
  const mod = await Module.findById(lesson.module, 'title').lean();
  return { lesson, moduleTitle: mod?.title || '' };
}

router.get('/lessons/:id', requireAuth, async (req, res) => {
  const u = req.user;
  const { lesson, moduleTitle } = await loadLesson(req.params.id);
  const course = await viewableCourse(u, lesson.course);
  const enrolled = await isEnrolled(u._id, course._id);
  if (!enrolled && !isStaff(u)) {
    fail(403, 'Join the course to start learning.', { code: 'NOT_ENROLLED', courseId: String(course._id) });
  }
  const [out, done, progress] = await Promise.all([
    outline(course._id, u._id),
    LessonProgress.exists({ user: u._id, lesson: lesson._id }),
    progressFor(u._id, course._id),
  ]);
  const i = out.lessons.findIndex((l) => String(l._id) === String(lesson._id));
  const l = lesson.toObject();
  res.json({
    lesson: {
      ...l,
      moduleTitle,
      fileUrl: l.file?.id ? `/api/lessons/${l._id}/file?token=${encodeURIComponent(signFileToken(u._id, l._id))}` : null,
    },
    course,
    outline: out,
    prev: i > 0 ? out.lessons[i - 1] : null,
    next: i >= 0 && i < out.lessons.length - 1 ? out.lessons[i + 1] : null,
    done: !!done,
    enrolled,
    progress,
  });
});

router.post('/lessons/:id/complete', requireAuth, async (req, res) => {
  const u = req.user;
  const { lesson } = await loadLesson(req.params.id);
  await viewableCourse(u, lesson.course);
  if (!(await isEnrolled(u._id, lesson.course))) fail(403, 'You need to be enrolled in this course to record progress.');
  await LessonProgress.updateOne(
    { user: u._id, lesson: lesson._id },
    { $setOnInsert: { course: lesson.course, completedAt: new Date() } },
    { upsert: true }
  );
  const finished = await checkCompletion(u._id, lesson.course);
  const courseId = String(lesson.course);
  if (finished) {
    return res.json({ finished: true, message: 'Congratulations — you have completed this course!', redirect: `/courses/${courseId}` });
  }
  const o = await outline(lesson.course, u._id);
  const nextId = str(req.body.next);
  let redirect = `/courses/${courseId}`;
  if (nextId && o.lessons.some((x) => String(x._id) === nextId)) redirect = `/lessons/${nextId}`;
  else if (o.next) redirect = `${o.next.type === 'quiz' ? '/quizzes/' : '/lessons/'}${o.next.id}`;
  res.json({ finished: false, redirect });
});

/**
 * Lesson file. Opened directly by <video>, <iframe> and download links, which cannot send
 * an Authorization header, so it is authorised by the short-lived token in the URL.
 */
router.get('/lessons/:id/file', async (req, res) => {
  const userId = verifyFileToken(req.query.token, req.params.id);
  if (!userId) fail(401, 'This file link has expired. Reload the lesson page.');
  const u = await loadUser(userId);
  if (!u) fail(401, 'Please sign in.');
  const { lesson } = await loadLesson(req.params.id);
  await viewableCourse(u, lesson.course);
  if (!isStaff(u) && !(await isEnrolled(u._id, lesson.course))) fail(403, 'You do not have access to this file.');
  if (!lesson.file?.id) fail(404, 'This lesson has no file.');
  await sendStoredFile(req, res, lesson.file, req.query.download === '1');
});

export default router;
