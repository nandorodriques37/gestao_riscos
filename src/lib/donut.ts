import type { TierKind } from './calculations';

export interface DonutSegment {
  tier: TierKind;
  count: number;
}

/**
 * Vão entre arcos, em graus. Equivale a ~2px de superfície no raio médio dos
 * donuts deste app (150–176px de diâmetro) — o mesmo vão de 2px usado entre
 * células do heatmap e entre segmentos das barras empilhadas.
 */
const GAP_DEG = 1.6;

/**
 * Monta o `conic-gradient` do donut a partir de frações exatas.
 *
 * O donut de status arredondava cada fatia para porcentagem inteira antes de
 * montar o gradiente, então a soma podia fechar em 99% ou 101% e deixar uma
 * fresta (ou comer o início do primeiro arco). Aqui os dois donuts usam a
 * fração exata, e a única folga é o vão deliberado entre arcos.
 *
 * As cores saem de variáveis CSS, então o tema escuro troca a paleta sem que
 * este código saiba que existe tema.
 */
export function buildDonutGradient(segments: DonutSegment[], total: number): string {
  const visible = segments.filter(s => s.count > 0);
  if (!total || visible.length === 0) return 'var(--bg-sunken)';
  if (visible.length === 1) return `var(--tier-${visible[0].tier})`;

  const half = GAP_DEG / 2;
  const parts: string[] = [`var(--bg-surface) 0deg ${half}deg`];
  let cursor = 0;

  visible.forEach(s => {
    const sweep = (s.count / total) * 360;
    const start = cursor + half;
    // Uma fatia menor que o próprio vão viraria um arco de comprimento
    // negativo; o clamp a mantém como um traço fino em vez de sumir.
    const end = Math.max(start, cursor + sweep - half);
    parts.push(`var(--tier-${s.tier}) ${start}deg ${end}deg`);
    cursor += sweep;
    parts.push(`var(--bg-surface) ${end}deg ${Math.min(360, cursor + half)}deg`);
  });

  return `conic-gradient(${parts.join(',')})`;
}
