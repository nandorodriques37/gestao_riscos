import type { Task, StoredTask, TaskAttachment } from '../types';
import type { PreparedAttachment } from './imageAttachments';
import { cabecalhosDeEscrita } from './autor';

const BASE = '/api';

/** Outra pessoa alterou a tarefa entre a leitura e a gravação (concorrência otimista). */
export class TaskConflictError extends Error {
  current: StoredTask;
  constructor(current: StoredTask) {
    super('Esta tarefa foi alterada por outra pessoa enquanto você editava.');
    this.name = 'TaskConflictError';
    this.current = current;
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      // corpo não-JSON — mantém a mensagem padrão
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function fetchTasks(): Promise<StoredTask[]> {
  return parse(await fetch(`${BASE}/tasks`));
}

export async function createTaskApi(task: Partial<Task> = {}): Promise<StoredTask> {
  return parse(await fetch(`${BASE}/tasks`, {
    method: 'POST',
    headers: cabecalhosDeEscrita(),
    body: JSON.stringify(task),
  }));
}

export async function patchTaskApi(id: string, patch: Partial<Task>, expectedVersion?: number): Promise<StoredTask> {
  const res = await fetch(`${BASE}/tasks/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: cabecalhosDeEscrita(),
    body: JSON.stringify({ ...patch, expectedVersion }),
  });
  if (res.status === 409) throw new TaskConflictError(await res.json());
  return parse(res);
}

export async function deleteTaskApi(id: string): Promise<void> {
  await parse(await fetch(`${BASE}/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' }));
}

// ---------- Anexos de imagem ----------

function anexosBase(taskId: string): string {
  return `${BASE}/tasks/${encodeURIComponent(taskId)}/anexos`;
}

/**
 * URL dos bytes da imagem — vai direto no `src` de um `<img>`. Servida com
 * cache imutável, então a mesma miniatura só é baixada uma vez.
 */
export function taskAttachmentUrl(taskId: string, anexoId: string): string {
  return `${anexosBase(taskId)}/${encodeURIComponent(anexoId)}`;
}

export async function uploadTaskAttachmentApi(taskId: string, anexo: PreparedAttachment): Promise<TaskAttachment> {
  return parse(await fetch(anexosBase(taskId), {
    method: 'POST',
    headers: cabecalhosDeEscrita(),
    body: JSON.stringify(anexo),
  }));
}

export async function deleteTaskAttachmentApi(taskId: string, anexoId: string): Promise<void> {
  await parse(await fetch(taskAttachmentUrl(taskId, anexoId), { method: 'DELETE' }));
}
