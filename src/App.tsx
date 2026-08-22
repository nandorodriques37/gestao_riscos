import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ModoRisco, RiskRecord, StoredRiskRecord, Tab } from './types';
import { TopBar } from './components/TopBar/TopBar';
import { NavRail } from './components/NavRail/NavRail';
import { PainelTab } from './components/PainelTab/PainelTab';
import { ObjetivosTab } from './components/ObjetivosTab/ObjetivosTab';
import { IniciativasTab } from './components/IniciativasTab/IniciativasTab';
import { RegistroTab } from './components/RegistroTab/RegistroTab';
import { RastroTab } from './components/RastroTab/RastroTab';
import { GraficosTab } from './components/GraficosTab/GraficosTab';
import { PriorizacaoTab } from './components/PriorizacaoTab/PriorizacaoTab';
import { TarefasTab } from './components/TarefasTab/TarefasTab';
import { PessoasTab } from './components/PessoasTab/PessoasTab';
import { TriagemTab } from './components/TriagemTab/TriagemTab';
import { EditModal } from './components/EditModal/EditModal';
import { ModoRiscoToggle } from './components/common/ModoRiscoToggle';
import { PromoverAcaoModal } from './components/RegistroTab/PromoverAcaoModal';
import { prontosParaFechar } from './lib/portfolioMetrics';
import type { AcaoRisco } from './types';
import { AREAS, ROTINAS, CATEGORIAS, RECURSOS, RESPONSAVEIS } from './data/RiskData';
import { useRecords } from './hooks/useRecords';
import { usePortfolio } from './hooks/usePortfolio';
import { downloadRecordsCSV } from './lib/csv';
import { readRailExpandido, writeRailExpandido, trocarComTransicao } from './lib/uiPrefs';
import './App.css';

const POLL_INTERVAL = 15000;
const UNDO_TIMEOUT = 8000;

