import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const quizSchema = new mongoose.Schema({
  course: { type: ObjectId, ref: 'Course', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, default: '' },
  passMark: { type: Number, default: 70, min: 0, max: 100 },
  timeLimitMin: { type: Number, default: null },
  maxAttempts: { type: Number, default: 0 }, // 0 = unlimited
  showAnswers: { type: Boolean, default: true },
  shuffleQuestions: { type: Boolean, default: false },
  position: { type: Number, default: 0 },
});
export const Quiz = mongoose.model('Quiz', quizSchema);

const choiceSchema = new mongoose.Schema({
  body: { type: String, required: true, maxlength: 500 },
  isCorrect: { type: Boolean, default: false },
  position: { type: Number, default: 0 },
});

const questionSchema = new mongoose.Schema({
  quiz: { type: ObjectId, ref: 'Quiz', required: true, index: true },
  course: { type: ObjectId, ref: 'Course', required: true, index: true },
  body: { type: String, required: true },
  type: { type: String, enum: ['single', 'multiple', 'truefalse'], default: 'single' },
  points: { type: Number, default: 1, min: 1, max: 100 },
  explanation: { type: String, default: null },
  position: { type: Number, default: 0 },
  choices: [choiceSchema],
});
export const Question = mongoose.model('Question', questionSchema);

const answerSchema = new mongoose.Schema(
  {
    question: { type: ObjectId, required: true },
    selected: [{ type: ObjectId }],
    correct: { type: Boolean, default: false },
    points: { type: Number, default: 0 },
  },
  { _id: false }
);

const attemptSchema = new mongoose.Schema({
  user: { type: ObjectId, ref: 'User', required: true },
  quiz: { type: ObjectId, ref: 'Quiz', required: true },
  course: { type: ObjectId, ref: 'Course', required: true, index: true },
  status: { type: String, enum: ['in_progress', 'grading', 'submitted'], default: 'in_progress' },
  questionOrder: [{ type: ObjectId }],
  startedAt: { type: Date, default: Date.now },
  submittedAt: { type: Date, default: null },
  score: { type: Number, default: 0 },
  maxScore: { type: Number, default: 0 },
  percent: { type: Number, default: 0 },
  passed: { type: Boolean, default: false },
  answers: [answerSchema],
  /**
   * Answers saved while the attempt is open ({ questionId: [choiceId…] }). When the time limit runs out and the
   * browser could not submit (closed tab, lost connection), the attempt is closed and graded with these.
   */
  draft: { type: mongoose.Schema.Types.Mixed, default: {} },
  draftAt: { type: Date, default: null },
});
attemptSchema.index({ user: 1, quiz: 1 });
attemptSchema.index({ status: 1, startedAt: 1 });
export const QuizAttempt = mongoose.model('QuizAttempt', attemptSchema);
