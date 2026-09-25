import { useSyncExternalStore } from 'react';

/** Subscribe to a CSS media query (e.g. "(min-width: 1024px)"). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const usePrefersReducedMotion = (): boolean => useMediaQuery('(prefers-reduced-motion: reduce)');
