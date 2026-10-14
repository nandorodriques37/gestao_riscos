import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { invalida, invalidarDados, observarDados, type DataSource } from '../lib/dataSync';
import { nextRetryDelay } from '../lib/retryBackoff';

export type SaveStatus = 'saving' | 'saved' | 'error' | 'conflict';
interface Stored { id: string; version: number }
interface Adapter<T extends Stored, P> {
  source: DataSource; cache: string;
  fetch: () => Promise<T[]>; create: (data: P) => Promise<T>;
  patch: (id: string, patch: P, version?: number) => Promise<T>; remove: (id: string) => Promise<void>;
}
export interface StoredCollectionOptions<T> {
  /**
   * Grava no cache local só o que o servidor confirmou (resposta de gravação e
   * releitura), nunca a edição otimista. Sem isso, o texto pendente aberto
   * sem rede aparece como salvo. Desligado: o cache segue a tela (riscos e
   * tarefas, como sempre foi).
   */
  confirmedCache?: boolean;
  /**
   * O servidor recusou de vez o que estava pendente (409, ou um 4xx que não
   * muda tentando de novo) e o hook descartou. `local` é o registro como
   * estava na tela antes de aceitar a versão do servidor — o último lugar
   * onde esse texto existe.
   */
  onRefused?: (id: string, local: T, err: unknown) => void;
}
/**
 * 4xx que repetir não resolve: 404 (o registro sumiu), 400 (validação)… Ficam
 * de fora o 408 e o 429 (passam sozinhos) e o 409 (conflito, tratado à parte).
 * Erro sem `status` (rede, ou cliente que não informa) segue tentando.
 */
