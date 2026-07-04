import { describe, it, expect } from 'vitest';
import type { RiskRecord } from '../types';
import {
  round1, round2, computeScore, computePrioriz, normStatus,
  scoreColor, criticidadeLabel, priorizColor, tierColor,
  respostaKind, statusKind, computeCompletude, COMPLETUDE_FIELDS,
} from './calculations';

// Cores canônicas das faixas (fonte da verdade: CLAUDE.md / README do handoff).
const VERDE = '#15803D';
const AMARELO = '#B8901F';
const LARANJA = '#D97706';
const VERMELHO = '#DC2626';
const CINZA = '#94A3B8';

function rec(partial: Partial<RiskRecord> = {}): RiskRecord {
  return {
    area: '', rotina: '', categoria: '', risco: '', resposta: '',
    probab: null, impact: null, acoes: '', resultado: '',
    esforco: null, impacto2: null, gravidade: null,
    recurso: '', responsavel: '', status: '', obs: '',
    ...partial,
  };
}

describe('round1 / round2', () => {
  it('arredonda o score a 1 casa decimal', () => {
    expect(round1(2.449)).toBe(2.4);
    expect(round1(2.45)).toBe(2.5);
    expect(round1(3)).toBe(3);
  });

  it('arredonda a priorização a 2 casas decimais', () => {
    expect(round2(6.666)).toBe(6.67);
    expect(round2(4.125)).toBe(4.13);
    expect(round2(3)).toBe(3);
  });
});

describe('computeScore = probab × impact', () => {
  it('multiplica quando ambos existem', () => {
    expect(computeScore(rec({ probab: 3, impact: 4 }))).toBe(12);
    expect(computeScore(rec({ probab: 5, impact: 5 }))).toBe(25);
  });

  it('é null se probab ou impact faltar', () => {
    expect(computeScore(rec({ probab: null, impact: 4 }))).toBeNull();
    expect(computeScore(rec({ probab: 3, impact: null }))).toBeNull();
    expect(computeScore(rec())).toBeNull();
  });

  it('trata 0 como valor presente (não null)', () => {
    expect(computeScore(rec({ probab: 0, impact: 5 }))).toBe(0);
  });
});

describe('computePrioriz = impacto2 / esforco + gravidade', () => {
  it('calcula quando os três campos existem e esforco != 0', () => {
    // 4/2 + 3 = 5
    expect(computePrioriz(rec({ impacto2: 4, esforco: 2, gravidade: 3 }))).toBe(5);
    // 5/2 + 4 = 6.5
    expect(computePrioriz(rec({ impacto2: 5, esforco: 2, gravidade: 4 }))).toBe(6.5);
  });

  it('é null se esforco ausente ou zero', () => {
    expect(computePrioriz(rec({ impacto2: 4, esforco: null, gravidade: 3 }))).toBeNull();
    expect(computePrioriz(rec({ impacto2: 4, esforco: 0, gravidade: 3 }))).toBeNull();
  });

  it('é null se impacto2 ou gravidade ausentes', () => {
    expect(computePrioriz(rec({ impacto2: null, esforco: 2, gravidade: 3 }))).toBeNull();
    expect(computePrioriz(rec({ impacto2: 4, esforco: 2, gravidade: null }))).toBeNull();
  });

  it('trata gravidade 0 como presente', () => {
    expect(computePrioriz(rec({ impacto2: 4, esforco: 2, gravidade: 0 }))).toBe(2);
  });
});

describe('normStatus', () => {
  it('vazio/null → Não iniciado', () => {
    expect(normStatus('')).toBe('Não iniciado');
    expect(normStatus(null)).toBe('Não iniciado');
    expect(normStatus(undefined)).toBe('Não iniciado');
  });

  it('contém ANDAMENTO (case-insensitive) → Em andamento', () => {
    expect(normStatus('EM ANDAMENTO')).toBe('Em andamento');
    expect(normStatus('andamento')).toBe('Em andamento');
  });

  it('contém CONCLU → Concluído', () => {
    expect(normStatus('CONCLUÍDO')).toBe('Concluído');
    expect(normStatus('concluida')).toBe('Concluído');
  });

  it('mantém valores que não casam as regras', () => {
    expect(normStatus('Pausado')).toBe('Pausado');
  });
});

