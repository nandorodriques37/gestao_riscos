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
  // Detalhes, as notas avulsas G/U/T e o Rank ficam só no modal de edição,
  // como já era no cartão do celular: o que se escaneia na lista é o chip de
  // GUT e a prioridade, e as cinco colunas só alongavam o scroll horizontal.
  { id: 'gut', label: 'GUT', width: 84, sortKey: 'gut' },
  { id: 'prioridade', label: 'Prioridade', width: 108 },
  { id: 'status', label: 'Status', width: 140 },
  // Prazo nasceu com a unificação: a mitigação sempre teve data combinada, a
  // tarefa livre não tinha onde guardar uma.
  { id: 'prazo', label: 'Prazo', width: 104, sortKey: 'prazo' },
  { id: 'responsavel', label: 'Responsável', width: 140 },
  // "Observações" fica só no modal de edição: é texto longo, raramente legível
  // na largura de uma coluna, e alongava o scroll horizontal da tabela.
  { id: '_done', label: '', width: 40 },
  { id: '_del', label: '', width: 36 },
];
