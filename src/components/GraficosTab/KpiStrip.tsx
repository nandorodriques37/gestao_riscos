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
      <div className="kpi-tile">
        <div className="kpi-label">Riscos avaliados</div>
        <div className="kpi-tile-value" style={{ color: '#1E3A5F' }}>
          {totalAvaliados}<span className="kpi-tile-value-sub"> / {totalRiscos}</span>
        </div>
      </div>
      <div className="kpi-tile">
        <div className="kpi-label">Score médio (P × I)</div>
        <div className="kpi-tile-value" style={{ color: '#B8901F' }}>{scoreMedio}</div>
      </div>
      <div className="kpi-tile">
        <div className="kpi-label">Riscos críticos</div>
        <div className="kpi-tile-value" style={{ color: '#DC2626' }}>{criticosCount}</div>
      </div>
      <div className="kpi-tile">
        <div className="kpi-label">Ações concluídas</div>
        <div className="kpi-tile-value" style={{ color: '#15803D' }}>{pctConcluido}%</div>
      </div>
    </div>
  );
}
