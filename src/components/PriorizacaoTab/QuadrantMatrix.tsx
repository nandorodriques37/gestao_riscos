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
  /** Bolha sob o mouse — ou item da lista ao lado, que destaca a bolha dele. */
  hoverRank: number | null;
  onHover: (rankIndex: number | null) => void;
}

/** Quantas bolhas levam o nome escrito embaixo, sem precisar da lista. */
const ROTULOS_DIRETOS = 6;

/**
 * Rótulos que cabem: das primeiras bolhas (e da que está sob o mouse), na
 * ordem do ranking, tirando a que cairia em cima de um rótulo já colocado —
 * duas bolhas na mesma altura e a menos de um rótulo de distância brigariam
 * pelo mesmo pedaço de tela. A perdedora continua com o nome no hover.
 */
function rotulosQueCabem(points: MatrixPoint[], hoverRank: number | null): MatrixPoint[] {
  const candidatos = points
    .filter(pt => !pt.dimmed && (pt.num <= ROTULOS_DIRETOS || hoverRank === pt.rankIndex))
    .sort((a, b) => a.num - b.num);
  const colocados: MatrixPoint[] = [];
  for (const pt of candidatos) {
    const briga = colocados.some(o => Math.abs(o.xPct - pt.xPct) < 16 && Math.abs(o.yPct - pt.yPct) < 9);
    if (!briga || hoverRank === pt.rankIndex) colocados.push(pt);
  }
  return colocados;
}

const POS_CLASS: Record<Quadrant, string> = { qw: 'qp-pos-qw', ga: 'qp-pos-ga', bp: 'qp-pos-bp', rv: 'qp-pos-rv' };
const TINT_CLASS: Record<Quadrant, string> = { qw: 'quad-tint-qw', ga: 'quad-tint-ga', bp: 'quad-tint-bp', rv: 'quad-tint-rv' };
const PILL_CLASS: Record<Quadrant, string> = { qw: 'qp-qw', ga: 'qp-ga', bp: 'qp-bp', rv: 'qp-rv' };

export function QuadrantMatrix({ points, selectedQuadrant, onBubbleClick, onQuadrantClick, hoverRank, onHover }: QuadrantMatrixProps) {
  return (
    <div className="matrix-plot-row">
      <div className="heatmap-yaxis-label matrix-yaxis">
        <span className="matrix-tick">5</span>
        <span>IMPACTO →</span>
        <span className="matrix-tick">1</span>
      </div>
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
              className={`matrix-bubble${pt.dimmed ? ' dimmed' : ''}${pt.isSelected ? ' selected' : ''}${hoverRank === pt.rankIndex ? ' hover' : ''}`}
              data-tier={pt.tier}
              title={pt.tooltip}
              role="button"
              tabIndex={0}
              aria-pressed={pt.isSelected}
              aria-label={pt.tooltip}
              onClick={() => onBubbleClick(pt.rankIndex)}
              onKeyDown={onActivateKey(() => onBubbleClick(pt.rankIndex))}
              onMouseEnter={() => onHover(pt.rankIndex)}
              onMouseLeave={() => onHover(null)}
              style={{
                left: `${pt.xPct}%`,
                top: `${pt.yPct}%`,
                width: pt.size,
                height: pt.size,
                // A escala de seleção é menor que a anterior (1.25): com o anel
                // de superfície o destaque já lê, e um salto grande empurrava
                // visualmente as bolhas vizinhas.
                transform: `translate(-50%,-50%)${pt.isSelected ? ' scale(1.15)' : ''}`,
                fontSize: pt.size >= 30 ? 12 : 11,
              }}
            >
              {pt.num}
            </div>
          ))}
          {/* Rótulo direto nas primeiras bolhas (e na que está sob o mouse):
              a melhor peça do app era sabotada pela legenda indireta — cada
              número exigia uma consulta à lista ao lado. */}
          {rotulosQueCabem(points, hoverRank).map(pt => (
            <div
              key={`r-${pt.rankIndex}`}
              className="matrix-rotulo"
              data-acima={pt.yPct > 78 || undefined}
              aria-hidden="true"
              style={{
                left: `${pt.xPct}%`,
                top: pt.yPct > 78 ? `calc(${pt.yPct}% - ${pt.size / 2 + 3}px)` : `calc(${pt.yPct}% + ${pt.size / 2 + 3}px)`,
              }}
            >
              {pt.rotulo}
            </div>
          ))}
        </div>
        <div className="matrix-axis-hint">
          <span className="matrix-axis-hint-edge"><span className="matrix-tick">1</span> menor esforço</span>
          <span className="matrix-axis-hint-main">ESFORÇO →</span>
          <span className="matrix-axis-hint-edge">maior esforço <span className="matrix-tick">5</span></span>
        </div>
      </div>
    </div>
  );
}
