import type { Task } from '../types';
import type { BadgeKind, TierKind } from './calculations';

/** GUT = Gravidade × Urgência × Tendência; null se faltar alguma nota. */
export function computeGUT(t: Pick<Task, 'g' | 'u' | 't'>): number | null {
  if (t.g == null || t.u == null || t.t == null) return null;
  return t.g * t.u * t.t;
}

/** Cor por faixa de GUT (independente das faixas de criticidade da Matriz de Risco). */
export function gutColor(gut: number | null): string {
  if (gut == null) return '#94A3B8';
  if (gut >= 100) return '#DC2626';
  if (gut >= 60) return '#D97706';
  if (gut >= 30) return '#B8901F';
  return '#15803D';
}

/** Faixa de GUT — mesmos limiares de gutColor, para o chip suave (tier-chip). */
export function gutTier(gut: number | null): TierKind {
  if (gut == null) return 'null';
  if (gut >= 100) return 'critico';
  if (gut >= 60) return 'alto';
  if (gut >= 30) return 'medio';
  return 'baixo';
}

/** Rótulo de prioridade — mesmas faixas de gutColor. */
export function prioridadeLabel(gut: number | null): 'Crítica' | 'Alta' | 'Média' | 'Baixa' | null {
  if (gut == null) return null;
  if (gut >= 100) return 'Crítica';
  if (gut >= 60) return 'Alta';
  if (gut >= 30) return 'Média';
  return 'Baixa';
}

export function normTaskStatus(status: string | null | undefined): string {
  if (!status) return 'A fazer';
  const u = status.toUpperCase();
  if (u.includes('ANDAMENTO')) return 'Em andamento';
  if (u.includes('CONCLU')) return 'Concluída';
  return status;
}

export function taskStatusKind(norm: string): BadgeKind {
  if (norm === 'Em andamento') return 'amber';
  if (norm === 'Concluída') return 'green';
  return 'slate';
}

/**
 * Rank por GUT decrescente, no estilo do RANK() do Excel: empates dividem a
 * mesma posição e a próxima posição pula (1, 1, 3, 4…). Tarefas sem GUT ficam
 * sem rank (null). Retorna os ranks alinhados por índice com `items`.
 */
export function computeTaskRanks<T extends { gut: number | null }>(items: T[]): (number | null)[] {
  const withGut = items
    .map((item, idx) => ({ idx, gut: item.gut }))
    .filter((x): x is { idx: number; gut: number } => x.gut != null)
    .sort((a, b) => b.gut - a.gut);

  const ranks = new Array<number | null>(items.length).fill(null);
  let rank = 0;
  let prevGut: number | null = null;
  withGut.forEach((item, i) => {
    if (item.gut !== prevGut) {
      rank = i + 1;
      prevGut = item.gut;
    }
    ranks[item.idx] = rank;
  });
  return ranks;
}

/** % de tarefas com Gravidade, Urgência e Tendência totalmente avaliadas. */
export function computeAvaliacao(tasks: Task[]): number {
  if (tasks.length === 0) return 0;
  const avaliadas = tasks.filter(t => t.g != null && t.u != null && t.t != null).length;
  return Math.round((avaliadas / tasks.length) * 100);
}
