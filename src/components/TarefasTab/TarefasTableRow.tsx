import type { EnrichedTaskRow } from '../../lib/taskRows';
import { BADGE_COLORS, TIER_CHIP_COLORS } from '../../lib/calculations';
import { gutColor, gutTier, taskStatusKind } from '../../lib/taskCalculations';
import { onActivateKey } from '../../lib/a11y';

interface TarefasTableRowProps {
  row: EnrichedTaskRow;
  onOpen: (idx: number) => void;
  onDelete: (idx: number) => void;
}

/** Iniciais do responsável (até 2 palavras) para o avatar. */
function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
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
      {/* Acento à esquerda colorido pela faixa de GUT — prioridade escaneável. */}
      <td title={t.tipo} style={{ boxShadow: `inset 3px 0 0 ${gutColor(gut)}` }}>
        {t.tipo ? <span className="type-tag">{t.tipo}</span> : '—'}
      </td>
      <td className="tarefa-cell" title={t.tarefa}><span className="clamp-2">{t.tarefa}</span></td>
      <td className="cell-wrap" title={t.detalhes}><span className="clamp-2">{t.detalhes}</span></td>
      <td className="center gut-note">{t.g ?? '—'}</td>
      <td className="center gut-note">{t.u ?? '—'}</td>
      <td className="center gut-note">{t.t ?? '—'}</td>
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
      <td title={t.responsavel}>
        {t.responsavel ? (
          <div className="owner-cell">
            <span className="owner-avatar" aria-hidden="true">{initials(t.responsavel)}</span>
            <span className="owner-name">{t.responsavel}</span>
          </div>
        ) : '—'}
      </td>
      <td className="cell-wrap" title={t.obs}><span className="clamp-2">{t.obs}</span></td>
      <td className="center">
        <button className="delete-btn" onClick={e => { e.stopPropagation(); onDelete(idx); }}>×</button>
      </td>
    </tr>
  );
}
