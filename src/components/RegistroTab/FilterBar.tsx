import type { Density, StatusFilterValue } from '../../types';

const STATUS_PILLS: StatusFilterValue[] = ['Todos', 'Não iniciado', 'Em andamento', 'Concluído'];

const DENSITY_OPTIONS: { value: Density; label: string; title: string }[] = [
  { value: 'comfortable', label: 'Confortável', title: 'Linhas com mais respiro' },
  { value: 'compact', label: 'Compacto', title: 'Mais linhas visíveis por tela' },
];

interface FilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: StatusFilterValue;
  onStatusFilterChange: (v: StatusFilterValue) => void;
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
  statusFilter, onStatusFilterChange,
  areaFilter, onAreaFilterChange, areaOptions,
  categoriaFilter, onCategoriaFilterChange, categoriaOptions,
  visibleCount, totalCount,
  density, onDensityChange,
}: FilterBarProps) {
  return (
    <div className="filter-row">
      <input
        className="search-input"
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        placeholder="Buscar por risco, ação, área, responsável…"
      />
      <div className="filter-pills">
        {STATUS_PILLS.map(s => (
          <button
            key={s}
            className={`filter-pill${statusFilter === s ? ' active' : ''}`}
            onClick={() => onStatusFilterChange(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <select className="select-filter" value={areaFilter} onChange={e => onAreaFilterChange(e.target.value)}>
        <option value="Todos">Todos</option>
        {areaOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
      <select className="select-filter" value={categoriaFilter} onChange={e => onCategoriaFilterChange(e.target.value)}>
        <option value="Todos">Todos</option>
        {categoriaOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
      <div className="density-toggle" role="group" aria-label="Densidade da tabela">
        {DENSITY_OPTIONS.map(opt => (
          <button
            key={opt.value}
            className={density === opt.value ? 'active' : ''}
            title={opt.title}
            aria-pressed={density === opt.value}
            onClick={() => onDensityChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="filter-count">{visibleCount} de {totalCount} registros · clique em uma linha para editar</div>
    </div>
  );
}
