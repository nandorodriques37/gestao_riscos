import { describe, it, expect } from 'vitest';
import type { Task } from '../types';
import {
  computeGUT, gutTier, prioridadeLabel, normTaskStatus, taskStatusKind,
  computeTaskRanks, computeAvaliacao,
} from './taskCalculations';

function task(partial: Partial<Task> = {}): Task {
  return {
    tipo: '', tarefa: '', detalhes: '',
    g: null, u: null, t: null,
    status: '', responsavel: '', obs: '', prazo: null, dono_id: null,
    ...partial,
  };
}

describe('computeGUT = g × u × t', () => {
  it('multiplica quando os três existem', () => {
    expect(computeGUT(task({ g: 5, u: 5, t: 5 }))).toBe(125);
    expect(computeGUT(task({ g: 2, u: 3, t: 4 }))).toBe(24);
  });

  it('é null se faltar g, u ou t', () => {
    expect(computeGUT(task({ g: null, u: 3, t: 4 }))).toBeNull();
    expect(computeGUT(task({ g: 3, u: null, t: 4 }))).toBeNull();
    expect(computeGUT(task({ g: 3, u: 4, t: null }))).toBeNull();
    expect(computeGUT(task())).toBeNull();
  });
});

describe('gutTier / prioridadeLabel (faixas da Matriz GUT)', () => {
  it('null → sem faixa / null', () => {
    expect(gutTier(null)).toBe('null');
    expect(prioridadeLabel(null)).toBeNull();
  });

  it('≥ 100 → crítico / Crítica', () => {
    expect(gutTier(100)).toBe('critico');
    expect(gutTier(125)).toBe('critico');
    expect(prioridadeLabel(100)).toBe('Crítica');
  });

  it('60–99 → alto / Alta', () => {
    expect(gutTier(60)).toBe('alto');
    expect(gutTier(99)).toBe('alto');
    expect(prioridadeLabel(80)).toBe('Alta');
  });

  it('30–59 → médio / Média', () => {
    expect(gutTier(30)).toBe('medio');
    expect(gutTier(59)).toBe('medio');
    expect(prioridadeLabel(45)).toBe('Média');
  });

  it('< 30 → baixo / Baixa', () => {
    expect(gutTier(29)).toBe('baixo');
    expect(gutTier(1)).toBe('baixo');
    expect(prioridadeLabel(10)).toBe('Baixa');
  });
});

describe('normTaskStatus', () => {
  it('vazio/null → A fazer', () => {
    expect(normTaskStatus('')).toBe('A fazer');
    expect(normTaskStatus(null)).toBe('A fazer');
    expect(normTaskStatus(undefined)).toBe('A fazer');
  });

  it('contém ANDAMENTO (case-insensitive) → Em andamento', () => {
    expect(normTaskStatus('EM ANDAMENTO')).toBe('Em andamento');
    expect(normTaskStatus('andamento')).toBe('Em andamento');
  });

  it('contém CONCLU → Concluída', () => {
    expect(normTaskStatus('CONCLUÍDA')).toBe('Concluída');
    expect(normTaskStatus('concluido')).toBe('Concluída');
  });

  it('mantém valores que não casam as regras', () => {
    expect(normTaskStatus('Pausada')).toBe('Pausada');
  });
});

describe('taskStatusKind', () => {
  it('mapeia o status normalizado', () => {
    expect(taskStatusKind('Em andamento')).toBe('atencao');
    expect(taskStatusKind('Concluída')).toBe('ok');
    expect(taskStatusKind('A fazer')).toBe('neutro');
  });
});

describe('computeTaskRanks (estilo RANK() do Excel)', () => {
  it('ordena por GUT decrescente, empates dividem o rank', () => {
    const items = [{ gut: 60 }, { gut: 125 }, { gut: 60 }, { gut: 10 }];
    expect(computeTaskRanks(items)).toEqual([2, 1, 2, 4]);
  });

  it('tarefas sem GUT ficam sem rank', () => {
    const items = [{ gut: 50 }, { gut: null }, { gut: 100 }];
    expect(computeTaskRanks(items)).toEqual([2, null, 1]);
  });

  it('lista vazia → lista vazia', () => {
    expect(computeTaskRanks([])).toEqual([]);
  });
});

describe('computeAvaliacao', () => {
  it('0 tarefas → 0', () => {
    expect(computeAvaliacao([])).toBe(0);
  });

  it('100% quando todas têm g/u/t preenchidos', () => {
    expect(computeAvaliacao([task({ g: 1, u: 1, t: 1 }), task({ g: 5, u: 5, t: 5 })])).toBe(100);
  });

  it('conta parcialmente preenchido como não avaliado', () => {
    expect(computeAvaliacao([task({ g: 1, u: 1, t: null }), task({ g: 5, u: 5, t: 5 })])).toBe(50);
  });

  it('mitigação de risco fica fora da conta — ela nunca terá nota GUT', () => {
    // Contá-la derrubou a métrica de 90% para 52% no dia da unificação, sem
    // que ninguém tivesse deixado de priorizar nada.
    const livre = task({ g: 5, u: 5, t: 5 });
    const mitigacao = { ...task(), risco_id: 'r1' };
    expect(computeAvaliacao([livre, mitigacao])).toBe(100);
  });

  it('só mitigação → 0, porque não há tarefa livre para medir', () => {
    expect(computeAvaliacao([{ ...task(), risco_id: 'r1' }])).toBe(0);
  });
});
