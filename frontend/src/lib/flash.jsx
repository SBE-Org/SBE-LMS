import { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * Flash messages: shown at the top of the next page (or the current one) and
 * dismissed by the user or by the next navigation.
 */
const FlashContext = createContext(null);

export function FlashProvider({ children }) {
  const [items, setItems] = useState([]);
  const flash = useCallback((type, message) => {
    if (!message) return;
    setItems((list) => [...list, { id: Math.random().toString(36).slice(2), type, message, seen: false }]);
  }, []);
  /** Adds several messages returned by the API: [{type, message}] */
  const flashAll = useCallback((messages) => (messages || []).forEach((m) => flash(m.type, m.message)), [flash]);
  const dismiss = useCallback((id) => setItems((list) => list.filter((x) => x.id !== id)), []);
  /** Called on navigation: drop messages that have already been shown once. */
  const age = useCallback(() => setItems((list) => list.filter((x) => !x.seen).map((x) => ({ ...x, seen: true }))), []);
  const value = useMemo(() => ({ items, flash, flashAll, dismiss, age }), [items, flash, flashAll, dismiss, age]);
  return <FlashContext.Provider value={value}>{children}</FlashContext.Provider>;
}

export const useFlash = () => useContext(FlashContext);
