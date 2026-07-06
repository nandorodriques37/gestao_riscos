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
        <div className="kpi-icon" style={{ background: 'rgba(30,58,95,0.1)', color: '#1E3A5F' }}>◆</div>
        <div className="kpi-body">
          <div className="kpi-label">Riscos avaliados</div>
          <div className="kpi-tile-value" style={{ color: '#1E3A5F' }}>
            {totalAvaliados}<span className="kpi-tile-value-sub"> / {totalRiscos}</span>
          </div>
        </div>
      </div>
      <div className="kpi-tile">
        <div className="kpi-icon" style={{ background: 'rgba(184,144,31,0.14)', color: '#8A6D17' }}>×</div>
        <div className="kpi-body">
          <div className="kpi-label">Score médio (P × I)</div>
          <div className="kpi-tile-value" style={{ color: '#B8901F' }}>{scoreMedio}</div>
        </div>
      </div>
      <div className="kpi-tile">
        <div className="kpi-icon" style={{ background: 'rgba(220,38,38,0.12)', color: '#DC2626' }}>▲</div>
        <div className="kpi-body">
          <div className="kpi-label">Riscos críticos</div>
          <div className="kpi-tile-value" style={{ color: '#DC2626' }}>{criticosCount}</div>
        </div>
      </div>
      <div className="kpi-tile">
        <div className="kpi-icon" style={{ background: 'rgba(21,128,61,0.14)', color: '#15803D' }}>✓</div>
        <div className="kpi-body">
          <div className="kpi-label">Ações concluídas</div>
          <div className="kpi-tile-value" style={{ color: '#15803D' }}>{pctConcluido}%</div>
        </div>
      </div>
    </div>
  );
}
