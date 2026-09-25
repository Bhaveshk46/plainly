import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppConfig } from '../../shared/types.js';
import { api } from '../lib/api.js';

/**
 * Server capabilities. If the server cannot be reached the app still works:
 * the on-device engine needs no server, so we fall back to "no AI, no sharing".
 */
const FALLBACK: AppConfig = {
  ai: { enabled: false, provider: 'Gemini' },
  limits: { maxDocChars: 150_000, maxUploadBytes: 8 * 1024 * 1024, maxQuestionChars: 600, maxShareBytes: 256 * 1024 },
  shares: { enabled: false, ttlHours: [1, 24, 168] },
};

export interface ConfigState {
  config: AppConfig;
  /** 'loading' until /api/config answers; 'offline' if the server is unreachable. */
  status: 'loading' | 'ready' | 'offline';
}

const ConfigContext = createContext<ConfigState>({ config: FALLBACK, status: 'loading' });

export function ConfigProvider({ children, initial }: { children: ReactNode; initial?: AppConfig }) {
  const [state, setState] = useState<ConfigState>(initial ? { config: initial, status: 'ready' } : { config: FALLBACK, status: 'loading' });

  useEffect(() => {
    if (initial) return;
    const controller = new AbortController();
    api
      .config(controller.signal)
      .then((config) => setState({ config, status: 'ready' }))
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== 'AbortError') setState({ config: FALLBACK, status: 'offline' });
      });
    return () => controller.abort();
  }, [initial]);

  return <ConfigContext.Provider value={state}>{children}</ConfigContext.Provider>;
}

export const useConfig = (): ConfigState => useContext(ConfigContext);
