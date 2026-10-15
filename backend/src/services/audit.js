import { AuditLog } from '../models/index.js';

/** Keys that must never be written to the audit log. */
const SECRET = /pass|token|secret|hash/i;

function clean(details) {
  if (!details || typeof details !== 'object') return details ?? null;
  const out = Array.isArray(details) ? [] : {};
  for (const [k, v] of Object.entries(details)) {
    if (SECRET.test(k)) continue;
    out[k] = v && typeof v === 'object' && !(v instanceof Date) && !v._bsontype ? clean(v) : v;
  }
  return out;
}

/**
 * Records an important action. Never throws: an audit failure must not break the request,
 * but it is reported in the server log.
 */
export async function audit(req, action, { targetType = null, targetId = null, targetLabel = null, department = null, details = null } = {}) {
  try {
    const u = req?.user || null;
    await AuditLog.create({
      actor: u?._id || null,
      actorName: u?.name || null,
      actorRole: u?.role || null,
      action,
      targetType,
      targetId: targetId || null,
      targetLabel: targetLabel ? String(targetLabel).slice(0, 200) : null,
      department: department || null,
      details: clean(details),
      ip: req?.ip ? String(req.ip).slice(0, 45) : null,
    });
  } catch (e) {
    console.error('[audit] could not record', action, e?.message);
  }
}
