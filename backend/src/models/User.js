import mongoose from 'mongoose';

export const ROLES = {
  admin: 'Administrator',
  trainer: 'Trainer',
  team_lead: 'Team Lead',
  agent: 'Agent',
};

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 190 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.keys(ROLES), default: 'agent' },
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null, index: true },
    employeeId: { type: String, trim: true, maxlength: 50, default: null },
    active: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: false },
    // Bumped when the password changes, so older sign-in tokens stop working.
    tokenVersion: { type: Number, default: 0, select: false },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
