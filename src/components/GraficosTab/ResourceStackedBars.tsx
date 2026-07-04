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
        <div className="color-legend-row" style={{ paddingTop: 2 }}>
          <div className="color-legend-item"><span className="color-legend-swatch" style={{ background: '#94A3B8' }} />Não iniciado</div>
          <div className="color-legend-item"><span className="color-legend-swatch" style={{ background: '#D97706' }} />Em andamento</div>
          <div className="color-legend-item"><span className="color-legend-swatch" style={{ background: '#15803D' }} />Concluído</div>
        </div>
      </div>
      <div className="bar-list">
        {bars.map(b => (
          <button key={b.name} className="bar-row" title="Clique para filtrar toda a aba por este recurso" onClick={() => onClick(b.name)}>
            <div className="bar-name resource" title={b.name}>{b.name}</div>
            <div className="bar-track">
              <div className="stack-fill-wrap" style={{ width: `${b.wrapPct}%`, minWidth: 14 }}>
                <div className="seg-ni" style={{ width: `${b.niW}%` }} />
                <div className="seg-ea" style={{ width: `${b.eaW}%` }} />
                <div className="seg-cc" style={{ width: `${b.ccW}%` }} />
              </div>
              <span className="bar-score" style={{ flexShrink: 0 }}>{b.total}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
