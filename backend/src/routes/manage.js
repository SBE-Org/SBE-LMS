/** Course authoring and enrolment, for administrators and trainers. */
import { Router } from 'express';
import {
  Course, Module, Lesson, Quiz, Question, Enrolment, TeamCourse, Team, User, ROLES,
} from '../models/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { progressMap, progressOf, enrol, recheckCourse, courseStructure } from '../services/progress.js';
import { upload, storeUpload, deleteStoredFile, removeTemp, checkUploadType } from '../services/files.js';
import { deleteCourse, deleteLessons, move, nextPosition, touchCourse } from '../services/content.js';
import { parseVideoUrl } from '../utils/video.js';
import { today, daysUntil, isYmd } from '../utils/dates.js';
import { fail, invalid, findOr404, str, intOr, bool, arr, plural, isId, toId, sameId } from '../utils/http.js';

const router = Router();
router.use(requireAuth, requireRole('admin', 'trainer'));

const STATUSES = ['draft', 'published', 'archived'];
const getCourse = (id) => findOr404(Course, id, 'This course does not exist.');
const getModule = (id) => findOr404(Module, id, 'This module does not exist.');
const getLesson = (id) => findOr404(Lesson, id, 'This lesson does not exist.');

async function categories() {
  return (await Course.distinct('category', { category: { $nin: [null, ''] } })).sort((a, b) => a.localeCompare(b));
}

// ---- courses ----------------------------------------------------------------

router.get('/courses', async (req, res) => {
  const status = str(req.query.status);
  const filter = STATUSES.includes(status) ? { status } : {};
  const courses = await Course.find(filter).populate('createdBy', 'name').sort({ updatedAt: -1 }).lean();
  const ids = courses.map((c) => c._id);
  const count = (Model, extra = {}) =>
    Model.aggregate([{ $match: { course: { $in: ids }, ...extra } }, { $group: { _id: '$course', n: { $sum: 1 } } }])
      .then((rows) => new Map(rows.map((r) => [String(r._id), r.n])));
  const [modules, lessons, quizzes, enrolled, completed] = await Promise.all([
    count(Module), count(Lesson), count(Quiz), count(Enrolment), count(Enrolment, { completedAt: { $ne: null } }),
  ]);
  res.json({
    courses: courses.map((c) => {
      const k = String(c._id);
      return {
        ...c,
        author: c.createdBy?.name || null,
        moduleCount: modules.get(k) || 0,
        lessonCount: lessons.get(k) || 0,
        quizCount: quizzes.get(k) || 0,
        enrolled: enrolled.get(k) || 0,
        completed: completed.get(k) || 0,
      };
    }),
  });
});

router.get('/categories', async (req, res) => res.json({ categories: await categories() }));

function courseData(body) {
  return {
    title: str(body.title, 200),
    summary: str(body.summary),
    category: str(body.category, 80) || null,
    status: STATUSES.includes(body.status) ? body.status : 'draft',
    selfEnrol: bool(body.selfEnrol),
    certificateEnabled: bool(body.certificateEnabled),
  };
}

router.post('/courses', async (req, res) => {
  const data = courseData(req.body);
  if (!data.title) invalid(['Enter a course title.']);
  const course = await Course.create({ ...data, createdBy: req.user._id });
  await Module.create({ course: course._id, title: 'Module 1', position: 1 });
  res.status(201).json({ course, message: 'Course created. Now add lessons and a quiz.' });
});

router.get('/courses/:id', async (req, res) => {
  const course = await getCourse(req.params.id);
  const { modules, lessons } = await courseStructure(course._id);
  const byModule = {};
  for (const l of lessons) (byModule[String(l.module)] ??= []).push(l);
  const quizzes = await Quiz.find({ course: course._id }).sort({ position: 1, _id: 1 }).lean();
  const qStats = await Question.aggregate([
    { $match: { quiz: { $in: quizzes.map((q) => q._id) } } },
    { $group: { _id: '$quiz', n: { $sum: 1 }, points: { $sum: '$points' } } },
  ]);
  const qs = new Map(qStats.map((r) => [String(r._id), r]));
  res.json({
    course,
    modules: modules.map((m) => ({ ...m, lessons: byModule[String(m._id)] || [] })),
    quizzes: quizzes.map((q) => ({ ...q, questionCount: qs.get(String(q._id))?.n || 0, totalPoints: qs.get(String(q._id))?.points || 0 })),
    enrolled: await Enrolment.countDocuments({ course: course._id }),
    categories: await categories(),
  });
});

router.put('/courses/:id', async (req, res) => {
  const course = await getCourse(req.params.id);
  const data = courseData(req.body);
  if (!data.title) invalid(['Enter a course title.']);
  Object.assign(course, data);
  await course.save();
  res.json({ course, message: 'Course saved.' });
});

router.delete('/courses/:id', async (req, res) => {
  const course = await getCourse(req.params.id);
  if (str(req.body?.confirmTitle) !== course.title) {
    fail(422, 'To delete, type the exact course title. Nothing was deleted.');
  }
  await deleteCourse(course._id);
  res.json({ message: `Course “${course.title}” was deleted.` });
});

