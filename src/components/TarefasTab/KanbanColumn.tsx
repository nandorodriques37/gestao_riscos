import { useDroppable } from '@dnd-kit/core';
import type { ReactNode } from 'react';
import type { TierKind } from '../../lib/calculations';

interface KanbanColumnProps {
  id: string;
  label: string;
  /** Faixa que colore o ponto do cabeçalho; ausente nas colunas de status. */
  tier?: TierKind;
  count: number;
  /** Texto da coluna vazia, que também é a promessa do que o drop vai fazer. */
  emptyHint: string;
  onAdd?: () => void;
  children: ReactNode;
}

/**
 * Coluna do quadro, no padrão de três zonas do Trello: cabeçalho e rodapé fixos,
 * corpo rolável no meio. O corpo inteiro é a zona de drop — uma coluna vazia
 * continua sendo alvo válido, com altura mínima para poder ser acertada.
 */
export function KanbanColumn({ id, label, tier, count, emptyHint, onAdd, children }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <section className="kanban-column" aria-label={`${label}: ${count} tarefa${count === 1 ? '' : 's'}`}>
      <header className="kanban-column-header">
        {/* A cor nunca identifica sozinha: o nome da faixa vem escrito ao lado do ponto. */}
        {tier && <span className="tier-dot" data-tier={tier} aria-hidden="true" />}
        <span className="kanban-column-label">{label}</span>
        <span className="kanban-column-count">{count}</span>
      </header>

      <div className="kanban-column-body" ref={setNodeRef} data-over={isOver || undefined}>
        {count === 0 ? <p className="kanban-column-empty">{emptyHint}</p> : children}
      </div>

      {onAdd && (
        <footer className="kanban-column-footer">
          <button className="kanban-add-btn" onClick={onAdd}>+ Adicionar tarefa</button>
        </footer>
      )}
    </section>
  );
}
