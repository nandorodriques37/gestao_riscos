import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ModoRisco, RiskRecord, StoredRiskRecord, Tab } from './types';
import { MODOS_RISCO } from './types';
import { TopBar } from './components/TopBar/TopBar';
import { NavRail } from './components/NavRail/NavRail';
import { NavBottom } from './components/NavBottom/NavBottom';
const PainelTab = lazy(() => import('./components/PainelTab/PainelTab').then(m => ({ default: m.PainelTab })));
const ObjetivosTab = lazy(() => import('./components/ObjetivosTab/ObjetivosTab').then(m => ({ default: m.ObjetivosTab })));
const IniciativasTab = lazy(() => import('./components/IniciativasTab/IniciativasTab').then(m => ({ default: m.IniciativasTab })));
const RegistroTab = lazy(() => import('./components/RegistroTab/RegistroTab').then(m => ({ default: m.RegistroTab })));
const RastroTab = lazy(() => import('./components/RastroTab/RastroTab').then(m => ({ default: m.RastroTab })));
const GraficosTab = lazy(() => import('./components/GraficosTab/GraficosTab').then(m => ({ default: m.GraficosTab })));
const PriorizacaoTab = lazy(() => import('./components/PriorizacaoTab/PriorizacaoTab').then(m => ({ default: m.PriorizacaoTab })));
const TarefasTab = lazy(() => import('./components/TarefasTab/TarefasTab').then(m => ({ default: m.TarefasTab })));
const PessoasTab = lazy(() => import('./components/PessoasTab/PessoasTab').then(m => ({ default: m.PessoasTab })));
const TriagemTab = lazy(() => import('./components/TriagemTab/TriagemTab').then(m => ({ default: m.TriagemTab })));
import { EditModal } from './components/EditModal/EditModal';
import { ModoRiscoToggle } from './components/common/ModoRiscoToggle';
import { PromoverAcaoModal } from './components/RegistroTab/PromoverAcaoModal';
import { prontosParaFechar, cadeiaQuebrada } from './lib/portfolioMetrics';
import { useAppNavigation } from './hooks/useAppNavigation';
import { canNavigate, readRoute } from './lib/navigation';
import { AREAS, ROTINAS, CATEGORIAS, RECURSOS, RESPONSAVEIS } from './data/RiskData';
import { useRecords } from './hooks/useRecords';
import { useTasks } from './hooks/useTasks';
import { usePortfolio } from './hooks/usePortfolio';
import { downloadRecordsCSV } from './lib/csv';
import {
  readRailExpandido, writeRailExpandido, trocarComTransicao, readEnumPref, writePref,
  applyThemePref, readThemePref, type ThemePref,
} from './lib/uiPrefs';
import { lerAutor, gravarAutor } from './lib/autor';
import './App.css';

const POLL_INTERVAL = 15000;
const UNDO_TIMEOUT = 8000;
const MODO_RISCO_KEY = 'riskMatrix.modoRisco.v1';

const THEME_CYCLE: ThemePref[] = ['system', 'light', 'dark'];
const THEME_LABEL: Record<ThemePref, string> = {
  system: 'Tema: seguindo o sistema',
  light: 'Tema: claro',
  dark: 'Tema: escuro',
};

