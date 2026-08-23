interface TarefasKpiCardsProps {
  total: number;
  aFazer: number;
  emAndamento: number;
  concluidas: number;
  criticas: number;
  avaliacao: number;
  /** Prazo vencido e trabalho aberto. Só existe desde que tarefa tem prazo. */
  atrasadas: number;
}

export function TarefasKpiCards({ total, aFazer, emAndamento, concluidas, criticas, avaliacao, atrasadas }: TarefasKpiCardsProps) {
  return (
    <div className="kpi-strip">
      <div className="kpi-card" data-accent="brand">
        <div className="kpi-body">
          <div className="kpi-label">Tarefas</div>
          <div className="kpi-value">{total}</div>
        </div>
      </div>
      <div className="kpi-card" data-accent="null">
        <div className="kpi-body">
          <div className="kpi-label">A fazer</div>
          <div className="kpi-value">{aFazer}</div>
        </div>
      </div>
      <div className="kpi-card" data-accent="alto">
        <div className="kpi-body">
          <div className="kpi-label">Em andamento</div>
          <div className="kpi-value">{emAndamento}</div>
        </div>
      </div>
      <div className="kpi-card" data-accent={atrasadas > 0 ? 'critico' : 'baixo'}>
        <div className="kpi-body">
          <div className="kpi-label">Atrasadas</div>
          <div className="kpi-value">{atrasadas}</div>
        </div>
      </div>
      <div className="kpi-card" data-accent="baixo">
        <div className="kpi-body">
          <div className="kpi-label">Concluídas</div>
          <div className="kpi-value">{concluidas}</div>
        </div>
      </div>
      <div className="kpi-card" data-accent="critico">
        <div className="kpi-body">
          <div className="kpi-label">GUT crítico</div>
          <div className="kpi-value">{criticas}</div>
        </div>
      </div>
      <div className="kpi-card wide" data-accent="brand">
        <div className="kpi-body">
          <div className="kpi-label">Avaliadas (GUT)</div>
          <div className="kpi-value-row">
            <div className="kpi-value">{avaliacao}%</div>
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
