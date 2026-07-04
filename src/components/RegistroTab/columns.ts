import type { SortKey } from '../../types';

export interface ColumnDef {
  id: string;
  label: string;
  width: number;
  sortKey?: SortKey;
  red?: boolean;
}

export const COLUMNS: ColumnDef[] = [
  { id: 'area', label: 'Área', width: 150 },
  { id: 'rotina', label: 'Rotina', width: 160 },
  { id: 'categoria', label: 'Categoria', width: 110 },
  { id: 'risco', label: 'Riscos', width: 270, red: true },
  { id: 'resposta', label: 'Resposta', width: 100 },
  { id: 'probab', label: 'Probab.', width: 64, sortKey: 'probab' },
  { id: 'impact', label: 'Impact.', width: 64, sortKey: 'impact' },
  { id: 'score', label: 'Score', width: 64, sortKey: 'score' },
  { id: 'acoes', label: 'Ações', width: 250 },
  { id: 'resultado', label: 'Resultado Esperado', width: 220 },
  { id: 'esforco', label: 'ESFORÇO', width: 76 },
  { id: 'impacto2', label: 'IMPACTO2', width: 80 },
  { id: 'gravidade', label: 'GRAVIDADE', width: 84 },
  { id: 'prioriz', label: 'PRIORIZAÇÃO', width: 100, sortKey: 'prioriz' },
  { id: 'recurso', label: 'Recurso', width: 160 },
  { id: 'responsavel', label: 'Responsável', width: 140 },
  { id: 'status', label: 'Status', width: 118 },
  { id: 'obs', label: 'Observação', width: 170 },
  { id: '_del', label: '', width: 36 },
];
