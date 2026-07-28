import type { EnrichedTaskRow } from '../../lib/taskRows';
import { gutTier, taskStatusKind } from '../../lib/taskCalculations';
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


  return (
    <tr
      onClick={() => onOpen(idx)}
      onKeyDown={onActivateKey(() => onOpen(idx))}
      tabIndex={0}
      role="button"
      aria-label={`Editar tarefa: ${t.tarefa || 'sem título'}`}
      data-tier={gutTier(gut)}
    >
      {/* Acento à esquerda colorido pela faixa de GUT — prioridade escaneável.
          A zebra saiu junto com a da aba Registro: hairline entre linhas lê
          mais limpo e não briga com o fundo dos chips. */}
      <td className="gut-accent" title={t.tipo}>
        {t.tipo ? <span className="type-tag">{t.tipo}</span> : '—'}
      </td>
      <td className="tarefa-cell" title={t.tarefa}><span className="clamp-2">{t.tarefa}</span></td>
      <td className="cell-wrap" title={t.detalhes}><span className="clamp-2">{t.detalhes}</span></td>
      <td className="center gut-note">{t.g ?? '—'}</td>
      <td className="center gut-note">{t.u ?? '—'}</td>
      <td className="center gut-note">{t.t ?? '—'}</td>
      <td className="center">
        <span className="tier-chip" data-tier={gutTier(gut)}>
          <span className="tier-dot" />
          {gut ?? '—'}
        </span>
      </td>
      <td className="center">
        <span className="tier-chip" data-tier={gutTier(gut)}>
          <span className="tier-dot" />
          {prioridade ?? '—'}
        </span>
      </td>
      <td className="num">{rank ?? '—'}</td>
      <td className="center">
        <span className="badge" data-badge={taskStatusKind(normSt)}>{normSt}</span>
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
        <button
          className="delete-btn"
          onClick={e => { e.stopPropagation(); onDelete(idx); }}
          aria-label={`Excluir tarefa: ${t.tarefa || 'sem título'}`}
        >
          ×
        </button>
      </td>
    </tr>
  );
}
