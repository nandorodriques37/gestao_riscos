import { describe, it, expect } from 'vitest';
import type { Task } from '../types';
import {
  computeGUT, gutColor, prioridadeLabel, normTaskStatus, taskStatusKind,
  computeTaskRanks, computeAvaliacao,
} from './taskCalculations';

const VERDE = '#15803D';
const AMARELO = '#B8901F';
const LARANJA = '#D97706';
const VERMELHO = '#DC2626';
const CINZA = '#94A3B8';

function task(partial: Partial<Task> = {}): Task {
  return {
    tipo: '', tarefa: '', detalhes: '',
    g: null, u: null, t: null,
    status: '', responsavel: '', obs: '',
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

describe('gutColor / prioridadeLabel (faixas da Matriz GUT)', () => {
  it('null → cinza / null', () => {
    expect(gutColor(null)).toBe(CINZA);
    expect(prioridadeLabel(null)).toBeNull();
  });

  it('≥ 100 → Crítica (vermelho)', () => {
    expect(gutColor(100)).toBe(VERMELHO);
    expect(gutColor(125)).toBe(VERMELHO);
    expect(prioridadeLabel(100)).toBe('Crítica');
  });

  it('60–99 → Alta (laranja)', () => {
    expect(gutColor(60)).toBe(LARANJA);
    expect(gutColor(99)).toBe(LARANJA);
    expect(prioridadeLabel(80)).toBe('Alta');
  });

  it('30–59 → Média (amarelo)', () => {
    expect(gutColor(30)).toBe(AMARELO);
    expect(gutColor(59)).toBe(AMARELO);
    expect(prioridadeLabel(45)).toBe('Média');
  });

  it('< 30 → Baixa (verde)', () => {
    expect(gutColor(29)).toBe(VERDE);
    expect(gutColor(1)).toBe(VERDE);
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
    expect(taskStatusKind('Em andamento')).toBe('amber');
    expect(taskStatusKind('Concluída')).toBe('green');
    expect(taskStatusKind('A fazer')).toBe('slate');
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
});
