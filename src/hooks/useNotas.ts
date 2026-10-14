import type { Nota } from '../types';
import { createNota, deleteNota, listNotas, patchNota, type NotaPatch } from '../lib/notasApi';
import { useStoredCollection } from './useStoredCollection';
export type { SaveStatus as NotaSaveStatus } from './useStoredCollection';

// Estável fora do componente: o hook usa o adaptador como dependência.
const adapter = {
  source: 'notas' as const,
  cache: 'notas.cache.v1',
  fetch: listNotas,
  create: createNota,
  patch: patchNota,
  remove: deleteNota,
};

/**
 * As páginas da aba Anotações. Mora no `App`, como `useTasks`: o salvamento
 * automático pendente de uma página não pode morrer quando a aba desmonta (o
 * hook limpa os relógios ao desmontar), e a paleta de comando vai precisar dos
 * títulos fora da aba.
 *
 * Fica FORA do polling de 15s do `App` — o texto é longo. Quem relê é o `App`,
 * ao entrar na aba e quando a janela volta ao foco.
 */
export function useNotas() {
  const c = useStoredCollection<Nota, NotaPatch>(adapter);
  return {
    notas: c.items,
    loading: c.loading,
    error: c.error,
    saveStatus: c.saveStatus,
    hasPendingWrites: c.hasPendingWrites,
    /** Salvamento automático: aplica na hora na lista e grava ~600 ms depois, em série por página. */
    update: c.update,
    /** Grava agora, com a versão dada (ou a da lista). `false` em erro ou conflito. */
    saveNow: c.saveNow,
    /** POST; devolve a página criada (já na lista). Lança em erro. */
    add: c.add,
    /** DELETE; `false` em erro (a mensagem fica em `error`). */
    remove: c.remove,
    refresh: c.refresh,
    flushPending: c.flushPending,
    clearError: c.clearError,
  };
}
export type UseNotas = ReturnType<typeof useNotas>;
