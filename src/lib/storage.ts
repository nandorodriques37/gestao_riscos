import type { RiskRecord } from '../types';
import { INITIAL_RECORDS } from '../data/RiskData';

const PERSIST_KEY = 'riskMatrix.records.v1';

export function cloneDefaults(): RiskRecord[] {
  return INITIAL_RECORDS.map(r => ({ ...r }));
}

export function loadInitialRecords(): RiskRecord[] {
  try {
    const saved = localStorage.getItem(PERSIST_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    // localStorage indisponível ou dado corrompido — usa os padrões
  }
  return cloneDefaults();
}

export function persistRecords(records: RiskRecord[]): void {
  try {
    localStorage.setItem(PERSIST_KEY, JSON.stringify(records));
  } catch {
    // quota excedida ou storage indisponível — segue apenas em memória
  }
}

export function clearPersistedRecords(): void {
  try {
    localStorage.removeItem(PERSIST_KEY);
  } catch {
    // ignore
  }
}
