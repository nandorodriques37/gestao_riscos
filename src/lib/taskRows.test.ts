import { describe, it, expect } from 'vitest';
import type { Iniciativa, Pessoa, StoredRiskRecord, StoredTask } from '../types';
import { buildTaskRows, diasDeAtraso } from './taskRows';

function tarefa(p: Partial<StoredTask> = {}): StoredTask {
  return {
    id: 't1', tipo: '', tarefa: 'Fazer algo', detalhes: '',
    g: null, u: null, t: null, status: 'A fazer', responsavel: '', obs: '',
    prazo: null, risco_id: null, iniciativa_id: null, dono_id: null,
    triagem: '', indicador_sucesso: '', version: 1, anexos: [],
    ...p,
  };
}

const RISCO = {
  id: 'r1', risco: 'Ruptura de estoque', probab: 4, impact: 4,
} as unknown as StoredRiskRecord;

const CTX = {
  riscos: [RISCO],
  iniciativas: [{ id: 'i1', nome: 'Projeto Pysha' } as unknown as Iniciativa],
  pessoas: [{ id: 'p1', nome: 'João Fernando' } as unknown as Pessoa],
  hoje: '2026-08-23',
};

describe('vínculo — de onde a linha veio', () => {
  it('tarefa livre não tem vínculo, e não ganha selo de "livre"', () => {
    const [row] = buildTaskRows([tarefa()], CTX);
    expect(row.vinculo).toBeNull();
  });

  it('mitigação carrega o risco, a criticidade dele e a iniciativa que a executa', () => {
    const [row] = buildTaskRows([tarefa({ risco_id: 'r1', iniciativa_id: 'i1' })], CTX);
    expect(row.vinculo).toEqual({
      riscoId: 'r1',
      risco: 'Ruptura de estoque',
      // 4 × 4 = 16, acima de 14 → crítico.
      tier: 'critico',
      iniciativa: 'Projeto Pysha',
      iniciativaId: 'i1',
      rotina: false,
      orfa: false,
    });
  });

  it('risco excluído deixa a linha órfã, e ela diz isso em vez de sumir', () => {
    // `risco_id` é `set null`: a mitigação sobrevive à exclusão do risco. Aqui
    // o id ainda aponta para um registro que o contexto não conhece.
    const [row] = buildTaskRows([tarefa({ risco_id: 'apagado' })], CTX);
    expect(row.vinculo?.risco).toBe('');
    expect(row.vinculo?.orfa).toBe(true);
    expect(row.vinculo?.tier).toBe('null');
  });

  it('enquanto os riscos não chegam, a linha não se declara órfã', () => {
    // O quadro pinta antes do fetch dos riscos. Sem esta distinção, as 50
    // mitigações anunciam "risco excluído" a cada carregamento da aba.
    const [row] = buildTaskRows([tarefa({ risco_id: 'r1' })], { ...CTX, riscos: [] });
    expect(row.vinculo?.risco).toBe('');
    expect(row.vinculo?.orfa).toBe(false);
  });
});

describe('dono — um nome, duas origens', () => {
  it('usa o texto livre da tarefa quando existe', () => {
    const [row] = buildTaskRows([tarefa({ responsavel: 'Kauan' })], CTX);
    expect(row.dono).toBe('Kauan');
  });

  it('cai para a pessoa do plano de ação quando o texto está vazio', () => {
    const [row] = buildTaskRows([tarefa({ risco_id: 'r1', dono_id: 'p1' })], CTX);
    expect(row.dono).toBe('João Fernando');
  });

  it('fica vazio quando não há nem um nem outro', () => {
    const [row] = buildTaskRows([tarefa()], CTX);
    expect(row.dono).toBe('');
  });
});

describe('atraso', () => {
  it('prazo vencido com trabalho aberto atrasa', () => {
    const [row] = buildTaskRows([tarefa({ prazo: '2026-08-01' })], CTX);
    expect(row.atrasada).toBe(true);
  });

  it('prazo de hoje ainda não atrasou', () => {
    const [row] = buildTaskRows([tarefa({ prazo: '2026-08-23' })], CTX);
    expect(row.atrasada).toBe(false);
  });

  it('concluída e cancelada não atrasam — o prazo já não cobra nada', () => {
    for (const status of ['Concluída', 'Cancelada']) {
      const [row] = buildTaskRows([tarefa({ prazo: '2026-01-01', status })], CTX);
      expect(row.atrasada).toBe(false);
    }
  });

  it('rotina nunca atrasa: controle contínuo não tem data para vencer', () => {
    const [row] = buildTaskRows(
      [tarefa({ risco_id: 'r1', triagem: 'rotina', prazo: '2026-01-01' })], CTX,
    );
    expect(row.vinculo?.rotina).toBe(true);
    expect(row.atrasada).toBe(false);
  });

  it('conta os dias, para o rótulo dizer o tamanho do atraso', () => {
    expect(diasDeAtraso('2026-08-01', '2026-08-23')).toBe(22);
    expect(diasDeAtraso('2026-08-30', '2026-08-23')).toBe(0);
  });
});

describe('prioridade — dois esquemas, um quadro', () => {
  it('tarefa com nota usa a própria faixa de GUT', () => {
    const [row] = buildTaskRows([tarefa({ g: 5, u: 5, t: 5 })], CTX);
    expect(row.prioridade).toBe('Crítica');
    expect(row.prioridadeHerdada).toBe(false);
  });

  it('mitigação sem nota herda a criticidade do risco', () => {
    // Sem isso as 50 linhas vindas do plano de ação caem todas em "Sem nota" e
    // o quadro por prioridade fica inútil para metade das linhas.
    const [row] = buildTaskRows([tarefa({ risco_id: 'r1' })], CTX);
    expect(row.prioridade).toBe('Crítica');
    expect(row.prioridadeHerdada).toBe(true);
  });

  it('nota própria ganha da herdada — quem pontuou decidiu', () => {
    const [row] = buildTaskRows([tarefa({ risco_id: 'r1', g: 1, u: 1, t: 1 })], CTX);
    expect(row.prioridade).toBe('Baixa');
    expect(row.prioridadeHerdada).toBe(false);
  });

  it('tarefa livre sem nota continua sem faixa', () => {
    const [row] = buildTaskRows([tarefa()], CTX);
    expect(row.prioridade).toBeNull();
    expect(row.prioridadeHerdada).toBe(false);
  });
});

describe('sem contexto', () => {
  it('não quebra quando riscos e pessoas ainda não carregaram', () => {
    // O quadro pinta antes de o portfólio chegar: uma linha vinculada precisa
    // renderizar mesmo sem saber ainda o nome do risco.
    const [row] = buildTaskRows([tarefa({ risco_id: 'r1', dono_id: 'p1' })]);
    expect(row.vinculo?.riscoId).toBe('r1');
    expect(row.vinculo?.risco).toBe('');
    expect(row.vinculo?.orfa).toBe(false);
    expect(row.dono).toBe('');
  });
});
