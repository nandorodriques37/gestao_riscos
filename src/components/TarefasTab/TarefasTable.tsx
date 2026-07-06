import type { ColWidths, TaskSortKey } from '../../types';
import type { EnrichedTaskRow } from '../../lib/taskRows';
import { TASK_COLUMNS } from './columns';
import { TarefasTableRow } from './TarefasTableRow';
import { onActivateKey } from '../../lib/a11y';
import { EmptyState } from '../common/EmptyState';

interface TarefasTableProps {
  rows: EnrichedTaskRow[];
  colWidths: ColWidths;
  onColWidthChange: (id: string, width: number) => void;
  sortKey: TaskSortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: NonNullable<TaskSortKey>) => void;
  onOpenEdit: (idx: number) => void;
  onDeleteRow: (idx: number) => void;
  emptyMessage?: string;
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

export function TarefasTable({ rows, colWidths, onColWidthChange, sortKey, sortDir, onSort, onOpenEdit, onDeleteRow, emptyMessage }: TarefasTableProps) {
  const isEmpty = rows.length === 0 && !!emptyMessage;

  return (
    <div className="tarefas-table-wrap">
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
            <TarefasTableRow key={row.idx} row={row} onOpen={onOpenEdit} onDelete={onDeleteRow} />
          ))}
        </tbody>
      </table>
      {isEmpty && <EmptyState message={emptyMessage} />}
    </div>
  );
}
