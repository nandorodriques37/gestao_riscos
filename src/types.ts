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

export type Tab = 'registro' | 'graficos' | 'priorizacao';

export type StatusFilterValue = 'Todos' | 'Não iniciado' | 'Em andamento' | 'Concluído';

export type Quadrant = 'qw' | 'ga' | 'bp' | 'rv';

export type SortKey = 'probab' | 'impact' | 'score' | 'prioriz' | null;

export type SortDir = 'asc' | 'desc';

export type GraphFilter =
  | { type: 'categoria' | 'area' | 'rotina' | 'recurso' | 'status' | 'criticidade'; value: string }
  | { type: 'heat'; prob: number; imp: number }
  | null;

export type ColWidths = Record<string, number>;
