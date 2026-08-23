import type { EnrichedTaskRow } from './taskRows';
import { computeGUT, normTaskStatus } from './taskCalculations';

/**
 * O CSV sai da LINHA ENRIQUECIDA, não da tarefa crua.
 *
 * Exportava `responsavel`, que virou texto congelado de antes da conversão:
 * mitigação saía sem responsável nenhum e tarefa cujo dono mudou saía com o
 * nome antigo. Quem sabe quem responde hoje é a mesma função que a tela usa —
 * e daí saem também o prazo e o vínculo, que a tabela já mostra.
 */
type Valor = (row: EnrichedTaskRow) => unknown;

const COLUNAS: [string, Valor][] = [
  ['Tipo', r => r.task.tipo],
  ['Tarefa', r => r.task.tarefa],
  ['Detalhes', r => r.task.detalhes],
  ['Vínculo', r => (r.vinculo ? (r.vinculo.rotina ? 'Rotina de risco' : 'Mitigação de risco') : 'Tarefa livre')],
  ['Risco de origem', r => r.vinculo?.risco ?? ''],
  ['Iniciativa', r => r.vinculo?.iniciativa ?? ''],
  ['Gravidade', r => r.task.g],
  ['Urgência', r => r.task.u],
  ['Tendência', r => r.task.t],
  ['GUT', r => computeGUT(r.task) ?? ''],
  ['Prioridade', r => (r.prioridade ?? '') + (r.prioridadeHerdada ? ' (herdada do risco)' : '')],
  ['Status', r => normTaskStatus(r.task.status)],
  ['Responsável', r => r.dono],
  ['Prazo', r => r.task.prazo ?? ''],
  ['Atrasada', r => (r.atrasada ? 'sim' : '')],
  ['Observações', r => r.task.obs],
];

function esc(v: unknown): string {
  const s = v == null ? '' : String(v);
  return '"' + s.replace(/"/g, '""') + '"';
}

export function tasksToCSV(rows: EnrichedTaskRow[]): string {
  const linhas = [COLUNAS.map(c => esc(c[0])).join(';')];
  rows.forEach(row => {
    linhas.push(COLUNAS.map(([, valor]) => esc(valor(row))).join(';'));
  });
  return linhas.join('\r\n');
}

export function downloadTasksCSV(rows: EnrichedTaskRow[], filename = 'gestao-de-tarefas.csv'): void {
  const csv = tasksToCSV(rows);
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
