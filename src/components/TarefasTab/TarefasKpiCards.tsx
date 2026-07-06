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
      <div className="kpi-card" style={{ borderTopColor: '#1E3A5F' }}>
        <div className="kpi-label">Tarefas</div>
        <div className="kpi-value" style={{ color: '#1E3A5F' }}>{total}</div>
      </div>
      <div className="kpi-card" style={{ borderTopColor: '#94A3B8' }}>
        <div className="kpi-label">A fazer</div>
        <div className="kpi-value" style={{ color: '#64748B' }}>{aFazer}</div>
      </div>
      <div className="kpi-card" style={{ borderTopColor: '#D97706' }}>
        <div className="kpi-label">Em andamento</div>
        <div className="kpi-value" style={{ color: '#B45309' }}>{emAndamento}</div>
      </div>
      <div className="kpi-card" style={{ borderTopColor: '#15803D' }}>
        <div className="kpi-label">Concluídas</div>
        <div className="kpi-value" style={{ color: '#15803D' }}>{concluidas}</div>
      </div>
      <div className="kpi-card" style={{ borderTopColor: '#DC2626' }}>
        <div className="kpi-label">GUT crítico</div>
        <div className="kpi-value" style={{ color: '#DC2626' }}>{criticas}</div>
      </div>
      <div className="kpi-card wide" style={{ borderTopColor: '#5B8DEF' }}>
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
  );
}
