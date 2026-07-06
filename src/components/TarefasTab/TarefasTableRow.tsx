import type { EnrichedTaskRow } from '../../lib/taskRows';
import { gutColor, taskStatusKind } from '../../lib/taskCalculations';
import type { TaskBadgeKind } from '../../lib/taskCalculations';
import { onActivateKey } from '../../lib/a11y';

const STATUS_COLORS: Record<TaskBadgeKind, { bg: string; fg: string }> = {
  slate: { bg: '#F1F5F9', fg: '#475569' },
  amber: { bg: '#FEF3C7', fg: '#B45309' },
  green: { bg: '#DCFCE7', fg: '#15803D' },
};

interface TarefasTableRowProps {
  row: EnrichedTaskRow;
  onOpen: (idx: number) => void;
  onDelete: (idx: number) => void;
}

export function TarefasTableRow({ row, onOpen, onDelete }: TarefasTableRowProps) {
  const { task: t, gut, prioridade, rank, normSt, idx } = row;
  const statusColors = STATUS_COLORS[taskStatusKind(normSt)];

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
        <span className="score-badge" style={{ background: gutColor(gut) }}>{gut ?? '—'}</span>
      </td>
      <td className="center">
        <span className="score-badge" style={{ background: gutColor(gut) }}>{prioridade ?? '—'}</span>
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
