import { useCallback, useEffect, useRef, useState } from 'react';
import type { PortfolioBundle } from '../types';
import {
  fetchPortfolio, patchEntidadeApi, createEntidadeApi, deleteEntidadeApi,
  migrarAcoesApi, promoverTriagemApi, PortfolioConflictError,
  type EntidadeUrl, type ResultadoMigracao, type ResultadoPromocao,
} from '../lib/portfolioApi';

const CACHE_KEY = 'riskMatrix.portfolio.v1';

/** Chave do pacote correspondente a cada entidade da URL. */
const CAMPO: Record<EntidadeUrl, keyof PortfolioBundle> = {
  pessoas: 'pessoas',
  objetivos: 'objetivos',
  iniciativas: 'iniciativas',
  marcos: 'marcos',
  'acoes-risco': 'acoes_risco',
};

const VAZIO: PortfolioBundle = {
  pessoas: [], objetivos: [], iniciativas: [], marcos: [], acoes_risco: [],
};

function lerCache(): PortfolioBundle {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Defensivo contra cache gravado por outra versão do app.
      if (parsed && typeof parsed === 'object') return { ...VAZIO, ...parsed };
    }
  } catch {
    // cache ausente ou corrompido — ignora
  }
  return VAZIO;
}

function gravarCache(b: PortfolioBundle): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(b));
  } catch {
    // storage indisponível — segue apenas em memória
  }
}

export interface UsePortfolio {
  portfolio: PortfolioBundle;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  clearError: () => void;
  /**
   * Grava um campo e devolve o item atualizado. Otimista: a tela muda na hora
   * e reverte se o servidor recusar — inclusive nos 400 das regras de
   * integridade, que são recusas esperadas, não falhas.
   */
  patchEntidade: (entidade: EntidadeUrl, id: string, patch: Record<string, unknown>) => Promise<boolean>;
  /** Grava vários de uma vez e devolve quantos pegaram. Não é otimista. */
  patchVarios: (
    entidade: EntidadeUrl,
    itens: { id: string; patch: Record<string, unknown> }[],
  ) => Promise<number>;
  createEntidade: (entidade: EntidadeUrl, data: Record<string, unknown>) => Promise<boolean>;
  deleteEntidade: (entidade: EntidadeUrl, id: string) => Promise<boolean>;
  migrarAcoes: () => Promise<ResultadoMigracao | null>;
  /** Aplica a triagem: as marcadas como iniciativa viram iniciativas. */
  promoverTriagem: () => Promise<ResultadoPromocao | null>;
}

/**
 * Estado do portfólio inteiro num pacote só.
 *
 * Diferente de `useRecords`, aqui não há debounce: as gravações da triagem e
 * das telas de portfólio são confirmações discretas (um clique = uma decisão),
 * não digitação contínua. Um polling só cobre as cinco entidades, e as métricas
 * precisam das cinco juntas de qualquer forma.
 */
