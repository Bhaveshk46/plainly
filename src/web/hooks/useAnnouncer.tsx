import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Announce = (message: string) => void;

const AnnouncerContext = createContext<Announce>(() => undefined);

/**
 * A polite, visually hidden live region for screen-reader announcements
 * ("Analysis complete", "Copied"). Clearing first makes repeated identical
 * messages announce again; a timer (not requestAnimationFrame) keeps it
 * working in throttled background tabs.
 */
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const announce = useCallback<Announce>((next) => {
    setMessage('');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(next), 50);
  }, []);

  const value = useMemo(() => announce, [announce]);
  return (
    <AnnouncerContext.Provider value={value}>
      {children}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="live-region">
        {message}
      </div>
    </AnnouncerContext.Provider>
  );
}

export const useAnnounce = (): Announce => useContext(AnnouncerContext);
