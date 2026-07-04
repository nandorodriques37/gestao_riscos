export interface CritLegendItem {
  label: string;
  color: string;
  count: number;
  pct: number;
}

interface CriticidadeDonutProps {
  totalAvaliados: number;
  critLegend: CritLegendItem[];
  donutBg: string;
  onLegendClick: (label: string) => void;
}

export function CriticidadeDonut({ totalAvaliados, critLegend, donutBg, onLegendClick }: CriticidadeDonutProps) {
  return (
    <div className="card card-col">
      <div className="section-title">Distribuição por Criticidade</div>
      <div className="section-subtitle">{totalAvaliados} riscos avaliados por nível de score inerente</div>
      <div className="donut-row" style={{ flex: 1 }}>
        <div className="donut" style={{ width: 150, height: 150, background: donutBg }}>
          <div className="donut-center" style={{ width: 92, height: 92 }}>
            <div className="donut-center-value">{totalAvaliados}</div>
            <div className="donut-center-label">RISCOS</div>
          </div>
        </div>
        <div className="legend-col">
          {critLegend.map(c => (
            <button
              key={c.label}
              className="legend-item"
              title="Clique para filtrar toda a aba por esta criticidade"
              onClick={() => onLegendClick(c.label)}
            >
              <span className="legend-swatch" style={{ background: c.color }} />
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
