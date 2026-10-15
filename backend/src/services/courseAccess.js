import { Course } from '../models/index.js';
import { courseScope, canManageCourse } from '../middleware/auth.js';
import { fail, findOr404 } from '../utils/http.js';

/**
 * Course authoring scope. Administrators and trainers manage every course; a Department
 * Head only the courses of their own departments. Checked on every authoring request.
 */
export async function assertCourseAccess(req, courseId) {
  if (courseScope(req.user) === null) return;
  const c = await Course.findById(courseId, 'department').lean();
  if (!c) fail(404, 'This course does not exist.');
  if (!canManageCourse(req.user, c)) fail(403, 'This course belongs to a department you do not manage.');
}

/** Loads a document whose `course` (or itself, for Course) must be in the user's scope. */
export async function scoped(req, Model, id, message, courseField = 'course') {
  const doc = await findOr404(Model, id, message);
  await assertCourseAccess(req, Model === Course ? doc._id : doc[courseField]);
  return doc;
}
