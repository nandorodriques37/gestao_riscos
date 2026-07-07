export interface RiskRecord {
  area: string;
  rotina: string;
  categoria: string;
  risco: string;
  resposta: string;
  probab: number | null;
  impact: number | null;
  acoes: string;
  resultado: string;
  esforco: number | null;
  impacto2: number | null;
  gravidade: number | null;
  recurso: string;
  responsavel: string;
  status: string;
  obs: string;
}

/** Registro como vem do backend — igual a RiskRecord, mas com id e versão do banco. */
export interface StoredRiskRecord extends RiskRecord {
  id: string;
  /** Incrementada a cada gravação; usada para detectar edição concorrente. */
  version: number;
}

export type Tab = 'registro' | 'graficos' | 'priorizacao' | 'tarefas';

export type StatusFilterValue = 'Todos' | 'Não iniciado' | 'Em andamento' | 'Concluído';

/** Status "reais" da aba Registro (sem "Todos"), usados na seleção múltipla do filtro. */
export type RegistroStatus = 'Não iniciado' | 'Em andamento' | 'Concluído';
export const REGISTRO_STATUSES: readonly RegistroStatus[] = ['Não iniciado', 'Em andamento', 'Concluído'];

export type Quadrant = 'qw' | 'ga' | 'bp' | 'rv';

export type SortKey = 'probab' | 'impact' | 'score' | 'prioriz' | null;

export type SortDir = 'asc' | 'desc';

export type GraphFilter =
  | { type: 'categoria' | 'area' | 'rotina' | 'recurso' | 'status' | 'criticidade'; value: string }
  | { type: 'heat'; prob: number; imp: number }
  | null;

export type ColWidths = Record<string, number>;

/** Densidade das linhas da tabela de registro (persistida entre sessões). */
export type Density = 'comfortable' | 'compact';

/** Tarefa do dia a dia, priorizada pela Matriz GUT (Gravidade × Urgência × Tendência). */
export interface Task {
  tipo: string;
  tarefa: string;
  detalhes: string;
  g: number | null;
  u: number | null;
  t: number | null;
  status: string;
  responsavel: string;
  obs: string;
}

/** Tarefa como vem do backend — igual a Task, mas com id e versão do banco. */
export interface StoredTask extends Task {
  id: string;
  /** Incrementada a cada gravação; usada para detectar edição concorrente. */
  version: number;
}

export type TaskStatusFilterValue = 'Todos' | 'A fazer' | 'Em andamento' | 'Concluída';

/** Status "reais" da aba Tarefas (sem "Todos"), usados na seleção múltipla do filtro. */
export type TaskStatus = 'A fazer' | 'Em andamento' | 'Concluída';
export const TASK_STATUSES: readonly TaskStatus[] = ['A fazer', 'Em andamento', 'Concluída'];

export type TaskSortKey = 'g' | 'u' | 't' | 'gut' | null;
