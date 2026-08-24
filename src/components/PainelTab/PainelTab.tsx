import { useMemo, useState } from 'react';
import type { StoredRiskRecord, StoredTask, Tab } from '../../types';
import { FONTES_INICIATIVA, VETORES } from '../../types';
import type { UsePortfolio } from '../../hooks/usePortfolio';
import {
  impactoComprometido, marcosNoPrazo, slipMedio, wipPorDono, cargaPorPessoa,
  zumbis, mixPorVetor, portfolioPorOrigem, fonteVsVetor,
  tratamentoDosRiscos, exposicaoResidual,
  saudeObjetivos, saudeIniciativas, saudeRiscos, saudeTrabalho, cadeiaQuebrada,
  hojeISO, periodoDe, LIMITE_WIP, DIAS_PARA_ZUMBI, LIMITE_DEFENSIVO,
  type ChaveLacuna, type EstadoTratamento,
} from '../../lib/portfolioMetrics';
import {
  ROTULO_VETOR, ROTULO_FONTE, formatarMoeda, formatarMoedaCheia,
  formatarNumero, formatarPct, nomeRisco, plural,
} from '../../lib/portfolioLabels';
import { LACUNAS, OBJETIVO_BALDE } from '../../lib/portfolioUi';
import { ROTULO_TIER } from '../../lib/calculations';
import { baixarPortfolioCSV, baixarBackup } from '../../lib/portfolioCsv';
import { EmptyState } from '../common/EmptyState';
import { Composicao, type Fatia } from '../common/Composicao';
import { Historico } from '../common/Historico';

interface PainelTabProps {
  records: StoredRiskRecord[];
  pf: UsePortfolio;
  /**
   * Tarefas livres E mitigações — são a mesma tabela. Vêm do `App`, que passou
   * a ser dono do `useTasks`: sem isso o Painel não conseguia responder
   * "quantas ações eu tenho", porque a aba Tarefas não está montada aqui.
   */
  tarefas: StoredTask[];
  onIrPara: (tab: Tab) => void;
  onAbrirIniciativa: (id: string) => void;
  onAbrirRisco: (id: string) => void;
}

/** Rótulo e ordem dos estados de tratamento. A ordem é a da leitura, não do enum. */
const ESTADOS: { estado: EstadoTratamento; label: string }[] = [
  { estado: 'tratamento_concluido', label: 'Tratamento entregue' },
  { estado: 'em_tratamento', label: 'Em tratamento' },
  { estado: 'aceito', label: 'Aceito' },
  { estado: 'sem_tratamento', label: 'Sem tratamento' },
];

/** Série de cor do estado no gráfico empilhado — casa com `portfolio.css`. */
const SERIE_ESTADO: Record<EstadoTratamento, string> = {
  tratamento_concluido: 'mitigado',
  em_tratamento: 'em_tratamento',
  aceito: 'aceito',
  sem_tratamento: 'sem_tratamento',
};

/**
 * Série de cor do status do quadro. A chave é o status JÁ NORMALIZADO por
 * `normTaskStatus`, que é o que `saudeTrabalho` devolve — status legado fora do
 * vocabulário cai no cinza de ausência em vez de sumir da barra.
 */
const SERIE_TRABALHO: Record<string, string> = {
  'A fazer': 'a_fazer',
  'Em andamento': 'em_andamento',
  'Concluída': 'concluida',
  'Cancelada': 'cancelada',
};

/**
 * Um elo da cadeia: a camada, quanto dela existe, quanto dela terminou e a
 * composição por estado. Os quatro juntos são as quatro perguntas que o Painel
 * precisava responder e não respondia.
 */
interface EloProps {
  rotulo: string;
  valor: number;
  /** O que o número grande conta, em uma palavra. */
  unidade: string;
  /** O número que fecha a pergunta "quantos eu terminei". */
  feito: { n: number; label: string };
  fatias: Fatia[];
  vazio: string;
  destino: Tab;
  onIrPara: (tab: Tab) => void;
}

function Elo({ rotulo, valor, unidade, feito, fatias, vazio, destino, onIrPara }: EloProps) {
  return (
    <button type="button" className="cadeia-elo" onClick={() => onIrPara(destino)}>
      <span className="cadeia-rotulo">{rotulo}</span>
      <span className="cadeia-numeros">
        <span className="cadeia-valor">{valor}</span>
        <span className="cadeia-unidade">{unidade}</span>
      </span>
      <span className="cadeia-feito">
        <strong className="tabular">{feito.n}</strong> {feito.label}
      </span>
      <Composicao fatias={fatias} vazio={vazio} />
    </button>
  );
}

