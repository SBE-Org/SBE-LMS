/** Quiz and question authoring, for administrators and trainers. */
import { Router } from 'express';
import { Course, Quiz, Question, QuizAttempt } from '../models/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { deleteQuiz, deleteQuestion, nextPosition, touchCourse } from '../services/content.js';
import { invalid, findOr404, str, intOr, bool, arr } from '../utils/http.js';

const router = Router();
router.use(requireAuth, requireRole('admin', 'trainer'));

const getQuiz = (id) => findOr404(Quiz, id, 'This quiz does not exist.');
const getCourse = (id) => findOr404(Course, id, 'This course does not exist.');
const getQuestion = (id) => findOr404(Question, id, 'This question does not exist.');

function quizData(b) {
  const t = intOr(b.timeLimitMin);
  return {
    title: str(b.title, 200),
    description: str(b.description),
    passMark: Math.max(0, Math.min(100, intOr(b.passMark, 70))),
    timeLimitMin: t && t > 0 ? Math.min(t, 600) : null,
    maxAttempts: Math.max(0, intOr(b.maxAttempts, 0)),
    showAnswers: bool(b.showAnswers),
    shuffleQuestions: bool(b.shuffleQuestions),
  };
}

router.get('/courses/:id/quiz-form', async (req, res) => {
  res.json({ course: await getCourse(req.params.id) });
});

router.post('/courses/:id/quizzes', async (req, res) => {
  const course = await getCourse(req.params.id);
  const data = quizData(req.body);
  if (!data.title) invalid(['Enter a quiz title.']);
  const quiz = await Quiz.create({ ...data, course: course._id, position: await nextPosition(Quiz, { course: course._id }) });
  await touchCourse(course._id);
  res.status(201).json({ quiz, message: 'Quiz created. Now add questions.' });
});

router.get('/quizzes/:id', async (req, res) => {
  const quiz = await getQuiz(req.params.id);
  const [course, questions, attempts] = await Promise.all([
    getCourse(quiz.course),
    Question.find({ quiz: quiz._id }).sort({ position: 1, _id: 1 }).lean(),
    QuizAttempt.countDocuments({ quiz: quiz._id, status: 'submitted' }),
  ]);
  for (const q of questions) q.choices.sort((a, b) => a.position - b.position);
  res.json({ quiz, course, questions, attempts });
});

router.put('/quizzes/:id', async (req, res) => {
  const quiz = await getQuiz(req.params.id);
  const data = quizData(req.body);
  if (!data.title) invalid(['Enter a quiz title.']);
  Object.assign(quiz, data);
  await quiz.save();
  res.json({ quiz, message: 'Quiz settings saved. Changes to the pass mark apply to new attempts.' });
});

router.delete('/quizzes/:id', async (req, res) => {
  const quiz = await getQuiz(req.params.id);
  await deleteQuiz(quiz._id);
  await touchCourse(quiz.course);
  res.json({ courseId: quiz.course, message: `Quiz “${quiz.title}” and its results were deleted.` });
});

// ---- questions --------------------------------------------------------------

/** Validates the question form. Returns { data, choices } or stops with 422. */
function questionInput(b) {
  const type = ['single', 'multiple', 'truefalse'].includes(b.type) ? b.type : 'single';
  const data = {
    body: str(b.body),
    type,
    points: Math.max(1, Math.min(100, intOr(b.points, 1))),
    explanation: str(b.explanation) || null,
  };
  let choices = [];
  if (type === 'truefalse') {
    const answer = b.tfAnswer === 'false' ? 'false' : 'true';
    choices = [{ body: 'True', isCorrect: answer === 'true' }, { body: 'False', isCorrect: answer === 'false' }];
  } else {
    // choices: [{ body, isCorrect }]
    choices = arr(b.choices)
      .map((c) => ({ body: str(c?.body, 500), isCorrect: bool(c?.isCorrect) }))
      .filter((c) => c.body !== '');
  }
  const errors = [];
  if (!data.body) errors.push('Enter the question text.');
  const nCorrect = choices.filter((c) => c.isCorrect).length;
  if (type !== 'truefalse') {
    if (choices.length < 2) errors.push('Add at least two answer options.');
    if (type === 'single' && nCorrect !== 1) errors.push('A single-answer question needs exactly one correct option.');
    if (type === 'multiple' && nCorrect < 1) errors.push('Mark at least one option as correct.');
  }
  if (errors.length) invalid(errors);
  return { data, choices };
}

router.get('/quizzes/:id/question-form', async (req, res) => {
  const quiz = await getQuiz(req.params.id);
  res.json({ quiz, course: await getCourse(quiz.course) });
});

router.post('/quizzes/:id/questions', async (req, res) => {
  const quiz = await getQuiz(req.params.id);
  const { data, choices } = questionInput(req.body);
  const question = await Question.create({
    ...data,
    quiz: quiz._id,
    course: quiz.course,
    position: await nextPosition(Question, { quiz: quiz._id }),
    choices: choices.map((c, i) => ({ ...c, position: i + 1 })),
  });
  res.status(201).json({ question, message: 'Question added.' });
});

router.get('/questions/:id', async (req, res) => {
  const question = await getQuestion(req.params.id);
  question.choices.sort((a, b) => a.position - b.position);
  const quiz = await getQuiz(question.quiz);
  res.json({ question, quiz, course: await getCourse(quiz.course) });
});

router.put('/questions/:id', async (req, res) => {
  const question = await getQuestion(req.params.id);
  const { data, choices } = questionInput(req.body);
  // Keep choice ids stable (update in place) so past attempts still show what was picked
  const old = [...question.choices].sort((a, b) => a.position - b.position);
  question.set(data);
  question.choices = choices.map((c, i) => (old[i] ? { _id: old[i]._id, ...c, position: i + 1 } : { ...c, position: i + 1 }));
  await question.save();
  res.json({ question, message: 'Question saved.' });
});

router.delete('/questions/:id', async (req, res) => {
  const question = await getQuestion(req.params.id);
  await deleteQuestion(question);
  res.json({ quizId: question.quiz, message: 'Question deleted.' });
});

export default router;
