import type { Task } from '../types';
import { computeGUT, prioridadeLabel, normTaskStatus } from './taskCalculations';

type ColDef = [keyof Task | 'gut' | 'prioridade', string];

const COLUMNS: ColDef[] = [
  ['tipo', 'Tipo'],
  ['tarefa', 'Tarefa'],
  ['detalhes', 'Detalhes'],
  ['g', 'Gravidade'],
  ['u', 'Urgência'],
  ['t', 'Tendência'],
  ['gut', 'GUT'],
  ['prioridade', 'Prioridade'],
  ['status', 'Status'],
  ['responsavel', 'Responsável'],
  ['obs', 'Observações'],
];

function esc(v: unknown): string {
  const s = v == null ? '' : String(v);
  return '"' + s.replace(/"/g, '""') + '"';
}

export function tasksToCSV(tasks: Task[]): string {
  const lines = [COLUMNS.map(c => esc(c[1])).join(';')];
  tasks.forEach(task => {
    const row = COLUMNS.map(([key]) => {
      if (key === 'status') return esc(normTaskStatus(task.status));
      if (key === 'gut') return esc(computeGUT(task) ?? '');
      if (key === 'prioridade') return esc(prioridadeLabel(computeGUT(task)) ?? '');
      return esc(task[key as keyof Task]);
    });
    lines.push(row.join(';'));
  });
  return lines.join('\r\n');
}

export function downloadTasksCSV(tasks: Task[], filename = 'gestao-de-tarefas.csv'): void {
  const csv = tasksToCSV(tasks);
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
