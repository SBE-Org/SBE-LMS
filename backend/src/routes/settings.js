/**
 * Branding and appearance, certificate layout and registration-form settings.
 *
 *   GET    /api/branding/files/:id          public: logo / seal / signature image
 *   GET    /api/admin/settings              administrators
 *   PUT    /api/admin/settings              administrators
 *   POST   /api/admin/settings/files/:kind  administrators: upload logo, certificate logo, seal or signature
 *   DELETE /api/admin/settings/files/:kind  administrators
 */
import { Router } from 'express';
import { LOGO_PLACEMENTS, REGISTRATION_FIELDS } from '../models/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getBucket } from '../db.js';
import { imageUpload, checkBufferUpload, storeBuffer, deleteBucketFile } from '../services/files.js';
import { getSettings, settingsDoc, clearSettingsCache, publicBranding, publicRegistration } from '../services/settings.js';
import { audit } from '../services/audit.js';
import { fail, invalid, str, bool, isId, toId } from '../utils/http.js';

export const BRAND_BUCKET = 'brandingFiles';
const MAX_IMAGE_MB = 2;
const SIZES = ['small', 'medium', 'large'];
const ALIGNS = ['left', 'center', 'right'];
const HEX = /^#[0-9a-f]{6}$/i;

const router = Router();

// ---- public image files ------------------------------------------------------------

router.get('/branding/files/:id', async (req, res) => {
  if (!isId(req.params.id)) fail(404, 'File not found.');
  const bucket = getBucket(BRAND_BUCKET);
  const [info] = await bucket.find({ _id: toId(req.params.id) }).toArray();
  if (!info) fail(404, 'File not found.');
  const type = info.metadata?.contentType || 'application/octet-stream';
  if (!/^image\/(png|jpeg|svg\+xml)$/.test(type)) fail(404, 'File not found.');
  // Never let a branding file run code, even if opened directly in the browser.
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Length', String(info.length));
  // File ids change on every upload, so the content of a URL never changes.
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  bucket.openDownloadStream(info._id).on('error', () => res.destroy()).pipe(res);
});

// ---- administrators ----------------------------------------------------------------

const admin = [requireAuth, requireRole('admin')];

async function fullSettings() {
  const s = await getSettings({ fresh: true });
  return {
    settings: s,
    branding: publicBranding(s),
    registration: publicRegistration(s),
    placementLabels: LOGO_PLACEMENTS,
    fieldLabels: REGISTRATION_FIELDS,
  };
}

router.get('/admin/settings', ...admin, async (req, res) => {
  res.json(await fullSettings());
});

router.put('/admin/settings', ...admin, async (req, res) => {
  const b = req.body || {};
  const doc = await settingsDoc();
  const errors = [];
  const changed = [];

  if (b.branding) {
    const x = b.branding;
    if (x.institutionName !== undefined) doc.branding.institutionName = str(x.institutionName, 160) || null;
    if (x.appName !== undefined) doc.branding.appName = str(x.appName, 120) || null;
    if (x.tagline !== undefined) doc.branding.tagline = str(x.tagline, 200);
    if (x.colors) {
      for (const k of ['primary', 'primaryDark', 'accent']) {
        if (x.colors[k] === undefined) continue;
        if (!HEX.test(String(x.colors[k]))) errors.push(`The ${k === 'primaryDark' ? 'dark primary' : k} color must look like #0e5e6f.`);
        else doc.branding.colors[k] = String(x.colors[k]).toLowerCase();
      }
    }
    if (x.keepAspectRatio !== undefined) doc.branding.keepAspectRatio = bool(x.keepAspectRatio);
    if (x.showNameWithLogo !== undefined) doc.branding.showNameWithLogo = bool(x.showNameWithLogo);
    if (x.placements && typeof x.placements === 'object') {
      for (const key of Object.keys(LOGO_PLACEMENTS)) {
        const p = x.placements[key];
        if (!p) continue;
        doc.branding.placements[key] = {
          enabled: bool(p.enabled),
          size: SIZES.includes(p.size) ? p.size : 'medium',
          align: ALIGNS.includes(p.align) ? p.align : 'left',
        };
      }
      doc.markModified('branding.placements');
    }
    changed.push('branding');
  }

  if (b.certificate) {
    const c = b.certificate;
    if (c.title !== undefined) doc.certificate.title = str(c.title, 80) || 'Certificate of Completion';
    if (c.useSeparateLogo !== undefined) doc.certificate.useSeparateLogo = bool(c.useSeparateLogo);
    if (['top', 'header', 'bottom'].includes(c.logoPosition)) doc.certificate.logoPosition = c.logoPosition;
    if (SIZES.includes(c.logoSize)) doc.certificate.logoSize = c.logoSize;
    if (ALIGNS.includes(c.logoAlign)) doc.certificate.logoAlign = c.logoAlign;
    if (c.showDepartment !== undefined) doc.certificate.showDepartment = bool(c.showDepartment);
    if (Array.isArray(c.signatories)) {
      if (c.signatories.length > 3) errors.push('A certificate can show at most three signatories.');
      const old = (doc.certificate.signatories || []).map((x) => (x.toObject ? x.toObject() : x));
      // "from" says which saved signatory a row was (so its signature image follows it); default: same position.
      const kept = new Set();
      doc.certificate.signatories = c.signatories.slice(0, 3).map((x, i) => {
        const from = x?.from === null ? null : Number.isInteger(x?.from) ? x.from : i;
        const sig = from !== null && !kept.has(from) ? old[from]?.signature || null : null;
        if (sig) kept.add(from);
        return { name: str(x?.name, 120), title: str(x?.title, 120), signature: sig };
      });
      // Signature images no longer used are deleted.
      for (const [i, o] of old.entries()) if (!kept.has(i) && o?.signature?.fileId) await deleteBucketFile(BRAND_BUCKET, o.signature.fileId);
    }
    changed.push('certificate');
  }

  if (b.registration) {
    const r = b.registration;
    if (r.allowSelfRegistration !== undefined) doc.registration.allowSelfRegistration = bool(r.allowSelfRegistration);
    if (r.termsText !== undefined) doc.registration.termsText = str(r.termsText, 5000);
    if (r.studentIdPrefix !== undefined) {
      const p = str(r.studentIdPrefix, 10).toUpperCase();
      if (!/^[A-Z0-9]{1,10}$/.test(p)) errors.push('The student ID prefix may only contain letters and numbers (up to 10).');
      else doc.registration.studentIdPrefix = p;
    }
    if (r.fields && typeof r.fields === 'object') {
      for (const key of Object.keys(REGISTRATION_FIELDS)) {
        if (['off', 'optional', 'required'].includes(r.fields[key])) doc.registration.fields[key] = r.fields[key];
      }
      doc.markModified('registration.fields');
    }
    changed.push('registration');
  }

  if (errors.length) invalid(errors);
  doc.updatedBy = req.user._id;
  await doc.save();
  clearSettingsCache();
  await audit(req, 'settings.updated', { targetType: 'Settings', details: { sections: changed } });
  res.json({ ...(await fullSettings()), message: 'Settings saved. Everyone sees the change on their next page load.' });
});