function App() {
  const [tab, setTab] = useState<Tab>('painel');
  const [railExpandido, setRailExpandido] = useState(readRailExpandido);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Os dois modos de leitura do registro de risco. Não é destino de menu.
  const [modoRisco, setModoRisco] = useState<ModoRisco>('tabela');
  // Vive no App para o Painel e os Objetivos conseguirem abrir uma iniciativa.
  const [iniciativaSel, setIniciativaSel] = useState<string | null>(null);
  // Promoção de uma mitigação a iniciativa. Fica aqui, e não dentro do
  // EditModal, porque dois diálogos empilhados brigariam pelo foco.
  const [promovendo, setPromovendo] = useState<AcaoRisco | null>(null);
  const [pendingUndo, setPendingUndo] = useState<Partial<RiskRecord> | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    records, loading, error,
    hasPendingWrites, saveStatus, updateRecordById, addRecord, deleteRecordById,
    refresh, flushPending, clearError,
  } = useRecords();

  // Fica no App porque decide se a aba Triagem aparece — e porque duas
  // instâncias do mesmo estado dariam duas verdades sobre a mesma fila.
  const pf = usePortfolio();
  const triagemPendente = pf.portfolio.acoes_risco.filter(a => !a.triagem).length;
  // Promoção pendente também segura a aba: sem isso ela sumiria assim que a
  // fila esvaziasse, e o botão de promover ficaria inalcançável.
  const promocaoPendente = pf.portfolio.acoes_risco
    .filter(a => a.triagem === 'iniciativa' && !a.iniciativa_id).length;
  const migracaoIniciada = pf.portfolio.acoes_risco.length > 0;
  // Uma regra só, lida pelo rail e pela barra do topo: a Triagem é aba de
  // mudança, fica enquanto há trabalho e some sozinha quando a migração acaba.
  const mostrarTriagem = tab === 'triagem'
    || !migracaoIniciada
    || triagemPendente > 0
    || promocaoPendente > 0;

  // Espelha o estado do rail no <html> já na primeira pintura: o grid do shell
  // precisa saber a largura antes de o rail montar, senão o conteúdo salta.
  useEffect(() => { writeRailExpandido(railExpandido); }, [railExpandido]);

  /** Troca de seção com cross-fade onde o navegador suportar. */
  const irPara = useCallback((destino: Tab) => {
    trocarComTransicao(() => setTab(destino));
  }, []);

  /** Abre uma iniciativa vinda de outra tela (Painel, Objetivos, Rastro). */
  const abrirIniciativa = useCallback((id: string) => {
    setIniciativaSel(id);
    irPara('iniciativas');
  }, [irPara]);

  /** Abre o modal de um risco vindo de outra tela. */
  const abrirRisco = useCallback((id: string) => {
    irPara('registro');
    setEditingId(id);
  }, [irPara]);

  // Riscos com tratamento entregue esperando confirmação. Fica no App porque
  // alimenta o contador do alternador de modo, que aparece nas duas leituras.
  const prontos = useMemo(
    () => prontosParaFechar(records, pf.portfolio.acoes_risco, pf.portfolio.iniciativas),
    [records, pf.portfolio.acoes_risco, pf.portfolio.iniciativas],
  );

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

  function handleCloseModal() {
    setEditingId(null);
  }

  // Grava o rascunho do modal imediatamente: estaciona o patch e força o flush
  // num único PATCH, reutilizando saveStatus/conflito/retry do hook.
  function handleCommitEdit(id: string, patch: Partial<RiskRecord>) {
    updateRecordById(id, patch);
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

  // Resumo do estado de gravação para o header. O detalhe por registro continua
  // no modal; aqui interessa só se o time está vendo dados sincronizados.
  const sync = (() => {
    if (tab === 'tarefas') return undefined;
    const statuses = Object.values(saveStatus);
    if (error || statuses.includes('error') || statuses.includes('conflict')) {
      return { state: 'error' as const, label: 'Falha ao sincronizar' };
    }
    if (loading || statuses.includes('saving')) {
      return { state: 'saving' as const, label: 'Salvando…' };
    }
    return { state: 'idle' as const, label: 'Sincronizado' };
  })();

  return (
    <div className="app-shell">
      <TopBar
        tab={tab}
        onChangeTab={irPara}
        sync={sync}
        triagemPendente={triagemPendente}
        promocaoPendente={promocaoPendente}
        migracaoIniciada={migracaoIniciada}
      />

      <NavRail
        tab={tab}
        onChangeTab={irPara}
        expandido={railExpandido}
        onToggle={() => setRailExpandido(v => !v)}
        mostrarTriagem={mostrarTriagem}
        triagemPendente={triagemPendente}
      />

      <div className="app-conteudo">
      {tab !== 'tarefas' && error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => { clearError(); void refresh(); }}>Tentar novamente</button>
          <button className="error-banner-dismiss" onClick={clearError}>×</button>
        </div>
      )}

      {tab !== 'tarefas' && showLoading ? (
        <div className="app-loading" role="status" aria-label="Carregando matriz de risco…">
          <div className="skeleton-kpis">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton-kpi" />)}
          </div>
          <div className="skeleton-table">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton-row" />)}
          </div>
        </div>
      ) : (
        <>
          {tab === 'painel' && (
            <PainelTab
              records={records}
              pf={pf}
              onIrPara={irPara}
              onAbrirIniciativa={abrirIniciativa}
            />
          )}

          {tab === 'objetivos' && (
            <ObjetivosTab pf={pf} onIrPara={irPara} onAbrirIniciativa={abrirIniciativa} />
          )}

          {tab === 'iniciativas' && (
            <IniciativasTab
              riscos={records}
              pf={pf}
              selecionada={iniciativaSel}
              onSelecionar={setIniciativaSel}
              onAbrirRisco={abrirRisco}
            />
          )}

          {tab === 'registro' && modoRisco === 'tabela' && (
            <RegistroTab
              records={records}
              onOpenEdit={handleOpenEdit}
              onDeleteRow={handleDeleteRow}
              onAddRow={handleAddRow}
              onExportCSV={() => downloadRecordsCSV(records)}
              areaOptions={AREAS}
              categoriaOptions={CATEGORIAS}
              modoToggle={
                <ModoRiscoToggle modo={modoRisco} onChange={setModoRisco} pendentes={prontos.length} />
              }
            />
          )}

          {tab === 'registro' && modoRisco === 'rastro' && (
            <RastroTab
              records={records}
              pf={pf}
              onAtualizarRisco={handleCommitEdit}
              onAbrirRisco={abrirRisco}
              onAbrirIniciativa={abrirIniciativa}
              onPromoverAcao={setPromovendo}
              onIrPara={irPara}
              cabecalho={
                <div className="page-bar">
                  <div>
                    <div className="page-title">Rastro de mitigação</div>
                    <div className="page-subtitle">
                      Os mesmos riscos, lidos pelo tratamento: o que foi feito, onde foi feito
                      e o que já pode ser fechado
                    </div>
                  </div>
                  <div className="actions-row">
                    <ModoRiscoToggle modo={modoRisco} onChange={setModoRisco} pendentes={prontos.length} />
                  </div>
                </div>
              }
            />
          )}

          {tab === 'graficos' && <GraficosTab records={records} />}

          {tab === 'priorizacao' && (
            <PriorizacaoTab
              records={records}
              iniciativas={pf.portfolio.iniciativas}
              objetivos={pf.portfolio.objetivos}
              pessoas={pf.portfolio.pessoas}
              onAbrirIniciativa={abrirIniciativa}
            />
          )}

          {tab === 'tarefas' && <TarefasTab />}

          {tab === 'pessoas' && <PessoasTab pf={pf} onIrPara={irPara} />}

          {tab === 'triagem' && <TriagemTab records={records} pf={pf} />}
        </>
      )}
      </div>

      {editingRecord && (
        <EditModal
          key={editingRecord.id}
          record={editingRecord}
          saveStatus={saveStatus[editingRecord.id]}
          onCommit={patch => handleCommitEdit(editingRecord.id, patch)}
          onClose={handleCloseModal}
          onDelete={handleDeleteFromModal}
          areaOptions={AREAS}
          rotinaOptions={ROTINAS}
          categoriaOptions={CATEGORIAS}
          recursoOptions={RECURSOS}
          responsavelOptions={RESPONSAVEIS}
          acoesVinculadas={pf.portfolio.acoes_risco.filter(a => a.risco_id === editingRecord.id)}
          pessoas={pf.portfolio.pessoas}
          iniciativas={pf.portfolio.iniciativas}
          onAbrirIniciativa={id => { setEditingId(null); abrirIniciativa(id); }}
          onPromoverAcao={id => {
            const acao = pf.portfolio.acoes_risco.find(a => a.id === id);
            if (!acao) return;
            setEditingId(null);
            setPromovendo(acao);
          }}
          onSalvarPlano={(base, atual) => pf.salvarPlanoDeAcao(editingRecord.id, base, atual)}
        />
      )}

      {promovendo && (
        <PromoverAcaoModal
          acao={promovendo}
          risco={records.find(r => r.id === promovendo.risco_id) ?? null}
          objetivos={pf.portfolio.objetivos}
          pf={pf}
          onClose={() => setPromovendo(null)}
          onPromovida={id => { setPromovendo(null); abrirIniciativa(id); }}
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