export function isDefinitiveError(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 409 && status !== 429;
}
export function useStoredCollection<T extends Stored, P extends object>(api: Adapter<T, P>, options: StoredCollectionOptions<T> = {}) {
  const [items, setItems] = useState<T[]>(() => {
    try { const r = JSON.parse(localStorage.getItem(api.cache) ?? '[]'); return Array.isArray(r) ? r : []; }
    catch { return []; }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const opts = useRef(options);
  useLayoutEffect(() => { opts.current = options; });
  const state = useRef(items);
  /** O que o servidor confirmou, para o cache de `confirmedCache`. */
  const confirmed = useRef(items);
  const pending = useRef(new Map<string, P>());
  const running = useRef(new Map<string, Promise<boolean>>());
  const explicit = useRef(new Set<string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const retries = useRef(new Map<string, number>());
  const mounted = useRef(true);
  const revision = useRef(0);
  const readSequence = useRef(0);

  const writeCache = useCallback((list: T[]) => {
    try { localStorage.setItem(api.cache, JSON.stringify(list)); } catch { /* cache opcional */ }
  }, [api]);
  const commit = useCallback((next: T[]) => {
    state.current = next;
    if (mounted.current) setItems(next);
    if (!opts.current.confirmedCache) writeCache(next);
  }, [writeCache]);
  /** Só com `confirmedCache`: atualiza a lista confirmada e o cache. */
  const confirm = useCallback((next: (list: T[]) => T[]) => {
    if (!opts.current.confirmedCache) return;
    confirmed.current = next(confirmed.current);
    writeCache(confirmed.current);
  }, [writeCache]);
  /** `item` é o que o servidor devolveu; `shown`, o que fica na tela (o servidor mais o que ainda está pendente). */
  const accept = useCallback((item: T, shown: T = item) => {
    revision.current++;
    const newer = (r: T) => r.id === item.id && r.version <= item.version;
    commit(state.current.map(r => newer(r) ? shown : r));
    confirm(list => list.map(r => newer(r) ? item : r));
  }, [commit, confirm]);
  const hasPendingWrites = useCallback(() => pending.current.size > 0 || running.current.size > 0 || explicit.current.size > 0, []);
  /** Há gravação deste registro na fila, indo ou esperando nova tentativa. */
  const hasPendingWrite = useCallback((id: string) => pending.current.has(id) || running.current.has(id) || explicit.current.has(id), []);
  const refused = useCallback((id: string, local: T | undefined, err: unknown) => {
    if (local) opts.current.onRefused?.(id, local, err);
  }, []);
  const refresh = useCallback(async () => {
    if (hasPendingWrites()) return;
    const sequence = ++readSequence.current, epoch = revision.current;
    try {
      const data = await api.fetch();
      if (mounted.current && sequence === readSequence.current && epoch === revision.current && !hasPendingWrites()) {
        commit(data); confirm(() => data);
      }
    } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : 'Falha ao atualizar os dados.'); }
    // Só a leitura mais recente encerra o carregamento: uma anterior, cuja
    // resposta é descartada, deixaria a tela com o cache como se fosse o servidor.
    finally { if (mounted.current && sequence === readSequence.current) setLoading(false); }
  }, [api, commit, confirm, hasPendingWrites]);

  const flushOne = useCallback(async function flush(id: string): Promise<boolean> {
    const existing = running.current.get(id);
    if (existing) {
      if (!(await existing)) return false;
      return pending.current.has(id) ? flush(id) : true;
    }
    const patch = pending.current.get(id);
    clearTimeout(timers.current.get(id)); timers.current.delete(id);
    if (!patch) return true;
    pending.current.delete(id);
    const version = state.current.find(r => r.id === id)?.version;
    const request = (async () => {
      try {
        const item = await api.patch(id, patch, version);
        retries.current.delete(id);
        accept(item, { ...item, ...pending.current.get(id) });
        setSaveStatus(s => ({ ...s, [id]: pending.current.has(id) ? 'saving' : 'saved' }));
        setError(null); invalidarDados(api.source);
        return true;
      } catch (err) {
        const current = (err as { current?: T })?.current;
        if (current) {
          pending.current.delete(id);
          refused(id, state.current.find(r => r.id === id), err);
          accept(current);
          setSaveStatus(s => ({ ...s, [id]: 'conflict' }));
          setError('Este registro foi alterado por outra pessoa. Confira os dados antes de editar novamente.');
        } else if (isDefinitiveError(err)) {
          // Repetir não muda a resposta: o pendente sai da fila (senão a
          // releitura ficaria travada para sempre) e quem chamou fica sabendo.
          pending.current.delete(id); retries.current.delete(id);
          refused(id, state.current.find(r => r.id === id), err);
          setSaveStatus(s => ({ ...s, [id]: 'error' }));
          setError(err instanceof Error ? err.message : 'Falha ao salvar.');
        } else {
          pending.current.set(id, { ...patch, ...pending.current.get(id) });
          const attempt = retries.current.get(id) ?? 0;
          retries.current.set(id, attempt + 1);
          timers.current.set(id, setTimeout(() => { void flush(id); }, nextRetryDelay(attempt)));
          setSaveStatus(s => ({ ...s, [id]: 'error' }));
          setError(err instanceof Error ? err.message : 'Falha ao salvar.');
        }
        return false;
      } finally { running.current.delete(id); }
    })();
    running.current.set(id, request);
    return request;
  }, [api, accept, refused]);
  const update = useCallback((id: string, patch: P) => {
    revision.current++;
    commit(state.current.map(r => r.id === id ? { ...r, ...patch } : r));
    pending.current.set(id, { ...pending.current.get(id), ...patch });
    setSaveStatus(s => ({ ...s, [id]: 'saving' }));
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => { void flushOne(id); }, 600));
  }, [commit, flushOne]);
  const saveNow = useCallback(async (id: string, patch: P, version?: number): Promise<boolean> => {
    if (explicit.current.has(id)) return false;
    explicit.current.add(id);
    try {
      if (!(await flushOne(id))) return false;
      revision.current++;
      setSaveStatus(s => ({ ...s, [id]: 'saving' }));
      const request = (async () => {
        try {
          const item = await api.patch(id, patch, version ?? state.current.find(r => r.id === id)?.version);
          accept(item); setError(null);
          setSaveStatus(s => ({ ...s, [id]: 'saved' })); invalidarDados(api.source); return true;
        } catch (err) {
          const current = (err as { current?: T })?.current;
          if (current || isDefinitiveError(err)) {
            const base = state.current.find(r => r.id === id);
            refused(id, base && { ...base, ...patch }, err);
          }
          if (current) accept(current);
          setSaveStatus(s => ({ ...s, [id]: current ? 'conflict' : 'error' }));
          setError(err instanceof Error ? err.message : 'Falha ao salvar.'); return false;
        } finally { running.current.delete(id); }
      })();
      running.current.set(id, request);
      return await request;
    } finally { explicit.current.delete(id); }
  }, [api, accept, flushOne, refused]);
  const flushPending = useCallback(async () => {
    const ids = new Set([...pending.current.keys(), ...running.current.keys()]);
    return (await Promise.all([...ids].map(flushOne))).every(Boolean);
  }, [flushOne]);
  const add = useCallback(async (data: P) => {
    const item = await api.create(data);
    revision.current++; commit([...state.current, item]); confirm(list => [...list, item]);
    invalidarDados(api.source); return item;
  }, [api, commit, confirm]);
  const remove = useCallback(async (id: string) => {
    if (running.current.has(id)) await running.current.get(id);
    clearTimeout(timers.current.get(id)); timers.current.delete(id);
    revision.current++;
    try {
      await api.remove(id);
      pending.current.delete(id);
      commit(state.current.filter(r => r.id !== id)); confirm(list => list.filter(r => r.id !== id));
      setSaveStatus(s => { const next = { ...s }; delete next[id]; return next; });
      setError(null); invalidarDados(api.source); return true;
    } catch (err) {
      if (pending.current.has(id)) timers.current.set(id, setTimeout(() => { void flushOne(id); }, 600));
      setError(err instanceof Error ? err.message : 'Falha ao excluir.'); return false;
    }
  }, [api, commit, confirm, flushOne]);
  /** Lista que veio do servidor por outro caminho (restauração): na tela e no cache confirmado. */
  const commitConfirmed = useCallback((next: T[]) => { commit(next); confirm(() => next); }, [commit, confirm]);
  const clearError = useCallback(() => setError(null), []);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const stop = observarDados(source => { if (invalida(source, api.source)) void refresh(); });
    const currentTimers = timers.current;
    return () => { mounted.current = false; stop(); currentTimers.forEach(clearTimeout); };
  }, [api, refresh]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (hasPendingWrites()) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasPendingWrites]);
  return {
    items, loading, error, saveStatus, hasPendingWrites, hasPendingWrite,
    update, saveNow, add, remove, refresh, flushPending, clearError, accept, commit: commitConfirmed,
  };
}
