import { useEffect, useMemo, useState } from 'react';
import type { TaskStatusFilterValue, TaskSortKey } from '../../types';
import { useTasks } from '../../hooks/useTasks';
import { buildTaskRows, type EnrichedTaskRow } from '../../lib/taskRows';
import { computeAvaliacao } from '../../lib/taskCalculations';
import { downloadTasksCSV } from '../../lib/taskCsv';
import { TarefasKpiCards } from './TarefasKpiCards';
import { TarefasFilterBar } from './TarefasFilterBar';
import { TarefasTable } from './TarefasTable';
import { TarefaEditModal } from './TarefaEditModal';
import { GutGuide } from './GutGuide';

const POLL_INTERVAL = 15000;

function sortValue(row: EnrichedTaskRow, key: TaskSortKey): number | null {
  if (key === 'gut') return row.gut;
  if (key === 'g') return row.task.g;
  if (key === 'u') return row.task.u;
  if (key === 't') return row.task.t;
  return null;
}

export function TarefasTab() {
  const {
    tasks, loading, error,
    hasPendingWrites, saveStatus, updateTaskById, addTask, deleteTaskById,
    refresh, flushPending, clearError,
  } = useTasks();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilterValue>('Todos');
  const [tipoFilter, setTipoFilter] = useState('Todos');
  const [sortKey, setSortKey] = useState<TaskSortKey>('gut');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setEditingId(null); void flushPending(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flushPending]);

  useEffect(() => {
    const canSync = () => editingId == null && !hasPendingWrites();
    const interval = setInterval(() => { if (canSync()) void refresh(); }, POLL_INTERVAL);
    const onFocus = () => { if (canSync()) void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, [editingId, hasPendingWrites, refresh]);

  const rows = useMemo(() => buildTaskRows(tasks), [tasks]);

  const tipoOptions = useMemo(() => [...new Set(tasks.map(t => t.tipo).filter(Boolean))], [tasks]);
  const responsavelOptions = useMemo(() => [...new Set(tasks.map(t => t.responsavel).filter(Boolean))], [tasks]);

  const total = tasks.length;
  const aFazer = useMemo(() => rows.filter(r => r.normSt === 'A fazer').length, [rows]);
  const emAndamento = useMemo(() => rows.filter(r => r.normSt === 'Em andamento').length, [rows]);
  const concluidas = useMemo(() => rows.filter(r => r.normSt === 'Concluída').length, [rows]);
  const criticas = useMemo(() => rows.filter(r => r.gut != null && r.gut >= 100).length, [rows]);
  const avaliacao = useMemo(() => computeAvaliacao(tasks), [tasks]);

  const visibleRows = useMemo(() => {
    const q = search.toLowerCase().trim();
    let result = rows.filter(row => {
      if (statusFilter !== 'Todos' && row.normSt !== statusFilter) return false;
      if (tipoFilter !== 'Todos' && row.task.tipo !== tipoFilter) return false;
      if (!q) return true;
      const hay = [row.task.tipo, row.task.tarefa, row.task.detalhes, row.task.responsavel, row.task.obs]
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
  }, [rows, search, statusFilter, tipoFilter, sortKey, sortDir]);

  function handleSort(key: NonNullable<TaskSortKey>) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function handleOpenEdit(idx: number) {
    const t = tasks[idx];
    if (t) setEditingId(t.id);
  }

  async function handleDeleteRow(idx: number) {
    const t = tasks[idx];
    if (!t) return;
    if (!window.confirm('Tem certeza que deseja excluir esta tarefa?')) return;
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
    void flushPending();
  }

  async function handleDeleteFromModal() {
    if (!editingId) return;
    if (!window.confirm('Tem certeza que deseja excluir esta tarefa?')) return;
    const id = editingId;
    setEditingId(null);
    await deleteTaskById(id);
  }

  const editingTask = editingId != null ? tasks.find(t => t.id === editingId) ?? null : null;
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
          <div className="tarefas-heading">
            <div className="tarefas-heading-title">Gestão de Tarefas</div>
            <div className="tarefas-heading-subtitle">Priorização do dia a dia pela Matriz GUT (Gravidade × Urgência × Tendência)</div>
          </div>

          <div className="toolbar-row">
            <TarefasKpiCards
              total={total}
              aFazer={aFazer}
              emAndamento={emAndamento}
              concluidas={concluidas}
              criticas={criticas}
              avaliacao={avaliacao}
            />
            <div className="actions-row">
              <GutGuide />
              <button className="btn btn-outline-navy" onClick={() => downloadTasksCSV(tasks)}>↓ Exportar CSV</button>
              <button className="btn btn-navy" onClick={handleAddRow}>+ Adicionar tarefa</button>
            </div>
          </div>

          <TarefasFilterBar
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            tipoFilter={tipoFilter}
            onTipoFilterChange={setTipoFilter}
            tipoOptions={tipoOptions}
            visibleCount={visibleRows.length}
            totalCount={rows.length}
          />

          <TarefasTable
            rows={visibleRows}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={handleSort}
            onOpenEdit={handleOpenEdit}
            onDeleteRow={handleDeleteRow}
            emptyMessage={emptyMessage}
          />
        </>
      )}

      {editingTask && (
        <TarefaEditModal
          task={editingTask}
          saveStatus={saveStatus[editingTask.id]}
          onUpdate={patch => updateTaskById(editingTask.id, patch)}
          onClose={handleCloseModal}
          onDelete={handleDeleteFromModal}
          tipoOptions={tipoOptions}
          responsavelOptions={responsavelOptions}
        />
      )}
    </div>
  );
}
