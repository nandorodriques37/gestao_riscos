import { useCallback, useEffect, useRef, useState } from 'react';
import { invalidarDados, observarDados, type DataSource } from '../lib/dataSync';
import { nextRetryDelay } from '../lib/retryBackoff';

export type SaveStatus = 'saving' | 'saved' | 'error' | 'conflict';
interface Stored { id: string; version: number }
interface Adapter<T extends Stored, P> {
  source: DataSource; cache: string;
  fetch: () => Promise<T[]>; create: (data: P) => Promise<T>;
  patch: (id: string, patch: P, version?: number) => Promise<T>; remove: (id: string) => Promise<void>;
}
export function useStoredCollection<T extends Stored, P extends object>(api: Adapter<T, P>) {
  const [items, setItems] = useState<T[]>(() => {
    try { const r = JSON.parse(localStorage.getItem(api.cache) ?? '[]'); return Array.isArray(r) ? r : []; }
    catch { return []; }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});
  const state = useRef(items);
  const pending = useRef(new Map<string, P>());
  const running = useRef(new Map<string, Promise<boolean>>());
  const explicit = useRef(new Set<string>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const retries = useRef(new Map<string, number>());
  const mounted = useRef(true);
  const revision = useRef(0);
  const readSequence = useRef(0);

  const commit = useCallback((next: T[]) => {
    state.current = next;
    if (mounted.current) setItems(next);
    try { localStorage.setItem(api.cache, JSON.stringify(next)); } catch { /* cache opcional */ }
  }, [api]);
  const accept = useCallback((item: T) => {
    revision.current++;
    commit(state.current.map(r => r.id === item.id && r.version <= item.version ? item : r));
  }, [commit]);
  const hasPendingWrites = useCallback(() => pending.current.size > 0 || running.current.size > 0 || explicit.current.size > 0, []);
  const refresh = useCallback(async () => {
    if (hasPendingWrites()) return;
    const sequence = ++readSequence.current, epoch = revision.current;
    try {
      const data = await api.fetch();
      if (mounted.current && sequence === readSequence.current && epoch === revision.current && !hasPendingWrites()) commit(data);
    } catch (err) { if (mounted.current) setError(err instanceof Error ? err.message : 'Falha ao atualizar os dados.'); }
  }, [api, commit, hasPendingWrites]);

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
        accept({ ...item, ...pending.current.get(id) });
        setSaveStatus(s => ({ ...s, [id]: pending.current.has(id) ? 'saving' : 'saved' }));
        setError(null); invalidarDados(api.source);
        return true;
      } catch (err) {
        const current = (err as { current?: T })?.current;
        if (current) {
          pending.current.delete(id); accept(current);
          setSaveStatus(s => ({ ...s, [id]: 'conflict' }));
          setError('Este registro foi alterado por outra pessoa. Confira os dados antes de editar novamente.');
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
  }, [api, accept]);
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
          if (current) accept(current);
          setSaveStatus(s => ({ ...s, [id]: current ? 'conflict' : 'error' }));
          setError(err instanceof Error ? err.message : 'Falha ao salvar.'); return false;
        } finally { running.current.delete(id); }
      })();
      running.current.set(id, request);
      return await request;
    } finally { explicit.current.delete(id); }
  }, [api, accept, flushOne]);
  const flushPending = useCallback(async () => {
    const ids = new Set([...pending.current.keys(), ...running.current.keys()]);
    return (await Promise.all([...ids].map(flushOne))).every(Boolean);
  }, [flushOne]);
  const add = useCallback(async (data: P) => {
    const item = await api.create(data);
    revision.current++; commit([...state.current, item]); invalidarDados(api.source); return item;
  }, [api, commit]);
  const remove = useCallback(async (id: string) => {
    if (running.current.has(id)) await running.current.get(id);
    clearTimeout(timers.current.get(id)); timers.current.delete(id);
    revision.current++;
    try {
      await api.remove(id);
      pending.current.delete(id);
      commit(state.current.filter(r => r.id !== id));
      setSaveStatus(s => { const next = { ...s }; delete next[id]; return next; });
      setError(null); invalidarDados(api.source); return true;
    } catch (err) {
      if (pending.current.has(id)) timers.current.set(id, setTimeout(() => { void flushOne(id); }, 600));
      setError(err instanceof Error ? err.message : 'Falha ao excluir.'); return false;
    }
  }, [api, commit, flushOne]);
  const clearError = useCallback(() => setError(null), []);
  useEffect(() => {
    mounted.current = true;
    void refresh().finally(() => { if (mounted.current) setLoading(false); });
    const stop = observarDados(source => { if (source !== api.source) void refresh(); });
    const currentTimers = timers.current;
    return () => { mounted.current = false; stop(); currentTimers.forEach(clearTimeout); };
  }, [api, refresh]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (hasPendingWrites()) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasPendingWrites]);
  return { items, loading, error, saveStatus, hasPendingWrites, update, saveNow, add, remove, refresh, flushPending, clearError, accept, commit };
}
