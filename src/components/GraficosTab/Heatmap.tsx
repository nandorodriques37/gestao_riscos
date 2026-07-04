import type { RiskRecord } from '../../types';
import { scoreColor } from '../../lib/calculations';
import { onActivateKey } from '../../lib/a11y';

interface HeatmapProps {
  records: RiskRecord[];
  onCellClick: (prob: number, imp: number) => void;
}

const IMPACT_ROWS = [5, 4, 3, 2, 1];
const PROB_COLS = [1, 2, 3, 4, 5];

export function Heatmap({ records, onCellClick }: HeatmapProps) {
  return (
    <div className="card card-col">
      <div className="section-title">Mapa de Calor · Probabilidade × Impacto</div>
      <div className="section-subtitle">Número de riscos em cada célula do grid 5×5 — cor pela criticidade (P × I)</div>
      <div className="heatmap-row">
        <div className="heatmap-yaxis-label"><span>IMPACTO →</span></div>
        <div className="heatmap-ylabels">
          {IMPACT_ROWS.map(im => <div key={im} className="heatmap-ylabel">{im}</div>)}
          <div style={{ height: 15 }} />
        </div>
        <div className="heatmap-grid-wrap">
          <div className="heatmap-grid">
            {IMPACT_ROWS.flatMap(imp => PROB_COLS.map(prob => {
              const count = records.filter(r => r.probab === prob && r.impact === imp).length;
              const color = scoreColor(prob * imp);
              const clickable = count > 0;
              const label = `Probabilidade ${prob} · Impacto ${imp} — ${count} ${count === 1 ? 'risco' : 'riscos'}` + (clickable ? ' · clique para filtrar' : '');
              return (
                <div
                  key={`${prob}-${imp}`}
                  className="heatmap-cell"
                  title={label}
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  aria-label={clickable ? label : undefined}
                  onClick={clickable ? () => onCellClick(prob, imp) : undefined}
                  onKeyDown={clickable ? onActivateKey(() => onCellClick(prob, imp)) : undefined}
                  style={{
                    background: count > 0 ? color : color + '24',
                    color: count > 0 ? '#fff' : 'transparent',
                    cursor: count > 0 ? 'pointer' : 'default',
                    boxShadow: count > 0 ? '0 2px 6px rgba(15,23,42,0.12)' : 'none',
                  }}
                >
                  {count > 0 ? count : ''}
                </div>
              );
            }))}
          </div>
          <div className="heatmap-xlabels">
            {PROB_COLS.map(p => <div key={p} className="heatmap-xlabel">{p}</div>)}
          </div>
          <div className="heatmap-axis-caption">PROBABILIDADE →</div>
        </div>
      </div>
    </div>
  );
}
