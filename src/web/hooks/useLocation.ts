import { useSyncExternalStore } from 'react';

function subscribe(notify: () => void) {
  window.addEventListener('hashchange', notify);
  window.addEventListener('popstate', notify);
  return () => {
    window.removeEventListener('hashchange', notify);
    window.removeEventListener('popstate', notify);
  };
}

/** Keep shared-link keys and browser back/forward navigation reactive. */
export function useLocation(pathname = '/') {
  const href = useSyncExternalStore(subscribe, () => window.location.href, () => `http://localhost${pathname}`);
  return new URL(href);
}
