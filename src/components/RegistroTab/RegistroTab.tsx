import { useSessionState } from '../../hooks/useSessionState';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Density, RegistroStatus, RiskRecord, SortDir, SortKey } from '../../types';
import { REGISTRO_STATUSES } from '../../types';
import { buildRows, type EnrichedRow } from '../../lib/rows';
import { computeCompletude } from '../../lib/calculations';
import { readColWidths, readDensity, readStatusFilter, writeDensity, writePref } from '../../lib/uiPrefs';
import { Kpi, KpiRow } from '../common/Kpi';
import { FilterBar } from './FilterBar';
import { RiskTable } from './RiskTable';

const COL_WIDTHS_KEY = 'riskMatrix.colWidths.v1';
const DENSITY_KEY = 'riskMatrix.density.v1';
const STATUS_FILTER_KEY = 'riskMatrix.statusFilter.v1';
const COL_WIDTHS_SAVE_DELAY = 300;

interface RegistroTabProps {
  idsDoRecorte?: Set<string> | null;
  records: RiskRecord[];
  onOpenEdit: (idx: number) => void;
  onDeleteRow: (idx: number) => void;
  onAddRow: () => void;
  onExportCSV: () => void;
  areaOptions: string[];
  categoriaOptions: string[];
  /**
   * Alternador entre tabela e rastro de mitigação. Vem de fora porque o modo é
   * estado do `App` — as duas leituras são a mesma seção, e quem escolhe qual
   * componente montar é ele.
   */
  modoToggle?: ReactNode;
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
  areaOptions, categoriaOptions, modoToggle, idsDoRecorte,
}: RegistroTabProps) {
  const [search, setSearch] = useSessionState('riscos.busca', '');
  // Seleção múltipla de status persistida entre sessões; array vazio = todos.
  const [statusFilter, setStatusFilter] = useState<RegistroStatus[]>(() => readStatusFilter(STATUS_FILTER_KEY, REGISTRO_STATUSES));
  const [areaFilter, setAreaFilter] = useSessionState('riscos.area', 'Todos');
  const [categoriaFilter, setCategoriaFilter] = useSessionState('riscos.categoria', 'Todos');
  const [sortKey, setSortKey] = useSessionState<SortKey>('riscos.ordem', null);
  const [sortDir, setSortDir] = useSessionState<SortDir>('riscos.direcao', 'desc');
  const [colWidths, setColWidths] = useState(() => readColWidths(COL_WIDTHS_KEY));
  const [density, setDensity] = useState<Density>(() => readDensity(DENSITY_KEY));

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

  useEffect(() => { writeDensity(DENSITY_KEY, density); }, [density]);

  useEffect(() => { writePref(STATUS_FILTER_KEY, statusFilter); }, [statusFilter]);

  const rows = useMemo(() => buildRows(records), [records]);

  const totalRiscos = useMemo(() => records.filter(r => r.risco).length, [records]);
  const totalEmAndamento = useMemo(() => rows.filter(r => r.normSt === 'Em andamento').length, [rows]);
  const totalConcluido = useMemo(() => rows.filter(r => r.normSt === 'Concluído').length, [rows]);
  const totalCritico = useMemo(() => rows.filter(r => r.prioriz != null && r.prioriz >= 6).length, [rows]);
  const completude = useMemo(() => computeCompletude(records), [records]);

  const visibleRows = useMemo(() => {
    const q = search.toLowerCase().trim();
    let result = rows.filter(row => {
      if (idsDoRecorte) return idsDoRecorte.has((row.record as RiskRecord & { id: string }).id);
      if (statusFilter.length > 0 && !statusFilter.includes(row.normSt as RegistroStatus)) return false;
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
  }, [rows, idsDoRecorte, search, statusFilter, areaFilter, categoriaFilter, sortKey, sortDir]);

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

  function handleToggleStatus(status: RegistroStatus) {
    setStatusFilter(prev => (prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]));
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
            setStatusFilter([]);
            setAreaFilter('Todos');
            setCategoriaFilter('Todos');
          },
        }
      : undefined;

  return (
    <div className="tab-page">
      {/* Título e ações numa barra própria; os KPIs abaixo, em faixa inteira.
          Antes os cinco cartões e os dois botões dividiam a mesma linha e
          embolavam a partir de qualquer largura de notebook. */}
      <div className="page-bar">
        <div>
          <div className="page-title">Registro de riscos e ações</div>
          <div className="page-subtitle">{rows.length} {rows.length === 1 ? 'registro' : 'registros'} · clique em uma linha para editar</div>
        </div>
        <div className="actions-row">
          {modoToggle}
          <button className="btn btn-ghost" onClick={onExportCSV}>↓ Exportar CSV</button>
          <button className="btn btn-navy" onClick={onAddRow}>+ Adicionar registro</button>
        </div>
      </div>

      <KpiRow>
        <Kpi label="Riscos mapeados" valor={totalRiscos} acento="brand" />
        <Kpi label="Em andamento" valor={totalEmAndamento} acento="alto" />
        <Kpi label="Concluídas" valor={totalConcluido} acento="baixo" />
        <Kpi label="Priorização crítica" valor={totalCritico} acento="critico" />
        <Kpi
          label="Completude"
          valor={`${completude}%`}
          sub={<>campos preenchidos</>}
          progresso={completude / 100}
          acento="brand"
          largo
        />
      </KpiRow>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onToggleStatus={handleToggleStatus}
        onClearStatus={() => setStatusFilter([])}
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
