import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemePreference = 'auto' | 'light' | 'dark';

/** Root font sizes (percent). Everything is in rem, so the whole UI scales. */
export const TEXT_SCALES = [90, 100, 112, 125, 150] as const;

interface Settings {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  scale: number;
  canGrow: boolean;
  canShrink: boolean;
  changeScale: (direction: 1 | -1) => void;
}

const SettingsContext = createContext<Settings | null>(null);

// Preferences (theme, text size) are the only things stored in the browser.
// Documents are never persisted. Keep in sync with public/theme-init.js.
const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage may be blocked; the preference just will not persist */
    }
  },
};

const readTheme = (): ThemePreference => {
  const saved = store.get('plainly.theme');
  return saved === 'light' || saved === 'dark' ? saved : 'auto';
};

const readScale = (): number => {
  const saved = Number(store.get('plainly.scale'));
  return (TEXT_SCALES as readonly number[]).includes(saved) ? saved : 100;
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>('auto');
  const [scale, setScale] = useState<number>(100);

  useEffect(() => {
    setThemeState(readTheme());
    setScale(readScale());
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (): void => {
      const dark = theme === 'dark' || (theme === 'auto' && query.matches);
      document.documentElement.dataset['theme'] = dark ? 'dark' : 'light';
    };
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--root-size', `${scale}%`);
  }, [scale]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    store.set('plainly.theme', next);
  }, []);

  const changeScale = useCallback((direction: 1 | -1) => {
    setScale((current) => {
      const index = (TEXT_SCALES as readonly number[]).indexOf(current);
      const next = TEXT_SCALES[Math.min(TEXT_SCALES.length - 1, Math.max(0, index + direction))] ?? 100;
      store.set('plainly.scale', String(next));
      return next;
    });
  }, []);

  const value = useMemo<Settings>(
    () => ({ theme, setTheme, scale, changeScale, canGrow: scale < (TEXT_SCALES.at(-1) ?? 150), canShrink: scale > (TEXT_SCALES[0] ?? 90) }),
    [theme, setTheme, scale, changeScale],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Settings {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside <SettingsProvider>');
  return value;
}
