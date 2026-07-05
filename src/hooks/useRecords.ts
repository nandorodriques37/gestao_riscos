import { useCallback, useEffect, useRef, useState } from 'react';
import type { RiskRecord, StoredRiskRecord } from '../types';
import {
  fetchRecords, createRecordApi, patchRecordApi, deleteRecordApi, restoreRecordsApi,
} from '../lib/api';
import { nextRetryDelay } from '../lib/retryBackoff';

const CACHE_KEY = 'riskMatrix.cache.v1';
const FLUSH_DELAY = 600;

export type SaveStatus = 'saving' | 'saved' | 'error';

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
  saveStatus: Record<string, SaveStatus>;
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
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>({});

  const pending = useRef<Map<string, Partial<RiskRecord>>>(new Map());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const retryAttempts = useRef<Map<string, number>>(new Map());
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
      retryAttempts.current.delete(id);
      if (mounted.current) {
        setError(null);
        setSaveStatus(s => ({ ...s, [id]: 'saved' }));
      }
    } catch (err) {
      // devolve o patch para a fila e agenda um retry automático com backoff,
      // para não depender de uma edição futura ou do flush do modal para sincronizar
      const merged = { ...patch, ...(pending.current.get(id) || {}) };
      pending.current.set(id, merged);
      const attempt = retryAttempts.current.get(id) ?? 0;
      retryAttempts.current.set(id, attempt + 1);
      timers.current.set(id, setTimeout(() => { void flushOne(id); }, nextRetryDelay(attempt)));
      if (mounted.current) {
        setError(err instanceof Error ? err.message : 'Falha ao salvar');
        setSaveStatus(s => ({ ...s, [id]: 'error' }));
      }
    }
  }, []);

  const updateRecordById = useCallback((id: string, patch: Partial<RiskRecord>) => {
    setRecords(prev => {
      const next = prev.map(r => (r.id === id ? { ...r, ...patch } : r));
      writeCache(next);
      return next;
    });
    pending.current.set(id, { ...(pending.current.get(id) || {}), ...patch });
    retryAttempts.current.delete(id);
    setSaveStatus(s => ({ ...s, [id]: 'saving' }));
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
    retryAttempts.current.delete(id);
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
    setSaveStatus(s => {
      if (!(id in s)) return s;
      const rest = { ...s };
      delete rest[id];
      return rest;
    });
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
    retryAttempts.current.clear();
    timers.current.forEach(t => clearTimeout(t));
    timers.current.clear();
    const data = await restoreRecordsApi();
    if (mounted.current) { commit(data); setError(null); setSaveStatus({}); }
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
    hasPendingWrites, saveStatus, updateRecordById, addRecord, deleteRecordById,
    restore, refresh, flushPending, clearError,
  };
}
