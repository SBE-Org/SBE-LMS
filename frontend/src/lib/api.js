/** Thin fetch wrapper for the Shaggar LMS API. */

export const API_URL = String(import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '');
const TOKEN_KEY = 'shaggar_lms_token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: token lives only for this page */
  }
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed (${status})`);
    this.status = status;
    this.errors = body?.errors || (body?.error ? [body.error] : []);
    this.code = body?.code || null;
    this.body = body || {};
  }
}

// App-level listeners (sign-out on 401, forced password change on 403)
const listeners = new Set();
export const onApiError = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Absolute URL for an API path such as a lesson file link returned by the API. */
export const apiUrl = (path) => (path ? `${API_URL}${path}` : null);

/**
 * Opens a protected file (e.g. a student's document) in a new tab. The file is fetched with
 * the sign-in token, so no secret ever appears in a URL.
 */
export async function openProtectedFile(path, { download: save = false, name = 'document' } = {}) {
  const win = save ? null : window.open('', '_blank');
  try {
    const res = await request('GET', path, undefined, { raw: true });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if (win) win.location.href = url;
    else {
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    if (win) win.close();
    throw e;
  }
}

/** Object URL for a protected image (e.g. a student's photo). Remember to revoke it. */
export async function protectedImageUrl(path) {
  const res = await request('GET', path, undefined, { raw: true });
  return URL.createObjectURL(await res.blob());
}

export async function request(method, path, data, { raw = false, keepalive = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (data instanceof FormData) body = data;
  else if (data !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(data);
  }
  let res;
  try {
    // keepalive lets a request finish while the page is closing (e.g. saving quiz answers)
    res = await fetch(`${API_URL}/api${path}`, { method, headers, body, keepalive });
  } catch {
    throw new ApiError(0, { error: 'Cannot reach the server. Check your internet connection and try again.' });
  }
  if (raw && res.ok) return res;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new ApiError(res.status, json);
    listeners.forEach((fn) => fn(err));
    throw err;
  }
  return json;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, d = {}) => request('POST', p, d),
  put: (p, d = {}) => request('PUT', p, d),
  del: (p, d) => request('DELETE', p, d),
};

/** Builds "?a=1&b=2", leaving out empty values. */
export function qs(params) {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
  return s ? `?${s}` : '';
}

/** Downloads a file from an authenticated endpoint (e.g. CSV export). */
export async function download(path, fallbackName) {
  const res = await request('GET', path, undefined, { raw: true });
  const cd = res.headers.get('Content-Disposition') || '';
  const name = /filename="([^"]+)"/.exec(cd)?.[1] || fallbackName;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
