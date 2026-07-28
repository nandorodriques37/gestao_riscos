import type { TierKind } from '../../lib/calculations';

export interface StatusLegendItem {
  label: string;
  tier: TierKind;
  count: number;
  pct: number;
}

interface StatusDonutProps {
  totalAcoesComStatus: number;
  statusLegend: StatusLegendItem[];
  donutBg: string;
  activeLabel: string | null;
  onLegendClick: (label: string) => void;
}

export function StatusDonut({ totalAcoesComStatus, statusLegend, donutBg, activeLabel, onLegendClick }: StatusDonutProps) {
  return (
    <div className="card">
      <div className="section-title">Status das Ações</div>
      <div className="section-subtitle">Distribuição das {totalAcoesComStatus} ações registradas</div>
      <div className="legend-status-row">
        <div className="donut" style={{ width: 160, height: 160, background: donutBg }}>
          <div className="donut-center" style={{ width: 132, height: 132 }}>
            <div className="donut-center-value">{totalAcoesComStatus}</div>
            <div className="donut-center-label">ações</div>
          </div>
        </div>
        <div className="legend-status-col">
          {statusLegend.map(s => (
            <button
              key={s.label}
              className={`legend-item${activeLabel === s.label ? ' active' : ''}`}
              title="Clique para filtrar toda a aba por este status"
              aria-pressed={activeLabel === s.label}
              onClick={() => onLegendClick(s.label)}
            >
              <span className="legend-swatch" data-tier={s.tier} />
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
