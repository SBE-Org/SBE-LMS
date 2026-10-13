import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/**
 * Loads `path` from the API and reloads when it changes.
 * Returns { data, error, loading, reload, setData }.
 */
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: !!path });
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const n = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api.get(path);
      if (n === seq.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (n === seq.current) setState({ data: null, error, loading: false });
    }
  }, [path]);

  useEffect(() => {
    load();
  }, [load]);

  const setData = useCallback((fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })), []);
  return { ...state, reload: load, setData };
}

/** Sets the browser tab title. */
export function useTitle(title, appName) {
  useEffect(() => {
    document.title = title ? `${title} · ${appName || 'Shaggar BPO Academy'}` : appName || 'Shaggar BPO Academy';
  }, [title, appName]);
}

/** Adds a class to <body> while the component is shown (auth and certificate pages). */
export function useBodyClass(cls) {
  useEffect(() => {
    if (!cls) return undefined;
    document.body.classList.add(cls);
    return () => document.body.classList.remove(cls);
  }, [cls]);
}