export function usePortfolio(): UsePortfolio {
  const [portfolio, setPortfolio] = useState<PortfolioBundle>(lerCache);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const montado = useRef(true);

  const commit = useCallback((b: PortfolioBundle) => {
    setPortfolio(b);
    gravarCache(b);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchPortfolio();
      if (!montado.current) return;
      commit(data);
      setError(null);
    } catch (err) {
      if (montado.current) setError(err instanceof Error ? err.message : 'Falha ao carregar o portfólio');
    }
  }, [commit]);

  const patchEntidade = useCallback(async (entidade: EntidadeUrl, id: string, patch: Record<string, unknown>) => {
    const campo = CAMPO[entidade];
    let anterior: PortfolioBundle | null = null;

    setPortfolio(prev => {
      anterior = prev;
      const lista = (prev[campo] as { id: string }[]).map(x => (x.id === id ? { ...x, ...patch } : x));
      const proximo = { ...prev, [campo]: lista } as PortfolioBundle;
      gravarCache(proximo);
      return proximo;
    });

    try {
      const atualizado = await patchEntidadeApi<{ id: string }>(entidade, id, patch);
      if (montado.current) {
        setPortfolio(prev => {
          const lista = (prev[campo] as { id: string }[]).map(x => (x.id === id ? atualizado : x));
          const proximo = { ...prev, [campo]: lista } as PortfolioBundle;
          gravarCache(proximo);
          return proximo;
        });
        setError(null);
      }
      return true;
    } catch (err) {
      // Desfaz o otimismo: uma recusa de regra de integridade é resposta
      // esperada, e deixar a tela mostrando o valor recusado seria mentira.
      if (montado.current && anterior) commit(anterior);
      if (montado.current) {
        setError(err instanceof PortfolioConflictError
          ? 'Este registro foi alterado por outra pessoa. Os dados foram atualizados.'
          : err instanceof Error ? err.message : 'Falha ao gravar');
      }
      if (err instanceof PortfolioConflictError) await refresh();
      return false;
    }
  }, [commit, refresh]);

  /**
   * Grava vários itens de uma vez. Não é otimista: uma decisão em massa muda
   * meia tela, e pintar tudo antes da confirmação faria uma falha parcial
   * mentir feio. Dispara em paralelo, refresca uma vez e devolve quantos
   * pegaram.
   */
  const patchVarios = useCallback(async (
    entidade: EntidadeUrl,
    itens: { id: string; patch: Record<string, unknown> }[],
  ) => {
    if (itens.length === 0) return 0;
    const resultados = await Promise.allSettled(
      itens.map(({ id, patch }) => patchEntidadeApi(entidade, id, patch)),
    );
    const ok = resultados.filter(r => r.status === 'fulfilled').length;
    await refresh();
    if (montado.current && ok < itens.length) {
      setError(`${itens.length - ok} de ${itens.length} não puderam ser gravados. Os demais foram salvos.`);
    }
    return ok;
  }, [refresh]);

  const createEntidade = useCallback(async (entidade: EntidadeUrl, data: Record<string, unknown>) => {
    try {
      await createEntidadeApi(entidade, data);
      await refresh();
      return true;
    } catch (err) {
      if (montado.current) setError(err instanceof Error ? err.message : 'Falha ao criar');
      return false;
    }
  }, [refresh]);

  const deleteEntidade = useCallback(async (entidade: EntidadeUrl, id: string) => {
    try {
      await deleteEntidadeApi(entidade, id);
      await refresh();
      return true;
    } catch (err) {
      if (montado.current) setError(err instanceof Error ? err.message : 'Falha ao excluir');
      return false;
    }
  }, [refresh]);

  const migrarAcoes = useCallback(async () => {
    try {
      const resultado = await migrarAcoesApi();
      await refresh();
      return resultado;
    } catch (err) {
      if (montado.current) setError(err instanceof Error ? err.message : 'Falha ao extrair os planos de ação');
      return null;
    }
  }, [refresh]);

  const promoverTriagem = useCallback(async () => {
    try {
      const resultado = await promoverTriagemApi();
      await refresh();
      return resultado;
    } catch (err) {
      if (montado.current) setError(err instanceof Error ? err.message : 'Falha ao promover as iniciativas');
      return null;
    }
  }, [refresh]);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    montado.current = true;
    (async () => {
      try {
        const data = await fetchPortfolio();
        if (montado.current) commit(data);
      } catch (err) {
        if (montado.current) setError(err instanceof Error ? err.message : 'Falha ao carregar o portfólio');
      } finally {
        if (montado.current) setLoading(false);
      }
    })();
    return () => { montado.current = false; };
  }, [commit]);

  return {
    portfolio, loading, error, refresh, clearError,
    patchEntidade, patchVarios, createEntidade, deleteEntidade, migrarAcoes, promoverTriagem,
  };
}