/** Where each uploadable image lives in the settings document. */
function slot(doc, kind) {
  if (kind === 'logo') return { get: () => doc.branding.logo, set: (v) => { doc.branding.logo = v; } };
  if (kind === 'certificateLogo') return { get: () => doc.branding.certificateLogo, set: (v) => { doc.branding.certificateLogo = v; } };
  if (kind === 'seal') return { get: () => doc.certificate.seal, set: (v) => { doc.certificate.seal = v; } };
  const m = /^signature([0-2])$/.exec(kind);
  if (m) {
    const i = Number(m[1]);
    return {
      get: () => doc.certificate.signatories?.[i]?.signature || null,
      set: (v) => {
        while (doc.certificate.signatories.length <= i) doc.certificate.signatories.push({ name: '', title: '' });
        doc.certificate.signatories[i].signature = v;
        doc.markModified('certificate.signatories');
      },
    };
  }
  return null;
}

/**
 * Upload or replace an image. The new file is stored first; only after the settings are
 * saved is the previous file deleted, so a failed upload never loses the current logo.
 */
router.post('/admin/settings/files/:kind', ...admin, imageUpload.single('file'), async (req, res) => {
  const doc = await settingsDoc();
  const s = slot(doc, req.params.kind);
  if (!s) fail(404, 'Unknown image type.');
  if (!req.file) invalid(['Choose an image to upload.']);
  const allowed = ['png', 'jpg', 'svg'];
  let kind;
  try {
    kind = checkBufferUpload(req.file, allowed, MAX_IMAGE_MB, 'image');
  } catch (e) {
    invalid([e.message]);
  }
  const stored = await storeBuffer(BRAND_BUCKET, req.file, kind);
  const previous = s.get()?.fileId || null;
  try {
    s.set(stored);
    doc.updatedBy = req.user._id;
    await doc.save();
  } catch (e) {
    await deleteBucketFile(BRAND_BUCKET, stored.fileId);
    throw e;
  }
  if (previous) await deleteBucketFile(BRAND_BUCKET, previous);
  clearSettingsCache();
  await audit(req, previous ? 'branding.image_replaced' : 'branding.image_uploaded', { targetType: 'Settings', details: { kind: req.params.kind, name: stored.name, size: stored.size, type: stored.contentType } });
  res.json({ ...(await fullSettings()), message: previous ? 'Image replaced.' : 'Image uploaded.' });
});

router.delete('/admin/settings/files/:kind', ...admin, async (req, res) => {
  const doc = await settingsDoc();
  const s = slot(doc, req.params.kind);
  if (!s) fail(404, 'Unknown image type.');
  const previous = s.get()?.fileId || null;
  if (!previous) return res.json({ ...(await fullSettings()), message: 'There was no image to remove.' });
  s.set(null);
  await doc.save();
  await deleteBucketFile(BRAND_BUCKET, previous);
  clearSettingsCache();
  await audit(req, 'branding.image_removed', { targetType: 'Settings', details: { kind: req.params.kind } });
  res.json({ ...(await fullSettings()), message: 'Image removed. The default appearance is used instead.' });
});

export default router;
