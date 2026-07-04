import type { ColWidths, SortDir, SortKey } from '../../types';
import type { EnrichedRow } from '../../lib/rows';
import { COLUMNS } from './columns';
import { RiskTableRow } from './RiskTableRow';

interface RiskTableProps {
  rows: EnrichedRow[];
  colWidths: ColWidths;
  onColWidthChange: (id: string, width: number) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: NonNullable<SortKey>) => void;
  onOpenEdit: (idx: number) => void;
  onDeleteRow: (idx: number) => void;
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

export function RiskTable({ rows, colWidths, onColWidthChange, sortKey, sortDir, onSort, onOpenEdit, onDeleteRow }: RiskTableProps) {
  return (
    <div className="table-wrap">
      <table className="risk-table">
        <thead>
          <tr>
            {COLUMNS.map(col => {
              const width = colWidths[col.id] ?? col.width;
              const sortable = !!col.sortKey;
              const arrow = sortable && sortKey === col.sortKey ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
              return (
                <th
                  key={col.id}
                  className={`${col.red ? 'th-red' : ''} ${sortable ? 'sortable' : ''}`}
                  style={{ width }}
                  title="Arraste a borda direita para redimensionar"
                  onClick={sortable ? () => onSort(col.sortKey as NonNullable<SortKey>) : undefined}
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
            <RiskTableRow key={row.idx} row={row} onOpen={onOpenEdit} onDelete={onDeleteRow} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
