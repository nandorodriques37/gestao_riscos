import { useEffect, useMemo, useRef, useState } from 'react';
import type { Pessoa, StoredRiskRecord, Task, TaskStatus, TaskSortKey } from '../../types';
import { TASK_STATUSES } from '../../types';
import { useTasks } from '../../hooks/useTasks';
import type { UsePortfolio } from '../../hooks/usePortfolio';
import { buildTaskRows, type EnrichedTaskRow } from '../../lib/taskRows';
import { chaveDoNome } from '../../lib/nomes';
import { computeAvaliacao, normTaskStatus } from '../../lib/taskCalculations';
import {
  SEM_NOTA, adjustGutToBand, bandOf, describeChanges, type PriorityBand,
} from '../../lib/taskPriority';
import { downloadTasksCSV } from '../../lib/taskCsv';
import {
  KANBAN_GROUP_BYS, TASK_VIEWS, readColWidths, readEnumPref, readStatusFilter, writePref,
  type KanbanGroupBy, type TaskView,
} from '../../lib/uiPrefs';
import { TarefasKpiCards } from './TarefasKpiCards';
import { TarefasFilterBar } from './TarefasFilterBar';
import { TarefasTable } from './TarefasTable';
import { TarefasKanban } from './TarefasKanban';
import { TarefaEditModal } from './TarefaEditModal';
import { GutGuide } from './GutGuide';

const POLL_INTERVAL = 15000;
const COL_WIDTHS_KEY = 'riskMatrix.tasks.colWidths.v1';
const STATUS_FILTER_KEY = 'riskMatrix.tasks.statusFilter.v1';
const VIEW_KEY = 'riskMatrix.tasks.view.v1';
const GROUP_BY_KEY = 'riskMatrix.tasks.groupBy.v1';
const COL_WIDTHS_SAVE_DELAY = 300;
const UNDO_TIMEOUT = 10000;
const VINCULO_KEY = 'riskMatrix.tasks.vinculo.v1';

/**
 * Recorte por origem do trabalho. O quadro passou a mostrar tarefa livre e
 * mitigação de risco na mesma lista — são a mesma coisa, distinguidas por
 * `risco_id` —, e são rituais diferentes: acompanhamento do time de um lado,
 * prestação de contas de risco do outro. O filtro é o que faz uma lista só
 * servir aos dois.
 */
export type FiltroVinculo = 'todas' | 'risco' | 'livres';
const FILTROS_VINCULO: readonly FiltroVinculo[] = ['todas', 'risco', 'livres'];

/** Notas anteriores de uma tarefa re-priorizada por arraste, para o "Desfazer". */
interface PendingPriorityUndo {
  id: string;
  before: Pick<Task, 'g' | 'u' | 't'>;
  message: string;
}

function sortValue(row: EnrichedTaskRow, key: TaskSortKey): number | null {
  if (key === 'gut') return row.gut;
  if (key === 'g') return row.task.g;
  if (key === 'u') return row.task.u;
  if (key === 't') return row.task.t;
  // Data vira número para caber na mesma comparação. Sem prazo continua no fim,
  // como toda ausência aqui — e é o que se quer: o que não tem data combinada
  // não disputa a atenção com o que vence amanhã.
  if (key === 'prazo') return row.task.prazo ? Date.parse(row.task.prazo) : null;
  return null;
}

interface TarefasTabProps {
  /** Para o cartão dizer QUAL risco a mitigação segura, e com que criticidade. */
  records: StoredRiskRecord[];
  /** Iniciativas e pessoas: o vínculo de execução e o dono de verdade. */
  pf: UsePortfolio;
}

