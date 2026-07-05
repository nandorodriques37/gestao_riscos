import { useEffect, useRef, useState } from 'react';
import type { RiskRecord, StoredRiskRecord, Tab } from './types';
import { TopBar } from './components/TopBar/TopBar';
import { RegistroTab } from './components/RegistroTab/RegistroTab';
import { GraficosTab } from './components/GraficosTab/GraficosTab';
import { PriorizacaoTab } from './components/PriorizacaoTab/PriorizacaoTab';
import { EditModal } from './components/EditModal/EditModal';
import { AREAS, ROTINAS, CATEGORIAS, RECURSOS, RESPONSAVEIS } from './data/RiskData';
import { useRecords } from './hooks/useRecords';
import { downloadRecordsCSV } from './lib/csv';
import './App.css';

const POLL_INTERVAL = 15000;
const UNDO_TIMEOUT = 8000;

function App() {
  const [tab, setTab] = useState<Tab>('registro');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingUndo, setPendingUndo] = useState<Partial<RiskRecord> | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    records, loading, error,
    hasPendingWrites, saveStatus, updateRecordById, addRecord, deleteRecordById,
    restore, refresh, flushPending, clearError,
  } = useRecords();

  // Fecha o snackbar de "desfazer" quando o componente desmonta.
  useEffect(() => () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  }, []);

  function scheduleUndo(record: StoredRiskRecord) {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const { id: _id, ...data } = record;
    setPendingUndo(data);
    undoTimerRef.current = setTimeout(() => setPendingUndo(null), UNDO_TIMEOUT);
  }

  function handleUndoDelete() {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    if (pendingUndo) void addRecord(pendingUndo);
    setPendingUndo(null);
  }

  function dismissUndo() {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setPendingUndo(null);
  }

  // Fecha o modal com Escape (sincronizando o que estiver pendente).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setEditingId(null); void flushPending(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [flushPending]);

  // Mantém a matriz atualizada com o servidor (dados compartilhados pelo time),
  // sem atrapalhar quem está editando ou com gravações pendentes.
  useEffect(() => {
    const canSync = () => editingId == null && !hasPendingWrites();
    const interval = setInterval(() => { if (canSync()) void refresh(); }, POLL_INTERVAL);
    const onFocus = () => { if (canSync()) void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, [editingId, hasPendingWrites, refresh]);

  function handleOpenEdit(idx: number) {
    const rec = records[idx];
    if (rec) setEditingId(rec.id);
  }

  async function handleDeleteRow(idx: number) {
    const rec = records[idx];
    if (!rec) return;
    if (!window.confirm('Tem certeza que deseja excluir este registro?')) return;
    if (editingId === rec.id) setEditingId(null);
    const ok = await deleteRecordById(rec.id);
    if (ok) scheduleUndo(rec);
  }

  async function handleAddRow() {
    try {
      const created = await addRecord();
      setEditingId(created.id);
    } catch {
      // erro já sinalizado pelo hook (banner)
    }
  }

  async function handleResetData() {
    if (!window.confirm('Restaurar os dados originais? Todas as edições feitas aqui serão perdidas.')) return;
    setEditingId(null);
    try {
      await restore();
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
    if (!window.confirm('Tem certeza que deseja excluir este registro?')) return;
    const id = editingId;
    const rec = records.find(r => r.id === id);
    setEditingId(null);
    const ok = await deleteRecordById(id);
    if (ok && rec) scheduleUndo(rec);
  }

  const editingRecord = editingId != null ? records.find(r => r.id === editingId) ?? null : null;
  const showLoading = loading && records.length === 0;

  return (
    <div className="app-shell">
      <TopBar tab={tab} onChangeTab={setTab} />

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => { clearError(); void refresh(); }}>Tentar novamente</button>
          <button className="error-banner-dismiss" onClick={clearError}>×</button>
        </div>
      )}

      {showLoading ? (
        <div className="app-loading">Carregando matriz de risco…</div>
      ) : (
        <>
          {tab === 'registro' && (
            <RegistroTab
              records={records}
              onOpenEdit={handleOpenEdit}
              onDeleteRow={handleDeleteRow}
              onAddRow={handleAddRow}
              onResetData={handleResetData}
              onExportCSV={() => downloadRecordsCSV(records)}
              areaOptions={AREAS}
              categoriaOptions={CATEGORIAS}
            />
          )}

          {tab === 'graficos' && <GraficosTab records={records} />}

          {tab === 'priorizacao' && <PriorizacaoTab records={records} />}
        </>
      )}

      {editingRecord && (
        <EditModal
          record={editingRecord}
          saveStatus={saveStatus[editingRecord.id]}
          onUpdate={patch => updateRecordById(editingRecord.id, patch)}
          onClose={handleCloseModal}
          onDelete={handleDeleteFromModal}
          areaOptions={AREAS}
          rotinaOptions={ROTINAS}
          categoriaOptions={CATEGORIAS}
          recursoOptions={RECURSOS}
          responsavelOptions={RESPONSAVEIS}
        />
      )}

      {pendingUndo && (
        <div className="undo-snackbar" role="status" aria-live="polite">
          <span>Registro excluído.</span>
          <button className="undo-snackbar-action" onClick={handleUndoDelete}>Desfazer</button>
          <button className="undo-snackbar-dismiss" onClick={dismissUndo} aria-label="Fechar aviso">×</button>
        </div>
      )}
    </div>
  );
}

export default App;
