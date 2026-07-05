import type { RiskRecord, StoredRiskRecord } from '../types';

const BASE = '/api';

/** Outra pessoa alterou o registro entre a leitura e a gravação (concorrência otimista). */
export class ConflictError extends Error {
  current: StoredRiskRecord;
  constructor(current: StoredRiskRecord) {
    super('Este registro foi alterado por outra pessoa enquanto você editava.');
    this.name = 'ConflictError';
    this.current = current;
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      // corpo não-JSON — mantém a mensagem padrão
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function fetchRecords(): Promise<StoredRiskRecord[]> {
  return parse(await fetch(`${BASE}/records`));
}

export async function createRecordApi(rec: Partial<RiskRecord> = {}): Promise<StoredRiskRecord> {
  return parse(await fetch(`${BASE}/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rec),
  }));
}

export async function patchRecordApi(id: string, patch: Partial<RiskRecord>, expectedVersion?: number): Promise<StoredRiskRecord> {
  const res = await fetch(`${BASE}/records/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...patch, expectedVersion }),
  });
  if (res.status === 409) throw new ConflictError(await res.json());
  return parse(res);
}

export async function deleteRecordApi(id: string): Promise<void> {
  await parse(await fetch(`${BASE}/records/${encodeURIComponent(id)}`, { method: 'DELETE' }));
}

export async function restoreRecordsApi(): Promise<StoredRiskRecord[]> {
  return parse(await fetch(`${BASE}/restore`, { method: 'POST' }));
}
