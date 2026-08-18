import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task, StoredTask, TaskAttachment } from '../types';
import {
  fetchTasks, createTaskApi, patchTaskApi, deleteTaskApi, TaskConflictError,
  uploadTaskAttachmentApi, deleteTaskAttachmentApi,
} from '../lib/tasksApi';
import { prepareAttachment } from '../lib/imageAttachments';
import { nextRetryDelay } from '../lib/retryBackoff';

// v2: as tarefas passaram a carregar `anexos`; o cache antigo não tem o campo.
const CACHE_KEY = 'tasks.cache.v2';
const FLUSH_DELAY = 600;

export type TaskSaveStatus = 'saving' | 'saved' | 'error' | 'conflict';

function readCache(): StoredTask[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Defensivo contra um cache gravado por outra versão do app.
      if (Array.isArray(parsed)) return parsed.map(t => ({ ...t, anexos: t?.anexos ?? [] }));
    }
  } catch {
    // cache ausente/corrompido — ignora
  }
  return [];
}

function writeCache(tasks: StoredTask[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(tasks));
  } catch {
    // storage indisponível — segue apenas em memória
  }
}

export interface UseTasks {
  tasks: StoredTask[];
  loading: boolean;
  error: string | null;
  hasPendingWrites: () => boolean;
  saveStatus: Record<string, TaskSaveStatus>;
  updateTaskById: (id: string, patch: Partial<Task>) => void;
  addTask: (data?: Partial<Task>) => Promise<StoredTask>;
  deleteTaskById: (id: string) => Promise<boolean>;
  /** Prepara a imagem (reduz/valida), sobe e junta o anexo à tarefa. Lança em caso de recusa. */
  addAttachment: (taskId: string, file: File) => Promise<void>;
  removeAttachment: (taskId: string, anexoId: string) => Promise<void>;
  refresh: () => Promise<void>;
  flushPending: () => Promise<void>;
  clearError: () => void;
}

export function useTasks(): UseTasks {
  const [tasks, setTasks] = useState<StoredTask[]>(readCache);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<Record<string, TaskSaveStatus>>({});

  const pending = useRef<Map<string, Partial<Task>>>(new Map());
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const retryAttempts = useRef<Map<string, number>>(new Map());
  const mounted = useRef(true);
  const tasksRef = useRef<StoredTask[]>(tasks);

  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  const commit = useCallback((next: StoredTask[]) => {
    setTasks(next);
    writeCache(next);
  }, []);

  const flushOne = useCallback(async (id: string) => {
    const patch = pending.current.get(id);
    pending.current.delete(id);
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
    if (!patch) return;
    const expectedVersion = tasksRef.current.find(t => t.id === id)?.version;
    try {
      const updated = await patchTaskApi(id, patch, expectedVersion);
      retryAttempts.current.delete(id);
      if (mounted.current) {
        setError(null);
        setSaveStatus(s => ({ ...s, [id]: 'saved' }));
        setTasks(prev => {
          const next = prev.map(t => (t.id === id ? updated : t));
          writeCache(next);
          return next;
        });
      }
    } catch (err) {
      if (err instanceof TaskConflictError) {
        if (mounted.current) {
          setSaveStatus(s => ({ ...s, [id]: 'conflict' }));
          setError('Esta tarefa foi alterada por outra pessoa enquanto você editava. Os dados foram atualizados.');
          setTasks(prev => {
            const next = prev.map(t => (t.id === id ? err.current : t));
            writeCache(next);
            return next;
          });
        }
        return;
      }
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

  const updateTaskById = useCallback((id: string, patch: Partial<Task>) => {
    setTasks(prev => {
      const next = prev.map(t => (t.id === id ? { ...t, ...patch } : t));
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
      const data = await fetchTasks();
      if (!mounted.current) return;
      commit(data);
      setError(null);
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Falha ao carregar');
    }
  }, [commit]);

  const addTask = useCallback(async (data?: Partial<Task>) => {
    const created = await createTaskApi(data ?? {});
    setTasks(prev => {
      const next = [...prev, created];
      writeCache(next);
      return next;
    });
    return created;
  }, []);

  const deleteTaskById = useCallback(async (id: string) => {
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
    setTasks(prev => {
      const next = prev.filter(t => t.id !== id);
      writeCache(next);
      return next;
    });
    try {
      await deleteTaskApi(id);
      if (mounted.current) setError(null);
      return true;
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Falha ao excluir');
      await refresh();
      return false;
    }
  }, [refresh]);

  /**
   * Anexos não passam pelo caminho com debounce das edições de campo: são
   * operações imediatas em endpoint próprio. O estado local é corrigido na
   * resposta, e o erro sobe para quem chamou mostrar ao lado do campo.
   */
  const patchAnexos = useCallback((taskId: string, fn: (anexos: TaskAttachment[]) => TaskAttachment[]) => {
    if (!mounted.current) return;
    setTasks(prev => {
      const next = prev.map(t => (t.id === taskId ? { ...t, anexos: fn(t.anexos ?? []) } : t));
      writeCache(next);
      return next;
    });
  }, []);

  const addAttachment = useCallback(async (taskId: string, file: File) => {
    const preparada = await prepareAttachment(file);
    const anexo = await uploadTaskAttachmentApi(taskId, preparada);
    patchAnexos(taskId, anexos => [...anexos, anexo]);
  }, [patchAnexos]);

  const removeAttachment = useCallback(async (taskId: string, anexoId: string) => {
    await deleteTaskAttachmentApi(taskId, anexoId);
    patchAnexos(taskId, anexos => anexos.filter(a => a.id !== anexoId));
  }, [patchAnexos]);

  const hasPendingWrites = useCallback(() => pending.current.size > 0, []);
  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    mounted.current = true;
    const timersSnapshot = timers.current;
    (async () => {
      try {
        const data = await fetchTasks();
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
    tasks, loading, error,
    hasPendingWrites, saveStatus, updateTaskById, addTask, deleteTaskById,
    addAttachment, removeAttachment,
    refresh, flushPending, clearError,
  };
}
