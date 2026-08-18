import { useDraggable } from '@dnd-kit/core';
import type { EnrichedTaskRow } from '../../lib/taskRows';
import { initials } from '../../lib/taskRows';
import { gutTier, taskStatusKind } from '../../lib/taskCalculations';
import { onActivateKey } from '../../lib/a11y';
import { MoveMenu, type MoveOption } from './MoveMenu';
import { AnexosBadge } from './AnexosBadge';

interface KanbanCardProps {
  row: EnrichedTaskRow;
  /** Coluna onde o card está — o menu desabilita esta opção. */
  currentColumnId: string;
  moveOptions: readonly MoveOption[];
  onMove: (idx: number, columnId: string) => void;
  onOpen: (idx: number) => void;
  onToggleConcluida: (idx: number) => void;
}

/**
 * Frente do card. Mesmo vocabulário visual da linha da tabela (`.type-tag`,
 * `.tier-chip`, `.badge`, `.owner-avatar`) — o Kanban é outra disposição dos
 * mesmos dados, não outra linguagem.
 */
export function KanbanCardFace({
  row, currentColumnId, moveOptions, onMove, onToggleConcluida,
}: Omit<KanbanCardProps, 'onOpen'>) {
  const { task: t, gut, rank, normSt, idx } = row;
  const concluida = normSt === 'Concluída';
  const titulo = t.tarefa || 'sem título';

  return (
    <>
      <div className="kanban-card-top">
        {t.tipo ? <span className="type-tag">{t.tipo}</span> : <span className="kanban-card-sem-tipo">—</span>}
        <span className="badge" data-badge={taskStatusKind(normSt)}>{normSt}</span>
      </div>

      <div className="kanban-card-title"><span className="clamp-3">{titulo}</span></div>

      <div className="kanban-card-badges">
        {/* O número acompanha a cor: a faixa nunca é identificada só pela matiz. */}
        <span className="tier-chip" data-tier={gutTier(gut)}>
          <span className="tier-dot" />
          GUT {gut ?? '—'}
        </span>
        {rank != null && <span className="kanban-card-rank">#{rank}</span>}
        <AnexosBadge quantidade={t.anexos?.length ?? 0} />
      </div>

      <div className="kanban-card-foot">
        {t.responsavel ? (
          <div className="owner-cell" title={t.responsavel}>
            <span className="owner-avatar" aria-hidden="true">{initials(t.responsavel)}</span>
            <span className="owner-name">{t.responsavel}</span>
          </div>
        ) : (
          <span className="kanban-card-sem-resp">Sem responsável</span>
        )}
        <div className="kanban-card-actions">
          <MoveMenu
            options={moveOptions}
            currentId={currentColumnId}
            onMove={col => onMove(idx, col)}
            taskLabel={titulo}
          />
          <button
            className="done-btn"
            onClick={e => { e.stopPropagation(); onToggleConcluida(idx); }}
            onKeyDown={e => e.stopPropagation()}
            aria-pressed={concluida}
            aria-label={concluida ? `Reabrir tarefa: ${titulo}` : `Concluir tarefa: ${titulo}`}
            title={concluida ? 'Reabrir tarefa' : 'Concluir tarefa'}
          >
            <span className="done-check" aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  );
}

export function KanbanCard(props: KanbanCardProps) {
  const { row, onOpen } = props;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: row.idx });

  return (
    <div
      ref={setNodeRef}
      className="kanban-card"
      data-tier={gutTier(row.gut)}
      data-dragging={isDragging || undefined}
      data-concluida={row.normSt === 'Concluída' || undefined}
      onClick={() => onOpen(row.idx)}
      onKeyDown={onActivateKey(() => onOpen(row.idx))}
      aria-label={`Tarefa: ${row.task.tarefa || 'sem título'}`}
      // `attributes` já traz role="button", tabIndex e aria-roledescription="draggable".
      {...attributes}
      {...listeners}
    >
      <KanbanCardFace {...props} />
    </div>
  );
}
