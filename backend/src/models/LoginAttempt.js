import mongoose from 'mongoose';

/** Failed sign-ins. MongoDB removes each record automatically after 15 minutes. */
const loginAttemptSchema = new mongoose.Schema({
  email: { type: String, required: true },
  ip: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 15 * 60 },
});
loginAttemptSchema.index({ email: 1, ip: 1, createdAt: 1 });

export const LoginAttempt = mongoose.model('LoginAttempt', loginAttemptSchema);
