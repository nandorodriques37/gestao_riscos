import { useCallback, useEffect, useRef, useState } from 'react';
import type { Nota } from '../types';
import { createNota, deleteNota, listNotas, MSG_SEM_CONEXAO_SERVIDOR, patchNota, type NotaPatch } from '../lib/notasApi';
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

/** Por que o servidor recusou o texto: outra pessoa gravou, excluiu a página, ou o servidor não aceita (limite, validação). */
export type MotivoNaoSalvo = 'conflito' | 'excluida' | 'recusada';

export interface TextoNaoSalvo {
  /** A página como estava na tela quando o servidor recusou — título e texto de quem escreveu. */
  nota: Nota;
  motivo: MotivoNaoSalvo;
  /** A mensagem do servidor; é o que a tela mostra em `recusada`. */
  mensagem: string;
}

type Mapa = ReadonlyMap<string, TextoNaoSalvo>;

function motivoDo(err: unknown): MotivoNaoSalvo {
  if ((err as { current?: unknown } | null)?.current) return 'conflito';
  return (err as { status?: unknown } | null)?.status === 404 ? 'excluida' : 'recusada';
}

/**
 * As páginas da aba Anotações. Mora no `App`, como `useTasks`: o salvamento
 * automático pendente de uma página não pode morrer quando a aba desmonta (o
 * hook limpa os relógios ao desmontar), e a paleta de comando vai precisar dos
 * títulos fora da aba.
 *
 * Fica FORA do polling de 15s do `App` — o texto é longo. Quem relê é o `App`,
 * ao entrar na aba e quando a janela volta ao foco.
 *
 * O cache local guarda só o que o servidor confirmou. O texto que o servidor
 * recusou (409, página excluída, limite) sai da fila de gravação, mas não
 * some: fica em `naoSalvas` até alguém decidir — inclusive o de uma página que
 * já saiu da tela, ou de quando a aba nem está aberta.
 */
export function useNotas() {
  const [naoSalvas, setNaoSalvas] = useState<Mapa>(() => new Map());
  // Espelho síncrono: o guard de saída pergunta logo depois do flush, antes
  // de a tela renderizar de novo.
  const naoSalvasRef = useRef<Mapa>(naoSalvas);
  const mudar = useCallback((fn: (m: Mapa) => Mapa) => {
    const next = fn(naoSalvasRef.current);
    if (next === naoSalvasRef.current) return;
    naoSalvasRef.current = next;
    setNaoSalvas(next);
  }, []);
  const onRefused = useCallback((id: string, local: Nota, err: unknown) => {
    const mensagem = err instanceof Error ? err.message : '';
    mudar(m => new Map(m).set(id, { nota: local, motivo: motivoDo(err), mensagem }));
  }, [mudar]);

  const c = useStoredCollection<Nota, NotaPatch>(adapter, { confirmedCache: true, onRefused });
  const { remove: removerNoServidor, discardRefused } = c;

  // O texto sai daqui E da lista: a recusa definitiva (400, 404) deixava a
  // edição otimista na lista, e reabrir a página mostrava o texto descartado
  // como se fosse dela — e gravava-o na próxima tecla.
  const descartarTexto = useCallback((id: string) => {
    mudar(m => {
      if (!m.has(id)) return m;
      const next = new Map(m);
      next.delete(id);
      return next;
    });
    discardRefused(id);
  }, [mudar, discardRefused]);
  const guardarTexto = useCallback((id: string, texto: Partial<Pick<Nota, 'titulo' | 'conteudo'>>) => mudar(m => {
    const atual = m.get(id);
    return atual ? new Map(m).set(id, { ...atual, nota: { ...atual.nota, ...texto } }) : m;
  }), [mudar]);
  const textoNaoSalvo = useCallback((id: string) => naoSalvasRef.current.get(id), []);
  // O texto recusado não está na fila (o hook já o soltou) nem no cache:
  // fechar o navegador com ele pergunta antes, como a gravação pendente.
  const temTextoNaoSalvo = naoSalvas.size > 0;
  useEffect(() => {
    if (!temTextoNaoSalvo) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [temTextoNaoSalvo]);
  const remove = useCallback(async (id: string) => {
    const ok = await removerNoServidor(id);
    if (ok) descartarTexto(id);
    return ok;
  }, [removerNoServidor, descartarTexto]);

  return {
    notas: c.items,
    loading: c.loading,
    error: c.error,
    /** O último erro foi falta de rede (o `fetch` nem teve resposta), não uma recusa do servidor. */
    semConexao: c.error === MSG_SEM_CONEXAO_SERVIDOR,
    saveStatus: c.saveStatus,
    hasPendingWrites: c.hasPendingWrites,
    /** Há gravação desta página na fila, indo ou esperando nova tentativa. */
    hasPendingWrite: c.hasPendingWrite,
    /** Salvamento automático: aplica na hora na lista e grava ~600 ms depois, em série por página. */
    update: c.update,
    /** Grava agora, com a versão dada (ou a da lista). `false` em erro ou conflito. */
    saveNow: c.saveNow,
    /** POST; devolve a página criada (já na lista). Lança em erro. */
    add: c.add,
    /** DELETE; `false` em erro (a mensagem fica em `error`). Leva junto o texto não salvo da página. */
    remove,
    refresh: c.refresh,
    flushPending: c.flushPending,
    clearError: c.clearError,
    /** Texto que o servidor recusou, por página, esperando a decisão de quem escreveu. */
    naoSalvas,
    /** O mesmo, lido na hora (sem esperar a renderização). */
    textoNaoSalvo,
    /** Atualiza o texto guardado de uma página que já tem texto recusado. */
    guardarTexto,
    /** A pessoa decidiu: manteve, carregou a outra versão, recriou ou descartou. */
    descartarTexto,
  };
}
export type UseNotas = ReturnType<typeof useNotas>;
