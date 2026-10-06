import { useCallback, useEffect, type ReactNode } from 'react';
import { guardNavigation } from '../lib/navigation';
import { useConfirmacao } from '../components/common/Confirmacao';

/**
 * Protege um rascunho: fechar o modal, trocar de destino ou usar Voltar com
 * alteração não salva abre a confirmação em vez de perder o texto calado.
 * Devolve `[fechar, dialogo]`; a tela renderiza `dialogo` (é um portal, a
 * posição não importa). Sair da página (`beforeunload`) segue nativo — o
 * navegador não deixa trocar esse aviso.
 */
export function useDraftGuard(dirty: boolean, busy: boolean, onClose: () => void): [() => void, ReactNode] {
  const [confirmar, dialogo] = useConfirmacao();
  const allow = useCallback(async () => {
    if (busy) return false;
    if (!dirty) return true;
    return confirmar({
      titulo: 'Descartar as alterações?',
      consequencia: 'O que você digitou não foi salvo e será perdido.',
      rotuloConfirmar: 'Descartar rascunho',
      rotuloManter: 'Continuar editando',
    });
  }, [dirty, busy, confirmar]);
  useEffect(() => guardNavigation(allow), [allow]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  const fechar = useCallback(() => { void allow().then(ok => { if (ok) onClose(); }); }, [allow, onClose]);
  return [fechar, dialogo];
}
