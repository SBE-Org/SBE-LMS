import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, onApiError } from './api.js';

/** Mixes a #rrggbb colour with white: amount 0..1 of the colour kept. */
export function tint(hex, amount) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c * amount + 255 * (1 - amount)));
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Applies the institution's colours (from the administrator's settings) to the whole app. */
export function applyBrandColors(colors) {
  const root = document.documentElement.style;
  if (!colors) return;
  const set = (k, v) => (v ? root.setProperty(k, v) : root.removeProperty(k));
  set('--brand', colors.primary);
  set('--brand-ink', colors.primaryDark);
  set('--accent', colors.accent);
  set('--brand-soft', tint(colors.primary, 0.12));
  set('--accent-soft', tint(colors.accent, 0.16));
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [meta, setMeta] = useState({ appName: import.meta.env.VITE_APP_NAME || 'Shaggar BPO Academy', company: 'Shaggar BPO Enterprise', installed: true });
  const [ready, setReady] = useState(false);
  const [metaError, setMetaError] = useState(null);

  const refreshMeta = useCallback(async () => {
    try {
      const m = await api.get('/meta');
      setMeta(m);
      applyBrandColors(m.branding?.colors);
      setMetaError(null);
      return m;
    } catch (e) {
      setMetaError(e);
      return null;
    }
  }, []);

  // Load settings and the signed-in user on first visit
  useEffect(() => {
    (async () => {
      await refreshMeta();
      if (getToken()) {
        try {
          const { user: u } = await api.get('/auth/me');
          setUser(u);
        } catch (e) {
          if (e.status === 401) setToken('');
        }
      }
      setReady(true);
    })();
  }, [refreshMeta]);

  // Expired token → sign out; temporary password → mark it so the router redirects.
  useEffect(
    () =>
      onApiError((e) => {
        if (e.status === 401 && getToken()) {
          setToken('');
          setUser(null);
        }
        if (e.code === 'PASSWORD_CHANGE_REQUIRED') setUser((u) => (u ? { ...u, mustChangePassword: true } : u));
      }),
    []
  );

  const signIn = useCallback((token, u) => {
    setToken(token);
    setUser(u);
  }, []);

  const signOut = useCallback(() => {
    setToken('');
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, setUser, meta, setMeta, refreshMeta, metaError, ready, signIn, signOut }),
    [user, meta, refreshMeta, metaError, ready, signIn, signOut]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export const hasRole = (user, ...roles) => !!user && roles.includes(user.role);
export const isStaff = (user) => hasRole(user, 'admin', 'trainer');
export const isStudent = (user) => hasRole(user, 'agent');
/** Course builders: administrators, trainers and Department Heads (own departments). */
export const canBuild = (user) => hasRole(user, 'admin', 'trainer', 'department_head');
export const canSeeReports = (user) => hasRole(user, 'admin', 'trainer', 'team_lead', 'department_head');
export const canSeeRegistrations = (user) => hasRole(user, 'admin', 'registrar', 'department_head');
export const canAuthorizeCertificates = (user) => hasRole(user, 'admin', 'department_head') || !!user?.permissions?.authorizeCertificates;
/** A student whose registration is not approved yet cannot open course content. */
export const isLearningBlocked = (user) => isStudent(user) && user.registrationStatus !== 'approved';
