import type { RiskRecord } from '../../types';
import { computeScore, round1, tierColor } from '../../lib/calculations';
import type { EnrichedRow } from '../../lib/rows';

export interface ScoreBar {
  name: string;
  score: number;
  count: number;
  pct: number;
  color: string;
  meta: string;
}

export function buildScoreBars(records: RiskRecord[], field: 'categoria' | 'area' | 'rotina'): ScoreBar[] {
  const agg: Record<string, { sum: number; count: number }> = {};
  records.forEach(r => {
    const key = r[field];
    if (!key) return;
    const sc = computeScore(r);
    if (sc == null) return;
    if (!agg[key]) agg[key] = { sum: 0, count: 0 };
    agg[key].sum += sc;
    agg[key].count += 1;
  });
  const raw = Object.entries(agg)
    .map(([name, v]) => ({ name, sum: v.sum, count: v.count }))
    .sort((a, b) => b.sum - a.sum);
  const maxSum = Math.max(...raw.map(b => b.sum), 1);
  return raw.map(b => ({
    name: b.name,
    score: round1(b.sum),
    count: b.count,
    pct: Math.max(2, (b.sum / maxSum) * 100),
    color: tierColor(b.sum / maxSum),
    meta: `${b.count} ${b.count > 1 ? 'riscos' : 'risco'}`,
  }));
}

export interface ResourceStatusBar {
  name: string;
  total: number;
  ni: number;
  ea: number;
  cc: number;
  wrapPct: number;
  niW: number;
  eaW: number;
  ccW: number;
}

export function buildResourceStatusBars(actionRows: EnrichedRow[]): ResourceStatusBar[] {
  const map: Record<string, { ni: number; ea: number; cc: number; total: number }> = {};
  actionRows.forEach(row => {
    const key = row.record.recurso && row.record.recurso.trim() !== '' ? row.record.recurso : 'Sem recurso definido';
    if (!map[key]) map[key] = { ni: 0, ea: 0, cc: 0, total: 0 };
    if (row.normSt === 'Concluído') map[key].cc++;
    else if (row.normSt === 'Em andamento') map[key].ea++;
    else map[key].ni++;
    map[key].total++;
  });
  const maxTotal = Math.max(...Object.values(map).map(v => v.total), 1);
  return Object.entries(map)
    .map(([name, v]) => ({
      name, total: v.total, ni: v.ni, ea: v.ea, cc: v.cc,
      wrapPct: Math.max(5, (v.total / maxTotal) * 100),
      niW: (v.ni / v.total) * 100, eaW: (v.ea / v.total) * 100, ccW: (v.cc / v.total) * 100,
    }))
    .sort((a, b) => b.total - a.total);
}