function App() {
  const { route, navigate } = useAppNavigation();
  const tab = route.tab;
  const editingId = route.risco;
  const iniciativaSel = route.iniciativa;
  const setEditingId = (id: string | null) => navigate({ ...route, risco: id });
  const setIniciativaSel = (id: string | null) => navigate({ ...route, iniciativa: id });
  const [railExpandido, setRailExpandido] = useState(readRailExpandido);
  // As três leituras do registro de risco. Não é destino de menu — e é
  // persistida como as outras preferências de aba: quem trabalha no rastro ou
  // na análise não quer voltar para a tabela a cada recarga.
  const [modoRisco, setModoRisco] = useState<ModoRisco>(
    () => readEnumPref(MODO_RISCO_KEY, MODOS_RISCO, 'tabela'),
  );
  // Vive no App para o Painel e os Objetivos conseguirem abrir uma iniciativa.
  // Promoção de uma mitigação a iniciativa. Fica aqui, e não dentro do
  // EditModal, porque dois diálogos empilhados brigariam pelo foco.
  const [promovendoId, setPromovendoId] = useState<string | null>(null);
  const [pendingUndo, setPendingUndo] = useState<Partial<RiskRecord> | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tema e identidade autodeclarada. Moravam dentro do `TopBar`; subiram porque
  // abaixo de 760px o header perde as abas para a barra inferior e os dois
  // passam a aparecer TAMBÉM na folha "Mais". Um `useState` em cada componente
  // daria duas verdades sobre o mesmo tema.
  const [theme, setTheme] = useState<ThemePref>(readThemePref);
  const [autor, setAutor] = useState(lerAutor);

  useEffect(() => { applyThemePref(theme); }, [theme]);

  const cycleTheme = useCallback(() => {
    setTheme(t => THEME_CYCLE[(THEME_CYCLE.indexOf(t) + 1) % THEME_CYCLE.length]);
  }, []);

  /**
   * O nome vai junto de cada gravação e aparece no histórico. Não autentica
   * ninguém — e o texto do prompt diz isso, para ninguém confundir a trilha com
   * controle de acesso.
   */
  const pedirNome = useCallback(() => {
    const novo = window.prompt(
      'Seu nome aparece no histórico de quem alterou o quê.\n\n'
      + 'Isto não é login: qualquer pessoa com acesso ao app pode digitar qualquer nome.',
      lerAutor(),
    );
    if (novo === null) return;
    gravarAutor(novo);
    setAutor(novo.trim());
  }, []);

  const {
    records, loading, error,
    hasPendingWrites, saveStatus, saveRecord, acceptRecord, addRecord, deleteRecordById,
    refresh, clearError,
  } = useRecords();

  // Fica no App porque decide se a aba Triagem aparece — e porque duas
  // instâncias do mesmo estado dariam duas verdades sobre a mesma fila.
  const pf = usePortfolio();
  const promovendo = pf.portfolio.acoes_risco.find(a => a.id === promovendoId) ?? null;

  // Mesmo argumento: o quadro era dono de `useTasks`, e por isso o Painel não
  // conseguia contar tarefa nenhuma — a aba Tarefas não está montada quando o
  // Painel está. Uma instância só, aqui, e as duas telas leem a mesma lista.
  const tarefas = useTasks();
  const idsDoRecorte = useMemo(() => {
    if (!route.recorte) return null;
    const lacunas = cadeiaQuebrada({ ...pf.portfolio, riscos: records, acoes: pf.portfolio.acoes_risco, trabalho: tarefas.tasks });
    return new Set(lacunas.find(l => l.chave === route.recorte)?.ids ?? []);
  }, [route.recorte, records, pf.portfolio, tarefas.tasks]);
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

  useEffect(() => { writePref(MODO_RISCO_KEY, modoRisco); }, [modoRisco]);

  /** Troca de seção com cross-fade onde o navegador suportar. */
  const irPara = useCallback((destino: Tab, recorte?: string) => {
    if (!canNavigate()) return;
    if (destino === 'registro' && recorte) setModoRisco('tabela');
    trocarComTransicao(() => navigate({ ...readRoute(''), tab: destino, recorte: recorte ?? null }));
  }, [navigate]);
  const abrirIniciativa = useCallback((id: string) => navigate({ ...readRoute(''), tab: 'iniciativas', iniciativa: id }), [navigate]);
  const abrirRisco = useCallback((id: string) => navigate({ ...route, risco: id }), [navigate, route]);

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
  //
  // As tarefas entram no mesmo relógio, mas SÓ fora da aba Tarefas: lá dentro
  // quem sincroniza é o próprio quadro, que sabe se há um arraste ou um modal
  // aberto. Dois relógios sobre a mesma lista embaralhariam os cards.
  const tarefasRefresh = tarefas.refresh;
  const tarefasPendentes = tarefas.hasPendingWrites;
  const foraDoQuadro = tab !== 'tarefas';
  const portfolioRefresh = pf.refresh;
  useEffect(() => {
    const canSync = () => !document.hidden && !hasPendingWrites();
    const sync = () => {
      if (!canSync()) return;
      void refresh();
      void portfolioRefresh();
      if (foraDoQuadro && !tarefasPendentes()) void tarefasRefresh();
    };
    const interval = setInterval(sync, POLL_INTERVAL);
    window.addEventListener('focus', sync);
    return () => { clearInterval(interval); window.removeEventListener('focus', sync); };
  }, [hasPendingWrites, refresh, portfolioRefresh, foraDoQuadro, tarefasRefresh, tarefasPendentes]);

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
    return saveRecord(id, patch);
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

  /**
   * Cabeçalho das leituras do risco que não trazem o seu. A tabela monta o
   * dela (tem os botões de exportar e adicionar); o rastro e a análise
   * recebem este, para as três terem a mesma barra e o mesmo alternador —
   * antes a análise era uma aba que começava direto num filtro, sem título.
   */
  function cabecalhoRisco(titulo: string, subtitulo: string) {
    return (
      <div className="page-bar">
        <div>
          <div className="page-title">{titulo}</div>
          <div className="page-subtitle">{subtitulo}</div>
        </div>
        <div className="actions-row">
          <ModoRiscoToggle modo={modoRisco} onChange={setModoRisco} pendentes={prontos.length} />
        </div>
      </div>
    );
  }

  // Resumo do estado de gravação para o header. O detalhe por registro continua
  // no modal; aqui interessa só se o time está vendo dados sincronizados.
  const sync = (() => {
    if (tab === 'tarefas') return undefined;
    const statuses = [...Object.values(saveStatus), ...Object.values(tarefas.saveStatus)];
    if (error || pf.error || tarefas.error || statuses.includes('error') || statuses.includes('conflict')) {
      return { state: 'error' as const, label: 'Falha ao sincronizar' };
    }
    if (loading || tarefas.loading || pf.loading || pf.saving || statuses.includes('saving')) {
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
        mostrarTriagem={mostrarTriagem}
        triagemPendente={triagemPendente}
        autor={autor}
        onPedirNome={pedirNome}
        theme={theme}
        onCycleTheme={cycleTheme}
        themeLabel={THEME_LABEL[theme]}
      />

      <NavRail
        tab={tab}
        onChangeTab={irPara}
        expandido={railExpandido}
        onToggle={() => setRailExpandido(v => !v)}
        mostrarTriagem={mostrarTriagem}
        triagemPendente={triagemPendente}
      />

      {/* As três formas de navegação ficam no DOM ao mesmo tempo; quem aparece
          em cada faixa é decidido em styles/rail.css, num lugar só. */}
      <NavBottom
        tab={tab}
        onChangeTab={irPara}
        mostrarTriagem={mostrarTriagem}
        triagemPendente={triagemPendente}
        autor={autor}
        onPedirNome={pedirNome}
        theme={theme}
        onCycleTheme={cycleTheme}
        themeLabel={THEME_LABEL[theme]}
      />

      <div className="app-conteudo">
      {route.recorte && <div className="context-banner" role="status"><span>Itens que precisam de atenção: {idsDoRecorte?.size ?? 0}</span><button className="btn btn-ghost" onClick={() => navigate({ ...route, recorte: null }, true)}>Limpar recorte</button></div>}
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
        <Suspense fallback={<div className="app-loading" role="status">Carregando seção…</div>}>
          {tab === 'painel' && (
            <PainelTab
              records={records}
              pf={pf}
              tarefas={tarefas.tasks}
              onIrPara={irPara}
              onAbrirIniciativa={abrirIniciativa}
              onAbrirRisco={abrirRisco}
            />
          )}

          {tab === 'objetivos' && (
            <ObjetivosTab idsDoRecorte={idsDoRecorte} onCriarIniciativa={objetivo => navigate({ ...readRoute(''), tab: 'iniciativas', objetivo })}
              riscos={records}
              pf={pf}
              onIrPara={irPara}
              onAbrirIniciativa={abrirIniciativa}
              onAbrirRisco={abrirRisco}
            />
          )}

          {tab === 'iniciativas' && (
            <IniciativasTab
              riscos={records}
              pf={pf}
              selecionada={iniciativaSel}
              onSelecionar={setIniciativaSel} idsDoRecorte={idsDoRecorte} novoObjetivoId={route.objetivo}
              onNovaIniciativaFechada={() => navigate({ ...route, objetivo: null }, true)}
              onAbrirRisco={abrirRisco}
            />
          )}

          {tab === 'registro' && modoRisco === 'tabela' && (
            <RegistroTab idsDoRecorte={idsDoRecorte}
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
              onPromoverAcao={acao => setPromovendoId(acao.id)}
              onIrPara={irPara}
              cabecalho={cabecalhoRisco(
                'Rastro de mitigação',
                'Os mesmos riscos, lidos pelo tratamento: o que foi feito, onde foi feito '
                + 'e o que já pode ser fechado',
              )}
            />
          )}

          {tab === 'registro' && modoRisco === 'analise' && (
            <GraficosTab
              records={records}
              cabecalho={cabecalhoRisco(
                'Análise de riscos',
                'Os mesmos riscos, lidos pela distribuição: onde a exposição se concentra '
                + 'por probabilidade, impacto, área, rotina e recurso',
              )}
            />
          )}

          {tab === 'priorizacao' && (
            <PriorizacaoTab
              records={records}
              iniciativas={pf.portfolio.iniciativas}
              objetivos={pf.portfolio.objetivos}
              pessoas={pf.portfolio.pessoas}
              onAbrirIniciativa={abrirIniciativa}
            />
          )}

          {tab === 'tarefas' && <TarefasTab records={records} pf={pf} tarefas={tarefas} idsDoRecorte={idsDoRecorte} selecionada={route.tarefa} onSelecionar={id => navigate({ ...route, tarefa: id })} />}

          {tab === 'pessoas' && <PessoasTab pf={pf} onIrPara={irPara} />}

          {tab === 'triagem' && <TriagemTab records={records} pf={pf} />}
        </Suspense>
      )}
      </div>

      {editingRecord && !promovendoId && (
        <EditModal
          key={editingRecord.id}
          record={editingRecord}
          saveStatus={saveStatus[editingRecord.id]}
          onCommit={async pedido => { const salvo = await pf.salvarRisco(pedido); if (salvo) acceptRecord(salvo.record); return salvo; }}
          error={pf.error} objetivos={pf.portfolio.objetivos}
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
          onAbrirIniciativa={abrirIniciativa}
          onPromoverAcao={setPromovendoId}
        />
      )}

      {promovendo && (
        <PromoverAcaoModal
          acao={promovendo}
          risco={records.find(r => r.id === promovendo.risco_id) ?? null}
          objetivos={pf.portfolio.objetivos}
          pf={pf}
          onClose={() => setPromovendoId(null)}
          onPromovida={id => { setPromovendoId(null); abrirIniciativa(id); }}
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
