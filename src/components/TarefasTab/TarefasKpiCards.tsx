interface TarefasKpiCardsProps {
  total: number;
  aFazer: number;
  emAndamento: number;
  concluidas: number;
  criticas: number;
  avaliacao: number;
}

export function TarefasKpiCards({ total, aFazer, emAndamento, concluidas, criticas, avaliacao }: TarefasKpiCardsProps) {
  return (
    <div className="kpi-strip">
      <div className="kpi-card">
        <div className="kpi-icon" style={{ background: 'rgba(30,58,95,0.1)', color: '#1E3A5F' }}>◆</div>
        <div className="kpi-body">
          <div className="kpi-label">Tarefas</div>
          <div className="kpi-value" style={{ color: '#1E3A5F' }}>{total}</div>
        </div>
      </div>
      <div className="kpi-card">
        <div className="kpi-icon" style={{ background: 'rgba(100,116,139,0.12)', color: '#64748B' }}>○</div>
        <div className="kpi-body">
          <div className="kpi-label">A fazer</div>
          <div className="kpi-value" style={{ color: '#64748B' }}>{aFazer}</div>
        </div>
      </div>
      <div className="kpi-card">
        <div className="kpi-icon" style={{ background: 'rgba(217,119,6,0.14)', color: '#B45309' }}>◐</div>
        <div className="kpi-body">
          <div className="kpi-label">Em andamento</div>
          <div className="kpi-value" style={{ color: '#B45309' }}>{emAndamento}</div>
        </div>
      </div>
      <div className="kpi-card">
        <div className="kpi-icon" style={{ background: 'rgba(21,128,61,0.14)', color: '#15803D' }}>✓</div>
        <div className="kpi-body">
          <div className="kpi-label">Concluídas</div>
          <div className="kpi-value" style={{ color: '#15803D' }}>{concluidas}</div>
        </div>
      </div>
      <div className="kpi-card">
        <div className="kpi-icon" style={{ background: 'rgba(220,38,38,0.12)', color: '#DC2626' }}>▲</div>
        <div className="kpi-body">
          <div className="kpi-label">GUT crítico</div>
          <div className="kpi-value" style={{ color: '#DC2626' }}>{criticas}</div>
        </div>
      </div>
      <div className="kpi-card wide">
        <div className="kpi-body" style={{ width: '100%' }}>
          <div className="kpi-label">Avaliadas (GUT)</div>
          <div className="kpi-value-row">
            <div className="kpi-value" style={{ color: '#3E6FD9' }}>{avaliacao}%</div>
            <span className="kpi-value-sub">com G/U/T preenchidos</span>
          </div>
          <div className="kpi-progress-track">
            <div className="kpi-progress-bar" style={{ width: `${avaliacao}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
