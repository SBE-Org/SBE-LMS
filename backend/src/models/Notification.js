import mongoose from 'mongoose';

/** In-app notification shown in the bell menu and on dashboards. */
const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, default: 'info' },
  title: { type: String, required: true, maxlength: 200 },
  body: { type: String, maxlength: 2000, default: '' },
  link: { type: String, maxlength: 300, default: null },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});
notificationSchema.index({ user: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
