import type { Density, RegistroStatus } from '../../types';
import { REGISTRO_STATUSES } from '../../types';
import { DensityToggle } from '../common/DensityToggle';
import { FiltrosDobraveis } from '../common/FiltrosDobraveis';

interface FilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: RegistroStatus[];
  onToggleStatus: (v: RegistroStatus) => void;
  onClearStatus: () => void;
  areaFilter: string;
  onAreaFilterChange: (v: string) => void;
  areaOptions: string[];
  categoriaFilter: string;
  onCategoriaFilterChange: (v: string) => void;
  categoriaOptions: string[];
  visibleCount: number;
  totalCount: number;
  density: Density;
  onDensityChange: (v: Density) => void;
}

export function FilterBar({
  search, onSearchChange,
  statusFilter, onToggleStatus, onClearStatus,
  areaFilter, onAreaFilterChange, areaOptions,
  categoriaFilter, onCategoriaFilterChange, categoriaOptions,
  visibleCount, totalCount,
  density, onDensityChange,
}: FilterBarProps) {
  // Quantos recortes estão ativos: é o selo do botão "Filtros" no celular, onde
  // os controles ficam dobrados. Sem ele, um filtro esquecido encurta a lista
  // sem dizer por quê. A densidade não conta — ela não filtra nada.
  const ativos = (statusFilter.length > 0 ? 1 : 0)
    + (areaFilter !== 'Todos' ? 1 : 0)
    + (categoriaFilter !== 'Todos' ? 1 : 0);

  return (
    <FiltrosDobraveis
      ativos={ativos}
      busca={
        <input
          className="search-input"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Buscar por risco, ação, área, responsável…"
        />
      }
      contagem={
        <div className="filter-count">{visibleCount} de {totalCount} registros · clique em uma linha para editar</div>
      }
    >
      <div className="filter-pills">
        {/* Seleção múltipla: cada pill alterna; "Todos" (nenhum selecionado) limpa o filtro. */}
        <button
          className={`filter-pill${statusFilter.length === 0 ? ' active' : ''}`}
          onClick={onClearStatus}
          aria-pressed={statusFilter.length === 0}
        >
          Todos
        </button>
        {REGISTRO_STATUSES.map(s => {
          const active = statusFilter.includes(s);
          return (
            <button
              key={s}
              className={`filter-pill${active ? ' active' : ''}`}
              onClick={() => onToggleStatus(s)}
              aria-pressed={active}
            >
              {s}
            </button>
          );
        })}
      </div>
      <select className="select-filter" value={areaFilter} onChange={e => onAreaFilterChange(e.target.value)}>
        <option value="Todos">Todos</option>
        {areaOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
      <select className="select-filter" value={categoriaFilter} onChange={e => onCategoriaFilterChange(e.target.value)}>
        <option value="Todos">Todos</option>
        {categoriaOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
      <DensityToggle density={density} onChange={onDensityChange} />
    </FiltrosDobraveis>
  );
}