/**
 * Painel de direção. Cada tile responde a uma pergunta que muda uma decisão;
 * nenhum é decorativo. O tamanho do tile é a prioridade do dado.
 */
export function PainelTab({
  records, pf, tarefas, onIrPara, onAbrirIniciativa, onAbrirRisco,
}: PainelTabProps) {
  const { portfolio, loading } = pf;
  const { objetivos, iniciativas, marcos, medicoes, acoes_risco, pessoas } = portfolio;
  const [baixando, setBaixando] = useState(false);
  const [erroBackup, setErroBackup] = useState<string | null>(null);

  async function handleBackup() {
    setBaixando(true);
    setErroBackup(null);
    try {
      await baixarBackup();
    } catch (e) {
      setErroBackup(e instanceof Error ? e.message : 'Falha ao gerar o backup.');
    } finally {
      setBaixando(false);
    }
  }

  const hoje = useMemo(() => new Date(), []);
  const hojeStr = hojeISO(hoje);
  const ano = Number(hojeStr.slice(0, 4));

  const impacto = useMemo(() => impactoComprometido(iniciativas, objetivos), [iniciativas, objetivos]);
  const prazo = useMemo(() => marcosNoPrazo(marcos, hoje), [marcos, hoje]);
  const slip = useMemo(() => slipMedio(marcos), [marcos]);
  const wip = useMemo(() => wipPorDono(iniciativas, pessoas), [iniciativas, pessoas]);
  const carga = useMemo(
    () => cargaPorPessoa(iniciativas, pessoas, periodoDe(hojeStr)),
    [iniciativas, pessoas, hojeStr],
  );
  const parados = useMemo(() => zumbis(iniciativas, marcos, hoje), [iniciativas, marcos, hoje]);
  const mix = useMemo(() => mixPorVetor(iniciativas), [iniciativas]);
  const origem = useMemo(() => portfolioPorOrigem(iniciativas), [iniciativas]);
  const matriz = useMemo(() => fonteVsVetor(iniciativas), [iniciativas]);

  // Só as combinações que existem, na ordem em que a matriz será lida. Uma
  // grade 4×3 fixa mostraria nove células vazias e esconderia as três cheias.
  const fontesUsadas = useMemo(
    () => FONTES_INICIATIVA.filter(f => matriz.some(c => c.fonte === f && c.iniciativas > 0)),
    [matriz],
  );
  const vetoresUsados = useMemo(
    () => VETORES.filter(v => matriz.some(c => c.vetor === v && c.iniciativas > 0)),
    [matriz],
  );
  const celula = (f: string, v: string) =>
    matriz.find(c => c.fonte === f && c.vetor === v)?.iniciativas ?? 0;
  // Prova visual: mais de uma origem cruzando mais de um vetor.
  const eixosIndependentes = fontesUsadas.length > 1 && vetoresUsados.length > 1;

  const tratamento = useMemo(
    () => tratamentoDosRiscos(records, acoes_risco, iniciativas),
    [records, acoes_risco, iniciativas],
  );
  const exposicao = useMemo(() => exposicaoResidual(records), [records]);

  /* ---- A cadeia: as quatro perguntas que abrem o Painel ---- */

  const saudeObj = useMemo(() => saudeObjetivos(objetivos, medicoes), [objetivos, medicoes]);
  const saudeIni = useMemo(() => saudeIniciativas(iniciativas, marcos, hoje), [iniciativas, marcos, hoje]);
  const saudeRis = useMemo(
    () => saudeRiscos(records, acoes_risco, iniciativas, ano),
    [records, acoes_risco, iniciativas, ano],
  );
  const saudeTra = useMemo(() => saudeTrabalho(tarefas, hojeStr), [tarefas, hojeStr]);

  const lacunas = useMemo(() => cadeiaQuebrada({
    objetivos, iniciativas, marcos, riscos: records, acoes: acoes_risco,
    trabalho: tarefas, hoje,
  }), [objetivos, iniciativas, marcos, records, acoes_risco, tarefas, hoje]);

  /**
   * O balde da migração é objetivo de verdade no banco, e a métrica pura está
   * certa em contá-lo como descoberto. Mas ele é temporário e a resposta certa
   * é excluí-lo, não pendurar iniciativa nele — como lacuna seria uma cobrança
   * que ninguém deve atender. A TELA o separa, e não a métrica, para não enfiar
   * uma string mágica dentro de uma função de domínio.
   */
  const lacunasAbertas = useMemo(() => {
    const balde = new Set(
      objetivos.filter(o => o.descricao === OBJETIVO_BALDE).map(o => o.id),
    );
    return lacunas
      .map(l => (l.chave === 'objetivo_sem_iniciativa' && balde.size > 0
        ? { ...l, ids: l.ids.filter(id => !balde.has(id)) }
        : l))
      .map(l => ({ ...l, n: l.ids.length }))
      .filter(l => l.n > 0);
  }, [lacunas, objetivos]);

  /**
   * Nome legível de qualquer id da cadeia — objetivo, iniciativa, risco ou
   * tarefa. A métrica devolve só ids, de propósito: quem sabe transformar um id
   * num rótulo é a tela, e assim `portfolioMetrics` continua sem conhecer
   * "Iniciativa sem nome" nem `nomeRisco`.
   */
  const nomePorId = useMemo(() => {
    const m = new Map<string, string>();
    objetivos.forEach(o => m.set(o.id, o.descricao || 'Objetivo sem descrição'));
    iniciativas.forEach(i => m.set(i.id, i.nome || 'Iniciativa sem nome'));
    records.forEach(r => m.set(r.id, nomeRisco(r)));
    tarefas.forEach(t => m.set(t.id, t.tarefa || 'Tarefa sem título'));
    return m;
  }, [objetivos, iniciativas, records, tarefas]);

  /** Para onde a lacuna leva. Risco abre o rastro; o resto, a aba da camada. */
  function irParaLacuna(chave: ChaveLacuna) {
    onIrPara(LACUNAS[chave].destino);
  }

  /**
   * Abre o item exemplificado, quando há para onde abrir. Usa `entidade`, não
   * `camada`: "iniciativa sem objetivo" é uma lacuna da camada do objetivo,
   * mas os ids são de iniciativa — clicar por camada abriria a coisa errada.
   * Tarefa não tem tela própria de item, então cai na aba.
   */
  function abrirItemDaLacuna(chave: ChaveLacuna, id: string) {
    const { entidade, destino } = LACUNAS[chave];
    if (entidade === 'risco') onAbrirRisco(id);
    else if (entidade === 'iniciativa') onAbrirIniciativa(id);
    else onIrPara(destino);
  }

  /**
   * Composição da iniciativa em QUATRO grupos, não nos seis status do enum.
   *
   * Não é simplificação estética: "em execução" e "pausada" usam `--badge-amber`
   * e `--badge-orange`, que medem ΔE 4.1 mesmo em visão normal (e 0.1 em
   * deuteranopia). Como badge cada um carrega o próprio rótulo e a diferença
   * não importa; como segmentos VIZINHOS de uma barra, seriam a mesma cor. A
   * leitura que o Painel quer é a forma do progresso — o detalhe por status
   * está na aba Iniciativas, onde cada um vem com o nome escrito.
   */
  const fatiasIniciativa = useMemo<Fatia[]>(() => {
    const n = (...st: string[]) => saudeIni.porStatus
      .filter(s => st.includes(s.status))
      .reduce((soma, s) => soma + s.n, 0);
    return [
      { chave: 'backlog', serie: 'backlog', label: 'Backlog', valor: n('backlog', '') },
      {
        chave: 'ativa',
        serie: 'ativa',
        label: 'Ativas',
        valor: n('aprovada', 'em_execucao', 'pausada'),
        nota: 'aprovada, em execução ou pausada',
      },
      { chave: 'concluida', serie: 'concluida', label: 'Concluídas', valor: n('concluida') },
      { chave: 'cancelada', serie: 'cancelada', label: 'Canceladas', valor: n('cancelada') },
    ];
  }, [saudeIni]);

  /**
   * Composição do trabalho, com os quatro estados SEMPRE presentes.
   *
   * `saudeTrabalho` devolve só o que existe — é uma contagem, e contagem não
   * inventa linha. Mas na legenda o zero informa: "Cancelada 0" diz que o
   * estado existe e está vazio, e sumir dali faria a leitura pensar que o
   * quadro não cancela nada. É a mesma regra da célula vazia do heatmap, que
   * mostra o 0 em vez de texto transparente. Status legado fora do vocabulário
   * entra depois, e só quando houver.
   */
  const fatiasTrabalho = useMemo<Fatia[]>(() => {
    const porStatus = new Map(saudeTra.porStatus.map(s => [s.status, s.n]));
    const conhecidos = ['A fazer', 'Em andamento', 'Concluída', 'Cancelada'];
    const extras = saudeTra.porStatus.filter(s => !conhecidos.includes(s.status));
    return [
      ...conhecidos.map(status => ({
        chave: status,
        serie: SERIE_TRABALHO[status],
        label: status,
        valor: porStatus.get(status) ?? 0,
      })),
      ...extras.map(s => ({ chave: s.status, serie: 'null', label: s.status, valor: s.n })),
    ];
  }, [saudeTra]);

  const porEstado = useMemo(() => {
    const c = new Map<EstadoTratamento, number>();
    tratamento.forEach(t => c.set(t.estado, (c.get(t.estado) ?? 0) + 1));
    return c;
  }, [tratamento]);

  const maiorWip = wip[0];
  const sobrecarregados = wip.filter(w => w.acimaDoLimite).length;

  if (loading && iniciativas.length === 0 && objetivos.length === 0) {
    return (
      <div className="tab-page-lg">
        <div className="app-loading" role="status" aria-label="Carregando o painel…">
          <div className="skeleton-kpis">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton-kpi" />)}
          </div>
        </div>
      </div>
    );
  }

  if (iniciativas.length === 0 && objetivos.length === 0) {
    return (
      <div className="tab-page-lg">
        <div className="page-bar">
          <div>
            <div className="page-title">Painel</div>
            <div className="page-subtitle">O portfólio ainda não tem nada para medir</div>
          </div>
        </div>
        <div className="card">
          <EmptyState
            icon="◇"
            message="Nenhum objetivo e nenhuma iniciativa cadastrados"
            hint="O painel lê objetivos, iniciativas e marcos. Comece cadastrando um objetivo — ou extraia os planos de ação dos riscos pela Triagem."
            action={{ label: 'Ir para Objetivos', onClick: () => onIrPara('objetivos') }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="tab-page-lg">
      <div className="page-bar">
        <div>
          <div className="page-title">Painel</div>
          <div className="page-subtitle">
            {plural(iniciativas.length, 'iniciativa', 'iniciativas')} ·{' '}
            {plural(objetivos.length, 'objetivo', 'objetivos')} ·{' '}
            {/* A mesma régua da cadeia e da aba Registro: linha em branco não
                é risco mapeado. */}
            {plural(saudeRis.total, 'risco', 'riscos')}
          </div>
        </div>
        <div className="actions-row sem-impressao">
          <button
            className="btn btn-ghost"
            onClick={() => window.print()}
            title="Imprime este painel em uma folha, sem menu e sem botões."
          >
            Imprimir
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => baixarPortfolioCSV({
              iniciativas, objetivos, pessoas, marcos, acoes: acoes_risco,
            })}
            disabled={iniciativas.length === 0}
            title="Uma linha por iniciativa, com objetivo, marcos e riscos cobertos."
          >
            ↓ CSV do portfólio
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => { void handleBackup(); }}
            disabled={baixando}
            title="Dump completo: riscos, tarefas e todas as tabelas do portfólio."
          >
            {baixando ? 'Gerando…' : '↓ Backup'}
          </button>
        </div>
      </div>

      {erroBackup && (
        <div className="error-banner sem-impressao">
          <span>{erroBackup}</span>
          <button className="error-banner-dismiss" onClick={() => setErroBackup(null)} aria-label="Fechar aviso">×</button>
        </div>
      )}

      <div className="bento">
        {/* ---- A cadeia: objetivo → iniciativa → risco → trabalho ----
            Uma coluna por camada, na ordem da jornada. Cada uma responde
            "quanto existe" e "quanto terminou", que eram quatro perguntas
            espalhadas por quatro abas — e a de tarefas não existia em lugar
            nenhum fora do próprio quadro. */}

        <div className="card" data-span="12">
          <div className="section-header-row">
            <div>
              <div className="section-title">A cadeia, de ponta a ponta</div>
              <div className="bento-sub" style={{ maxWidth: '78ch' }}>
                O objetivo diz por quê; a iniciativa, o quê; o risco, o que ameaça; a
                tarefa, quem faz. Cada elo leva à sua seção.
              </div>
            </div>
          </div>

          <div className="cadeia">
            <Elo
              rotulo="Objetivos"
              valor={saudeObj.ativos}
              unidade="ativos"
              feito={{ n: saudeObj.atingidos, label: 'atingidos' }}
              destino="objetivos"
              onIrPara={onIrPara}
              vazio="Nenhum objetivo cadastrado."
              fatias={[
                { chave: 'ativo', serie: 'ativo', label: 'Ativos', valor: saudeObj.ativos },
                { chave: 'atingido', serie: 'atingido', label: 'Atingidos', valor: saudeObj.atingidos },
                { chave: 'abandonado', serie: 'abandonado', label: 'Abandonados', valor: saudeObj.abandonados },
              ]}
            />

            <span className="cadeia-seta" aria-hidden="true">›</span>

            <Elo
              rotulo="Iniciativas"
              valor={saudeIni.total}
              unidade="no portfólio"
              feito={{ n: saudeIni.concluidas, label: 'concluídas' }}
              destino="iniciativas"
              onIrPara={onIrPara}
              vazio="Nenhuma iniciativa cadastrada."
              fatias={fatiasIniciativa}
            />

            <span className="cadeia-seta" aria-hidden="true">›</span>

            <Elo
              rotulo="Riscos"
              valor={saudeRis.total}
              unidade="mapeados"
              feito={{ n: saudeRis.mitigadosNoAno, label: `mitigados em ${ano}` }}
              destino="registro"
              onIrPara={onIrPara}
              vazio="Nenhum risco cadastrado."
              /* A gravidade é a escada de criticidade, com os hex fixados pela
                 regra de negócio. Ela não passa nos limites de daltonismo por
                 matiz — por isso o vão de 2px entre segmentos e o número ao
                 lado de cada rótulo, que é onde a identidade de fato mora. */
              fatias={saudeRis.porTier.map(t => ({
                chave: t.tier,
                serie: t.tier,
                label: ROTULO_TIER[t.tier],
                valor: t.n,
              }))}
            />

            <span className="cadeia-seta" aria-hidden="true">›</span>

            <Elo
              rotulo="Tarefas e ações"
              valor={saudeTra.total}
              unidade={`${saudeTra.deRisco} de risco · ${saudeTra.livres} livres`}
              feito={{ n: saudeTra.concluidas, label: 'concluídas' }}
              destino="tarefas"
              onIrPara={onIrPara}
              vazio="Nenhuma tarefa cadastrada."
              fatias={fatiasTrabalho}
            />
          </div>
        </div>

        {/* ---- Onde a cadeia quebra ---- */}

        <div className="card" data-span="12">
          <div className="section-header-row">
            <div style={{ maxWidth: '78ch' }}>
              <div className="section-title">Onde a cadeia quebra</div>
              <div className="bento-sub">
                Todo elo solto num lugar só. Nenhum destes é erro de sistema — são
                decisões que ninguém tomou ainda, e cada linha leva a quem as toma.
              </div>
            </div>
          </div>

          {lacunasAbertas.length === 0 ? (
            <div className="bento-sub" style={{ marginTop: 'var(--sp-3)' }}>
              Nada solto: todo objetivo tem iniciativa, toda iniciativa tem marco, todo
              risco aberto tem tratamento e todo trabalho aberto tem dono e prazo em dia.
            </div>
          ) : (
            <div className="lacunas">
              {lacunasAbertas.map(l => {
                const r = LACUNAS[l.chave];
                const exemplos = l.ids.slice(0, 2)
                  .flatMap(id => {
                    const nome = nomePorId.get(id);
                    return nome ? [{ id, nome }] : [];
                  });
                return (
                  <div className="lacuna" key={l.chave} data-camada={r.camada}>
                    <span className="lacuna-n tabular">{l.n}</span>
                    <div className="lacuna-corpo">
                      <div className="lacuna-titulo">{r.titulo}</div>
                      <div className="lacuna-ajuda">{r.ajuda}</div>
                      {exemplos.length > 0 && (
                        <div className="lacuna-exemplos">
                          {/* Os nomes cortam com reticências; o "e mais N" fica
                              FORA do corte. Junto, ele era a primeira coisa que
                              a elipse comia — e o número é mais útil que um
                              terceiro nome pela metade. */}
                          <span className="lacuna-exemplos-nomes">
                            {exemplos.map((e, i) => (
                              <span key={e.id}>
                                {i > 0 && <span aria-hidden="true"> · </span>}
                                <button
                                  className="link-ini"
                                  onClick={() => abrirItemDaLacuna(l.chave, e.id)}
                                  title={e.nome}
                                >
                                  {e.nome}
                                </button>
                              </span>
                            ))}
                          </span>
                          {l.n > exemplos.length && (
                            <span className="lacuna-exemplos-resto">
                              e mais {l.n - exemplos.length}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <button className="btn btn-ghost" onClick={() => irParaLacuna(l.chave)}>
                      {r.acao}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ---- Linha 1: os quatro números que abrem a conversa ---- */}

        <div className="card" data-span="3">
          <div className="kpi-label">Impacto comprometido</div>
          <div className="bento-valor" title={formatarMoedaCheia(impacto.total)}>
            {formatarMoeda(impacto.total)}
          </div>
          <div className="bento-sub">
            {plural(iniciativas.filter(i => ['aprovada', 'em_execucao', 'pausada'].includes(i.status)).length,
              'iniciativa ativa', 'iniciativas ativas')}
          </div>
          {impacto.semValor > 0 && (
            <div className="bento-lacuna">
              <span aria-hidden="true">▲</span>
              {plural(impacto.semValor, 'iniciativa ativa sem valor', 'iniciativas ativas sem valor')} — o total é piso
            </div>
          )}
        </div>

        <div className="card" data-span="3">
          <div className="kpi-label">Marcos no prazo</div>
          <div className="bento-valor">
            {prazo.pct == null ? '—' : formatarPct(prazo.pct)}
          </div>
          <div className="bento-sub">
            {prazo.pct == null
              ? 'Nenhum marco venceu ainda'
              : `${prazo.noPrazo} de ${prazo.total} medidos contra a data original`}
          </div>
          {slip.replanejados > 0 && (
            <div className="bento-sub">
              {plural(slip.replanejados, 'marco replanejado', 'marcos replanejados')} ·
              {' '}+{formatarNumero(slip.diasMedioDosReplanejados, 0)} dias em média
            </div>
          )}
        </div>

        <div className="card" data-span="3">
          <div className="kpi-label">Maior WIP por dono</div>
          <div className="bento-valor">{maiorWip ? maiorWip.wip : '0'}</div>
          <div className="bento-sub">
            {maiorWip ? maiorWip.nome : 'Ninguém com iniciativa em execução'}
          </div>
          {sobrecarregados > 0 && (
            <div className="bento-lacuna">
              <span aria-hidden="true">▲</span>
              {plural(sobrecarregados, 'pessoa acima', 'pessoas acima')} de {LIMITE_WIP} em execução
            </div>
          )}
        </div>

        <div className="card" data-span="3">
          <div className="kpi-label">Iniciativas paradas</div>
          <div className="bento-valor">{parados.length}</div>
          <div className="bento-sub">
            Em execução sem marco movimentado há mais de {DIAS_PARA_ZUMBI} dias
          </div>
        </div>

        {/* ---- Mix e cobertura de objetivo ---- */}

        <div className="card" data-span="6">
          <div className="section-title">O portfólio cria valor ou só defende?</div>
          <div className="bento-sub">
            Vetor das iniciativas ativas, por contagem. Independe da origem: uma iniciativa
            que nasceu de gap de KPI pode perfeitamente evitar perda.
          </div>
          <Composicao
            vazio="Nenhuma iniciativa ativa para classificar."
            fatias={mix.fatias.map(f => ({
              chave: f.vetor,
              serie: f.vetor || 'null',
              label: ROTULO_VETOR[f.vetor],
              valor: f.iniciativas,
              nota: f.impacto > 0 ? formatarMoeda(f.impacto) : undefined,
            }))}
          />
          {mix.soDefensivo && (
            <div className="form-aviso">
              {formatarPct(mix.defensivoPct)} do impacto está em evitar perda, acima do
              limite de {formatarPct(LIMITE_DEFENSIVO)}. O portfólio está só se defendendo.
            </div>
          )}
        </div>

        <div className="card" data-span="6">
          <div className="section-title">Prontos para uma decisão sua</div>
          <div className="bento-sub">
            O sistema prova a entrega; declarar o resultado é sempre de quem responde
            por ele. Estas duas filas são o trabalho que já terminou e está esperando.
          </div>
          <div className="fato-par" style={{ marginTop: 'var(--sp-4)' }}>
            <div className="fato">
              <div className="fato-label">Riscos prontos para fechar</div>
              <div className="fato-valor">
                {/* Vem de `saudeRiscos`, não do `prontos` solto: os dois
                    respondem a mesma pergunta e precisam da mesma régua. */}
                <span className="bento-valor" style={{ marginTop: 0 }}>
                  {saudeRis.prontosParaFechar}
                </span>
              </div>
              <div className="bento-sub">Toda mitigação viva concluiu — falta declarar a ameaça derrubada.</div>
              <div className="actions-row" style={{ marginTop: 'var(--sp-2)' }}>
                <button className="btn btn-ghost" onClick={() => onIrPara('registro')}>
                  Abrir o rastro
                </button>
              </div>
            </div>
            <div className="fato">
              <div className="fato-label">Objetivos prontos para atingir</div>
              <div className="fato-valor">
                <span className="bento-valor" style={{ marginTop: 0 }}>
                  {saudeObj.prontosParaAtingir.length}
                </span>
              </div>
              <div className="bento-sub">A série já cobriu todo o caminho até a meta.</div>
              <div className="actions-row" style={{ marginTop: 'var(--sp-2)' }}>
                <button className="btn btn-ghost" onClick={() => onIrPara('objetivos')}>
                  Ver objetivos
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ---- Carga, paradas e exposição ---- */}

        <div className="card" data-span="4">
          <div className="section-title">Carga por pessoa</div>
          <div className="bento-sub">
            Dias-pessoa que caem neste mês, contra o teto declarado de cada um.
          </div>
          {carga.length === 0 ? (
            <div className="bento-sub" style={{ marginTop: 'var(--sp-3)' }}>
              Nenhuma iniciativa ativa com esforço e janela preenchidos. Sem isso, não dá
              para acusar sobrecarga de forma auditável.
            </div>
          ) : (
            <div className="lista-linhas">
              {carga.slice(0, 6).map(c => {
                const teto = c.capacidade && c.capacidade > 0 ? c.capacidade : null;
                const escala = Math.max(c.diasNoPeriodo, teto ?? 0) || 1;
                return (
                  <div className="lista-linha" key={c.pessoa.id}>
                    <span className="lista-texto" style={{ flex: '0 0 34%' }}>{c.pessoa.nome}</span>
                    <span className="carga-track">
                      <span
                        className="carga-fill"
                        data-acima={c.acimaDaCapacidade}
                        style={{ width: `${Math.min(100, (c.diasNoPeriodo / escala) * 100)}%` }}
                      />
                      {teto != null && (
                        <span className="carga-limite" style={{ left: `${(teto / escala) * 100}%` }} />
                      )}
                    </span>
                    <span className="lista-nota tabular">
                      {formatarNumero(c.diasNoPeriodo, 1)}{teto != null ? `/${teto}` : ''} d
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card" data-span="4">
          <div className="section-title">Paradas há mais de {DIAS_PARA_ZUMBI} dias</div>
          <div className="bento-sub">
            Ninguém cancela uma iniciativa — só para de mexer nela.
          </div>
          {parados.length === 0 ? (
            <div className="bento-sub" style={{ marginTop: 'var(--sp-3)' }}>
              Nada abandonado em silêncio.
            </div>
          ) : (
            <div className="lista-linhas">
              {parados.slice(0, 6).map(z => (
                <div className="lista-linha" key={z.iniciativa.id}>
                  <button
                    className="lista-texto link-ini"
                    style={{ fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-medium)' }}
                    onClick={() => onAbrirIniciativa(z.iniciativa.id)}
                  >
                    {z.iniciativa.nome || 'Iniciativa sem nome'}
                  </button>
                  <span className="lista-nota tabular">
                    {z.diasParado} d{z.temMarco ? '' : ' · sem marco'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" data-span="4">
          <div className="kpi-label">Exposição residual</div>
          <div className="bento-valor" title={formatarMoedaCheia(exposicao.total)}>
            {formatarMoeda(exposicao.total)}
          </div>
          <div className="bento-sub">
            {plural(exposicao.riscos, 'risco ainda aberto', 'riscos ainda abertos')} —
            nem mitigados, nem obsoletos, nem descartados.
          </div>
          {exposicao.semValor > 0 && (
            <div className="bento-lacuna">
              <span aria-hidden="true">▲</span>
              {plural(exposicao.semValor, 'risco aberto sem exposição', 'riscos abertos sem exposição')} em R$
            </div>
          )}
        </div>

        {/* ---- Origem × vetor: a prova de que são dois eixos ---- */}

        {matriz.length > 0 && (
          <div className="card" data-span="12">
            <div className="section-title">Origem × vetor</div>
            <div className="bento-sub" style={{ maxWidth: '78ch' }}>
              {eixosIndependentes
                ? 'De onde a iniciativa veio não determina o que ela faz com o valor. '
                  + 'Se determinasse, esta matriz teria uma célula por linha — e não tem.'
                : 'Por enquanto o portfólio ocupa poucas combinações. A matriz fica interessante '
                  + 'quando origens diferentes aparecem no mesmo vetor, e vice-versa.'}
            </div>

            <div className="matriz-wrap">
              <table className="matriz">
                <thead>
                  <tr>
                    <th />
                    {vetoresUsados.map(v => <th key={v} className="num">{ROTULO_VETOR[v]}</th>)}
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {fontesUsadas.map(f => {
                    const totalLinha = vetoresUsados.reduce((s, v) => s + celula(f, v), 0);
                    return (
                      <tr key={f}>
                        <th scope="row">
                          <span className="matriz-rotulo">
                            <span className="serie-dot" data-serie={f === 'risco' ? 'risco' : 'oportunidade'} aria-hidden="true" />
                            {ROTULO_FONTE[f]}
                          </span>
                        </th>
                        {vetoresUsados.map(v => {
                          const n = celula(f, v);
                          return (
                            <td key={v} className="num" data-vazio={n === 0 || undefined}>{n}</td>
                          );
                        })}
                        <td className="num total">{totalLinha}</td>
                      </tr>
                    );
                  })}
                  <tr className="matriz-total">
                    <th scope="row">Total</th>
                    {vetoresUsados.map(v => (
                      <td key={v} className="num">
                        {fontesUsadas.reduce((s, f) => s + celula(f, v), 0)}
                      </td>
                    ))}
                    <td className="num total">{iniciativas.length}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---- Cobertura: as duas metades da história ----
            As contagens de "mitigados no ano" e "prontos para fechar" saíram
            daqui: viraram a cadeia e o cartão de decisões, e três cópias do
            mesmo número na mesma tela é como se perde a confiança nele. O que
            sobra é o que nenhuma outra leitura dá — o TRATAMENTO que os riscos
            receberam, e a ORIGEM de cada iniciativa. */}

        <div className="card" data-span="12">
          <div className="section-header-row">
            {/* Sem o teto de largura, a explicação empurra os botões para a
                linha de baixo já em 1600px. */}
            <div style={{ maxWidth: '68ch' }}>
              <div className="section-title">Como os riscos foram tratados × por que as iniciativas nasceram</div>
              <div className="bento-sub">
                São duas perguntas diferentes, e nenhuma se deriva da outra. À esquerda, o que
                o registro de risco recebeu de tratamento. À direita, de onde cada iniciativa
                do portfólio veio.
              </div>
            </div>
            <div className="actions-row">
              <button className="btn btn-ghost" onClick={() => onIrPara('registro')}>Rastro de mitigação</button>
              <button className="btn btn-ghost" onClick={() => onIrPara('iniciativas')}>Ver iniciativas</button>
            </div>
          </div>

          <div className="cobertura">
            <div>
              <div className="fato-label">Tratamento dos riscos</div>
              <div className="bento-sub">
                Derivado das ações vivas de cada risco — e, quando a ação está dentro de uma
                iniciativa, do status dela.
              </div>
              <Composicao
                vazio="Nenhum risco cadastrado."
                fatias={ESTADOS.map(e => ({
                  chave: e.estado,
                  serie: SERIE_ESTADO[e.estado],
                  label: e.label,
                  valor: porEstado.get(e.estado) ?? 0,
                }))}
              />
            </div>

            <div className="cobertura-divisor" aria-hidden="true" />

            <div>
              <div className="fato-label">Origem das iniciativas</div>
              <div className="bento-sub">
                Origem é histórico e não muda. Quantos riscos uma iniciativa cobre hoje é
                outro número, que cresce — está no detalhe de cada uma.
              </div>
              <Composicao
                vazio="Nenhuma iniciativa cadastrada."
                fatias={origem.fatias.map(f => ({
                  chave: f.fonte,
                  serie: f.fonte === 'risco' ? 'risco' : 'oportunidade',
                  label: ROTULO_FONTE[f.fonte],
                  valor: f.iniciativas,
                  nota: f.impacto > 0 ? formatarMoeda(f.impacto) : undefined,
                }))}
              />
            </div>
          </div>
        </div>

        {/* ---- Atividade recente ---- */}

        <div className="card" data-span="12">
          <div className="section-title">Atividade recente</div>
          <div className="bento-sub">
            As últimas mudanças em riscos, objetivos, iniciativas, marcos, ações e pessoas.
            O nome é o que cada um digitou no cabeçalho — serve para saber a quem perguntar,
            não para autorizar ninguém.
          </div>
          <Historico
            limite={20}
            vazio="Nenhuma alteração registrada ainda. O histórico começa a contar a partir de agora."
          />
        </div>
      </div>
    </div>
  );
}
