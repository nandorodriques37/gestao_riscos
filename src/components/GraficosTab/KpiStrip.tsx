interface KpiStripProps {
  totalAvaliados: number;
  totalRiscos: number;
  scoreMedio: number | '—';
  criticosCount: number;
  pctConcluido: number;
}

export function KpiStrip({ totalAvaliados, totalRiscos, scoreMedio, criticosCount, pctConcluido }: KpiStripProps) {
  return (
    <div className="kpi-grid-4">
      <div className="kpi-tile" data-accent="brand">
        <div className="kpi-body">
          <div className="kpi-label">Riscos avaliados</div>
          <div className="kpi-tile-value">
            {totalAvaliados}<span className="kpi-tile-value-sub"> / {totalRiscos}</span>
          </div>
        </div>
      </div>
      <div className="kpi-tile" data-accent="medio">
        <div className="kpi-body">
          <div className="kpi-label">Score médio (P × I)</div>
          <div className="kpi-tile-value">{scoreMedio}</div>
        </div>
      </div>
      <div className="kpi-tile" data-accent="critico">
        <div className="kpi-body">
          <div className="kpi-label">Riscos críticos</div>
          <div className="kpi-tile-value">{criticosCount}</div>
        </div>
      </div>
      <div className="kpi-tile" data-accent="baixo">
        <div className="kpi-body">
          <div className="kpi-label">Ações concluídas</div>
          <div className="kpi-tile-value">{pctConcluido}%</div>
        </div>
      </div>
    </div>
  );
}
