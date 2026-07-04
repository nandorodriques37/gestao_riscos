import type { EnrichedRow } from '../../lib/rows';
import { round1, round2, scoreColor, priorizColor, respostaKind, statusKind, BADGE_COLORS } from '../../lib/calculations';

interface RiskTableRowProps {
  row: EnrichedRow;
  onOpen: (idx: number) => void;
  onDelete: (idx: number) => void;
}

export function RiskTableRow({ row, onOpen, onDelete }: RiskTableRowProps) {
  const { record: r, score, prioriz, normSt, idx } = row;
  const respostaColors = BADGE_COLORS[respostaKind(r.resposta)];
  const statusColors = BADGE_COLORS[statusKind(normSt)];

  return (
    <tr
      onClick={() => onOpen(idx)}
      style={{ background: idx % 2 === 0 ? '#ffffff' : '#F7FAFD' }}
    >
      <td title={r.area}>{r.area}</td>
      <td title={r.rotina}>{r.rotina}</td>
      <td title={r.categoria}>{r.categoria}</td>
      <td className="risco-cell" title={r.risco}>{r.risco}</td>
      <td className="center">
        <span className="badge" style={{ background: respostaColors.bg, color: respostaColors.fg }}>
          {r.resposta || '—'}
        </span>
      </td>
      <td className="center">{r.probab ?? '—'}</td>
      <td className="center">{r.impact ?? '—'}</td>
      <td className="center">
        <span className="score-badge" style={{ background: scoreColor(score) }}>
          {score != null ? round1(score) : '—'}
        </span>
      </td>
      <td title={r.acoes}>{r.acoes}</td>
      <td title={r.resultado}>{r.resultado}</td>
      <td className="center">{r.esforco ?? '—'}</td>
      <td className="center">{r.impacto2 ?? '—'}</td>
      <td className="center">{r.gravidade ?? '—'}</td>
      <td className="center">
        <span className="score-badge" style={{ background: priorizColor(prioriz) }}>
          {prioriz != null ? round2(prioriz) : '—'}
        </span>
      </td>
      <td title={r.recurso}>{r.recurso}</td>
      <td title={r.responsavel}>{r.responsavel}</td>
      <td className="center">
        <span className="badge" style={{ background: statusColors.bg, color: statusColors.fg }}>
          {normSt}
        </span>
      </td>
      <td title={r.obs}>{r.obs}</td>
      <td className="center">
        <button
          className="delete-btn"
          onClick={e => { e.stopPropagation(); onDelete(idx); }}
        >
          ×
        </button>
      </td>
    </tr>
  );
}
