import { useCallback, useEffect, useRef, useState } from 'react';
import { canNavigate, readRoute, temGuard, routeHash, type AppRoute } from '../lib/navigation';
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
    const read = async () => {
      const alvo = window.location.hash, base = lastHash.current;
      if (alvo === base) return;
      if (temGuard()) {
        // O navegador já andou: volta para onde estava enquanto o diálogo pergunta,
        // e só reaplica o destino se o usuário confirmar e nada mais navegou.
        window.history.pushState(null, '', base || '#tab=painel');
        if (!(await canNavigate()) || lastHash.current !== base) return;
        window.history.pushState(null, '', alvo);
      }
      lastHash.current = alvo; setRoute(readRoute(alvo));
    };
    const ouvir = () => { void read(); };
    window.addEventListener('popstate', ouvir); window.addEventListener('hashchange', ouvir);
    return () => { window.removeEventListener('popstate', ouvir); window.removeEventListener('hashchange', ouvir); };
  }, []);
  return { route, navigate };
}
