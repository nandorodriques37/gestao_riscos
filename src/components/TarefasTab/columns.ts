import type { TaskSortKey } from '../../types';

export interface TaskColumnDef {
  id: string;
  label: string;
  width: number;
  sortKey?: TaskSortKey;
}

export const TASK_COLUMNS: TaskColumnDef[] = [
  { id: 'tipo', label: 'Tipo', width: 100 },
  { id: 'tarefa', label: 'Tarefa', width: 300 },
  { id: 'detalhes', label: 'Detalhes', width: 240 },
  { id: 'g', label: 'G', width: 44, sortKey: 'g' },
  { id: 'u', label: 'U', width: 44, sortKey: 'u' },
  { id: 't', label: 'T', width: 44, sortKey: 't' },
  { id: 'gut', label: 'GUT', width: 72, sortKey: 'gut' },
  { id: 'prioridade', label: 'Prioridade', width: 100 },
  { id: 'rank', label: 'Rank', width: 56 },
  { id: 'status', label: 'Status', width: 140 },
  { id: 'responsavel', label: 'Responsável', width: 140 },
  { id: 'obs', label: 'Observações', width: 200 },
  { id: '_del', label: '', width: 36 },
];
