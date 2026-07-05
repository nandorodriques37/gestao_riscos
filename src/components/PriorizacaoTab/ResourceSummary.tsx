import type { PriorityGroup } from './priorityGroups';
import { EmptyState } from '../common/EmptyState';

interface ResourceSummaryProps {
  groups: PriorityGroup[];
}

export function ResourceSummary({ groups }: ResourceSummaryProps) {
  return (
    <div className="card">
      <div className="section-title">Resumo de Priorização por Recurso</div>
      <div className="section-subtitle">Ações ordenadas por priorização dentro de cada recurso, com médias por grupo</div>
      <div className="priority-groups">
        {groups.length === 0 && <EmptyState message="Nenhuma ação neste filtro." />}
        {groups.map(grp => (
          <div key={grp.name} className="priority-group">
            <div className="priority-group-header">
              <span className="priority-group-name">{grp.name}</span>
              <span className="priority-group-meta">Esforço {grp.avgEsforco} · Impacto {grp.avgImpacto} · Gravidade {grp.avgGravidade}</span>
              <span className="priority-group-avg">Priorização média {grp.avgPrioriz}</span>
            </div>
            <div className="priority-group-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ação</th>
                    <th style={{ width: 190 }}>Área · Rotina · Categoria</th>
                    <th className="center" style={{ width: 70 }}>Esforço</th>
                    <th className="center" style={{ width: 70 }}>Impacto</th>
                    <th className="center" style={{ width: 80 }}>Gravidade</th>
                    <th className="center" style={{ width: 96 }}>Priorização</th>
                  </tr>
                </thead>
                <tbody>
                  {grp.actions.map((act, i) => (
                    <tr key={i}>
                      <td>{act.acoes}</td>
                      <td className="muted">{act.combo}</td>
                      <td className="center">{act.esforco}</td>
                      <td className="center">{act.impacto2}</td>
                      <td className="center">{act.gravidade}</td>
                      <td className="center">
                        <span className="prioriz-pill" style={{ background: act.priorizColor }}>{act.prioriz}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
