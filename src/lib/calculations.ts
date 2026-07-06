import type { RiskRecord } from '../types';

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** score (risco inerente) = probab × impact; null se probab ou impact ausente. */
export function computeScore(r: Pick<RiskRecord, 'probab' | 'impact'>): number | null {
  if (r.probab == null || r.impact == null) return null;
  return r.probab * r.impact;
}

/** prioriz = impacto2 / esforco + gravidade; null se esforco ausente/zero ou impacto2/gravidade ausentes. */
export function computePrioriz(r: Pick<RiskRecord, 'esforco' | 'impacto2' | 'gravidade'>): number | null {
  if (r.esforco == null || r.esforco === 0 || r.impacto2 == null || r.gravidade == null) return null;
  return r.impacto2 / r.esforco + r.gravidade;
}

export function normStatus(status: string | null | undefined): string {
  if (!status) return 'Não iniciado';
  const u = status.toUpperCase();
  if (u.includes('ANDAMENTO')) return 'Em andamento';
  if (u.includes('CONCLU')) return 'Concluído';
  return status;
}

/** Cor de criticidade do score (risco inerente). */
export function scoreColor(score: number | null): string {
  if (score == null) return '#94A3B8';
  if (score <= 4) return '#15803D';
  if (score <= 9) return '#B8901F';
  if (score <= 14) return '#D97706';
  return '#DC2626';
}

/** Rótulo de criticidade — mesmos limiares de scoreColor, expressos como faixas. */
export function criticidadeLabel(score: number | null): 'Crítico' | 'Alto' | 'Médio' | 'Baixo' | null {
  if (score == null) return null;
  if (score > 14) return 'Crítico';
  if (score > 9) return 'Alto';
  if (score > 4) return 'Médio';
  return 'Baixo';
}

export function priorizColor(p: number | null): string {
  if (p == null) return '#94A3B8';
  if (p >= 6) return '#DC2626';
  if (p >= 4.5) return '#D97706';
  if (p >= 3) return '#B8901F';
  return '#15803D';
}

export type TierKind = 'baixo' | 'medio' | 'alto' | 'critico' | 'null';

/** Faixa de criticidade do score — mesmos limiares de scoreColor. */
export function scoreTier(score: number | null): TierKind {
  if (score == null) return 'null';
  if (score <= 4) return 'baixo';
  if (score <= 9) return 'medio';
  if (score <= 14) return 'alto';
  return 'critico';
}

/** Faixa de priorização — mesmos limiares de priorizColor. */
export function priorizTier(p: number | null): TierKind {
  if (p == null) return 'null';
  if (p >= 6) return 'critico';
  if (p >= 4.5) return 'alto';
  if (p >= 3) return 'medio';
  return 'baixo';
}

/**
 * Cores do chip suave (fundo pastel + texto + bolinha) usado para Score e
 * Priorização. A bolinha (`dot`) usa sempre o hex exato de scoreColor/
 * priorizColor — a faixa de cor em si não muda, só a apresentação visual.
 */
export const TIER_CHIP_COLORS: Record<TierKind, { dot: string; bg: string; fg: string }> = {
  baixo: { dot: '#15803D', bg: '#DCFCE7', fg: '#15803D' },
  medio: { dot: '#B8901F', bg: '#FBF3DA', fg: '#8A6D17' },
  alto: { dot: '#D97706', bg: '#FEF3C7', fg: '#B45309' },
  critico: { dot: '#DC2626', bg: '#FEE2E2', fg: '#B91C1C' },
  null: { dot: '#94A3B8', bg: '#F1F5F9', fg: '#475569' },
};

/** Cor por "tier" relativo ao maior valor do grupo (barras de Categoria/Área/Rotina). */
export function tierColor(ratio: number): string {
  if (ratio >= 0.75) return '#DC2626';
  if (ratio >= 0.5) return '#D97706';
  if (ratio >= 0.25) return '#B8901F';
  return '#15803D';
}

export type BadgeKind = 'slate' | 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'orange';

export const BADGE_COLORS: Record<BadgeKind, { bg: string; fg: string }> = {
  slate: { bg: '#F1F5F9', fg: '#475569' },
  blue: { bg: '#DBEAFE', fg: '#1D4ED8' },
  green: { bg: '#DCFCE7', fg: '#15803D' },
  amber: { bg: '#FEF3C7', fg: '#B45309' },
  red: { bg: '#FEE2E2', fg: '#B91C1C' },
  purple: { bg: '#EDE9FE', fg: '#6D28D9' },
  orange: { bg: '#FFEDD5', fg: '#C2410C' },
};

export function respostaKind(v: string): BadgeKind {
  if (v === 'Mitigar') return 'blue';
  if (v === 'Aceitar') return 'slate';
  if (v === 'Transferir') return 'purple';
  if (v === 'Evitar') return 'red';
  return 'slate';
}

export function statusKind(norm: string): BadgeKind {
  if (norm === 'Em andamento') return 'amber';
  if (norm === 'Concluído') return 'green';
  return 'slate';
}

/** Campos considerados no cálculo de completude (KPI da aba Registro). */
export const COMPLETUDE_FIELDS: (keyof RiskRecord)[] = [
  'risco', 'probab', 'impact', 'acoes', 'esforco', 'impacto2', 'gravidade', 'recurso', 'responsavel', 'status',
];

export function computeCompletude(records: RiskRecord[]): number {
  const total = records.length * COMPLETUDE_FIELDS.length;
  if (!total) return 0;
  let filled = 0;
  records.forEach(r => {
    COMPLETUDE_FIELDS.forEach(f => {
      const v = r[f];
      if (v != null && v !== '') filled++;
    });
  });
  return Math.round((filled / total) * 100);
}
