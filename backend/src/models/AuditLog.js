import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

/** Append-only record of important actions. Never store passwords or tokens in `details`. */
const auditSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now, index: true },
  actor: { type: ObjectId, ref: 'User', default: null, index: true },
  actorName: { type: String, default: null },
  actorRole: { type: String, default: null },
  action: { type: String, required: true, index: true },
  targetType: { type: String, default: null },
  targetId: { type: ObjectId, default: null, index: true },
  targetLabel: { type: String, default: null },
  department: { type: ObjectId, ref: 'Department', default: null },
  details: { type: mongoose.Schema.Types.Mixed, default: null },
  ip: { type: String, default: null },
});

export const AuditLog = mongoose.model('AuditLog', auditSchema);
