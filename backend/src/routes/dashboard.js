import { Router } from 'express';
import { Enrolment, Certificate } from '../models/index.js';
import { requireAuth, hasRole, visibleTeamIds } from '../middleware/auth.js';
import { progressMap, progressOf, courseTotals, totalFor, outline } from '../services/progress.js';
import { summary } from '../services/reports.js';
import { today } from '../utils/dates.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const u = req.user;
  const rows = (await Enrolment.find({ user: u._id }).populate('course', 'title summary category status').lean())
    .filter((e) => e.course && e.course.status === 'published');
  // Unfinished first, then by due date, then title
  rows.sort((a, b) =>
    (a.completedAt ? 1 : 0) - (b.completedAt ? 1 : 0)
    || String(a.dueDate || '').localeCompare(String(b.dueDate || ''))
    || a.course.title.localeCompare(b.course.title));

  const courseIds = rows.map((e) => String(e.course._id));
  const [progress, totals] = await Promise.all([progressMap([u._id], courseIds), courseTotals(courseIds)]);
  const t = today();

  const active = [];
  const completed = [];
  for (const e of rows) {
    const item = {
      _id: e._id,
      courseId: e.course._id,
      title: e.course.title,
      summary: e.course.summary,
      category: e.course.category,
      dueDate: e.dueDate,
      completedAt: e.completedAt,
      progress: progressOf(progress, u._id, e.course._id, totalFor(totals, e.course._id).total),
      overdue: !e.completedAt && !!e.dueDate && e.dueDate < t,
    };
    (e.completedAt ? completed : active).push(item);
  }

  // "Continue where you left off": the first active course that has been started
  let resume = null;
  for (const e of active) {
    const o = await outline(e.courseId, u._id);
    if (o.next) {
      resume = { course: e, next: o.next };
      if (e.progress.pct > 0) break;
    }
  }

  const certificates = (await Certificate.find({ user: u._id }).populate('course', 'title').sort({ issuedAt: -1 }).limit(4).lean())
    .filter((c) => c.course)
    .map((c) => ({ _id: c._id, code: c.code, issuedAt: c.issuedAt, title: c.course.title }));

  const snapshot = hasRole(u, 'admin', 'trainer', 'team_lead') ? await summary(await visibleTeamIds(u)) : null;

  res.json({ active, completed, resume, certificates, snapshot });
});

export default router;