// ---- modules ----------------------------------------------------------------

router.post('/courses/:id/modules', async (req, res) => {
  const course = await getCourse(req.params.id);
  const title = str(req.body.title, 200);
  if (!title) invalid(['Enter a module title.']);
  const m = await Module.create({ course: course._id, title, position: await nextPosition(Module, { course: course._id }) });
  await touchCourse(course._id);
  res.status(201).json({ module: m, message: 'Module added.' });
});

router.get('/modules/:id', async (req, res) => {
  const m = await getModule(req.params.id);
  const course = await getCourse(m.course);
  const modules = await Module.find({ course: course._id }, 'title').sort({ position: 1, _id: 1 }).lean();
  res.json({ module: m, course, modules });
});

router.put('/modules/:id', async (req, res) => {
  const m = await getModule(req.params.id);
  const title = str(req.body.title, 200);
  if (!title) invalid(['Enter a module title.']);
  m.title = title;
  await m.save();
  await touchCourse(m.course);
  res.json({ module: m, message: 'Module renamed.' });
});

router.delete('/modules/:id', async (req, res) => {
  const m = await getModule(req.params.id);
  await deleteLessons({ module: m._id });
  await Module.deleteOne({ _id: m._id });
  await touchCourse(m.course);
  await recheckCourse(m.course);
  res.json({ message: `Module “${m.title}” and its lessons were deleted.` });
});

router.post('/modules/:id/move', async (req, res) => {
  const m = await getModule(req.params.id);
  await move(Module, { course: m.course }, m._id, req.body.dir === 'up' ? -1 : 1);
  res.json({ ok: true });
});

// ---- lessons ----------------------------------------------------------------

router.get('/lessons/:id', async (req, res) => {
  const lesson = await getLesson(req.params.id);
  const m = await getModule(lesson.module);
  const course = await getCourse(m.course);
  const modules = await Module.find({ course: course._id }, 'title').sort({ position: 1, _id: 1 }).lean();
  res.json({ lesson, module: m, course, modules });
});

/** Shared by create and update. `existing` is null for a new lesson. */
async function saveLesson(req, res, module, existing) {
  const course = await getCourse(module.course);
  const b = req.body || {};
  const file = req.file || null;
  try {
    const type = ['text', 'video', 'file'].includes(b.type) ? b.type : 'text';
    let target = module._id;
    if (isId(b.moduleId) && (await Module.exists({ _id: b.moduleId, course: course._id }))) target = toId(b.moduleId);
    const data = {
      module: target,
      course: course._id,
      title: str(b.title, 200),
      type,
      body: typeof b.body === 'string' ? b.body : '',
      videoUrl: str(b.videoUrl, 500) || null,
      durationMin: intOr(b.durationMin),
    };
    const errors = [];
    if (!data.title) errors.push('Enter a lesson title.');
    if (type === 'video' && data.videoUrl && !parseVideoUrl(data.videoUrl)) {
      errors.push('The video link must be a YouTube or Vimeo link, or a direct link to an .mp4/.webm file. You can also upload the video file instead.');
    }
    const hasOld = !!existing?.file?.id;
    if (type === 'file' && !file && !hasOld) errors.push('Choose a file to upload for this lesson.');
    if (type === 'video' && !data.videoUrl && !file && !hasOld) errors.push('Add a video link or upload a video file.');
    if (!errors.length && file) {
      try {
        checkUploadType(file);
      } catch (e) {
        errors.push(e.message);
      }
    }
    if (errors.length) invalid(errors);

    if (file) {
      data.file = await storeUpload(file);
      if (hasOld) await deleteStoredFile(existing.file.id);
    } else if (existing && bool(b.removeFile) && hasOld) {
      await deleteStoredFile(existing.file.id);
      data.file = { id: null, name: null, contentType: null, size: null };
    }

    let lesson;
    if (existing) {
      if (!sameId(existing.module, target)) data.position = await nextPosition(Lesson, { module: target });
      Object.assign(existing, data);
      lesson = await existing.save();
    } else {
      lesson = await Lesson.create({ ...data, position: await nextPosition(Lesson, { module: target }) });
    }
    await touchCourse(course._id);
    res.status(existing ? 200 : 201).json({ lesson, courseId: course._id, message: existing ? 'Lesson saved.' : 'Lesson added.' });
  } finally {
    removeTemp(file);
  }
}

router.post('/modules/:id/lessons', upload.single('file'), async (req, res) => {
  await saveLesson(req, res, await getModule(req.params.id), null);
});

router.put('/lessons/:id', upload.single('file'), async (req, res) => {
  const lesson = await getLesson(req.params.id);
  await saveLesson(req, res, await getModule(lesson.module), lesson);
});

