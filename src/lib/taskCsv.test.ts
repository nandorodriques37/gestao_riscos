import { describe, it, expect } from 'vitest';
import type { StoredRiskRecord, StoredTask } from '../types';
import { buildTaskRows } from './taskRows';
import { tasksToCSV } from './taskCsv';

function tarefa(p: Partial<StoredTask> = {}): StoredTask {
  return {
    id: 't1', tipo: '', tarefa: 'Fazer algo', detalhes: '',
    g: null, u: null, t: null, status: 'A fazer', responsavel: '', obs: '',
    prazo: null, dono_id: null, risco_id: null, iniciativa_id: null,
    triagem: '', indicador_sucesso: '', version: 1, anexos: [],
    ...p,
  };
}

const CTX = {
  riscos: [{ id: 'r1', risco: 'Ruptura', probab: 4, impact: 4 } as unknown as StoredRiskRecord],
  iniciativas: [],
  pessoas: [{ id: 'p1', nome: 'João Fernando' } as unknown as never],
  hoje: '2026-08-23',
};

describe('CSV do quadro', () => {
  it('exporta o dono de hoje, e não o texto congelado', () => {
    // `responsavel` é o que estava escrito ali antes da conversão. Exportá-lo
    // fazia a mitigação sair sem responsável e a tarefa cujo dono mudou sair
    // com o nome antigo.
    const rows = buildTaskRows(
      [tarefa({ dono_id: 'p1', responsavel: 'Nome antigo' })], CTX,
    );
    const csv = tasksToCSV(rows);
    expect(csv).toContain('João Fernando');
    expect(csv).not.toContain('Nome antigo');
  });

  it('leva o vínculo, o risco de origem e o prazo', () => {
    const rows = buildTaskRows(
      [tarefa({ risco_id: 'r1', prazo: '2026-07-15' })], CTX,
    );
    const csv = tasksToCSV(rows);
    expect(csv).toContain('Mitigação de risco');
    expect(csv).toContain('Ruptura');
    expect(csv).toContain('2026-07-15');
    expect(csv).toContain('sim');
  });

  it('tarefa livre se identifica como livre', () => {
    const csv = tasksToCSV(buildTaskRows([tarefa()], CTX));
    expect(csv).toContain('Tarefa livre');
  });

  it('marca a prioridade herdada, para o número ausente não confundir', () => {
    const csv = tasksToCSV(buildTaskRows([tarefa({ risco_id: 'r1' })], CTX));
    expect(csv).toContain('Crítica (herdada do risco)');
  });

  it('escapa aspas', () => {
    const csv = tasksToCSV(buildTaskRows([tarefa({ tarefa: 'Chamar de "Quick Win"' })], CTX));
    expect(csv).toContain('""Quick Win""');
  });
});
