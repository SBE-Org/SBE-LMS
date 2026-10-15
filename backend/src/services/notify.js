import { Notification, User } from '../models/index.js';

/** Sends an in-app notification to one or more users. Never throws. */
export async function notify(userIds, { title, body = '', link = null, type = 'info' }) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(String))];
  if (!ids.length) return;
  try {
    await Notification.insertMany(ids.map((user) => ({ user, title: String(title).slice(0, 200), body: String(body || '').slice(0, 2000), link, type })));
  } catch (e) {
    console.error('[notify] failed', e?.message);
  }
}

/** Active Department Heads of a department. */
export async function departmentHeadIds(departmentId) {
  if (!departmentId) return [];
  return (await User.find({ role: 'department_head', active: true, departments: departmentId }, '_id').lean()).map((u) => u._id);
}

export async function notifyDepartmentHeads(departmentId, message) {
  await notify(await departmentHeadIds(departmentId), message);
}
