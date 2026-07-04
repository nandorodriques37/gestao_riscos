import { useCallback, useEffect, useRef, useState } from 'react';
import type { RiskRecord, StoredRiskRecord } from '../types';
import {
  fetchRecords, createRecordApi, patchRecordApi, deleteRecordApi, restoreRecordsApi,
} from '../lib/api';

const CACHE_KEY = 'riskMatrix.cache.v1';
const FLUSH_DELAY = 600;

function readCache(): StoredRiskRecord[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // cache ausente/corrompido — ignora
  }
  return [];
}

function writeCache(records: StoredRiskRecord[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(records));
  } catch {
    // storage indisponível — segue apenas em memória
  }
}

export interface UseRecords {
  records: StoredRiskRecord[];
  loading: boolean;
  error: string | null;
  hasPendingWrites: () => boolean;
  updateRecordById: (id: string, patch: Partial<RiskRecord>) => void;
  addRecord: () => Promise<StoredRiskRecord>;
  deleteRecordById: (id: string) => Promise<void>;
  restore: () => Promise<void>;
  refresh: () => Promise<void>;
  flushPending: () => Promise<void>;
  clearError: () => void;
}

export function useRecords(): UseRecords {
  const [records, setRecords] = useState<StoredRiskRecord[]>(readCache);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pending = useRef<Map<string, Partial<RiskRecord>>>(new Map());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const mounted = useRef(true);

  const commit = useCallback((next: StoredRiskRecord[]) => {
    setRecords(next);
    writeCache(next);
  }, []);

  const flushOne = useCallback(async (id: string) => {
    const patch = pending.current.get(id);
    pending.current.delete(id);
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
    if (!patch) return;
    try {
      await patchRecordApi(id, patch);
      if (mounted.current) setError(null);
    } catch (err) {
      // devolve o patch para a fila para nova tentativa em edições/flush futuros
      const merged = { ...patch, ...(pending.current.get(id) || {}) };
      pending.current.set(id, merged);
      if (mounted.current) setError(err instanceof Error ? err.message : 'Falha ao salvar');
    }
  }, []);

  const updateRecordById = useCallback((id: string, patch: Partial<RiskRecord>) => {
    setRecords(prev => {
      const next = prev.map(r => (r.id === id ? { ...r, ...patch } : r));
      writeCache(next);
      return next;
    });
    pending.current.set(id, { ...(pending.current.get(id) || {}), ...patch });
    const existing = timers.current.get(id);
    if (existing) clearTimeout(existing);
    timers.current.set(id, setTimeout(() => { void flushOne(id); }, FLUSH_DELAY));
  }, [flushOne]);

  const flushPending = useCallback(async () => {
    const ids = Array.from(pending.current.keys());
    await Promise.all(ids.map(id => flushOne(id)));
  }, [flushOne]);

  const refresh = useCallback(async () => {
    if (pending.current.size > 0) return; // não sobrescreve edições ainda não sincronizadas
    try {
      const data = await fetchRecords();
      if (!mounted.current) return;
      commit(data);
      setError(null);
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Falha ao carregar');
    }
  }, [commit]);

  const addRecord = useCallback(async () => {
    const created = await createRecordApi({});
    setRecords(prev => {
      const next = [...prev, created];
      writeCache(next);
      return next;
    });
    return created;
  }, []);

  const deleteRecordById = useCallback(async (id: string) => {
    pending.current.delete(id);
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
    setRecords(prev => {
      const next = prev.filter(r => r.id !== id);
      writeCache(next);
      return next;
    });
    try {
      await deleteRecordApi(id);
      if (mounted.current) setError(null);
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Falha ao excluir');
      await refresh();
    }
  }, [refresh]);

  const restore = useCallback(async () => {
    pending.current.clear();
    timers.current.forEach(t => clearTimeout(t));
    timers.current.clear();
    const data = await restoreRecordsApi();
    if (mounted.current) { commit(data); setError(null); }
  }, [commit]);

  const hasPendingWrites = useCallback(() => pending.current.size > 0, []);
  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    mounted.current = true;
    const timersSnapshot = timers.current;
    (async () => {
      try {
        const data = await fetchRecords();
        if (!mounted.current) return;
        commit(data);
      } catch (err) {
        if (mounted.current) setError(err instanceof Error ? err.message : 'Falha ao carregar');
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();
    return () => {
      mounted.current = false;
      timersSnapshot.forEach(t => clearTimeout(t));
    };
  }, [commit]);

  return {
    records, loading, error,
    hasPendingWrites, updateRecordById, addRecord, deleteRecordById,
    restore, refresh, flushPending, clearError,
  };
}
