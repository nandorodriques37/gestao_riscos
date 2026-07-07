import type { TaskStatus } from '../../types';
import { TASK_STATUSES } from '../../types';

interface TarefasFilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: TaskStatus[];
  onToggleStatus: (v: TaskStatus) => void;
  onClearStatus: () => void;
  tipoFilter: string;
  onTipoFilterChange: (v: string) => void;
  tipoOptions: string[];
  visibleCount: number;
  totalCount: number;
}

export function TarefasFilterBar({
  search, onSearchChange,
  statusFilter, onToggleStatus, onClearStatus,
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
        {/* Seleção múltipla: cada pill alterna; "Todos" (nenhum selecionado) limpa o filtro. */}
        <button
          className={`filter-pill${statusFilter.length === 0 ? ' active' : ''}`}
          onClick={onClearStatus}
          aria-pressed={statusFilter.length === 0}
        >
          Todos
        </button>
        {TASK_STATUSES.map(s => {
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
      <select className="select-filter" value={tipoFilter} onChange={e => onTipoFilterChange(e.target.value)}>
        <option value="Todos">Todos os tipos</option>
        {tipoOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
      <div className="filter-count">{visibleCount} de {totalCount} tarefas · clique em uma linha para editar</div>
    </div>
  );
}
