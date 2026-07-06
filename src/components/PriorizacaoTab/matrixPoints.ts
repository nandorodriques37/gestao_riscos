import type { Quadrant } from '../../types';
import type { ActionableItem } from './actionable';
import { priorizColor, priorizTier, round2, type TierKind } from '../../lib/calculations';
import { quadrantOf } from './quadrant';

export interface MatrixPoint {
  rankIndex: number;
  num: number;
  xPct: number;
  yPct: number;
  size: number;
  color: string;
  tooltip: string;
  isSelected: boolean;
  dimmed: boolean;
}

/** Espalha bolhas sobrepostas (mesmo esforço/impacto) radialmente em torno do ponto original. */
function buildOffsets(ranked: ActionableItem[]): Record<number, { dx: number; dy: number }> {
  const posGroups: Record<string, number[]> = {};
  ranked.forEach((x, ri) => {
    const key = `${x.record.esforco}|${x.record.impacto2}`;
    if (!posGroups[key]) posGroups[key] = [];
    posGroups[key].push(ri);
  });
  const offsets: Record<number, { dx: number; dy: number }> = {};
  Object.values(posGroups).forEach(group => {
    if (group.length === 1) {
      offsets[group[0]] = { dx: 0, dy: 0 };
      return;
    }
    const spread = Math.min(3.2, 1.6 + group.length * 0.35);
    group.forEach((ri, gi) => {
      const ang = (gi / group.length) * Math.PI * 2 - Math.PI / 2;
      offsets[ri] = { dx: Math.cos(ang) * spread, dy: Math.sin(ang) * spread };
    });
  });
  return offsets;
}

export function buildMatrixPoints(
  ranked: ActionableItem[],
  selectedRank: number | null,
  selectedQuadrant: Quadrant | null,
): MatrixPoint[] {
  const offsets = buildOffsets(ranked);
  const pad = 7;
  const clampX = (v: number) => Math.min(Math.max(v, 5), 95);
  const clampY = (v: number) => Math.min(Math.max(v, 13), 87);

  return ranked.map((x, ri) => {
    const o = offsets[ri];
    const esforco = x.record.esforco as number;
    const impacto2 = x.record.impacto2 as number;
    const gravidade = x.record.gravidade as number;
    const xPct = clampX(pad + (esforco / 5) * (100 - 2 * pad) + o.dx);
    const yPct = clampY(100 - (pad + (impacto2 / 5) * (100 - 2 * pad)) + o.dy);
    const size = 22 + gravidade * 3.6;
    const isSelected = selectedRank === ri;
    const quadDim = selectedQuadrant != null && quadrantOf(esforco, impacto2) !== selectedQuadrant;
    const dimmed = (selectedRank != null && !isSelected) || quadDim;
    return {
      rankIndex: ri,
      num: ri + 1,
      xPct, yPct, size,
      color: priorizColor(x.prioriz),
      tooltip: `${x.record.acoes || '(sem descrição)'} — Priorização ${round2(x.prioriz)}`,
      isSelected,
      dimmed,
    };
  });
}

export interface RankedListItem {
  rankIndex: number;
  num: number;
  quadrant: Quadrant;
  acoes: string;
  esforco: number | string;
  impacto2: number | string;
  gravidade: number | string;
  prioriz: number;
  color: string;
  tier: TierKind;
}

export function buildRankedList(ranked: ActionableItem[]): RankedListItem[] {
  return ranked.map((x, ri) => ({
    rankIndex: ri,
    num: ri + 1,
    quadrant: quadrantOf(x.record.esforco as number, x.record.impacto2 as number),
    acoes: x.record.acoes || '(sem descrição)',
    esforco: x.record.esforco ?? '—',
    impacto2: x.record.impacto2 ?? '—',
    gravidade: x.record.gravidade ?? '—',
    prioriz: round2(x.prioriz),
    color: priorizColor(x.prioriz),
    tier: priorizTier(x.prioriz),
  }));
}
