import type { RiskRecord } from '../types';
import { computeScore, computePrioriz, normStatus } from './calculations';

export interface EnrichedRow {
  idx: number;
  record: RiskRecord;
  score: number | null;
  prioriz: number | null;
  normSt: string;
}

export function buildRows(records: RiskRecord[]): EnrichedRow[] {
  return records.map((record, idx) => ({
    idx,
    record,
    score: computeScore(record),
    prioriz: computePrioriz(record),
    normSt: normStatus(record.status),
  }));
}
