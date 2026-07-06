interface KpiCardsProps {
  totalRiscos: number;
  totalEmAndamento: number;
  totalConcluido: number;
  totalCritico: number;
  completude: number;
}

export function KpiCards({ totalRiscos, totalEmAndamento, totalConcluido, totalCritico, completude }: KpiCardsProps) {
  return (
    <div className="kpi-strip">
      <div className="kpi-card">
        <div className="kpi-icon" style={{ background: 'rgba(30,58,95,0.1)', color: '#1E3A5F' }}>◆</div>
        <div className="kpi-body">
          <div className="kpi-label">Riscos mapeados</div>
          <div className="kpi-value" style={{ color: '#1E3A5F' }}>{totalRiscos}</div>
        </div>
      </div>
      <div className="kpi-card">
        <div className="kpi-icon" style={{ background: 'rgba(217,119,6,0.14)', color: '#B45309' }}>◐</div>
        <div className="kpi-body">
          <div className="kpi-label">Em andamento</div>
          <div className="kpi-value" style={{ color: '#B45309' }}>{totalEmAndamento}</div>
        </div>
      </div>
      <div className="kpi-card">
        <div className="kpi-icon" style={{ background: 'rgba(21,128,61,0.14)', color: '#15803D' }}>✓</div>
        <div className="kpi-body">
          <div className="kpi-label">Concluídas</div>
          <div className="kpi-value" style={{ color: '#15803D' }}>{totalConcluido}</div>
        </div>
      </div>
      <div className="kpi-card">
        <div className="kpi-icon" style={{ background: 'rgba(220,38,38,0.12)', color: '#DC2626' }}>▲</div>
        <div className="kpi-body">
          <div className="kpi-label">Priorização crítica</div>
          <div className="kpi-value" style={{ color: '#DC2626' }}>{totalCritico}</div>
        </div>
      </div>
      <div className="kpi-card wide">
        <div className="kpi-body" style={{ width: '100%' }}>
          <div className="kpi-label">Completude</div>
          <div className="kpi-value-row">
            <div className="kpi-value" style={{ color: '#3E6FD9' }}>{completude}%</div>
            <span className="kpi-value-sub">campos preenchidos</span>
          </div>
          <div className="kpi-progress-track">
            <div className="kpi-progress-bar" style={{ width: `${completude}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
