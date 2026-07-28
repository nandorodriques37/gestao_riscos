import type { TierKind } from '../../lib/calculations';

export interface CritLegendItem {
  label: string;
  tier: TierKind;
  count: number;
  pct: number;
}

interface CriticidadeDonutProps {
  totalAvaliados: number;
  critLegend: CritLegendItem[];
  donutBg: string;
  activeLabel: string | null;
  onLegendClick: (label: string) => void;
}

export function CriticidadeDonut({ totalAvaliados, critLegend, donutBg, activeLabel, onLegendClick }: CriticidadeDonutProps) {
  return (
    <div className="card card-col">
      <div className="section-title">Distribuição por Criticidade</div>
      <div className="section-subtitle">{totalAvaliados} riscos avaliados por nível de score inerente</div>
      <div className="donut-row" style={{ flex: 1 }}>
        {/* Anel de 14px: 150 de diâmetro externo, 122 de furo. O anel de 29px
            anterior tinha mais tinta que dados. */}
        <div className="donut" style={{ width: 150, height: 150, background: donutBg }}>
          <div className="donut-center" style={{ width: 122, height: 122 }}>
            <div className="donut-center-value">{totalAvaliados}</div>
            <div className="donut-center-label">riscos</div>
          </div>
        </div>
        <div className="legend-col">
          {critLegend.map(c => (
            <button
              key={c.label}
              className={`legend-item${activeLabel === c.label ? ' active' : ''}`}
              title="Clique para filtrar toda a aba por esta criticidade"
              aria-pressed={activeLabel === c.label}
              onClick={() => onLegendClick(c.label)}
            >
              <span className="legend-swatch" data-tier={c.tier} />
              <span className="legend-label">{c.label}</span>
              <span className="legend-count">{c.count}</span>
              <span className="legend-pct">{c.pct}%</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
