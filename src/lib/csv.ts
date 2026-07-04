import type { RiskRecord } from '../types';
import { computeScore, computePrioriz, normStatus, round1, round2 } from './calculations';

type ColDef = [keyof RiskRecord | 'score' | 'prioriz', string];

const COLUMNS: ColDef[] = [
  ['area', 'Área'],
  ['rotina', 'Rotina'],
  ['categoria', 'Categoria'],
  ['risco', 'Risco'],
  ['resposta', 'Resposta'],
  ['probab', 'Probabilidade'],
  ['impact', 'Impacto'],
  ['score', 'Score'],
  ['acoes', 'Ações'],
  ['resultado', 'Resultado Esperado'],
  ['esforco', 'Esforço'],
  ['impacto2', 'Impacto2'],
  ['gravidade', 'Gravidade'],
  ['prioriz', 'Priorização'],
  ['recurso', 'Recurso'],
  ['responsavel', 'Responsável'],
  ['status', 'Status'],
  ['obs', 'Observação'],
];

function esc(v: unknown): string {
  const s = v == null ? '' : String(v);
  return '"' + s.replace(/"/g, '""') + '"';
}

export function recordsToCSV(records: RiskRecord[]): string {
  const lines = [COLUMNS.map(c => esc(c[1])).join(';')];
  records.forEach(r => {
    const row = COLUMNS.map(([key]) => {
      if (key === 'status') return esc(normStatus(r.status));
      if (key === 'score') {
        const sc = computeScore(r);
        return esc(sc == null ? '' : round1(sc));
      }
      if (key === 'prioriz') {
        const p = computePrioriz(r);
        return esc(p == null ? '' : round2(p));
      }
      return esc(r[key as keyof RiskRecord]);
    });
    lines.push(row.join(';'));
  });
  return lines.join('\r\n');
}

export function downloadRecordsCSV(records: RiskRecord[], filename = 'matriz-de-risco.csv'): void {
  const csv = recordsToCSV(records);
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
