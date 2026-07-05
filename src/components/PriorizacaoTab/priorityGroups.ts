import type { ActionableItem } from './actionable';
import { priorizTier, round2, type TierKind } from '../../lib/calculations';

export interface PriorityGroupAction {
  acoes: string;
  combo: string;
  esforco: number | string;
  impacto2: number | string;
  gravidade: number | string;
  prioriz: number;
  tier: TierKind;
}

export interface PriorityGroup {
  name: string;
  avgEsforco: number;
  avgImpacto: number;
  avgGravidade: number;
  avgPrioriz: number;
  actions: PriorityGroupAction[];
}

export function buildPriorityGroups(actionable: ActionableItem[]): PriorityGroup[] {
  const groupsMap: Record<string, ActionableItem[]> = {};
  actionable.forEach(x => {
    const key = x.record.recurso && x.record.recurso.trim() !== '' ? x.record.recurso : 'Sem recurso definido';
    if (!groupsMap[key]) groupsMap[key] = [];
    groupsMap[key].push(x);
  });

  const groups = Object.entries(groupsMap).map(([name, items]) => {
    const sorted = items.slice().sort((a, b) => b.prioriz - a.prioriz);
    const avg = (f: 'esforco' | 'impacto2' | 'gravidade') =>
      round2(sorted.reduce((sum, x) => sum + (x.record[f] ?? 0), 0) / sorted.length);
    return {
      name,
      avgEsforco: avg('esforco'),
      avgImpacto: avg('impacto2'),
      avgGravidade: avg('gravidade'),
      avgPrioriz: round2(sorted.reduce((sum, x) => sum + x.prioriz, 0) / sorted.length),
      actions: sorted.map(x => ({
        acoes: x.record.acoes || '(sem descrição)',
        combo: [x.record.area, x.record.rotina, x.record.categoria].filter(Boolean).join(' · '),
        esforco: x.record.esforco ?? '—',
        impacto2: x.record.impacto2 ?? '—',
        gravidade: x.record.gravidade ?? '—',
        prioriz: round2(x.prioriz),
        tier: priorizTier(x.prioriz),
      })),
    };
  });

  groups.sort((a, b) => b.avgPrioriz - a.avgPrioriz);
  return groups;
}
