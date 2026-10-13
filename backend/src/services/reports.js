import { User, Team, Enrolment, Certificate } from '../models/index.js';
import { progressMap, progressOf } from './progress.js';
import { today } from '../utils/dates.js';
import { toId } from '../utils/http.js';

/** Active user ids (strings) in scope. teamIds null = everyone. */
export async function scopedUserIds(teamIds) {
  if (teamIds === null) return (await User.find({ active: true }, '_id').lean()).map((u) => String(u._id));
  if (!teamIds.length) return [];
  return (await User.find({ active: true, team: { $in: teamIds.map(toId) } }, '_id').lean()).map((u) => String(u._id));
}

/** Enrolments of the given people, flattened with course, person and team details. */
export async function scopedEnrolments(userIds, courseId = null) {
  if (!userIds.length) return [];
  const filter = { user: { $in: userIds.map(toId) } };
  if (courseId) filter.course = courseId;
  const rows = await Enrolment.find(filter)
    .populate('course', 'title status')
    .populate({ path: 'user', select: 'name email employeeId team lastLoginAt', populate: { path: 'team', select: 'name' } })
    .lean();
  return rows
    .filter((e) => e.course && e.user)
    .map((e) => ({
      _id: e._id,
      userId: String(e.user._id),
      courseId: String(e.course._id),
      courseTitle: e.course.title,
      courseStatus: e.course.status,
      name: e.user.name,
      email: e.user.email,
      employeeId: e.user.employeeId,
      teamId: e.user.team ? String(e.user.team._id) : null,
      teamName: e.user.team?.name || null,
      lastLoginAt: e.user.lastLoginAt,
      dueDate: e.dueDate,
      enrolledAt: e.enrolledAt,
      completedAt: e.completedAt,
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.courseTitle.localeCompare(b.courseTitle));
}

const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);

/** Headline numbers, used by the dashboard and the overview report. */
export async function summary(teamIds) {
  const userIds = await scopedUserIds(teamIds);
  const [enrolments, progress] = await Promise.all([scopedEnrolments(userIds), progressMap(userIds)]);
  const t = today();
  const learners = new Set();
  let completed = 0;
  let overdue = 0;
  const scores = [];
  for (const e of enrolments) {
    learners.add(e.userId);
    if (e.completedAt) completed++;
    else if (e.dueDate && e.dueDate < t) overdue++;
    const s = progressOf(progress, e.userId, e.courseId).avgScore;
    if (s !== null) scores.push(s);
  }
  const certificates = userIds.length ? await Certificate.countDocuments({ user: { $in: userIds.map(toId) } }) : 0;
  const total = enrolments.length;
  return {
    learners: learners.size,
    enrolments: total,
    completed,
    overdue,
    completionRate: total ? Math.round((completed * 100) / total) : 0,
    avgScore: avg(scores),
    certificates,
  };
}

/** Teams the viewer may filter reports by. */
export async function teamOptions(visible) {
  if (visible === null) return Team.find({}, 'name').sort({ name: 1 }).lean();
  if (!visible.length) return [];
  return Team.find({ _id: { $in: visible.map(toId) } }, 'name').sort({ name: 1 }).lean();
}

export { avg };