describe('scoreColor (limites de criticidade)', () => {
  it('null → cinza', () => {
    expect(scoreColor(null)).toBe(CINZA);
  });

  it('≤ 4 → verde (baixo)', () => {
    expect(scoreColor(0)).toBe(VERDE);
    expect(scoreColor(4)).toBe(VERDE);
  });

  it('5–9 → amarelo (médio)', () => {
    expect(scoreColor(5)).toBe(AMARELO);
    expect(scoreColor(9)).toBe(AMARELO);
  });

  it('10–14 → laranja (alto)', () => {
    expect(scoreColor(10)).toBe(LARANJA);
    expect(scoreColor(14)).toBe(LARANJA);
  });

  it('> 14 → vermelho (crítico)', () => {
    expect(scoreColor(15)).toBe(VERMELHO);
    expect(scoreColor(25)).toBe(VERMELHO);
  });
});

describe('criticidadeLabel (limites estritos > para donut/heatmap)', () => {
  it('null → null', () => {
    expect(criticidadeLabel(null)).toBeNull();
  });

  it('faixas conforme os limites estritos', () => {
    expect(criticidadeLabel(4)).toBe('Baixo');
    expect(criticidadeLabel(5)).toBe('Médio'); // > 4
    expect(criticidadeLabel(9)).toBe('Médio');
    expect(criticidadeLabel(10)).toBe('Alto'); // > 9
    expect(criticidadeLabel(14)).toBe('Alto');
    expect(criticidadeLabel(15)).toBe('Crítico'); // > 14
  });
});

describe('priorizColor (limites de priorização)', () => {
  it('null → cinza', () => {
    expect(priorizColor(null)).toBe(CINZA);
  });

  it('≥ 6 → crítica (vermelho)', () => {
    expect(priorizColor(6)).toBe(VERMELHO);
    expect(priorizColor(8)).toBe(VERMELHO);
  });

  it('≥ 4.5 e < 6 → alta (laranja)', () => {
    expect(priorizColor(4.5)).toBe(LARANJA);
    expect(priorizColor(5.99)).toBe(LARANJA);
  });

  it('≥ 3 e < 4.5 → média (amarelo)', () => {
    expect(priorizColor(3)).toBe(AMARELO);
    expect(priorizColor(4.49)).toBe(AMARELO);
  });

  it('< 3 → baixa (verde)', () => {
    expect(priorizColor(2.99)).toBe(VERDE);
    expect(priorizColor(0)).toBe(VERDE);
  });
});

describe('tierColor (razão sobre o maior do grupo)', () => {
  it('faixas por razão', () => {
    expect(tierColor(1)).toBe(VERMELHO);
    expect(tierColor(0.75)).toBe(VERMELHO);
    expect(tierColor(0.5)).toBe(LARANJA);
    expect(tierColor(0.25)).toBe(AMARELO);
    expect(tierColor(0.24)).toBe(VERDE);
    expect(tierColor(0)).toBe(VERDE);
  });
});

describe('badges de resposta e status', () => {
  it('respostaKind mapeia cada resposta', () => {
    expect(respostaKind('Mitigar')).toBe('blue');
    expect(respostaKind('Aceitar')).toBe('slate');
    expect(respostaKind('Transferir')).toBe('purple');
    expect(respostaKind('Evitar')).toBe('red');
    expect(respostaKind('')).toBe('slate');
  });

  it('statusKind mapeia o status normalizado', () => {
    expect(statusKind('Em andamento')).toBe('amber');
    expect(statusKind('Concluído')).toBe('green');
    expect(statusKind('Não iniciado')).toBe('slate');
  });
});

describe('computeCompletude', () => {
  it('0 registros → 0', () => {
    expect(computeCompletude([])).toBe(0);
  });

  it('registro totalmente vazio → 0%', () => {
    expect(computeCompletude([rec()])).toBe(0);
  });

  it('registro com todos os 10 campos preenchidos → 100%', () => {
    const full = rec({
      risco: 'r', probab: 3, impact: 4, acoes: 'a', esforco: 2,
      impacto2: 3, gravidade: 1, recurso: 'x', responsavel: 'y', status: 'Concluído',
    });
    expect(computeCompletude([full])).toBe(100);
  });

  it('conta 0 numérico como preenchido, mas string vazia como vazio', () => {
    // apenas probab=0 preenchido dentre os 10 campos → 10%
    expect(computeCompletude([rec({ probab: 0 })])).toBe(10);
    // risco='' não conta
    expect(computeCompletude([rec({ risco: '' })])).toBe(0);
  });

  it('arredonda o percentual', () => {
    // 5 de 10 campos → 50%
    const half = rec({
      risco: 'r', probab: 3, impact: 4, acoes: 'a', esforco: 2,
    });
    expect(computeCompletude([half])).toBe(50);
  });

  it('COMPLETUDE_FIELDS tem exatamente 10 campos (base do denominador)', () => {
    expect(COMPLETUDE_FIELDS).toHaveLength(10);
  });
});
