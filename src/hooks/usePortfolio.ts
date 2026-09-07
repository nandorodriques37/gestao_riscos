import { useCallback, useEffect, useRef, useState } from 'react';
import type { PortfolioBundle } from '../types';
import { fetchPortfolio, patchEntidadeApi, createEntidadeApi, deleteEntidadeApi,
  migrarAcoesApi, promoverTriagemApi, mesclarPessoasApi, salvarRiscoApi, criarIniciativaDaAcaoApi,
  type EntidadeUrl, type SalvarRiscoPedido } from '../lib/portfolioApi';
import { invalidarDados, observarDados } from '../lib/dataSync';
const CACHE = 'riskMatrix.portfolio.v1';
const CAMPO: Record<EntidadeUrl, keyof PortfolioBundle> = {
  pessoas: 'pessoas', objetivos: 'objetivos', medicoes: 'medicoes', iniciativas: 'iniciativas', marcos: 'marcos', 'acoes-risco': 'acoes_risco',
};
const VAZIO: PortfolioBundle = { pessoas: [], objetivos: [], medicoes: [], iniciativas: [], marcos: [], acoes_risco: [] };
type Entity = PortfolioBundle[keyof PortfolioBundle][number];
function lerCache(): PortfolioBundle {
  try { return { ...VAZIO, ...JSON.parse(localStorage.getItem(CACHE) ?? '{}') }; } catch { return VAZIO; }
}
export function usePortfolio() {
  const [portfolio, setPortfolio] = useState(lerCache);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const current = useRef(portfolio), mounted = useRef(true), writes = useRef(0), revision = useRef(0), sequence = useRef(0);
  const locks = useRef(new Set<string>()), keys = useRef(new Map<string, string>());
  const commit = useCallback((data: PortfolioBundle) => {
    current.current = data;
    if (mounted.current) setPortfolio(data);
    try { localStorage.setItem(CACHE, JSON.stringify(data)); } catch { /* cache opcional */ }
  }, []);
  const accept = useCallback((entidade: EntidadeUrl, item: Entity) => {
    const campo = CAMPO[entidade], list = current.current[campo];
    const before = list.find(x => x.id === item.id);
    if (before && before.version > item.version) return;
    commit({ ...current.current, [campo]: before ? list.map(x => x.id === item.id ? item : x) : [...list, item] });
  }, [commit]);
  const refresh = useCallback(async () => {
    if (writes.current) return;
    const epoch = revision.current, read = ++sequence.current;
    try {
      const data = await fetchPortfolio();
      if (mounted.current && !writes.current && epoch === revision.current && read === sequence.current) commit(data);
    } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : 'Falha ao atualizar o portfólio.'); }
  }, [commit]);
  const mutate = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    writes.current++; revision.current++; setSaving(true); setError(null);
    try { return await fn(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível salvar.'); return null; }
    finally {
      writes.current--; revision.current++; setSaving(writes.current > 0);
      invalidarDados('portfolio'); await refresh();
    }
  }, [refresh]);
  const patchEntidade = useCallback(async (entidade: EntidadeUrl, id: string, patch: Record<string, unknown>, expectedVersion?: number) => {
    const key = entidade + '/' + id;
    if (locks.current.has(key)) return false;
    locks.current.add(key);
    try {
      const version = expectedVersion ?? current.current[CAMPO[entidade]].find(x => x.id === id)?.version;
      return (await mutate(async () => { const item = await patchEntidadeApi<Entity>(entidade, id, patch, version); accept(entidade, item); return item; })) != null;
    } finally { locks.current.delete(key); }
  }, [mutate, accept]);
  const patchVarios = useCallback(async (entidade: EntidadeUrl, itens: { id: string; patch: Record<string, unknown> }[]) => {
    const results = await Promise.all(itens.map(({ id, patch }) => patchEntidade(entidade, id, patch)));
    const ok = results.filter(Boolean).length;
    if (ok < itens.length) setError((itens.length - ok) + ' registros não foram salvos. Revise os dados atuais.');
    return ok;
  }, [patchEntidade]);
  const criarERetornar = useCallback(async <T extends { id: string }>(entidade: EntidadeUrl, data: Record<string, unknown>) => {
    const fingerprint = JSON.stringify({ entidade, data });
    const chave = keys.current.get(fingerprint) ?? crypto.randomUUID();
    keys.current.set(fingerprint, chave);
    const result = await mutate(async () => { const item = await createEntidadeApi<T>(entidade, { ...data, __chave: chave }); accept(entidade, item as unknown as Entity); return item; });
    if (result) keys.current.delete(fingerprint);
    return result;
  }, [mutate, accept]);
  const createEntidade = useCallback(async (entidade: EntidadeUrl, data: Record<string, unknown>) => (await criarERetornar(entidade, data)) != null, [criarERetornar]);
  const deleteEntidade = useCallback(async (entidade: EntidadeUrl, id: string) => (await mutate(async () => {
    await deleteEntidadeApi(entidade, id);
    const campo = CAMPO[entidade];
    commit({ ...current.current, [campo]: current.current[campo].filter(x => x.id !== id) }); return true;
  })) === true, [mutate, commit]);
  const salvarRisco = useCallback((pedido: SalvarRiscoPedido) => mutate(async () => {
    const result = await salvarRiscoApi(pedido);
    commit({ ...current.current, acoes_risco: [...current.current.acoes_risco.filter(a => a.risco_id !== pedido.riscoId), ...result.acoes] });
    return result;
  }), [mutate, commit]);
  const criarIniciativaDaAcao = useCallback((pedido: Parameters<typeof criarIniciativaDaAcaoApi>[0]) => mutate(async () => {
    const result = await criarIniciativaDaAcaoApi(pedido);
    accept('iniciativas', result);
    const action = current.current.acoes_risco.find(a => a.id === pedido.acaoId);
    if (action && action.version === pedido.expectedVersion) accept('acoes-risco', { ...action, iniciativa_id: result.id, triagem: 'iniciativa', version: action.version + 1 });
    return result;
  }), [mutate, accept]);
  const migrarAcoes = useCallback(() => mutate(migrarAcoesApi), [mutate]);
  const promoverTriagem = useCallback(() => mutate(promoverTriagemApi), [mutate]);
  const mesclarPessoas = useCallback(async (destino: string, origem: string) => (await mutate(() => mesclarPessoasApi(destino, origem)))?.movidas ?? null, [mutate]);
  const clearError = useCallback(() => setError(null), []);
  useEffect(() => {
    mounted.current = true; void refresh().finally(() => { if (mounted.current) setLoading(false); });
    const stop = observarDados(source => { if (source !== 'portfolio') void refresh(); });
    return () => { mounted.current = false; stop(); };
  }, [refresh]);
  return { portfolio, loading, saving, error, refresh, clearError, patchEntidade, patchVarios, createEntidade, criarERetornar,
    deleteEntidade, salvarRisco, criarIniciativaDaAcao, migrarAcoes, promoverTriagem, mesclarPessoas };
}
export type UsePortfolio = ReturnType<typeof usePortfolio>;
