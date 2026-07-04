import type { GraphFilter, RiskRecord } from '../../types';
import { computeScore, criticidadeLabel, normStatus } from '../../lib/calculations';

export function matchGraphFilter(rec: RiskRecord, gf: GraphFilter): boolean {
  if (!gf) return true;
  switch (gf.type) {
    case 'categoria': return rec.categoria === gf.value;
    case 'area': return rec.area === gf.value;
    case 'rotina': return rec.rotina === gf.value;
    case 'recurso': return (rec.recurso && rec.recurso.trim() !== '' ? rec.recurso : 'Sem recurso definido') === gf.value;
    case 'status': return normStatus(rec.status) === gf.value;
    case 'criticidade': return criticidadeLabel(computeScore(rec)) === gf.value;
    case 'heat': return rec.probab === gf.prob && rec.impact === gf.imp;
    default: return true;
  }
}

const GRAPH_FILTER_NAMES: Record<string, string> = {
  categoria: 'Categoria', area: 'Área', rotina: 'Rotina', recurso: 'Recurso', status: 'Status', criticidade: 'Criticidade',
};

export function graphFilterLabel(gf: GraphFilter): string {
  if (!gf) return '';
  if (gf.type === 'heat') return `Probabilidade ${gf.prob} × Impacto ${gf.imp}`;
  return `${GRAPH_FILTER_NAMES[gf.type] || gf.type}: ${gf.value}`;
}
