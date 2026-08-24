import type { ColWidths, Density, TaskSortKey } from '../../types';
import type { EnrichedTaskRow } from '../../lib/taskRows';
import { TASK_COLUMNS } from './columns';
import { TarefasTableRow } from './TarefasTableRow';
import { onActivateKey } from '../../lib/a11y';
import { EmptyState } from '../common/EmptyState';
import { TarefaCardList } from './TarefaCardList';

interface TarefasTableProps {
  rows: EnrichedTaskRow[];
  colWidths: ColWidths;
  onColWidthChange: (id: string, width: number) => void;
  sortKey: TaskSortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: NonNullable<TaskSortKey>) => void;
  onOpenEdit: (idx: number) => void;
  onToggleConcluida: (idx: number) => void;
  onDeleteRow: (idx: number) => void;
  emptyMessage?: string;
  density: Density;
}

function startColResize(e: React.MouseEvent, id: string, startWidth: number, onWidthChange: (id: string, w: number) => void) {
  e.preventDefault();
  e.stopPropagation();
  const startX = e.clientX;
  const onMove = (ev: MouseEvent) => {
    const w = Math.max(44, startWidth + (ev.clientX - startX));
    onWidthChange(id, w);
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    document.body.style.userSelect = '';
  };
  document.body.style.userSelect = 'none';
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

export function TarefasTable({ rows, colWidths, onColWidthChange, sortKey, sortDir, onSort, onOpenEdit, onToggleConcluida, onDeleteRow, emptyMessage, density }: TarefasTableProps) {
  const isEmpty = rows.length === 0 && !!emptyMessage;

  return (
    <>
      <div className={`tarefas-table-wrap${density === 'compact' ? ' density-compact' : ''}`}>
      <table className="risk-table">
        <thead>
          <tr>
            {TASK_COLUMNS.map(col => {
              const width = colWidths[col.id] ?? col.width;
              const sortable = !!col.sortKey;
              const isSorted = sortable && sortKey === col.sortKey;
              const arrow = isSorted ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
              const ariaSort = isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : sortable ? 'none' : undefined;
              return (
                <th
                  key={col.id}
                  className={sortable ? 'sortable' : ''}
                  style={{ width }}
                  title={sortable ? 'Clique para ordenar · arraste a borda para redimensionar' : 'Arraste a borda direita para redimensionar'}
                  aria-sort={ariaSort}
                  tabIndex={sortable ? 0 : undefined}
                  onClick={sortable ? () => onSort(col.sortKey as NonNullable<TaskSortKey>) : undefined}
                  onKeyDown={sortable ? onActivateKey(() => onSort(col.sortKey as NonNullable<TaskSortKey>)) : undefined}
                >
                  {col.label}{arrow}
                  <div
                    className="col-grip"
                    onMouseDown={e => startColResize(e, col.id, width, onColWidthChange)}
                    onClick={e => e.stopPropagation()}
                  />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <TarefasTableRow
              key={row.idx}
              row={row}
              onOpen={onOpenEdit}
              onToggleConcluida={onToggleConcluida}
              onDelete={onDeleteRow}
            />
          ))}
        </tbody>
      </table>
      </div>

      {/* Celular: um cartão por tarefa (ver styles/responsive.css — escondido em
          telas largas, e a tabela escondida onde ele aparece). */}
      <TarefaCardList rows={rows} onOpen={onOpenEdit} onToggleConcluida={onToggleConcluida} />

      {/* Fora dos dois de propósito: dentro do envelope da tabela, a mensagem
          de "nenhuma tarefa" sumia junto com ela no celular. É onde o
          `RiskTable` já a coloca. */}
      {isEmpty && <EmptyState message={emptyMessage} />}
    </>
  );
}
