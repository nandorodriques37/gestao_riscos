import { useEffect, useState } from 'react';
import type { RiskRecord, Tab } from './types';
import { TopBar } from './components/TopBar/TopBar';
import { RegistroTab } from './components/RegistroTab/RegistroTab';
import { GraficosTab } from './components/GraficosTab/GraficosTab';
import { PriorizacaoTab } from './components/PriorizacaoTab/PriorizacaoTab';
import { EditModal } from './components/EditModal/EditModal';
import { AREAS, ROTINAS, CATEGORIAS, RECURSOS, RESPONSAVEIS } from './data/RiskData';
import { loadInitialRecords, cloneDefaults, persistRecords, clearPersistedRecords } from './lib/storage';
import { downloadRecordsCSV } from './lib/csv';
import './App.css';

function emptyRecord(): RiskRecord {
  return {
    area: '', rotina: '', categoria: '', risco: '', resposta: '',
    probab: null, impact: null, acoes: '', resultado: '',
    esforco: null, impacto2: null, gravidade: null,
    recurso: '', responsavel: '', status: '', obs: '',
  };
}

function App() {
  const [tab, setTab] = useState<Tab>('registro');
  const [records, setRecords] = useState<RiskRecord[]>(loadInitialRecords);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    persistRecords(records);
  }, [records]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditingIndex(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function updateRecord(idx: number, patch: Partial<RiskRecord>) {
    setRecords(prev => {
      const next = prev.slice();
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }

  function addRow() {
    setRecords(prev => {
      const next = [...prev, emptyRecord()];
      setEditingIndex(next.length - 1);
      return next;
    });
  }

  function deleteRow(idx: number) {
    if (!window.confirm('Tem certeza que deseja excluir este registro?')) return;
    setRecords(prev => prev.filter((_, i) => i !== idx));
    setEditingIndex(null);
  }

  function resetData() {
    if (!window.confirm('Restaurar os dados originais? Todas as edições feitas aqui serão perdidas.')) return;
    clearPersistedRecords();
    setRecords(cloneDefaults());
    setEditingIndex(null);
  }

  const editingRecord = editingIndex != null ? records[editingIndex] : null;

  return (
    <div className="app-shell">
      <TopBar tab={tab} onChangeTab={setTab} />

      {tab === 'registro' && (
        <RegistroTab
          records={records}
          onOpenEdit={setEditingIndex}
          onDeleteRow={deleteRow}
          onAddRow={addRow}
          onResetData={resetData}
          onExportCSV={() => downloadRecordsCSV(records)}
          areaOptions={AREAS}
          categoriaOptions={CATEGORIAS}
        />
      )}

      {tab === 'graficos' && <GraficosTab records={records} />}

      {tab === 'priorizacao' && <PriorizacaoTab records={records} />}

      {editingIndex != null && editingRecord && (
        <EditModal
          record={editingRecord}
          onUpdate={patch => updateRecord(editingIndex, patch)}
          onClose={() => setEditingIndex(null)}
          onDelete={() => deleteRow(editingIndex)}
          areaOptions={AREAS}
          rotinaOptions={ROTINAS}
          categoriaOptions={CATEGORIAS}
          recursoOptions={RECURSOS}
          responsavelOptions={RESPONSAVEIS}
        />
      )}
    </div>
  );
}

export default App;
