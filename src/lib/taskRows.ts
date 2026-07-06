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
