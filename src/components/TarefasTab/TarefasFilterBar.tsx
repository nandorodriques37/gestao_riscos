import type { TaskStatus } from '../../types';
import { TASK_STATUSES } from '../../types';
import type { KanbanGroupBy, TaskView } from '../../lib/uiPrefs';
import type { FiltroVinculo } from './TarefasTab';

/** Rótulos do recorte por origem. "Livres" e não "Tarefas": desde a unificação
 *  as duas coisas são tarefa, e o que muda é ter ou não risco atrás. */
const VINCULO_OPTIONS: { value: FiltroVinculo; label: string; title: string }[] = [
  { value: 'todas', label: 'Todas', title: 'Tarefas livres e mitigações de risco' },
  { value: 'risco', label: 'De risco', title: 'Só o que mitiga um risco do registro' },
  { value: 'livres', label: 'Livres', title: 'Só o que não está ligado a risco nenhum' },
];

const VIEW_OPTIONS: { value: TaskView; label: string; title: string }[] = [
  { value: 'lista', label: 'Lista', title: 'Tabela com todas as colunas' },
  { value: 'kanban', label: 'Kanban', title: 'Quadro com colunas arrastáveis' },
];

interface TarefasFilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: TaskStatus[];
  onToggleStatus: (v: TaskStatus) => void;
  onClearStatus: () => void;
  tipoFilter: string;
  onTipoFilterChange: (v: string) => void;
  tipoOptions: string[];
  view: TaskView;
  onViewChange: (v: TaskView) => void;
  groupBy: KanbanGroupBy;
  onGroupByChange: (v: KanbanGroupBy) => void;
  visibleCount: number;
  totalCount: number;
  vinculoFilter: FiltroVinculo;
  onVinculoFilterChange: (v: FiltroVinculo) => void;
  vinculadasCount: number;
}

export function TarefasFilterBar({
  search, onSearchChange,
  statusFilter, onToggleStatus, onClearStatus,
  tipoFilter, onTipoFilterChange, tipoOptions,
  view, onViewChange, groupBy, onGroupByChange,
  visibleCount, totalCount,
  vinculoFilter, onVinculoFilterChange, vinculadasCount,
}: TarefasFilterBarProps) {
  return (
    <div className="filter-row">
      {/* Mesmo segmentado do modo de visualização — o recorte por origem é da
          mesma natureza: uma escolha entre poucas, sempre visível. */}
      <div className="view-toggle" role="group" aria-label="Origem do trabalho">
        {VINCULO_OPTIONS.map(o => (
          <button
            key={o.value}
            className={vinculoFilter === o.value ? 'active' : ''}
            onClick={() => onVinculoFilterChange(o.value)}
            aria-pressed={vinculoFilter === o.value}
            title={o.title}
          >
            {o.label}
            {o.value === 'risco' && vinculadasCount > 0 && (
              <span className="view-toggle-count tabular">{vinculadasCount}</span>
            )}
          </button>
        ))}
      </div>

      <input
        className="search-input"
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        placeholder="Buscar por tarefa, detalhes, responsável, risco…"
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

      {/* Agrupamento só faz sentido quando há colunas para agrupar. */}
      {view === 'kanban' && (
        <select
          className="select-filter"
          value={groupBy}
          onChange={e => onGroupByChange(e.target.value as KanbanGroupBy)}
          aria-label="Agrupar o quadro por"
        >
          <option value="prioridade">Agrupar por prioridade</option>
          <option value="status">Agrupar por status</option>
        </select>
      )}

      <div className="view-toggle" role="group" aria-label="Modo de visualização">
        {VIEW_OPTIONS.map(opt => (
          <button
            key={opt.value}
            className={view === opt.value ? 'active' : ''}
            title={opt.title}
            aria-pressed={view === opt.value}
            onClick={() => onViewChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="filter-count">
        {visibleCount} de {totalCount} tarefas · clique {view === 'kanban' ? 'em um card' : 'em uma linha'} para editar
      </div>
    </div>
  );
}
