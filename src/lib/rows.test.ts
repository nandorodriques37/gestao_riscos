import { describe, it, expect } from 'vitest';
import type { RiskRecord } from '../types';
import { buildRows } from './rows';

function rec(partial: Partial<RiskRecord> = {}): RiskRecord {
  return {
    area: '', rotina: '', categoria: '', risco: '', resposta: '',
    probab: null, impact: null, acoes: '', resultado: '',
    esforco: null, impacto2: null, gravidade: null,
    recurso: '', responsavel: '', status: '', obs: '',
    ...partial,
  };
}

describe('buildRows', () => {
  it('enriquece cada registro com score, prioriz, normSt e índice', () => {
    const rows = buildRows([
      rec({ probab: 3, impact: 4, impacto2: 4, esforco: 2, gravidade: 3, status: '' }),
      rec({ status: 'ANDAMENTO' }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ idx: 0, score: 12, prioriz: 5, normSt: 'Não iniciado' });
    expect(rows[1]).toMatchObject({ idx: 1, score: null, prioriz: null, normSt: 'Em andamento' });
  });

  it('preserva a ordem e a referência do registro original', () => {
    const input = [rec({ area: 'A' }), rec({ area: 'B' })];
    const rows = buildRows(input);
    expect(rows[0].record).toBe(input[0]);
    expect(rows[1].record.area).toBe('B');
  });
});
