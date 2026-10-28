/**
 * Cascading deletes and re-ordering. MongoDB has no foreign keys, so removing a
 * course, module, lesson or quiz also removes everything that belonged to it here.
 */
import {
  Course, Module, Lesson, Quiz, Question, QuizAttempt, Enrolment, TeamCourse, LessonProgress, Certificate,
} from '../models/index.js';
import { deleteStoredFile } from './files.js';

export async function deleteLessons(filter) {
  const lessons = await Lesson.find(filter, '_id file').lean();
  if (!lessons.length) return;
  const ids = lessons.map((l) => l._id);
  await Promise.all([Lesson.deleteMany({ _id: { $in: ids } }), LessonProgress.deleteMany({ lesson: { $in: ids } })]);
  await Promise.all(lessons.map((l) => deleteStoredFile(l.file?.id)));
}

export async function deleteQuiz(quizId) {
  await Promise.all([
    Quiz.deleteOne({ _id: quizId }),
    Question.deleteMany({ quiz: quizId }),
    QuizAttempt.deleteMany({ quiz: quizId }),
  ]);
}

export async function deleteQuestion(question) {
  await Question.deleteOne({ _id: question._id });
  // Like the original foreign keys: answers to this question disappear from past attempts.
  await QuizAttempt.updateMany(
    { quiz: question.quiz },
    { $pull: { answers: { question: question._id }, questionOrder: question._id } }
  );
}

export async function deleteCourse(courseId) {
  await deleteLessons({ course: courseId });
  await Promise.all([
    Module.deleteMany({ course: courseId }),
    Quiz.deleteMany({ course: courseId }),
    Question.deleteMany({ course: courseId }),
    QuizAttempt.deleteMany({ course: courseId }),
    Enrolment.deleteMany({ course: courseId }),
    TeamCourse.deleteMany({ course: courseId }),
    Certificate.deleteMany({ course: courseId }),
  ]);
  await Course.deleteOne({ _id: courseId });
}

/** Swaps an item with its neighbor, renumbering positions 1..n. */
export async function move(Model, parentFilter, itemId, dir) {
  const ids = (await Model.find(parentFilter, '_id').sort({ position: 1, _id: 1 }).lean()).map((d) => String(d._id));
  const i = ids.indexOf(String(itemId));
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await Model.bulkWrite(ids.map((id, pos) => ({ updateOne: { filter: { _id: id }, update: { position: pos + 1 } } })));
}

export async function nextPosition(Model, filter) {
  const last = await Model.findOne(filter, 'position').sort({ position: -1 }).lean();
  return (last?.position || 0) + 1;
}

export const touchCourse = (courseId) => Course.updateOne({ _id: courseId }, { $currentDate: { updatedAt: true } });
