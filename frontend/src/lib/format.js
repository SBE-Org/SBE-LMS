export const ROLES = {
  admin: 'Administrator',
  trainer: 'Trainer',
  team_lead: 'Team Lead',
  agent: 'Agent',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Accepts an ISO timestamp or a YYYY-MM-DD date. */
function toDate(d) {
  if (!d) return null;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day);
  }
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? null : x;
}

/** 13 Oct 2026 */
export function fmtDate(d) {
  const x = toDate(d);
  return x ? `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}` : '—';
}

/** 13 October 2026 */
export function fmtDateLong(d) {
  const x = toDate(d);
  return x ? `${x.getDate()} ${MONTHS_LONG[x.getMonth()]} ${x.getFullYear()}` : '—';
}

/** 13 Oct 2026, 14:05 */
export function fmtDateTime(d) {
  const x = toDate(d);
  if (!x) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${fmtDate(x)}, ${p(x.getHours())}:${p(x.getMinutes())}`;
}

/** Today's date as YYYY-MM-DD (browser time zone). */
export function todayYmd() {
  const x = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?';
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many ?? one + 's'}`;

export const pctClass = (pct) => (pct >= 100 ? 'done' : pct >= 50 ? 'mid' : pct > 0 ? 'low' : 'none');

export const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

export const fileKind = (name) => {
  const ext = String(name || '').split('.').pop().toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['mp4', 'webm'].includes(ext)) return 'video';
  if (['mp3', 'm4a', 'wav'].includes(ext)) return 'audio';
  if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) return 'image';
  return 'download';
};

/** Recognises YouTube, Vimeo and direct video links. */
export function parseVideoUrl(url) {
  const u = String(url || '').trim();
  if (!u) return null;
  let m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (m) return { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${m[1]}` };
  m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return { kind: 'vimeo', src: `https://player.vimeo.com/video/${m[1]}` };
  if (/^https?:\/\/\S+\.(mp4|webm|ogg)(\?\S*)?$/i.test(u)) return { kind: 'file', src: u };
  return null;
}

export const truncate = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
