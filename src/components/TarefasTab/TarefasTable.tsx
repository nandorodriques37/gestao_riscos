import type { TaskSortKey } from '../../types';
import type { EnrichedTaskRow } from '../../lib/taskRows';
import { TASK_COLUMNS } from './columns';
import { TarefasTableRow } from './TarefasTableRow';
import { onActivateKey } from '../../lib/a11y';
import { EmptyState } from '../common/EmptyState';

interface TarefasTableProps {
  rows: EnrichedTaskRow[];
  sortKey: TaskSortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: NonNullable<TaskSortKey>) => void;
  onOpenEdit: (idx: number) => void;
  onDeleteRow: (idx: number) => void;
  emptyMessage?: string;
}

export function TarefasTable({ rows, sortKey, sortDir, onSort, onOpenEdit, onDeleteRow, emptyMessage }: TarefasTableProps) {
  const isEmpty = rows.length === 0 && !!emptyMessage;

  return (
    <div className="tarefas-table-wrap">
      <table className="risk-table">
        <thead>
          <tr>
            {TASK_COLUMNS.map(col => {
              const sortable = !!col.sortKey;
              const isSorted = sortable && sortKey === col.sortKey;
              const arrow = isSorted ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
              const ariaSort = isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : sortable ? 'none' : undefined;
              return (
                <th
                  key={col.id}
                  className={sortable ? 'sortable' : ''}
                  style={{ width: col.width }}
                  title={sortable ? 'Clique para ordenar' : undefined}
                  aria-sort={ariaSort}
                  tabIndex={sortable ? 0 : undefined}
                  onClick={sortable ? () => onSort(col.sortKey as NonNullable<TaskSortKey>) : undefined}
                  onKeyDown={sortable ? onActivateKey(() => onSort(col.sortKey as NonNullable<TaskSortKey>)) : undefined}
                >
                  {col.label}{arrow}
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
