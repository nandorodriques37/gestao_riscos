interface KpiCardsProps {
  totalRiscos: number;
  totalEmAndamento: number;
  totalConcluido: number;
  totalCritico: number;
  completude: number;
}

/**
 * Tiles de indicador. O acento de cor é uma barra de 3px na borda esquerda
 * (ver styles/layout.css) — o quadrado colorido de 38px com glifo somava ruído
 * sem acrescentar informação, e o hover-lift sugeria um clique que não existe.
 */
export function KpiCards({ totalRiscos, totalEmAndamento, totalConcluido, totalCritico, completude }: KpiCardsProps) {
  return (
    <div className="kpi-strip">
      <div className="kpi-card" data-accent="brand">
        <div className="kpi-body">
          <div className="kpi-label">Riscos mapeados</div>
          <div className="kpi-value">{totalRiscos}</div>
        </div>
      </div>
      <div className="kpi-card" data-accent="alto">
        <div className="kpi-body">
          <div className="kpi-label">Em andamento</div>
          <div className="kpi-value">{totalEmAndamento}</div>
        </div>
      </div>
      <div className="kpi-card" data-accent="baixo">
        <div className="kpi-body">
          <div className="kpi-label">Concluídas</div>
          <div className="kpi-value">{totalConcluido}</div>
        </div>
      </div>
      <div className="kpi-card" data-accent="critico">
        <div className="kpi-body">
          <div className="kpi-label">Priorização crítica</div>
          <div className="kpi-value">{totalCritico}</div>
        </div>
      </div>
      <div className="kpi-card wide" data-accent="brand">
        <div className="kpi-body">
          <div className="kpi-label">Completude</div>
          <div className="kpi-value-row">
            <div className="kpi-value">{completude}%</div>
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