router.delete('/lessons/:id', async (req, res) => {
  const lesson = await getLesson(req.params.id);
  await deleteLessons({ _id: lesson._id });
  await touchCourse(lesson.course);
  await recheckCourse(lesson.course);
  res.json({ message: `Lesson “${lesson.title}” deleted.` });
});

router.post('/lessons/:id/move', async (req, res) => {
  const lesson = await getLesson(req.params.id);
  await move(Lesson, { module: lesson.module }, lesson._id, req.body.dir === 'up' ? -1 : 1);
  res.json({ ok: true });
});

// ---- enrolment --------------------------------------------------------------

router.get('/courses/:id/enrolments', async (req, res) => {
  const course = await getCourse(req.params.id);
  const rows = await Enrolment.find({ course: course._id })
    .populate({ path: 'user', select: 'name email employeeId team', populate: { path: 'team', select: 'name' } })
    .populate('assignedBy', 'name')
    .lean();
  const enrolled = rows.filter((e) => e.user).sort((a, b) => a.user.name.localeCompare(b.user.name));
  const progress = await progressMap(enrolled.map((e) => e.user._id), [course._id]);

  const memberCounts = new Map(
    (await User.aggregate([{ $match: { active: true, team: { $ne: null } } }, { $group: { _id: '$team', n: { $sum: 1 } } }]))
      .map((r) => [String(r._id), r.n])
  );
  const teams = (await Team.find({}, 'name campaign').sort({ name: 1 }).lean()).map((t) => ({ ...t, members: memberCounts.get(String(t._id)) || 0 }));
  const teamAssignments = (await TeamCourse.find({ course: course._id }).populate('team', 'name campaign').lean())
    .filter((tc) => tc.team)
    .map((tc) => ({ _id: tc._id, dueDays: tc.dueDays, teamId: tc.team._id, name: tc.team.name, campaign: tc.team.campaign, members: memberCounts.get(String(tc.team._id)) || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const enrolledIds = new Set(enrolled.map((e) => String(e.user._id)));
  const users = (await User.find({ active: true }, 'name email role team').populate('team', 'name').lean())
    .filter((u) => !enrolledIds.has(String(u._id)))
    .map((u) => ({ _id: u._id, name: u.name, email: u.email, role: u.role, roleLabel: ROLES[u.role], teamName: u.team?.name || null }))
    .sort((a, b) => String(a.teamName || '~').localeCompare(String(b.teamName || '~')) || a.name.localeCompare(b.name));

  res.json({
    course,
    today: today(),
    enrolled: enrolled.map((e) => ({
      _id: e._id,
      userId: e.user._id,
      name: e.user.name,
      email: e.user.email,
      employeeId: e.user.employeeId,
      teamName: e.user.team?.name || null,
      assignedByName: e.assignedBy?.name || null,
      dueDate: e.dueDate,
      enrolledAt: e.enrolledAt,
      completedAt: e.completedAt,
      pct: progressOf(progress, e.user._id, course._id).pct,
    })),
    teamAssignments,
    teams,
    users,
  });
});

router.post('/courses/:id/enrolments', async (req, res) => {
  const course = await getCourse(req.params.id);
  const due = isYmd(req.body.dueDate) ? req.body.dueDate : null;
  let count = 0;

  for (const userId of arr(req.body.userIds)) {
    if (isId(String(userId)) && (await User.exists({ _id: userId, active: true }))) {
      if (await enrol(toId(userId), course._id, req.user._id, due)) count++;
    }
  }
  for (const teamId of arr(req.body.teamIds)) {
    if (!isId(String(teamId)) || !(await Team.exists({ _id: teamId }))) continue;
    const dueDays = due ? Math.max(1, daysUntil(due)) : null;
    if (bool(req.body.autoEnrolNew)) {
      await TeamCourse.updateOne(
        { team: teamId, course: course._id },
        { $set: { dueDays }, $setOnInsert: { assignedBy: req.user._id } },
        { upsert: true }
      );
    }
    for (const member of await User.find({ team: teamId, active: true }, '_id').lean()) {
      if (await enrol(member._id, course._id, req.user._id, due)) count++;
    }
  }

  const messages = [];
  if (course.status !== 'published') {
    messages.push({ type: 'info', message: 'Note: this course is still a draft, so learners will not see it until you publish it.' });
  }
  messages.push({
    type: 'success',
    message: count > 0 ? `${plural(count, 'learner')} enrolled.` : 'No new learners were enrolled (they may already be enrolled). Due dates were updated.',
  });
  res.json({ count, messages });
});

router.delete('/enrolments/:id', async (req, res) => {
  const e = await findOr404(Enrolment, req.params.id);
  await Enrolment.deleteOne({ _id: e._id });
  res.json({ message: 'Learner removed from the course. Their past progress is kept if they are enrolled again.' });
});

router.delete('/team-courses/:id', async (req, res) => {
  const tc = await findOr404(TeamCourse, req.params.id);
  await TeamCourse.deleteOne({ _id: tc._id });
  res.json({ message: 'New team members will no longer be enrolled automatically. Current enrolments are unchanged.' });
});

export default router;
