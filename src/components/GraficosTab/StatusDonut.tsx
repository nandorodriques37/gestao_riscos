export interface StatusLegendItem {
  label: string;
  color: string;
  count: number;
  pct: number;
}

interface StatusDonutProps {
  totalAcoesComStatus: number;
  statusLegend: StatusLegendItem[];
  donutBg: string;
  onLegendClick: (label: string) => void;
}

export function StatusDonut({ totalAcoesComStatus, statusLegend, donutBg, onLegendClick }: StatusDonutProps) {
  return (
    <div className="card">
      <div className="section-title">Status das Ações</div>
      <div className="section-subtitle">Distribuição das {totalAcoesComStatus} ações registradas</div>
      <div className="legend-status-row">
        <div className="donut" style={{ width: 176, height: 176, background: donutBg }}>
          <div className="donut-center" style={{ width: 110, height: 110 }}>
            <div className="donut-center-value" style={{ fontSize: 26 }}>{totalAcoesComStatus}</div>
            <div className="donut-center-label" style={{ fontSize: 10 }}>AÇÕES</div>
          </div>
        </div>
        <div className="legend-status-col">
          {statusLegend.map(s => (
            <button
              key={s.label}
              className="legend-item"
              title="Clique para filtrar toda a aba por este status"
              onClick={() => onLegendClick(s.label)}
            >
              <span className="legend-swatch" style={{ background: s.color }} />
              <span className="legend-status-label">{s.label}</span>
              <span className="legend-status-count">{s.count}</span>
              <span className="legend-status-pct">({s.pct}%)</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
