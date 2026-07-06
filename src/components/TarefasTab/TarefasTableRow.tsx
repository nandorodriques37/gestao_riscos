import type { EnrichedTaskRow } from '../../lib/taskRows';
import { BADGE_COLORS, TIER_CHIP_COLORS } from '../../lib/calculations';
import { gutTier, taskStatusKind } from '../../lib/taskCalculations';
import { onActivateKey } from '../../lib/a11y';

interface TarefasTableRowProps {
  row: EnrichedTaskRow;
  onOpen: (idx: number) => void;
  onDelete: (idx: number) => void;
}

export function TarefasTableRow({ row, onOpen, onDelete }: TarefasTableRowProps) {
  const { task: t, gut, prioridade, rank, normSt, idx } = row;
  const statusColors = BADGE_COLORS[taskStatusKind(normSt)];
  const gutChip = TIER_CHIP_COLORS[gutTier(gut)];

  return (
    <tr
      onClick={() => onOpen(idx)}
      onKeyDown={onActivateKey(() => onOpen(idx))}
      tabIndex={0}
      role="button"
      aria-label={`Editar tarefa: ${t.tarefa || 'sem título'}`}
      style={{ background: idx % 2 === 0 ? '#ffffff' : '#F7FAFD' }}
    >
      <td title={t.tipo}>{t.tipo || '—'}</td>
      <td className="tarefa-cell" title={t.tarefa}>{t.tarefa}</td>
      <td title={t.detalhes}>{t.detalhes}</td>
      <td className="center">{t.g ?? '—'}</td>
      <td className="center">{t.u ?? '—'}</td>
      <td className="center">{t.t ?? '—'}</td>
      <td className="center">
        <span className="tier-chip" style={{ background: gutChip.bg, color: gutChip.fg }}>
          <span className="tier-dot" style={{ background: gutChip.dot }} />
          {gut ?? '—'}
        </span>
      </td>
      <td className="center">
        <span className="tier-chip" style={{ background: gutChip.bg, color: gutChip.fg }}>
          <span className="tier-dot" style={{ background: gutChip.dot }} />
          {prioridade ?? '—'}
        </span>
      </td>
      <td className="center">{rank ?? '—'}</td>
      <td className="center">
        <span className="badge" style={{ background: statusColors.bg, color: statusColors.fg }}>{normSt}</span>
      </td>
      <td title={t.responsavel}>{t.responsavel}</td>
      <td title={t.obs}>{t.obs}</td>
      <td className="center">
        <button className="delete-btn" onClick={e => { e.stopPropagation(); onDelete(idx); }}>×</button>
      </td>
    </tr>
  );
}
