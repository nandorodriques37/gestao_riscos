import type { Quadrant } from '../../types';

export function quadrantOf(esforco: number, impacto2: number): Quadrant {
  const highImpact = impacto2 >= 2.5;
  const highEffort = esforco >= 2.5;
  if (highImpact && !highEffort) return 'qw';
  if (highImpact && highEffort) return 'ga';
  if (!highImpact && !highEffort) return 'bp';
  return 'rv';
}

export interface QuadrantDef {
  key: Quadrant;
  title: string;
  subtitle: string;
}

export const QUADRANT_DEFS: QuadrantDef[] = [
  { key: 'qw', title: 'QUICK WINS', subtitle: 'alto impacto · baixo esforço' },
  { key: 'ga', title: 'GRANDES APOSTAS', subtitle: 'alto impacto · alto esforço' },
  { key: 'bp', title: 'BAIXA PRIORIDADE', subtitle: 'baixo impacto · baixo esforço' },
  { key: 'rv', title: 'REAVALIAR', subtitle: 'baixo impacto · alto esforço' },
];

export const QUADRANT_NAMES: Record<Quadrant, string> = {
  qw: 'Quick Wins',
  ga: 'Grandes Apostas',
  bp: 'Baixa Prioridade',
  rv: 'Reavaliar',
};
