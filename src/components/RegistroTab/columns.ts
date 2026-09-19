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

/*
 * O nome do risco vem PRIMEIRO e é a coluna congelada. Era a quarta, atrás de
 * área, rotina e categoria — três colunas de taxonomia com largura fixa
 * enquanto o texto livre mais importante da tabela cortava em ~40 caracteres.
 * Agora ele fica à vista durante todo o scroll horizontal, com duas linhas,
 * e a taxonomia leva só o mínimo que precisa.
 */
export const COLUMNS: ColumnDef[] = [
  { id: 'risco', label: 'Riscos', width: 380, red: true, group: 'Identificação' },
  { id: 'area', label: 'Área', width: 140, group: 'Identificação' },
  { id: 'rotina', label: 'Rotina', width: 140, group: 'Identificação', priority: 'low' },
  { id: 'categoria', label: 'Categoria', width: 100, group: 'Identificação' },
  { id: 'resposta', label: 'Resposta', width: 100, group: 'Avaliação do Risco Inerente' },
  { id: 'probab', label: 'Prob.', width: 60, sortKey: 'probab', group: 'Avaliação do Risco Inerente', num: true },
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
