import { useCallback } from 'react';
import type { Task } from '../types';
import { fetchTasks, createTaskApi, patchTaskApi, deleteTaskApi, uploadTaskAttachmentApi, deleteTaskAttachmentApi } from '../lib/tasksApi';
import { prepareAttachment } from '../lib/imageAttachments';
import { invalidarDados } from '../lib/dataSync';
import { useStoredCollection } from './useStoredCollection';
export type { SaveStatus as TaskSaveStatus } from './useStoredCollection';
const adapter = { source: 'tarefas' as const, cache: 'tasks.cache.v2', fetch: fetchTasks, create: createTaskApi, patch: patchTaskApi, remove: deleteTaskApi };
export function useTasks() {
  const c = useStoredCollection(adapter);
  const { add, refresh } = c;
  const addTask = useCallback((data: Partial<Task> = {}) => add(data), [add]);
  const addAttachment = useCallback(async (id: string, file: File) => {
    await uploadTaskAttachmentApi(id, await prepareAttachment(file)); await refresh(); invalidarDados('tarefas');
  }, [refresh]);
  const removeAttachment = useCallback(async (id: string, anexoId: string) => {
    await deleteTaskAttachmentApi(id, anexoId); await refresh(); invalidarDados('tarefas');
  }, [refresh]);
  return { tasks: c.items, loading: c.loading, error: c.error, saveStatus: c.saveStatus,
    updateTaskById: c.update, saveTask: c.saveNow, addTask, deleteTaskById: c.remove, addAttachment, removeAttachment,
    refresh, flushPending: c.flushPending, clearError: c.clearError, hasPendingWrites: c.hasPendingWrites };
}
export type UseTasks = ReturnType<typeof useTasks>;
