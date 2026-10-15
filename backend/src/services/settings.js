/** Institution-wide settings (branding, logo placements, certificate layout, registration form). */
import { config } from '../config.js';
import { Settings, LOGO_PLACEMENTS, REGISTRATION_FIELDS, DEFAULT_PLACEMENTS, DEFAULT_REGISTRATION_FIELDS } from '../models/index.js';

let cache = null;
let cachedAt = 0;
const TTL_MS = 30 * 1000; // a few seconds of caching; saves clear it at once

/** The settings document (created with defaults on first use). Lean object. */
export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < TTL_MS) return cache;
  let s = await Settings.findOne({ key: 'global' }).lean();
  if (!s) {
    await Settings.updateOne({ key: 'global' }, { $setOnInsert: { key: 'global' } }, { upsert: true });
    s = await Settings.findOne({ key: 'global' }).lean();
  }
  // Older documents may miss keys added later: fill them from the defaults.
  s.branding ??= {};
  s.branding.placements ??= {};
  for (const k of Object.keys(LOGO_PLACEMENTS)) s.branding.placements[k] ??= { ...DEFAULT_PLACEMENTS[k] };
  s.registration ??= {};
  s.registration.fields ??= {};
  for (const k of Object.keys(REGISTRATION_FIELDS)) s.registration.fields[k] ??= DEFAULT_REGISTRATION_FIELDS[k];
  s.certificate ??= {};
  cache = s;
  cachedAt = Date.now();
  return s;
}

export function clearSettingsCache() {
  cache = null;
}

/** Settings document for editing (a Mongoose document). */
export async function settingsDoc() {
  await getSettings();
  return Settings.findOne({ key: 'global' });
}

const fileUrl = (f) => (f?.fileId ? `/api/branding/files/${f.fileId}` : null);

/** What the browser needs to draw the brand. Public: contains no personal data. */
export function publicBranding(s) {
  const b = s.branding || {};
  const c = s.certificate || {};
  return {
    institutionName: b.institutionName || config.company,
    appName: b.appName || config.appName,
    tagline: b.tagline || '',
    colors: { primary: b.colors?.primary || '#0e5e6f', primaryDark: b.colors?.primaryDark || '#093f4b', accent: b.colors?.accent || '#e3a03a' },
    logoUrl: fileUrl(b.logo),
    logoVersion: b.logo?.uploadedAt ? new Date(b.logo.uploadedAt).getTime() : null,
    certificateLogoUrl: fileUrl(b.certificateLogo),
    keepAspectRatio: b.keepAspectRatio !== false,
    showNameWithLogo: b.showNameWithLogo !== false,
    placements: b.placements,
    certificate: {
      title: c.title || 'Certificate of Completion',
      useSeparateLogo: !!c.useSeparateLogo,
      logoPosition: c.logoPosition || 'header',
      logoSize: c.logoSize || 'medium',
      logoAlign: c.logoAlign || 'left',
      showDepartment: c.showDepartment !== false,
      sealUrl: fileUrl(c.seal),
      signatories: (c.signatories || []).map((x) => ({ name: x.name || '', title: x.title || '', signatureUrl: fileUrl(x.signature) })),
    },
  };
}

/** Registration form configuration (public, used by the self-registration page). */
export function publicRegistration(s) {
  const r = s.registration || {};
  return {
    allowSelfRegistration: r.allowSelfRegistration !== false,
    fields: r.fields,
    fieldLabels: REGISTRATION_FIELDS,
    termsText: r.termsText || '',
  };
}
