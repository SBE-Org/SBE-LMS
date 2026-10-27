/**
 * Connection with the Shaggar BPO Talent Pool.
 * The Talent Pool enrols approved talents in courses here; this side tells it when their progress changes,
 * so their status there moves from "Under training" to "Available" by itself.
 */
import crypto from 'node:crypto';
import { config } from '../config.js';
import { Course, Enrolment, Certificate, User } from '../models/index.js';
import { progressMap, courseTotals, totalFor, progressOf } from './progress.js';
import { certificateRule, courseFinished, allFinished } from './trainingRules.js';
import { learningBlock } from '../middleware/auth.js';

/** Enrolments made by the Talent Pool are marked with this, and only those are reported back. */
export const VIA = 'talent_pool';
export const integrationOn = () => !!config.integrationKey;

/** Constant-time comparison with INTEGRATION_KEY. */
export function keyMatches(given) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(String(config.integrationKey || ''));
  return b.length >= 16 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** The person's courses from the Talent Pool: progress, certificate and whether each one counts as finished. */
export async function trainingStatus(user) {
  const enrols = await Enrolment.find({ user: user._id, via: VIA }).sort({ enrolledAt: 1 }).lean();
  const ids = enrols.map((e) => e.course);
  const [courses, certs, map, totals] = await Promise.all([
    Course.find({ _id: { $in: ids } }, 'title certificateEnabled certificateRequiresApproval').lean(),
    Certificate.find({ user: user._id, course: { $in: ids } }).lean(),
    progressMap([user._id], ids),
    courseTotals(ids),
  ]);
  const list = enrols.map((e) => {
    const c = courses.find((x) => String(x._id) === String(e.course));
    const cert = certs.find((x) => String(x.course) === String(e.course)) || null;
    const rule = certificateRule(c);
    const p = progressOf(map, user._id, e.course, totalFor(totals, e.course).total);
    return {
      id: String(e.course), title: c?.title || 'A course that was removed', dueDate: e.dueDate || null, enrolledAt: e.enrolledAt,
      progress: { done: p.done, total: p.total, pct: p.pct }, completedAt: e.completedAt || null, rule,
      certificate: cert ? { status: cert.status || 'issued', code: cert.code } : null,
      ...courseFinished({ rule, completedAt: e.completedAt, certificate: cert }),
    };
  });
  const finished = allFinished(list);
  return {
    user: { id: String(user._id), email: user.email, name: user.name, signedIn: !!user.lastLoginAt, blocked: learningBlock(user)?.message || null },
    courses: list,
    finished,
    finishedAt: finished ? new Date(Math.max(...list.map((c) => new Date(c.finishedAt).getTime()))) : null,
  };
}

/** Sends the person's training status to the Talent Pool. Never throws; several changes in a row are sent once. */
const waiting = new Map();
export function notifyTalentPool(userId) {
  if (!integrationOn() || !config.talentPoolUrl || !userId) return;
  const key = String(userId);
  clearTimeout(waiting.get(key));
  waiting.set(key, setTimeout(() => { waiting.delete(key); send(key).catch((e) => console.error('[talent-pool]', e.message)); }, 1500));
}
async function send(userId) {
  if (!(await Enrolment.exists({ user: userId, via: VIA }))) return;
  const user = await User.findById(userId);
  if (!user) return;
  const res = await fetch(`${config.talentPoolUrl}/api/training/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Integration-Key': config.integrationKey },
    body: JSON.stringify(await trainingStatus(user)),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) console.error(`[talent-pool] update for ${user.email} was refused (${res.status})`);
}
