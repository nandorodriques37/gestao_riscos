import type { ResourceStatusBar } from './scoreBars';

interface ResourceStackedBarsProps {
  bars: ResourceStatusBar[];
  onClick: (name: string) => void;
}

export function ResourceStackedBars({ bars, onClick }: ResourceStackedBarsProps) {
  return (
    <div className="card">
      <div className="section-header-row">
        <div>
          <div className="section-title">Ações por Recurso · Andamento</div>
          <div className="section-subtitle">Carga de ações por recurso, segmentada pelo status de execução</div>
        </div>
        <div className="color-legend-row">
          <div className="color-legend-item"><span className="color-legend-swatch" data-tier="null" />Não iniciado</div>
          <div className="color-legend-item"><span className="color-legend-swatch" data-tier="alto" />Em andamento</div>
          <div className="color-legend-item"><span className="color-legend-swatch" data-tier="baixo" />Concluído</div>
        </div>
      </div>
      <div className="bar-list">
        {bars.map(b => (
          <button
            key={b.name}
            className="bar-row"
            title="Clique para filtrar toda a aba por este recurso"
            aria-label={`${b.name}: ${b.ni} não iniciado, ${b.ea} em andamento, ${b.cc} concluído — ${b.total} no total. Clique para filtrar.`}
            onClick={() => onClick(b.name)}
          >
            <div className="bar-head">
              <span className="bar-name" title={b.name}>{b.name}</span>
              <span className="bar-score">{b.total}</span>
            </div>
            <div className="bar-track">
              {/* Vão de 2px de superfície entre os segmentos (ver charts.css). */}
              <div className="stack-fill-wrap" style={{ width: `${b.wrapPct}%` }}>
                <div className="seg-ni" style={{ width: `${b.niW}%` }} />
                <div className="seg-ea" style={{ width: `${b.eaW}%` }} />
                <div className="seg-cc" style={{ width: `${b.ccW}%` }} />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
