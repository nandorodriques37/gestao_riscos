import type { RiskRecord } from '../../types';
import { computeScore, computePrioriz } from '../../lib/calculations';

export interface ActionableItem {
  idx: number;
  record: RiskRecord;
  score: number | null;
  prioriz: number;
}

/** Registros com priorização calculável (esforco/impacto2/gravidade preenchidos). */
export function buildActionable(records: RiskRecord[]): ActionableItem[] {
  return records
    .map((record, idx) => ({ idx, record, score: computeScore(record), prioriz: computePrioriz(record) }))
    .filter((x): x is ActionableItem => x.prioriz != null);
}
