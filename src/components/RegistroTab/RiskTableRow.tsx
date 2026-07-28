import type { EnrichedRow } from '../../lib/rows';
import { round1, round2, scoreTier, priorizTier, respostaKind, statusKind } from '../../lib/calculations';
import { onActivateKey } from '../../lib/a11y';

interface RiskTableRowProps {
  row: EnrichedRow;
  onOpen: (idx: number) => void;
  onDelete: (idx: number) => void;
}

export function RiskTableRow({ row, onOpen, onDelete }: RiskTableRowProps) {
  const { record: r, score, prioriz, normSt, idx } = row;

  return (
    <tr
      onClick={() => onOpen(idx)}
      onKeyDown={onActivateKey(() => onOpen(idx))}
      tabIndex={0}
      role="button"
      aria-label={`Editar risco: ${r.risco || 'sem descrição'}`}
    >
      <td className="sticky-col-left" title={r.area}>{r.area}</td>
      <td data-priority="low" title={r.rotina}>{r.rotina}</td>
      <td title={r.categoria}>{r.categoria}</td>
      <td className="risco-cell" title={r.risco}>{r.risco}</td>
      <td className="center">
        <span className="badge" data-badge={respostaKind(r.resposta)}>
          {r.resposta || '—'}
        </span>
      </td>
      <td className="num">{r.probab ?? '—'}</td>
      <td className="num">{r.impact ?? '—'}</td>
      <td className="center">
        <span className="tier-chip" data-tier={scoreTier(score)}>
          <span className="tier-dot" />
          {score != null ? round1(score) : '—'}
        </span>
      </td>
      <td title={r.acoes}>{r.acoes}</td>
      <td data-priority="low" title={r.resultado}>{r.resultado}</td>
      <td className="num">{r.esforco ?? '—'}</td>
      <td className="num">{r.impacto2 ?? '—'}</td>
      <td className="num">{r.gravidade ?? '—'}</td>
      <td className="center">
        <span className="tier-chip" data-tier={priorizTier(prioriz)}>
          <span className="tier-dot" />
          {prioriz != null ? round2(prioriz) : '—'}
        </span>
      </td>
      <td title={r.recurso}>{r.recurso}</td>
      <td title={r.responsavel}>{r.responsavel}</td>
      <td className="center">
        <span className="badge" data-badge={statusKind(normSt)}>
          {normSt}
        </span>
      </td>
      <td data-priority="low" title={r.obs}>{r.obs}</td>
      <td className="center sticky-col-right">
        <button
          className="delete-btn"
          onClick={e => { e.stopPropagation(); onDelete(idx); }}
          aria-label={`Excluir risco: ${r.risco || 'sem descrição'}`}
        >
          ×
        </button>
      </td>
    </tr>
  );
}
