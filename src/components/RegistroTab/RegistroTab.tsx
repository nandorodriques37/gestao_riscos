import { useEffect, useMemo, useState } from 'react';
import type { RiskRecord, ColWidths, Density, SortDir, SortKey, StatusFilterValue } from '../../types';
import { buildRows, type EnrichedRow } from '../../lib/rows';
import { computeCompletude } from '../../lib/calculations';
import { KpiCards } from './KpiCards';
import { FilterBar } from './FilterBar';
import { RiskTable } from './RiskTable';

const COL_WIDTHS_KEY = 'riskMatrix.colWidths.v1';
const DENSITY_KEY = 'riskMatrix.density.v1';
const COL_WIDTHS_SAVE_DELAY = 300;

/** Larguras salvas na sessão anterior; descarta entradas inválidas (mín. 44px, igual ao resize). */
function readColWidths(): ColWidths {
  try {
    const raw = localStorage.getItem(COL_WIDTHS_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const valid: ColWidths = {};
        Object.entries(parsed as Record<string, unknown>).forEach(([id, w]) => {
          if (typeof w === 'number' && Number.isFinite(w) && w >= 44) valid[id] = w;
        });
        return valid;
      }
    }
  } catch {
    // storage ausente/corrompido — usa larguras padrão
  }
  return {};
}

function readDensity(): Density {
  try {
    const raw = localStorage.getItem(DENSITY_KEY);
    if (raw === 'compact' || raw === 'comfortable') return raw;
  } catch {
    // storage ausente — usa padrão
  }
  return 'comfortable';
}

interface RegistroTabProps {
  records: RiskRecord[];
  onOpenEdit: (idx: number) => void;
  onDeleteRow: (idx: number) => void;
  onAddRow: () => void;
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
  records, onOpenEdit, onDeleteRow, onAddRow, onExportCSV,
  areaOptions, categoriaOptions,
}: RegistroTabProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterValue>('Todos');
  const [areaFilter, setAreaFilter] = useState('Todos');
  const [categoriaFilter, setCategoriaFilter] = useState('Todos');
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [colWidths, setColWidths] = useState<ColWidths>(readColWidths);
  const [density, setDensity] = useState<Density>(readDensity);

  // O drag de resize atualiza colWidths a cada mousemove; grava com debounce
  // para não escrever no localStorage dezenas de vezes por segundo.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(colWidths));
      } catch {
        // storage indisponível — preferência vale só para a sessão
      }
    }, COL_WIDTHS_SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [colWidths]);

  useEffect(() => {
    try {
      localStorage.setItem(DENSITY_KEY, density);
    } catch {
      // storage indisponível — preferência vale só para a sessão
    }
  }, [density]);

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
        density={density}
        onDensityChange={setDensity}
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
        density={density}
      />
    </div>
  );
}
