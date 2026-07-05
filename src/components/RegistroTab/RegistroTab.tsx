import { useMemo, useState } from 'react';
import type { RiskRecord, ColWidths, SortDir, SortKey, StatusFilterValue } from '../../types';
import { buildRows, type EnrichedRow } from '../../lib/rows';
import { computeCompletude } from '../../lib/calculations';
import { KpiCards } from './KpiCards';
import { FilterBar } from './FilterBar';
import { RiskTable } from './RiskTable';

interface RegistroTabProps {
  records: RiskRecord[];
  onOpenEdit: (idx: number) => void;
  onDeleteRow: (idx: number) => void;
  onAddRow: () => void;
  onResetData: () => void;
  onExportCSV: () => void;
  areaOptions: string[];
  categoriaOptions: string[];
}

function sortValue(row: EnrichedRow, key: SortKey): number | null {
  if (key === 'score') return row.score;
  if (key === 'prioriz') return row.prioriz;
  if (key === 'probab') return row.record.probab;
  if (key === 'impact') return row.record.impact;
  return null;
}

export function RegistroTab({
  records, onOpenEdit, onDeleteRow, onAddRow, onResetData, onExportCSV,
  areaOptions, categoriaOptions,
}: RegistroTabProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('Todos');
  const [areaFilter, setAreaFilter] = useState('Todos');
  const [categoriaFilter, setCategoriaFilter] = useState('Todos');
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [colWidths, setColWidths] = useState<ColWidths>({});

  const rows = useMemo(() => buildRows(records), [records]);

  const totalRiscos = useMemo(() => records.filter(r => r.risco).length, [records]);
  const totalEmAndamento = useMemo(() => rows.filter(r => r.normSt === 'Em andamento').length, [rows]);
  const totalConcluido = useMemo(() => rows.filter(r => r.normSt === 'Concluído').length, [rows]);
  const totalCritico = useMemo(() => rows.filter(r => r.prioriz != null && r.prioriz >= 6).length, [rows]);
  const completude = useMemo(() => computeCompletude(records), [records]);

  const visibleRows = useMemo(() => {
    const q = search.toLowerCase().trim();
    let result = rows.filter(row => {
      if (statusFilter !== 'Todos' && row.normSt !== statusFilter) return false;
      if (areaFilter !== 'Todos' && row.record.area !== areaFilter) return false;
      if (categoriaFilter !== 'Todos' && row.record.categoria !== categoriaFilter) return false;
      if (!q) return true;
      const hay = [row.record.area, row.record.rotina, row.record.categoria, row.record.risco, row.record.acoes, row.record.recurso, row.record.responsavel]
        .join(' ').toLowerCase();
      return hay.includes(q);
    });
    if (sortKey) {
      const dir = sortDir === 'asc' ? 1 : -1;
      result = result.slice().sort((a, b) => {
        const va = sortValue(a, sortKey);
        const vb = sortValue(b, sortKey);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        return (va - vb) * dir;
      });
    }
    return result;
  }, [rows, search, statusFilter, areaFilter, categoriaFilter, sortKey, sortDir]);

  function handleSort(key: NonNullable<SortKey>) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function handleColWidthChange(id: string, width: number) {
    setColWidths(prev => ({ ...prev, [id]: width }));
  }

  const emptyMessage = rows.length === 0
    ? 'Nenhum registro cadastrado ainda.'
    : visibleRows.length === 0
      ? 'Nenhum registro encontrado com esses filtros.'
      : undefined;

  const emptyAction = rows.length === 0
    ? { label: '+ Adicionar registro', onClick: onAddRow }
    : visibleRows.length === 0
      ? {
          label: 'Limpar filtros', onClick: () => {
            setSearch('');
            setStatusFilter('Todos');
            setAreaFilter('Todos');
            setCategoriaFilter('Todos');
          },
        }
      : undefined;

  return (
    <div className="tab-page">
      <div className="toolbar-row">
        <KpiCards
          totalRiscos={totalRiscos}
          totalEmAndamento={totalEmAndamento}
          totalConcluido={totalConcluido}
          totalCritico={totalCritico}
          completude={completude}
        />
        <div className="actions-row">
          <button className="btn btn-ghost" onClick={onResetData} title="Restaurar os dados originais">↺ Restaurar</button>
          <button className="btn btn-outline-navy" onClick={onExportCSV}>↓ Exportar CSV</button>
          <button className="btn btn-navy" onClick={onAddRow}>+ Adicionar registro</button>
        </div>
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        areaFilter={areaFilter}
        onAreaFilterChange={setAreaFilter}
        areaOptions={areaOptions}
        categoriaFilter={categoriaFilter}
        onCategoriaFilterChange={setCategoriaFilter}
        categoriaOptions={categoriaOptions}
        visibleCount={visibleRows.length}
        totalCount={rows.length}
      />

      <RiskTable
        rows={visibleRows}
        colWidths={colWidths}
        onColWidthChange={handleColWidthChange}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        onOpenEdit={onOpenEdit}
        onDeleteRow={onDeleteRow}
        emptyMessage={emptyMessage}
        emptyAction={emptyAction}
      />
    </div>
  );
}
