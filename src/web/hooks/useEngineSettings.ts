import { useMemo } from 'react';
import type { EngineSettings } from '../lib/engine.js';
import { useConfig } from '../state/config.js';
import { useSession } from '../state/session.js';

/**
 * The engine the UI should actually use: "ai" only when the user chose it *and*
 * the server has a key. Everything else runs on the device.
 */
export function useEngineSettings(): EngineSettings {
  const { state } = useSession();
  const { config } = useConfig();
  return useMemo<EngineSettings>(
    () => ({ mode: state.mode === 'ai' && config.ai.enabled ? 'ai' : 'local', redact: state.redact }),
    [state.mode, state.redact, config.ai.enabled],
  );
}
