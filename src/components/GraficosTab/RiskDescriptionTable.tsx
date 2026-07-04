import { BADGE_COLORS, round1, scoreColor, statusKind } from '../../lib/calculations';

export interface RiskListItem {
  risco: string;
  combo: string;
  score: number | null;
  normSt: string;
}

interface RiskDescriptionTableProps {
  riskList: RiskListItem[];
  count: number;
}

export function RiskDescriptionTable({ riskList, count }: RiskDescriptionTableProps) {
  return (
    <div className="card">
      <div className="section-title">Descrição dos Riscos</div>
      <div className="section-subtitle">{count} risco(s) — clique em qualquer gráfico desta aba para filtrar esta lista e todos os indicadores</div>
      <div className="desc-table-wrap">
        <table className="desc-table">
          <thead>
            <tr>
              <th>Risco</th>
              <th style={{ width: 180 }}>Área · Categoria</th>
              <th className="center" style={{ width: 70 }}>Score</th>
              <th className="center" style={{ width: 130 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {riskList.map((rk, i) => {
              const statusColors = BADGE_COLORS[statusKind(rk.normSt)];
              return (
                <tr key={i}>
                  <td>{rk.risco}</td>
                  <td className="muted">{rk.combo}</td>
                  <td className="center">
                    <span className="score-badge" style={{ background: scoreColor(rk.score) }}>
                      {rk.score != null ? round1(rk.score) : '—'}
                    </span>
                  </td>
                  <td className="center">
                    <span className="badge" style={{ background: statusColors.bg, color: statusColors.fg }}>
                      {rk.normSt}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
