import { describe, it, expect } from 'vitest';
import { computeGUT, prioridadeLabel } from './taskCalculations';
import {
  PRIORITY_BANDS, adjustGutToBand, bandOf, describeChanges, trincasDaFaixa,
  type PriorityBand,
} from './taskPriority';

/** Faixa em que a trinca ajustada realmente caiu — o que o Kanban vai mostrar. */
function faixaResultante(patch: { g: number; u: number; t: number }) {
  return prioridadeLabel(computeGUT(patch));
}

describe('alcance das faixas com notas 1–5', () => {
  it('toda faixa é alcançável — nenhuma coluna do quadro fica sem destino', () => {
    PRIORITY_BANDS.forEach(band => {
      expect(trincasDaFaixa(band).length).toBeGreaterThan(0);
    });
  });

  it('Crítica só existe em GUT 100 e 125 — é a faixa mais apertada', () => {
    const guts = new Set(trincasDaFaixa('Crítica').map(computeGUT));
    expect([...guts].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([100, 125]);
  });

  it('as 125 trincas se distribuem sem sobra entre as quatro faixas', () => {
    const total = PRIORITY_BANDS.reduce((acc, b) => acc + trincasDaFaixa(b).length, 0);
    expect(total).toBe(125);
  });
});

describe('bandOf', () => {
  it('devolve a faixa do GUT', () => {
    expect(bandOf({ g: 5, u: 5, t: 5 })).toBe('Crítica');
    expect(bandOf({ g: 4, u: 4, t: 4 })).toBe('Alta');
    expect(bandOf({ g: 3, u: 3, t: 4 })).toBe('Média');
    expect(bandOf({ g: 2, u: 2, t: 2 })).toBe('Baixa');
  });

  it('é null quando falta nota', () => {
    expect(bandOf({ g: 5, u: null, t: 5 })).toBeNull();
  });
});

describe('adjustGutToBand', () => {
  it('não faz nada se a tarefa já está na faixa alvo', () => {
    expect(adjustGutToBand({ g: 4, u: 4, t: 4 }, 'Alta')).toBeNull();
  });

  it('sempre aterrissa na faixa pedida, venha de onde vier', () => {
    const origens: PriorityBand[] = [...PRIORITY_BANDS];
    origens.forEach(origem => {
      trincasDaFaixa(origem).forEach(trinca => {
        PRIORITY_BANDS.forEach(alvo => {
          const r = adjustGutToBand(trinca, alvo);
          if (alvo === origem) {
            expect(r).toBeNull();
          } else {
            expect(faixaResultante(r!.patch)).toBe(alvo);
          }
        });
      });
    });
  });

  it('prefere mexer na Urgência quando o custo é o mesmo', () => {
    // 3×3×3 = 27 (Baixa). Chegar a Média (30–59) com um passo é possível em
    // qualquer eixo (4×3×3 = 36); o desempate escolhe U.
    const r = adjustGutToBand({ g: 3, u: 3, t: 3 }, 'Média');
    expect(r!.changes).toEqual([{ campo: 'U', de: 3, para: 4 }]);
  });

  it('faz o menor ajuste possível — um único campo quando um campo basta', () => {
    // 5×2×5 = 50 (Média) → Alta (60–99): basta U 2 → 3 (GUT 75).
    const r = adjustGutToBand({ g: 5, u: 2, t: 5 }, 'Alta');
    expect(r!.changes).toHaveLength(1);
    expect(faixaResultante(r!.patch)).toBe('Alta');
  });

  it('preenche as três notas de uma vez quando a tarefa não tinha avaliação', () => {
    const r = adjustGutToBand({ g: null, u: null, t: null }, 'Crítica');
    expect(faixaResultante(r!.patch)).toBe('Crítica');
    // Reporta o estado real de origem (vazio), não a nota neutra usada no cálculo.
    expect(r!.changes.map(c => c.de)).toEqual([null, null, null]);
  });

  it('trata nota faltante como o centro da escala, sem ir para os extremos', () => {
    const r = adjustGutToBand({ g: 5, u: null, t: 5 }, 'Alta');
    expect(faixaResultante(r!.patch)).toBe('Alta');
    expect(r!.patch.g).toBe(5);
    expect(r!.patch.t).toBe(5);
  });

  it('é determinístico — a mesma entrada dá sempre a mesma saída', () => {
    const a = adjustGutToBand({ g: 2, u: 3, t: 4 }, 'Crítica');
    const b = adjustGutToBand({ g: 2, u: 3, t: 4 }, 'Crítica');
    expect(a).toEqual(b);
  });

  it('a ida e volta entre faixas não deixa a tarefa fora de faixa', () => {
    const ida = adjustGutToBand({ g: 3, u: 3, t: 4 }, 'Crítica')!;
    expect(faixaResultante(ida.patch)).toBe('Crítica');
    const volta = adjustGutToBand(ida.patch, 'Média')!;
    expect(faixaResultante(volta.patch)).toBe('Média');
  });

  it('só reporta os campos que realmente mudaram', () => {
    const r = adjustGutToBand({ g: 1, u: 1, t: 1 }, 'Crítica')!;
    r.changes.forEach(c => expect(c.de).not.toBe(c.para));
    expect(r.changes.length).toBeGreaterThan(0);
  });
});

describe('describeChanges', () => {
  it('resume o ajuste para o aviso de desfazer', () => {
    expect(describeChanges([{ campo: 'U', de: 2, para: 4 }])).toBe('U 2 → 4');
  });

  it('mostra travessão no lugar da nota que estava em branco', () => {
    expect(describeChanges([
      { campo: 'G', de: null, para: 4 },
      { campo: 'U', de: null, para: 5 },
    ])).toBe('G — → 4 · U — → 5');
  });
});
