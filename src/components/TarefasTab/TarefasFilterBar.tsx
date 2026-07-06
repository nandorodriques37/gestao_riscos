import type { TaskStatusFilterValue } from '../../types';

const STATUS_PILLS: TaskStatusFilterValue[] = ['Todos', 'A fazer', 'Em andamento', 'Concluída'];

interface TarefasFilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: TaskStatusFilterValue;
  onStatusFilterChange: (v: TaskStatusFilterValue) => void;
  tipoFilter: string;
  onTipoFilterChange: (v: string) => void;
  tipoOptions: string[];
  visibleCount: number;
  totalCount: number;
}

export function TarefasFilterBar({
  search, onSearchChange,
  statusFilter, onStatusFilterChange,
  tipoFilter, onTipoFilterChange, tipoOptions,
  visibleCount, totalCount,
}: TarefasFilterBarProps) {
  return (
    <div className="filter-row">
      <input
        className="search-input"
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        placeholder="Buscar por tarefa, detalhes, responsável…"
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
      <select className="select-filter" value={tipoFilter} onChange={e => onTipoFilterChange(e.target.value)}>
        <option value="Todos">Todos os tipos</option>
        {tipoOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
      <div className="filter-count">{visibleCount} de {totalCount} tarefas · clique em uma linha para editar</div>
    </div>
  );
}
