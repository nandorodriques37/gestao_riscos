import { useCallback, useEffect, useRef, useState } from 'react';
import { canNavigate, readRoute, routeHash, type AppRoute } from '../lib/navigation';
export function useAppNavigation() {
  const [route, setRoute] = useState(() => readRoute(window.location.hash));
  const lastHash = useRef(window.location.hash);
  const navigate = useCallback((next: AppRoute, replace = false) => {
    const hash = routeHash(next);
    if (hash !== window.location.hash) {
      if (replace) window.history.replaceState(null, '', hash);
      else window.history.pushState(null, '', hash);
    }
    lastHash.current = hash; setRoute(next);
  }, []);
  useEffect(() => {
    const read = () => {
      if (window.location.hash === lastHash.current) return;
      if (!canNavigate()) { window.history.pushState(null, '', lastHash.current || '#tab=painel'); return; }
      lastHash.current = window.location.hash; setRoute(readRoute(window.location.hash));
    };
    window.addEventListener('popstate', read); window.addEventListener('hashchange', read);
    return () => { window.removeEventListener('popstate', read); window.removeEventListener('hashchange', read); };
  }, []);
  return { route, navigate };
}
