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
      <div className="kpi-card" style={{ borderTopColor: '#1E3A5F' }}>
        <div className="kpi-label">Riscos mapeados</div>
        <div className="kpi-value" style={{ color: '#1E3A5F' }}>{totalRiscos}</div>
      </div>
      <div className="kpi-card" style={{ borderTopColor: '#D97706' }}>
        <div className="kpi-label">Em andamento</div>
        <div className="kpi-value" style={{ color: '#B45309' }}>{totalEmAndamento}</div>
      </div>
      <div className="kpi-card" style={{ borderTopColor: '#15803D' }}>
        <div className="kpi-label">Concluídas</div>
        <div className="kpi-value" style={{ color: '#15803D' }}>{totalConcluido}</div>
      </div>
      <div className="kpi-card" style={{ borderTopColor: '#DC2626' }}>
        <div className="kpi-label">Priorização crítica</div>
        <div className="kpi-value" style={{ color: '#DC2626' }}>{totalCritico}</div>
      </div>
      <div className="kpi-card wide" style={{ borderTopColor: '#5B8DEF' }}>
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
  );
}