export function TarefasTab({ records, pf }: TarefasTabProps) {
  const {
    tasks, loading, error,
    hasPendingWrites, saveStatus, updateTaskById, addTask, deleteTaskById,
    addAttachment, removeAttachment,
    refresh, flushPending, clearError,
  } = useTasks();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Seleção múltipla de status persistida entre sessões; array vazio = todos.
  const [statusFilter, setStatusFilter] = useState<TaskStatus[]>(() => readStatusFilter(STATUS_FILTER_KEY, TASK_STATUSES));
  const [tipoFilter, setTipoFilter] = useState('Todos');
  const [vinculoFilter, setVinculoFilter] = useState<FiltroVinculo>(
    () => readEnumPref(VINCULO_KEY, FILTROS_VINCULO, 'todas'),
  );
  const [sortKey, setSortKey] = useState<TaskSortKey>('gut');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [colWidths, setColWidths] = useState(() => readColWidths(COL_WIDTHS_KEY));
  const [view, setView] = useState<TaskView>(() => readEnumPref(VIEW_KEY, TASK_VIEWS, 'lista'));
  const [groupBy, setGroupBy] = useState<KanbanGroupBy>(
    () => readEnumPref(GROUP_BY_KEY, KANBAN_GROUP_BYS, 'prioridade'),
  );
  const [pendingUndo, setPendingUndo] = useState<PendingPriorityUndo | null>(null);
  // Ref, não estado: só o efeito de polling lê isso, e re-renderizar o quadro no
  // meio de um arraste embaralharia os cards por baixo do cursor.
  const draggingRef = useRef(false);

  // O drag de resize atualiza colWidths a cada mousemove; grava com debounce
  // para não escrever no localStorage dezenas de vezes por segundo.
  useEffect(() => {
    const timer = setTimeout(() => writePref(COL_WIDTHS_KEY, colWidths), COL_WIDTHS_SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [colWidths]);

  useEffect(() => { writePref(STATUS_FILTER_KEY, statusFilter); }, [statusFilter]);
  useEffect(() => { writePref(VIEW_KEY, view); }, [view]);
  useEffect(() => { writePref(GROUP_BY_KEY, groupBy); }, [groupBy]);
  useEffect(() => { writePref(VINCULO_KEY, vinculoFilter); }, [vinculoFilter]);

  useEffect(() => {
    if (!pendingUndo) return;
    const timer = setTimeout(() => setPendingUndo(null), UNDO_TIMEOUT);
    return () => clearTimeout(timer);
  }, [pendingUndo]);

  useEffect(() => {
    // Um refresh no meio do arraste reordenaria `tasks` e invalidaria os índices
    // que os cards carregam — por isso o polling espera o drop.
    const canSync = () => editingId == null && !hasPendingWrites() && !draggingRef.current;
    const interval = setInterval(() => { if (canSync()) void refresh(); }, POLL_INTERVAL);
    const onFocus = () => { if (canSync()) void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, [editingId, hasPendingWrites, refresh]);

  const rows = useMemo(
    () => buildTaskRows(tasks, {
      riscos: records,
      iniciativas: pf.portfolio.iniciativas,
      pessoas: pf.portfolio.pessoas,
    }),
    [tasks, records, pf.portfolio.iniciativas, pf.portfolio.pessoas],
  );

  const vinculadas = useMemo(() => rows.filter(r => r.vinculo != null).length, [rows]);
  const atrasadas = useMemo(() => rows.filter(r => r.atrasada).length, [rows]);

  const tipoOptions = useMemo(() => [...new Set(tasks.map(t => t.tipo).filter(Boolean))], [tasks]);
  // A lista de sugestão passa a ser o cadastro de pessoas, não os nomes que
  // por acaso já aparecem no quadro: é assim que se para de criar ficha nova
  // por diferença de grafia.
  const responsavelOptions = useMemo(
    () => pf.portfolio.pessoas.map(p => p.nome).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [pf.portfolio.pessoas],
  );

  const total = tasks.length;
  const aFazer = useMemo(() => rows.filter(r => r.normSt === 'A fazer').length, [rows]);
  const emAndamento = useMemo(() => rows.filter(r => r.normSt === 'Em andamento').length, [rows]);
  const concluidas = useMemo(() => rows.filter(r => r.normSt === 'Concluída').length, [rows]);
  const criticas = useMemo(() => rows.filter(r => r.gut != null && r.gut >= 100).length, [rows]);
  const avaliacao = useMemo(() => computeAvaliacao(tasks), [tasks]);

  const visibleRows = useMemo(() => {
    const q = search.toLowerCase().trim();
    let result = rows.filter(row => {
      if (statusFilter.length > 0 && !statusFilter.includes(row.normSt as TaskStatus)) return false;
      if (tipoFilter !== 'Todos' && row.task.tipo !== tipoFilter) return false;
      if (vinculoFilter === 'risco' && row.vinculo == null) return false;
      if (vinculoFilter === 'livres' && row.vinculo != null) return false;
      if (!q) return true;
      // O nome do risco entra na busca: procurar pelo risco é como se chega à
      // mitigação, e era o caminho que existia antes de as duas listas virarem
      // uma.
      const hay = [
        row.task.tipo, row.task.tarefa, row.task.detalhes, row.dono, row.task.obs,
        row.vinculo?.risco ?? '', row.vinculo?.iniciativa ?? '',
      ].join(' ').toLowerCase();
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
  }, [rows, search, statusFilter, tipoFilter, vinculoFilter, sortKey, sortDir]);

  function handleSort(key: NonNullable<TaskSortKey>) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    // Nota alta primeiro; prazo é o contrário — o que vence antes vem antes.
    setSortDir(key === 'prazo' ? 'asc' : 'desc');
  }

  function handleColWidthChange(id: string, width: number) {
    setColWidths(prev => ({ ...prev, [id]: width }));
  }

  function handleToggleStatus(status: TaskStatus) {
    setStatusFilter(prev => (prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]));
  }

  function handleOpenEdit(idx: number) {
    const t = tasks[idx];
    if (t) setEditingId(t.id);
  }

  // Conclusão em um clique na própria linha: alterna Concluída ⇄ A fazer e
  // grava na hora (mesmo caminho do modal), sem abrir os detalhes.
  function handleToggleConcluida(idx: number) {
    const t = tasks[idx];
    if (!t) return;
    const status: TaskStatus = normTaskStatus(t.status) === 'Concluída' ? 'A fazer' : 'Concluída';
    updateTaskById(t.id, { status });
    void flushPending();
  }

  /**
   * Drop de um card no quadro. Agrupado por status, grava o campo direto. Agrupado
   * por prioridade não há campo a gravar — a faixa vem de G × U × T —, então o
   * ajuste mínimo calculado em `adjustGutToBand` é aplicado e fica desfazível: a
   * tarefa muda de coluna na hora, mas o usuário vê o que mudou e pode voltar.
   */
  function handleMove(idx: number, columnId: string) {
    const t = tasks[idx];
    if (!t) return;

    if (groupBy === 'status') {
      updateTaskById(t.id, { status: columnId });
      void flushPending();
      return;
    }

    const before = { g: t.g, u: t.u, t: t.t };

    if (columnId === SEM_NOTA) {
      if (bandOf(t) == null) return;
      updateTaskById(t.id, { g: null, u: null, t: null });
      void flushPending();
      setPendingUndo({ id: t.id, before, message: 'Prioridade removida: notas G, U e T apagadas.' });
      return;
    }

    const ajuste = adjustGutToBand(t, columnId as PriorityBand);
    if (!ajuste) return;
    updateTaskById(t.id, ajuste.patch);
    void flushPending();
    setPendingUndo({
      id: t.id,
      before,
      message: `Prioridade: ${t.tarefa || 'tarefa'} → ${columnId} (${describeChanges(ajuste.changes)}).`,
    });
  }

  function handleUndoPriority() {
    if (!pendingUndo) return;
    updateTaskById(pendingUndo.id, pendingUndo.before);
    void flushPending();
    setPendingUndo(null);
  }

  /**
   * Excluir mitigação não é o mesmo que excluir tarefa: some do plano de ação
   * do risco e muda o estado de tratamento dele, que é o número que vai ao
   * comitê. O aviso diz de qual risco se trata.
   */
  function confirmarExclusao(idx: number): boolean {
    const row = rows.find(r => r.idx === idx);
    const vinculo = row?.vinculo;
    if (!vinculo) return window.confirm('Tem certeza que deseja excluir esta tarefa?');
    return window.confirm(
      `Esta é uma mitigação do risco "${vinculo.risco || 'sem título'}".\n\n`
      + 'Excluir remove a ação do plano do risco e altera o estado de tratamento dele. '
      + 'Tem certeza?',
    );
  }

  async function handleDeleteRow(idx: number) {
    const t = tasks[idx];
    if (!t) return;
    if (!confirmarExclusao(idx)) return;
    if (editingId === t.id) setEditingId(null);
    await deleteTaskById(t.id);
  }

  async function handleAddRow() {
    try {
      const created = await addTask();
      setEditingId(created.id);
    } catch {
      // erro já sinalizado pelo hook (banner)
    }
  }

  function handleCloseModal() {
    setEditingId(null);
  }

  // Grava o rascunho do modal imediatamente: estaciona o patch e força o flush
  // num único PATCH, reutilizando saveStatus/conflito/retry do hook.
  function handleCommitEdit(id: string, patch: Partial<Task>) {
    updateTaskById(id, patch);
    void flushPending();
  }

  /**
   * Nome digitado vira pessoa: casa com uma ficha existente ignorando acento e
   * caixa, ou cadastra uma nova. É a mesma regra do editor de plano de ação —
   * e comparar pela grafia crua é exatamente o que criou 11 fichas para 8
   * pessoas.
   */
  async function handleCommitDono(id: string, nome: string) {
    const limpo = nome.trim();
    if (!limpo) {
      updateTaskById(id, { dono_id: null });
      void flushPending();
      return;
    }
    const chave = chaveDoNome(limpo);
    const existente = pf.portfolio.pessoas.find(p => chaveDoNome(p.nome) === chave);
    const pessoa = existente ?? await pf.criarERetornar<Pessoa>('pessoas', { nome: limpo, ativo: true });
    if (!pessoa) return;
    updateTaskById(id, { dono_id: pessoa.id });
    void flushPending();
  }

  async function handleDeleteFromModal() {
    if (!editingId) return;
    const idx = tasks.findIndex(t => t.id === editingId);
    if (!confirmarExclusao(idx)) return;
    const id = editingId;
    setEditingId(null);
    await deleteTaskById(id);
  }

  const editingTask = editingId != null ? tasks.find(t => t.id === editingId) ?? null : null;
  const editingRow = editingId != null ? rows.find(r => r.task.id === editingId) ?? null : null;
  const showLoading = loading && tasks.length === 0;

  const emptyMessage = rows.length === 0
    ? 'Nenhuma tarefa cadastrada ainda. Clique em "+ Adicionar tarefa" para começar.'
    : visibleRows.length === 0
      ? 'Nenhuma tarefa encontrada com esses filtros.'
      : undefined;

  return (
    <div className="tab-page">
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => { clearError(); void refresh(); }}>Tentar novamente</button>
          <button className="error-banner-dismiss" onClick={clearError}>×</button>
        </div>
      )}

      {showLoading ? (
        <div className="app-loading">Carregando tarefas…</div>
      ) : (
        <>
          <div className="page-bar">
            <div className="tarefas-heading">
              <div className="tarefas-heading-title">Gestão de Tarefas</div>
              <div className="tarefas-heading-subtitle">Tarefas do time e mitigações dos riscos, no mesmo lugar. Tarefa livre prioriza pela Matriz GUT (Gravidade × Urgência × Tendência); mitigação herda a criticidade do risco.</div>
            </div>
            <div className="actions-row">
              <GutGuide />
              <button className="btn btn-ghost" onClick={() => downloadTasksCSV(visibleRows)}>↓ Exportar CSV</button>
              <button className="btn btn-navy" onClick={handleAddRow}>+ Adicionar tarefa</button>
            </div>
          </div>

          <TarefasKpiCards
            total={total}
            aFazer={aFazer}
            emAndamento={emAndamento}
            concluidas={concluidas}
            criticas={criticas}
            avaliacao={avaliacao}
            atrasadas={atrasadas}
          />

          <TarefasFilterBar
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onToggleStatus={handleToggleStatus}
            onClearStatus={() => setStatusFilter([])}
            tipoFilter={tipoFilter}
            onTipoFilterChange={setTipoFilter}
            tipoOptions={tipoOptions}
            view={view}
            onViewChange={setView}
            groupBy={groupBy}
            onGroupByChange={setGroupBy}
            visibleCount={visibleRows.length}
            totalCount={rows.length}
            vinculoFilter={vinculoFilter}
            onVinculoFilterChange={setVinculoFilter}
            vinculadasCount={vinculadas}
          />

          {view === 'kanban' ? (
            <TarefasKanban
              rows={visibleRows}
              groupBy={groupBy}
              onMove={handleMove}
              onOpen={handleOpenEdit}
              onToggleConcluida={handleToggleConcluida}
              onAdd={handleAddRow}
              onDraggingChange={d => { draggingRef.current = d; }}
            />
          ) : (
            <TarefasTable
              rows={visibleRows}
              colWidths={colWidths}
              onColWidthChange={handleColWidthChange}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={handleSort}
              onOpenEdit={handleOpenEdit}
              onToggleConcluida={handleToggleConcluida}
              onDeleteRow={handleDeleteRow}
              emptyMessage={emptyMessage}
            />
          )}
        </>
      )}

      {editingTask && (
        <TarefaEditModal
          key={editingTask.id}
          task={editingTask}
          taskId={editingTask.id}
          anexos={editingTask.anexos}
          saveStatus={saveStatus[editingTask.id]}
          onCommit={patch => handleCommitEdit(editingTask.id, patch)}
          onClose={handleCloseModal}
          onDelete={handleDeleteFromModal}
          onAddAnexo={file => addAttachment(editingTask.id, file)}
          onRemoveAnexo={anexoId => removeAttachment(editingTask.id, anexoId)}
          tipoOptions={tipoOptions}
          responsavelOptions={responsavelOptions}
          vinculo={editingRow?.vinculo ?? null}
          dono={editingRow?.dono ?? ''}
          onCommitDono={nome => { void handleCommitDono(editingTask.id, nome); }}
        />
      )}

      {pendingUndo && (
        <div className="undo-snackbar" role="status" aria-live="polite">
          <span>{pendingUndo.message}</span>
          <button className="undo-snackbar-action" onClick={handleUndoPriority}>Desfazer</button>
          <button className="undo-snackbar-dismiss" onClick={() => setPendingUndo(null)} aria-label="Fechar aviso">×</button>
        </div>
      )}
    </div>
  );
}
