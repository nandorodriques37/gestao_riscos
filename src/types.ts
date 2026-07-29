/** Status de uma ação do plano de ação de um risco. */
export type AcaoStatus = 'A fazer' | 'Em andamento' | 'Concluída';
export const ACAO_STATUSES: readonly AcaoStatus[] = ['A fazer', 'Em andamento', 'Concluída'];

/** Uma linha do plano de ação: o que fazer, quem faz e até quando. */
export interface AcaoItem {
  id: string;
  descricao: string;
  responsavel: string;
  /** 'YYYY-MM-DD' (formato nativo do <input type="date">) ou '' quando sem prazo. */
  prazo: string;
  status: AcaoStatus;
}

export interface RiskRecord {
  area: string;
  rotina: string;
  categoria: string;
  risco: string;
  resposta: string;
  probab: number | null;
  impact: number | null;
  /** Resumo textual do plano de ação — derivado de `acoes_itens`, lido por tabela, gráficos e CSV. */
  acoes: string;
  /**
   * Plano de ação estruturado. Opcional porque registros antigos (e as sementes)
   * só têm o texto livre em `acoes`; `parseAcoes` cobre esse caso na leitura.
   * Nome em snake_case para bater com o da coluna no Postgres.
   */
  acoes_itens?: AcaoItem[];
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
