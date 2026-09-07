import { useCallback, useEffect } from 'react';
import { guardNavigation } from '../lib/navigation';
export function useDraftGuard(dirty: boolean, busy: boolean, onClose: () => void) {
  const allow = useCallback(() => !busy && (!dirty || window.confirm('Descartar as alterações não salvas? Escolha Cancelar para continuar editando.')), [dirty, busy]);
  useEffect(() => guardNavigation(allow), [allow]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  return useCallback(() => { if (allow()) onClose(); }, [allow, onClose]);
}
