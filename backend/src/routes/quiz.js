import { Router } from 'express';
import { Quiz, Question, QuizAttempt, Course, Enrolment, User } from '../models/index.js';
import { requireAuth, canSeePerson } from '../middleware/auth.js';
import { viewableCourse } from './learn.js';
import { isEnrolled, checkCompletion } from '../services/progress.js';
import { fail, findOr404, sameId } from '../utils/http.js';

const router = Router();

/** Seconds of grace after the time limit before a late submission is refused. */
const GRACE_SECONDS = 90;

const loadQuiz = (id) => findOr404(Quiz, id, 'This quiz does not exist.');

async function loadAttempt(user, id) {
  const a = await findOr404(QuizAttempt, id, 'This attempt does not exist.');
  if (!(await canSeePerson(user, a.user))) fail(403, 'You do not have permission to open this page.');
  return a;
}

const deadline = (quiz, attempt) => (quiz.timeLimitMin ? attempt.startedAt.getTime() + quiz.timeLimitMin * 60000 : null);

/** Questions of an attempt in the order the learner saw them, with their choices. */
async function attemptQuestions(attempt) {
  const order = attempt.questionOrder.map(String);
  if (!order.length) return [];
  const rows = await Question.find({ _id: { $in: attempt.questionOrder } }).lean();
  const byId = new Map(rows.map((q) => [String(q._id), { ...q, choices: [...q.choices].sort((a, b) => a.position - b.position) }]));
  return order.map((id) => byId.get(id)).filter(Boolean);
}

router.get('/quizzes/:id', requireAuth, async (req, res) => {
  const u = req.user;
  const quiz = await loadQuiz(req.params.id);
  const course = await viewableCourse(u, quiz.course);
  const [enrolled, attempts, questionCount] = await Promise.all([
    isEnrolled(u._id, course._id),
    QuizAttempt.find({ user: u._id, quiz: quiz._id }, '-answers -questionOrder').sort({ startedAt: -1, _id: -1 }).lean(),
    Question.countDocuments({ quiz: quiz._id }),
  ]);
  const submitted = attempts.filter((a) => a.status === 'submitted');
  const open = attempts.find((a) => a.status === 'in_progress') || null;
  res.json({
    quiz,
    course,
    enrolled,
    attempts: submitted,
    open,
    questionCount,
    remaining: quiz.maxAttempts > 0 ? Math.max(0, quiz.maxAttempts - submitted.length) : null,
    passed: submitted.some((a) => a.passed),
    best: submitted.length ? Math.max(...submitted.map((a) => a.percent)) : null,
  });
});

router.post('/quizzes/:id/start', requireAuth, async (req, res) => {
  const u = req.user;
  const quiz = await loadQuiz(req.params.id);
  await viewableCourse(u, quiz.course);
  if (!(await isEnrolled(u._id, quiz.course))) fail(403, 'You need to be enrolled in the course to take this quiz.');

  const open = await QuizAttempt.findOne({ user: u._id, quiz: quiz._id, status: 'in_progress' }).sort({ _id: -1 });
  if (open) return res.json({ attemptId: open._id });

  const used = await QuizAttempt.countDocuments({ user: u._id, quiz: quiz._id, status: 'submitted' });
  if (quiz.maxAttempts > 0 && used >= quiz.maxAttempts) fail(400, 'You have used all your attempts for this quiz.');

  const ids = (await Question.find({ quiz: quiz._id }, '_id').sort({ position: 1, _id: 1 }).lean()).map((q) => q._id);
  if (!ids.length) fail(400, 'This quiz has no questions yet.');
  if (quiz.shuffleQuestions) {
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
  }
  const attempt = await QuizAttempt.create({ user: u._id, quiz: quiz._id, course: quiz.course, questionOrder: ids });
  res.status(201).json({ attemptId: attempt._id });
});

/**
 * Scores an attempt. Single choice and true/false: the chosen option must be correct.
 * Multiple choice: the selected set must match the correct set exactly.
 */
async function grade(attempt, quiz, answers) {
  // Lock against double submission
  const locked = await QuizAttempt.findOneAndUpdate({ _id: attempt._id, status: 'in_progress' }, { status: 'grading' });
  if (!locked) return;
  const questions = await attemptQuestions(attempt);
  let score = 0;
  let max = 0;
  const graded = [];
  for (const q of questions) {
    const valid = new Set(q.choices.map((c) => String(c._id)));
    const correctSet = q.choices.filter((c) => c.isCorrect).map((c) => String(c._id)).sort();
    const raw = answers?.[String(q._id)];
    const selected = [...new Set((Array.isArray(raw) ? raw : raw == null ? [] : [raw]).map(String))].filter((id) => valid.has(id)).sort();
    const isCorrect = selected.length > 0 && selected.length === correctSet.length && selected.every((id, i) => id === correctSet[i]);
    max += q.points;
    if (isCorrect) score += q.points;
    graded.push({ question: q._id, selected, correct: isCorrect, points: isCorrect ? q.points : 0 });
  }
  const percent = max > 0 ? Math.floor((score * 100) / max) : 0;
  await QuizAttempt.updateOne(
    { _id: attempt._id },
    { status: 'submitted', submittedAt: new Date(), score, maxScore: max, percent, passed: percent >= quiz.passMark, answers: graded }
  );
  await checkCompletion(attempt.user, quiz.course);
}

