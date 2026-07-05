import type { SortKey } from '../../types';

export interface ColumnDef {
  id: string;
  label: string;
  width: number;
  sortKey?: SortKey;
  red?: boolean;
  /** Seção do registro à qual a coluna pertence — mesmos nomes das seções do EditModal. */
  group?: string;
}

export const COLUMNS: ColumnDef[] = [
  { id: 'area', label: 'Área', width: 150, group: 'Identificação' },
  { id: 'rotina', label: 'Rotina', width: 160, group: 'Identificação' },
  { id: 'categoria', label: 'Categoria', width: 110, group: 'Identificação' },
  { id: 'risco', label: 'Riscos', width: 270, red: true, group: 'Identificação' },
  { id: 'resposta', label: 'Resposta', width: 100, group: 'Avaliação do Risco Inerente' },
  { id: 'probab', label: 'Probab.', width: 64, sortKey: 'probab', group: 'Avaliação do Risco Inerente' },
  { id: 'impact', label: 'Impact.', width: 64, sortKey: 'impact', group: 'Avaliação do Risco Inerente' },
  { id: 'score', label: 'Score', width: 64, sortKey: 'score', group: 'Avaliação do Risco Inerente' },
  { id: 'acoes', label: 'Ações', width: 250, group: 'Plano de Ação' },
  { id: 'resultado', label: 'Resultado Esperado', width: 220, group: 'Plano de Ação' },
  { id: 'esforco', label: 'ESFORÇO', width: 76, group: 'Priorização do Esforço' },
  { id: 'impacto2', label: 'IMPACTO2', width: 80, group: 'Priorização do Esforço' },
  { id: 'gravidade', label: 'GRAVIDADE', width: 84, group: 'Priorização do Esforço' },
  { id: 'prioriz', label: 'PRIORIZAÇÃO', width: 100, sortKey: 'prioriz', group: 'Priorização do Esforço' },
  { id: 'recurso', label: 'Recurso', width: 160, group: 'Gestão e Acompanhamento' },
  { id: 'responsavel', label: 'Responsável', width: 140, group: 'Gestão e Acompanhamento' },
  { id: 'status', label: 'Status', width: 118, group: 'Gestão e Acompanhamento' },
  { id: 'obs', label: 'Observação', width: 170, group: 'Gestão e Acompanhamento' },
  { id: '_del', label: '', width: 36 },
];

export interface GroupRun {
  label: string;
  span: number;
}

/** Reduz COLUMNS em blocos consecutivos por `group`, para o cabeçalho de 2 linhas. */
function computeGroupRuns(columns: ColumnDef[]): GroupRun[] {
  const runs: GroupRun[] = [];
  for (const col of columns) {
    const label = col.group ?? '';
    const last = runs[runs.length - 1];
    if (last && last.label === label) {
      last.span += 1;
    } else {
      runs.push({ label, span: 1 });
    }
  }
  return runs;
}

export const GROUP_RUNS: GroupRun[] = computeGroupRuns(COLUMNS);
