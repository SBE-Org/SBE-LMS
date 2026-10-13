import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, onApiError } from './api.js';

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
