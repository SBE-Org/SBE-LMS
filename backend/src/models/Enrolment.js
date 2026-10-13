import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const enrolmentSchema = new mongoose.Schema({
  user: { type: ObjectId, ref: 'User', required: true },
  course: { type: ObjectId, ref: 'Course', required: true, index: true },
  assignedBy: { type: ObjectId, ref: 'User', default: null },
  dueDate: { type: String, default: null }, // YYYY-MM-DD in APP_TIMEZONE
  enrolledAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
});
enrolmentSchema.index({ user: 1, course: 1 }, { unique: true });
export const Enrolment = mongoose.model('Enrolment', enrolmentSchema);

/** A course assigned to a whole team: people who join the team later are enrolled too. */
const teamCourseSchema = new mongoose.Schema(
  {
    team: { type: ObjectId, ref: 'Team', required: true },
    course: { type: ObjectId, ref: 'Course', required: true, index: true },
    dueDays: { type: Number, default: null },
    assignedBy: { type: ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);
teamCourseSchema.index({ team: 1, course: 1 }, { unique: true });
export const TeamCourse = mongoose.model('TeamCourse', teamCourseSchema);

const lessonProgressSchema = new mongoose.Schema({
  user: { type: ObjectId, ref: 'User', required: true },
  lesson: { type: ObjectId, ref: 'Lesson', required: true, index: true },
  course: { type: ObjectId, ref: 'Course', required: true },
  completedAt: { type: Date, default: Date.now },
});
lessonProgressSchema.index({ user: 1, lesson: 1 }, { unique: true });
lessonProgressSchema.index({ user: 1, course: 1 });
export const LessonProgress = mongoose.model('LessonProgress', lessonProgressSchema);

const certificateSchema = new mongoose.Schema({
  user: { type: ObjectId, ref: 'User', required: true },
  course: { type: ObjectId, ref: 'Course', required: true, index: true },
  code: { type: String, required: true, unique: true },
  issuedAt: { type: Date, default: Date.now },
});
certificateSchema.index({ user: 1, course: 1 }, { unique: true });
export const Certificate = mongoose.model('Certificate', certificateSchema);
