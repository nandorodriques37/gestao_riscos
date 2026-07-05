import type { EnrichedRow } from '../../lib/rows';
import { round1, round2, scoreColor, priorizColor, respostaKind, statusKind, BADGE_COLORS } from '../../lib/calculations';
import { onActivateKey } from '../../lib/a11y';

interface RiskCardListProps {
  rows: EnrichedRow[];
  onOpen: (idx: number) => void;
  onDelete: (idx: number) => void;
}

/**
 * Alternativa à tabela de 19 colunas para telas estreitas: um cartão por
 * registro com os campos mais relevantes para escanear a lista; toque abre o
 * mesmo modal de edição usado na tabela. Visibilidade controlada por
 * @media em App.css — a tabela e os cartões nunca aparecem juntos.
 */
export function RiskCardList({ rows, onOpen, onDelete }: RiskCardListProps) {
  return (
    <div className="risk-card-list">
      {rows.map(row => {
        const { record: r, score, prioriz, normSt, idx } = row;
        const respostaColors = BADGE_COLORS[respostaKind(r.resposta)];
        const statusColors = BADGE_COLORS[statusKind(normSt)];
        return (
          <div
            key={idx}
            className="risk-card"
            role="button"
            tabIndex={0}
            aria-label={`Editar risco: ${r.risco || 'sem descrição'}`}
            onClick={() => onOpen(idx)}
            onKeyDown={onActivateKey(() => onOpen(idx))}
          >
            <div className="risk-card-top">
              <span className="risk-card-combo">{[r.area, r.categoria].filter(Boolean).join(' · ')}</span>
              <button
                className="delete-btn"
                onClick={e => { e.stopPropagation(); onDelete(idx); }}
                aria-label="Excluir registro"
              >
                ×
              </button>
            </div>
            <div className="risk-card-risco">{r.risco || '(sem descrição)'}</div>
            <div className="risk-card-badges">
              <span className="badge" style={{ background: respostaColors.bg, color: respostaColors.fg }}>
                {r.resposta || '—'}
              </span>
              <span className="score-badge" style={{ background: scoreColor(score) }}>
                {score != null ? round1(score) : '—'}
              </span>
              <span className="score-badge" style={{ background: priorizColor(prioriz) }}>
                {prioriz != null ? round2(prioriz) : '—'}
              </span>
              <span className="badge" style={{ background: statusColors.bg, color: statusColors.fg }}>
                {normSt}
              </span>
            </div>
            {(r.recurso || r.responsavel) && (
              <div className="risk-card-meta">
                {[r.recurso, r.responsavel].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
