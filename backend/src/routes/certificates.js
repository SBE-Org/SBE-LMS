import { Router } from 'express';
import { config } from '../config.js';
import { Certificate } from '../models/index.js';
import { requireAuth, canSeePerson } from '../middleware/auth.js';
import { fail, str } from '../utils/http.js';

const router = Router();

async function find(code) {
  const c = await Certificate.findOne({ code: str(code).toUpperCase() })
    .populate('course', 'title')
    .populate('user', 'name employeeId')
    .lean();
  if (!c || !c.course || !c.user) return null;
  return {
    _id: c._id,
    code: c.code,
    issuedAt: c.issuedAt,
    userId: c.user._id,
    learnerName: c.user.name,
    employeeId: c.user.employeeId,
    courseId: c.course._id,
    courseTitle: c.course.title,
  };
}

router.get('/certificates', requireAuth, async (req, res) => {
  const certs = await Certificate.find({ user: req.user._id }).populate('course', 'title category').sort({ issuedAt: -1 }).lean();
  res.json({
    certificates: certs.filter((c) => c.course).map((c) => ({
      _id: c._id, code: c.code, issuedAt: c.issuedAt, title: c.course.title, category: c.course.category,
    })),
  });
});

router.get('/certificates/:code', requireAuth, async (req, res) => {
  const cert = await find(req.params.code);
  if (!cert) fail(404, 'Certificate not found.');
  if (!(await canSeePerson(req.user, cert.userId))) fail(403, 'You do not have permission to open this certificate.');
  res.json({ certificate: cert, company: config.company, appName: config.appName });
});

/** Public: anyone can check that a certificate number is genuine. */
router.get('/verify', async (req, res) => {
  const code = str(req.query.code);
  const cert = code ? await find(code) : null;
  res.json({
    code,
    valid: !!cert,
    certificate: cert ? { code: cert.code, learnerName: cert.learnerName, courseTitle: cert.courseTitle, issuedAt: cert.issuedAt } : null,
  });
});

export default router;
