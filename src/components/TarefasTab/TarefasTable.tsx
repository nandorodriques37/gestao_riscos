import type { ColWidths, Density, TaskSortKey } from '../../types';
import type { EnrichedTaskRow } from '../../lib/taskRows';
import { TASK_COLUMNS } from './columns';
import { TarefasTableRow } from './TarefasTableRow';
import { onActivateKey } from '../../lib/a11y';
import { EmptyState } from '../common/EmptyState';
import { TarefaCardList } from './TarefaCardList';
import type { GrupoDono } from '../../lib/agrupamentoDono';
import { GrupoCabecalho } from './GrupoCabecalho';

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
  emptyHint?: string;
  density: Density;
  /** Presente = Lista agrupada por responsável. Ausente = a tabela de sempre. */
  grupos?: GrupoDono[] | null;
  /** ids dos grupos recolhidos. */
  fechados?: readonly string[];
  onToggleGrupo?: (id: string) => void;
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

export function TarefasTable({
  rows, colWidths, onColWidthChange, sortKey, sortDir, onSort, onOpenEdit, onToggleConcluida, onDeleteRow,
  emptyMessage, emptyHint, density, grupos = null, fechados = [], onToggleGrupo = () => {},
}: TarefasTableProps) {
  const isEmpty = rows.length === 0 && !!emptyMessage;
  const agrupada = grupos != null;
  const colunas = agrupada ? TASK_COLUMNS.filter(c => c.id !== 'responsavel') : TASK_COLUMNS;

  const linha = (row: EnrichedTaskRow) => (
    <TarefasTableRow
      key={row.idx}
      row={row}
      onOpen={onOpenEdit}
      onToggleConcluida={onToggleConcluida}
      onDelete={onDeleteRow}
      semResponsavel={agrupada}
    />
  );

  return (
    <>
      <div className={`tarefas-table-wrap${density === 'compact' ? ' density-compact' : ''}`}>
      <table className="risk-table">
        <thead>
          <tr>
            {colunas.map(col => {
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
        {/* Agrupada: um <tbody> por pessoa — é o "grupo de linhas" da própria
            tabela, e o leitor de tela anuncia o cabeçalho de cada um. */}
        {agrupada ? grupos.map(g => {
          const aberto = !fechados.includes(g.id);
          const corpoId = `tarefas-grupo-${g.id}`;
          return (
            <tbody key={g.id} id={corpoId} className="grupo-tbody" data-aberto={aberto || undefined}>
              <tr className="grupo-linha">
                <th colSpan={colunas.length} scope="rowgroup">
                  <GrupoCabecalho grupo={g} aberto={aberto} onToggle={() => onToggleGrupo(g.id)} controla={corpoId} />
                </th>
              </tr>
              {aberto && g.linhas.map(linha)}
            </tbody>
          );
        }) : (
          <tbody>{rows.map(linha)}</tbody>
        )}
      </table>
      </div>

      {/* Celular: um cartão por tarefa (ver styles/responsive.css — escondido em
          telas largas, e a tabela escondida onde ele aparece). */}
      <TarefaCardList
        rows={rows}
        onOpen={onOpenEdit}
        onToggleConcluida={onToggleConcluida}
        grupos={grupos}
        fechados={fechados}
        onToggleGrupo={onToggleGrupo}
      />

      {/* Fora dos dois de propósito: dentro do envelope da tabela, a mensagem
          de "nenhuma tarefa" sumia junto com ela no celular. É onde o
          `RiskTable` já a coloca. */}
      {isEmpty && <EmptyState message={emptyMessage} hint={emptyHint} />}
    </>
  );
}
