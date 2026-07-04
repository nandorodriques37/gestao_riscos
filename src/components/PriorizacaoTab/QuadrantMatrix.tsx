import type { Quadrant } from '../../types';
import type { MatrixPoint } from './matrixPoints';
import { QUADRANT_DEFS } from './quadrant';
import { onActivateKey } from '../../lib/a11y';
import { EmptyState } from '../common/EmptyState';

interface QuadrantMatrixProps {
  points: MatrixPoint[];
  selectedQuadrant: Quadrant | null;
  onBubbleClick: (rankIndex: number) => void;
  onQuadrantClick: (q: Quadrant) => void;
}

const POS_CLASS: Record<Quadrant, string> = { qw: 'qp-pos-qw', ga: 'qp-pos-ga', bp: 'qp-pos-bp', rv: 'qp-pos-rv' };
const TINT_CLASS: Record<Quadrant, string> = { qw: 'quad-tint-qw', ga: 'quad-tint-ga', bp: 'quad-tint-bp', rv: 'quad-tint-rv' };
const PILL_CLASS: Record<Quadrant, string> = { qw: 'qp-qw', ga: 'qp-ga', bp: 'qp-bp', rv: 'qp-rv' };

export function QuadrantMatrix({ points, selectedQuadrant, onBubbleClick, onQuadrantClick }: QuadrantMatrixProps) {
  return (
    <div className="matrix-plot-row">
      <div className="heatmap-yaxis-label"><span>IMPACTO →</span></div>
      <div className="matrix-plot-col">
        <div className="matrix-plot">
          {QUADRANT_DEFS.map(q => (
            <div key={q.key} className={`matrix-quadrant-tint ${TINT_CLASS[q.key]}`} />
          ))}
          <div className="matrix-divider-v" />
          <div className="matrix-divider-h" />
          {QUADRANT_DEFS.map(q => {
            const active = selectedQuadrant === q.key;
            return (
              <div
                key={q.key}
                className={`quadrant-pill ${POS_CLASS[q.key]} ${PILL_CLASS[q.key]}${active ? ' active' : ''}`}
                title="Clique para filtrar o ranking por este quadrante"
                role="button"
                tabIndex={0}
                aria-pressed={active}
                aria-label={`Filtrar por quadrante ${q.title}`}
                onClick={() => onQuadrantClick(q.key)}
                onKeyDown={onActivateKey(() => onQuadrantClick(q.key))}
              >
                {q.title}
                <div className="quadrant-pill-sub">{q.subtitle}</div>
              </div>
            );
          })}
          {points.length === 0 && (
            <div className="empty-state-overlay">
              <EmptyState message="Nenhuma ação para exibir neste filtro." />
            </div>
          )}
          {points.map(pt => (
            <div
              key={pt.rankIndex}
              className={`matrix-bubble${pt.dimmed ? ' dimmed' : ''}`}
              title={pt.tooltip}
              role="button"
              tabIndex={0}
              aria-pressed={pt.isSelected}
              aria-label={pt.tooltip}
              onClick={() => onBubbleClick(pt.rankIndex)}
              onKeyDown={onActivateKey(() => onBubbleClick(pt.rankIndex))}
              style={{
                left: `${pt.xPct}%`,
                top: `${pt.yPct}%`,
                width: pt.size,
                height: pt.size,
                transform: `translate(-50%,-50%)${pt.isSelected ? ' scale(1.25)' : ''}`,
                background: pt.color,
                fontSize: pt.size >= 30 ? 12 : 10.5,
                boxShadow: pt.isSelected
                  ? `0 0 0 3px #fff, 0 0 0 5px ${pt.color}, 0 4px 12px rgba(15,23,42,0.3)`
                  : '0 1px 4px rgba(15,23,42,0.2)',
                zIndex: pt.isSelected ? 10 : 1,
              }}
            >
              {pt.num}
            </div>
          ))}
        </div>
        <div className="matrix-axis-hint">
          <span className="matrix-axis-hint-edge">menor esforço</span>
          <span className="matrix-axis-hint-main">ESFORÇO →</span>
          <span className="matrix-axis-hint-edge">maior esforço</span>
        </div>
      </div>
    </div>
  );
}
