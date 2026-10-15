import { Router } from 'express';
import { Notification } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { arr, isId } from '../utils/http.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const [items, unread] = await Promise.all([
    Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(30).lean(),
    Notification.countDocuments({ user: req.user._id, readAt: null }),
  ]);
  res.json({ notifications: items, unread });
});

/** Marks the given notifications (or all of them) as read. Only ever touches the user's own. */
router.post('/read', async (req, res) => {
  const ids = arr(req.body?.ids).map(String).filter(isId);
  const filter = { user: req.user._id, readAt: null };
  if (ids.length) filter._id = { $in: ids };
  await Notification.updateMany(filter, { readAt: new Date() });
  res.json({ ok: true });
});

export default router;
