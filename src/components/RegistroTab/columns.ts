import type { SortKey } from '../../types';

export interface ColumnDef {
  id: string;
  label: string;
  width: number;
  sortKey?: SortKey;
  red?: boolean;
  /** Seção do registro à qual a coluna pertence — mesmos nomes das seções do EditModal. */
  group?: string;
  /**
   * Colunas 'low' somem abaixo de 1100px (ver styles/responsive.css). Encurtam
   * o scroll horizontal em notebook/tablet sem esconder nada essencial — o
   * conteúdo completo continua no modal de edição.
   */
  priority?: 'low';
  /** Coluna numérica: alinha à direita e usa figuras tabulares. */
  num?: boolean;
}

export const COLUMNS: ColumnDef[] = [
  { id: 'area', label: 'Área', width: 150, group: 'Identificação' },
  { id: 'rotina', label: 'Rotina', width: 160, group: 'Identificação', priority: 'low' },
  { id: 'categoria', label: 'Categoria', width: 110, group: 'Identificação' },
  { id: 'risco', label: 'Riscos', width: 270, red: true, group: 'Identificação' },
  { id: 'resposta', label: 'Resposta', width: 100, group: 'Avaliação do Risco Inerente' },
  { id: 'probab', label: 'Probab.', width: 64, sortKey: 'probab', group: 'Avaliação do Risco Inerente', num: true },
  { id: 'impact', label: 'Impact.', width: 64, sortKey: 'impact', group: 'Avaliação do Risco Inerente', num: true },
  { id: 'score', label: 'Score', width: 70, sortKey: 'score', group: 'Avaliação do Risco Inerente' },
  { id: 'acoes', label: 'Ações', width: 250, group: 'Plano de Ação' },
  { id: 'resultado', label: 'Resultado Esperado', width: 220, group: 'Plano de Ação', priority: 'low' },
  { id: 'esforco', label: 'Esforço', width: 76, group: 'Priorização do Esforço', num: true },
  { id: 'impacto2', label: 'Impacto', width: 80, group: 'Priorização do Esforço', num: true },
  { id: 'gravidade', label: 'Gravidade', width: 84, group: 'Priorização do Esforço', num: true },
  { id: 'prioriz', label: 'Priorização', width: 104, sortKey: 'prioriz', group: 'Priorização do Esforço' },
  { id: 'recurso', label: 'Recurso', width: 160, group: 'Gestão e Acompanhamento' },
  { id: 'responsavel', label: 'Responsável', width: 140, group: 'Gestão e Acompanhamento' },
  { id: 'status', label: 'Status', width: 118, group: 'Gestão e Acompanhamento' },
  { id: 'obs', label: 'Observação', width: 170, group: 'Gestão e Acompanhamento', priority: 'low' },
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