router.get('/attempts/:id', requireAuth, async (req, res) => {
  const attempt = await loadAttempt(req.user, req.params.id);
  if (!sameId(attempt.user, req.user)) fail(403, 'You do not have permission to open this page.');
  if (attempt.status !== 'in_progress') return res.json({ status: 'submitted' });
  const quiz = await loadQuiz(attempt.quiz);
  const course = await viewableCourse(req.user, quiz.course);
  const end = deadline(quiz, attempt);
  if (end && Date.now() > end + GRACE_SECONDS * 1000) {
    await grade(attempt, quiz, {});
    return res.json({ status: 'submitted', message: 'Time ran out for this attempt, so it was submitted without further answers.' });
  }
  const questions = (await attemptQuestions(attempt)).map((q) => ({
    _id: q._id,
    body: q.body,
    type: q.type,
    points: q.points,
    // Never send which answer is correct while the attempt is open
    choices: q.choices.map((c) => ({ _id: c._id, body: c.body })),
  }));
  res.json({
    status: 'in_progress',
    attempt: { _id: attempt._id, startedAt: attempt.startedAt },
    quiz: { _id: quiz._id, title: quiz.title, timeLimitMin: quiz.timeLimitMin },
    course: { _id: course._id, title: course.title },
    questions,
    secondsLeft: end ? Math.max(0, Math.round((end - Date.now()) / 1000)) : null,
  });
});

router.post('/attempts/:id', requireAuth, async (req, res) => {
  const attempt = await loadAttempt(req.user, req.params.id);
  if (!sameId(attempt.user, req.user)) fail(403, 'You do not have permission to open this page.');
  if (attempt.status !== 'in_progress') return res.json({ status: 'submitted' });
  const quiz = await loadQuiz(attempt.quiz);
  const end = deadline(quiz, attempt);
  let answers = req.body.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
  let message = null;
  if (end && Date.now() > end + GRACE_SECONDS * 1000) {
    answers = {};
    message = 'This attempt was submitted after the time limit, so the answers could not be accepted.';
  }
  await grade(attempt, quiz, answers);
  res.json({ status: 'submitted', message });
});

router.get('/attempts/:id/result', requireAuth, async (req, res) => {
  const u = req.user;
  const attempt = await loadAttempt(u, req.params.id);
  const isOwner = sameId(attempt.user, u);
  if (attempt.status !== 'submitted') {
    if (isOwner) return res.json({ status: 'in_progress' });
    fail(404, 'This attempt has not been submitted yet.');
  }
  const quiz = await loadQuiz(attempt.quiz);
  const [course, questions, learner, used, enrolment] = await Promise.all([
    Course.findById(quiz.course, 'title').lean(),
    attemptQuestions(attempt),
    User.findById(attempt.user, 'name').lean(),
    QuizAttempt.countDocuments({ user: attempt.user, quiz: quiz._id, status: 'submitted' }),
    Enrolment.findOne({ user: attempt.user, course: quiz.course }, 'completedAt').lean(),
  ]);
  const showAnswers = quiz.showAnswers || !isOwner;
  const answers = Object.fromEntries(attempt.answers.map((a) => [String(a.question), { correct: a.correct, selected: a.selected.map(String) }]));
  res.json({
    status: 'submitted',
    attempt: {
      _id: attempt._id, user: attempt.user, score: attempt.score, maxScore: attempt.maxScore,
      percent: attempt.percent, passed: attempt.passed, submittedAt: attempt.submittedAt,
    },
    quiz: { _id: quiz._id, title: quiz.title, passMark: quiz.passMark },
    course,
    learner,
    isOwner,
    showAnswers,
    canRetry: isOwner && (quiz.maxAttempts === 0 || used < quiz.maxAttempts),
    courseComplete: !!enrolment?.completedAt,
    answers,
    questions: questions.map((q) => ({
      _id: q._id,
      body: q.body,
      type: q.type,
      explanation: showAnswers ? q.explanation : null,
      choices: q.choices.map((c) => ({ _id: c._id, body: c.body, isCorrect: showAnswers ? c.isCorrect : undefined })),
    })),
  });
});

export default router;
