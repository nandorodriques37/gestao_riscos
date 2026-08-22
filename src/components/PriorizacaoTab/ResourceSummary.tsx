import type { PriorityGroup } from './priorityGroups';
import { EmptyState } from '../common/EmptyState';

interface ResourceSummaryProps {
  groups: PriorityGroup[];
  /** 'iniciativas' ou 'ações', conforme a fonte que a tela está lendo. */
  substantivo: string;
  /** O mesmo no singular, para o cabeçalho da coluna. */
  singular: string;
  /** O que a coluna de contexto mostra em cada fonte. */
  colunaContexto: string;
}

export function ResourceSummary({
  groups, substantivo, singular, colunaContexto,
}: ResourceSummaryProps) {
  return (
    <div className="card">
      <div className="section-title">Resumo de Priorização por Recurso</div>
      <div className="section-subtitle">
        {singular === 'Ação' ? 'Ações' : 'Iniciativas'} ordenadas por priorização dentro de
        cada recurso, com médias por grupo
      </div>
      <div className="priority-groups">
        {groups.length === 0 && <EmptyState message={`Nenhuma das ${substantivo} passa neste filtro.`} />}
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
                    <th>{singular}</th>
                    <th style={{ width: 190 }}>{colunaContexto}</th>
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
                      <td className="num">{act.esforco}</td>
                      <td className="num">{act.impacto2}</td>
                      <td className="num">{act.gravidade}</td>
                      <td className="center">
                        <span className="tier-chip" data-tier={act.tier}>
                          <span className="tier-dot" />
                          {act.prioriz}
                        </span>
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
