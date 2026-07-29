import type { Task } from '../types';
import { computeGUT, normTaskStatus, prioridadeLabel, computeTaskRanks } from './taskCalculations';

export interface EnrichedTaskRow {
  idx: number;
  task: Task;
  gut: number | null;
  prioridade: 'Crítica' | 'Alta' | 'Média' | 'Baixa' | null;
  rank: number | null;
  normSt: string;
}

/** Iniciais do responsável (até 2 palavras) para o avatar — usado na tabela e no card. */
export function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

export function buildTaskRows(tasks: Task[]): EnrichedTaskRow[] {
  const guts = tasks.map(t => computeGUT(t));
  const ranks = computeTaskRanks(guts.map(gut => ({ gut })));
  return tasks.map((task, idx) => ({
    idx,
    task,
    gut: guts[idx],
    prioridade: prioridadeLabel(guts[idx]),
    rank: ranks[idx],
    normSt: normTaskStatus(task.status),
  }));
}
