import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs one async task at a time, aborting the previous one. Exposes busy and
 * error state for the UI. Aborted runs are silent (they are not errors).
 */
export function useAsyncTask() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const controller = useRef<AbortController | undefined>(undefined);

  useEffect(() => () => controller.current?.abort(), []);

  const run = useCallback(async <T,>(task: (signal: AbortSignal) => Promise<T>): Promise<T | undefined> => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError(undefined);
    try {
      return await task(current.signal);
    } catch (caught) {
      if ((caught as { name?: string } | null)?.name === 'AbortError') return undefined;
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.');
      return undefined;
    } finally {
      if (controller.current === current) setBusy(false);
    }
  }, []);

  const cancel = useCallback(() => {
    controller.current?.abort();
    setBusy(false);
  }, []);

  return { busy, error, run, cancel, clearError: useCallback(() => setError(undefined), []) };
}
