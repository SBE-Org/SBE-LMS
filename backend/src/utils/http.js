import mongoose from 'mongoose';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

/** Stops the request with an HTTP error. */
export function fail(status, message, extra) {
  throw new HttpError(status, message, extra);
}

/** Stops with 422 and a list of form errors. */
export function invalid(errors) {
  throw new HttpError(422, errors[0], { errors });
}

export const isId = (v) => typeof v === 'string' && mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(v);

export const toId = (v) => new mongoose.Types.ObjectId(String(v));

/** Loads a document by id or stops with 404. */
export async function findOr404(Model, id, message = 'Not found.', projection) {
  if (!isId(String(id))) fail(404, message);
  const doc = await Model.findById(id, projection);
  if (!doc) fail(404, message);
  return doc;
}

export const sameId = (a, b) => a != null && b != null && String(a._id ?? a) === String(b._id ?? b);

// ---- small input helpers (forms send strings, checkboxes, numbers) ----------

export const str = (v, max) => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  return max ? s.slice(0, max) : s;
};

export const intOr = (v, d = null) => {
  if (v === '' || v == null) return d;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

export const bool = (v) => v === true || v === 1 || v === '1' || v === 'true' || v === 'on';

export const arr = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many ?? one + 's'}`;

export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
