import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Objetivo, StoredRiskRecord, Tab } from '../../types';
import type { UsePortfolio } from '../../hooks/usePortfolio';
import { useSessionState } from '../../hooks/useSessionState';
import {
  CRITERIOS_OBJETIVOS, aplicarOrdemVisivel, moverPara, moverUm, ordenarObjetivos,
  type CriterioObjetivos,
} from '../../lib/ordemObjetivos';
import { formatarMoeda, formatarMoedaCheia, formatarPct, plural } from '../../lib/portfolioLabels';
import { EmptyState } from '../common/EmptyState';
import { Kpi, KpiRow, type KpiProps } from '../common/Kpi';
import { Composicao, type Fatia } from '../common/Composicao';
import { useConfirmacao } from '../common/Confirmacao';
import { ObjetivoModal } from './ObjetivoModal';
import { MedicaoModal } from './MedicaoModal';
import { ListaObjetivos } from './ListaObjetivos';
import { ObjetivoDetalhe } from './ObjetivoDetalhe';
import { ehBalde, montarLinhas, somarTotais, type LinhaObjetivo } from './objetivosUi';

interface ObjetivosTabProps {
  idsDoRecorte?: Set<string> | null;
  onCriarIniciativa: (objetivoId: string) => void;
  /** Para o bloco "riscos que ameaçam este objetivo", derivado das iniciativas. */
  riscos: StoredRiskRecord[];
  pf: UsePortfolio;
  onIrPara: (tab: Tab) => void;
  onAbrirIniciativa: (id: string) => void;
  onAbrirRisco: (id: string) => void;
}

type EstadoOrdem = 'ocioso' | 'salvando' | 'salvo';

const CRITERIOS_VALIDOS = new Set<string>(CRITERIOS_OBJETIVOS.map(c => c.id));

/**
 * A aba Objetivos: a lista virou gráfico.
 *
 * Cada objetivo é uma linha que responde, de relance, às três perguntas da
 * cadeia — o número andou, quanto as entregas renderam, o que ainda ameaça —
 * e abre para o detalhe que prova cada uma. Tudo nasce recolhido: com seis
 * objetivos abertos a tela era uma pilha de cartões e ninguém comparava nada.
 *
 * A ordem da lista É a ordem manual, gravada para todos (`position` no
 * servidor). Impacto, progresso e prazo são VISTAS: reordenam na tela e não
 * gravam — voltar para Manual devolve a ordem combinada intacta.
 */
export function ObjetivosTab({
  riscos, pf, onIrPara, onAbrirIniciativa, onAbrirRisco, idsDoRecorte, onCriarIniciativa,
}: ObjetivosTabProps) {
  const {
    portfolio, loading, error, clearError, createEntidade, patchEntidade, deleteEntidade, reordenarObjetivos,
  } = pf;
  const { objetivos, medicoes, iniciativas, acoes_risco, pessoas } = portfolio;
  const [editando, setEditando] = useState<Objetivo | null>(null);
  const [medindo, setMedindo] = useState<Objetivo | null>(null);
  const [criando, setCriando] = useState(false);
  const [mostrarEncerrados, setMostrarEncerrados] = useState(false);
  const [confirmar, dialogoConfirmacao] = useConfirmacao();

  const [criterioSalvo, setCriterio] = useSessionState<CriterioObjetivos>('objetivos.criterio', 'manual');
  const criterio: CriterioObjetivos = CRITERIOS_VALIDOS.has(criterioSalvo) ? criterioSalvo : 'manual';
  const [abertosSalvos, setAbertos] = useSessionState<string[]>('objetivos.abertos', []);
  const abertos = useMemo(() => new Set(Array.isArray(abertosSalvos) ? abertosSalvos : []), [abertosSalvos]);
  const [modoReordenar, setModoReordenar] = useState(false);
  const reordenando = modoReordenar && criterio === 'manual';

  /*
   * Ordem que está indo para o servidor. A tela já mostra a nova ordem
   * enquanto grava — esperar o ida e volta para a linha sair do lugar faria o
   * arraste parecer quebrado. Ao terminar volta a valer a lista do servidor:
   * em sucesso ela já é a nova ordem; em falha, é a de antes.
   */
  const [ordemPendente, setOrdemPendente] = useState<string[] | null>(null);
  const [estadoOrdem, setEstadoOrdem] = useState<EstadoOrdem>('ocioso');
  const [anuncio, setAnuncio] = useState('');
  /*
   * Uma gravação da ordem por vez. Cada POST abre a própria conexão no
   * servidor e disputa o lock da tabela: dois em voo fazem commit em qualquer
   * ordem, e vale o último a chegar — que pode ser uma ordem intermediária.
   * Enquanto uma está em voo, só a ordem MAIS RECENTE fica guardada e sai
   * quando ela terminar; as do meio já foram superadas e nem viajam.
   */
  const emVoo = useRef(false);
  const proximaOrdem = useRef<string[] | null>(null);

  // Chegar com um recorte do Painel abre os objetivos recortados: quem veio
  // resolver uma lacuna não deveria ter de achar e abrir cada um. Cada id abre
  // UMA vez por chegada: o recorte encolhe quando uma lacuna é resolvida, e
  // somar de novo os que sobraram reabriria o que a pessoa já fechou.
  const chaveRecorte = idsDoRecorte ? [...idsDoRecorte].sort().join('|') : '';
  const abertosPeloRecorte = useRef(new Set<string>());
  useEffect(() => {
    if (!chaveRecorte) {
      abertosPeloRecorte.current.clear();
      return;
    }
    const ids = chaveRecorte.split('|').filter(id => !abertosPeloRecorte.current.has(id));
    if (ids.length === 0) return;
    for (const id of ids) abertosPeloRecorte.current.add(id);
    setAbertos(prev => {
      const novos = ids.filter(id => !prev.includes(id));
      return novos.length > 0 ? [...prev, ...novos] : prev;
    });
  }, [chaveRecorte, setAbertos]);

  const linhas = useMemo(
    () => montarLinhas({ objetivos, iniciativas, medicoes, acoes: acoes_risco, riscos, pessoas }),
    [objetivos, iniciativas, medicoes, acoes_risco, riscos, pessoas],
  );

  /** A ordem manual em vigor: a do servidor, ou a que está indo para lá. */
  const ordemManual = useMemo(() => {
    if (!ordemPendente) return objetivos;
    const porId = new Map(objetivos.map(o => [o.id, o]));
    const naOrdem = new Set(ordemPendente);
    return [
      ...ordemPendente.flatMap(id => porId.get(id) ?? []),
      // Criado por outra pessoa no meio da gravação: vai para o fim, como no servidor.
      ...objetivos.filter(o => !naOrdem.has(o.id)),
    ];
  }, [objetivos, ordemPendente]);

  const visiveis = useMemo(() => ordemManual.filter(o => (idsDoRecorte
    ? idsDoRecorte.has(o.id)
    : mostrarEncerrados || o.status !== 'abandonado')), [ordemManual, idsDoRecorte, mostrarEncerrados]);

  const linhaDe = (o: Objetivo): LinhaObjetivo[] => {
    const l = linhas.get(o.id);
    return l ? [l] : [];
  };

  const naVista = useMemo(() => ordenarObjetivos(
    visiveis.filter(o => !ehBalde(o)),
    criterio,
    o => {
      const l = linhas.get(o.id);
      return { impacto: l ? l.impacto.entregue + l.impacto.emJogo : 0, progresso: l?.progresso.pct ?? null };
    },
  ).flatMap(o => linhas.get(o.id) ?? []), [visiveis, criterio, linhas]);
  // O balde da migração vai para o fim em qualquer vista: é caixa de entrada,
  // não direção, e não entra na ordem.
  const baldes = visiveis.filter(ehBalde).flatMap(linhaDe);
  const todasVisiveis = [...naVista, ...baldes];
  const totais = somarTotais(todasVisiveis, medicoes);

  const encerrados = objetivos.filter(o => o.status === 'abandonado').length;
  const ativosNoPortfolio = objetivos.filter(o => o.status === 'ativo' && !ehBalde(o)).length;
  const atingidos = objetivos.filter(o => o.status === 'atingido').length;

  /* ---------------- Abrir e fechar ---------------- */

  function alternar(id: string) {
    setAbertos(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }

  /**
   * Abre e leva até a linha — é o que a legenda da composição faz. O título
   * para abaixo do header fixo por `scroll-margin-top` (portfolio.css); sem
   * isso o foco caía num botão encoberto.
   */
  function abrirEIr(id: string) {
    setModoReordenar(false);
    setAbertos(prev => (prev.includes(id) ? prev : [...prev, id]));
    const suave = typeof matchMedia !== 'function'
      || !matchMedia('(prefers-reduced-motion: reduce)').matches;
    requestAnimationFrame(() => {
      const el = document.getElementById(`objetivo-${id}`);
      el?.scrollIntoView?.({ block: 'start', behavior: suave ? 'smooth' : 'auto' });
      el?.focus({ preventScroll: true });
    });
  }

  const idsVisiveis = todasVisiveis.map(l => l.objetivo.id);
  const tudoAberto = idsVisiveis.length > 0 && idsVisiveis.every(id => abertos.has(id));
  function alternarTudo() {
    setAbertos(prev => (tudoAberto
      ? prev.filter(id => !idsVisiveis.includes(id))
      : [...new Set([...prev, ...idsVisiveis])]));
  }

  /* ---------------- Ordem ---------------- */

  function trocarCriterio(c: CriterioObjetivos) {
    setCriterio(c);
    setEstadoOrdem('ocioso');
    if (c !== 'manual') setModoReordenar(false);
  }

  async function gravarOrdem(novaVisivel: string[], movidoId: string) {
    if (criterio !== 'manual') return;
    const todos = ordemManual.map(o => o.id);
    // A tela reordena só o que mostra; o servidor grava a lista inteira. Os
    // ocultos (abandonados, fora do recorte, o balde) ficam onde estavam.
    const completa = aplicarOrdemVisivel(todos, novaVisivel);
    if (completa.every((id, i) => id === todos[i])) return;

    const nome = linhas.get(movidoId)?.nome ?? 'Objetivo';
    setAnuncio(`${nome} na posição ${novaVisivel.indexOf(movidoId) + 1} de ${novaVisivel.length}`);
    setOrdemPendente(completa);
    setEstadoOrdem('salvando');
    proximaOrdem.current = completa;
    // Já há uma em voo: ela leva esta quando terminar.
    if (emVoo.current) return;

    emVoo.current = true;
    let ok = true;
    try {
      while (ok && proximaOrdem.current) {
        const ordem = proximaOrdem.current;
        proximaOrdem.current = null;
        ok = await reordenarObjetivos(ordem);
      }
    } finally {
      emVoo.current = false;
      // Em falha a fila cai inteira: as ordens seguintes foram montadas sobre
      // a que o servidor recusou, e a tela volta à que ele tem.
      proximaOrdem.current = null;
    }
    setOrdemPendente(null);
    setEstadoOrdem(ok ? 'salvo' : 'ocioso');
    if (!ok) setAnuncio('A ordem não foi salva. A lista voltou à ordem anterior.');
  }

  const idsNaVista = naVista.map(l => l.objetivo.id);
  const mover = (id: string, delta: -1 | 1) => { void gravarOrdem(moverUm(idsNaVista, id, delta), id); };
  const soltar = (id: string, alvoId: string) => { void gravarOrdem(moverPara(idsNaVista, id, alvoId), id); };

  const rotuloCriterio = CRITERIOS_OBJETIVOS.find(c => c.id === criterio)?.rotulo ?? '';
  const textoEstado: ReactNode = estadoOrdem === 'salvando'
    ? 'Salvando a ordem…'
    : criterio !== 'manual'
      ? `Vista por ${rotuloCriterio.toLowerCase()}. A ordem manual continua guardada.`
      : estadoOrdem === 'salvo'
        ? 'Ordem salva · vale para todos'
        : reordenando
          ? 'Use ↑ ↓ em cada linha. A ordem vale para todos.'
          : (
              // Abaixo de 760px a alça some (portfolio.css), e a dica que manda
              // arrastá-la apontava para um controle que não está na tela. As
              // duas frases ficam no DOM e o CSS escolhe — a mesma régua de
              // largura que esconde a alça.
              <>
                <span className="objetivos-dica-alca">Arraste pela alça, ou foque nela e use ↑ ↓.</span>
                <span className="objetivos-dica-toque">Toque em Reordenar para mover com ↑ ↓.</span>
                {' '}A ordem vale para todos.
              </>
            );

  /* ---------------- Ações do objetivo ---------------- */

  async function salvarNovo(dados: Record<string, unknown>) {
    return createEntidade('objetivos', dados);
  }

  /**
   * Declara o objetivo atingido. É decisão, não cálculo — igual ao "confirmar
   * mitigado" do Rastro. A métrica só prova que a série cobriu o caminho até a
   * meta; quem responde pelo resultado é quem clica.
   */
  async function declararAtingido(o: Objetivo) {
    if (!(await confirmar({
      titulo: `Declarar "${o.descricao}" como atingido?`,
      consequencia: 'A série já cobriu todo o caminho entre baseline e meta. Ele sai da conta de '
        + 'objetivos ativos e passa a contar como alcançado — e quem declara responde por isso.',
      rotuloConfirmar: 'Declarar atingido',
      rotuloManter: 'Ainda não',
      perigo: false,
    }))) return;
    await patchEntidade('objetivos', o.id, { status: 'atingido' });
  }

  async function excluir(o: Objetivo) {
    const presas = iniciativas.filter(i => i.objetivo_id === o.id).length;
    if (presas > 0) {
      window.alert(
        `Este objetivo tem ${plural(presas, 'iniciativa pendurada', 'iniciativas penduradas')}. `
        + 'Mova-as para outro objetivo antes de excluir — iniciativa sem objetivo não é salva.',
      );
      return;
    }
    const nMedicoes = medicoes.filter(m => m.objetivo_id === o.id).length;
    if (!(await confirmar({
      titulo: `Excluir o objetivo "${o.descricao}"?`,
      consequencia: nMedicoes > 0
        ? `Ele some do portfólio. ${plural(nMedicoes, 'A medição registrada vai', 'As ' + nMedicoes + ' medições registradas vão')} junto — a tendência se perde.`
        : 'Ele some do portfólio. Não tem medição registrada.',
      rotuloConfirmar: 'Excluir objetivo',
    }))) return;
    const ok = await deleteEntidade('objetivos', o.id);
    if (ok) setEditando(null);
  }

  const porId = (id: string) => objetivos.find(o => o.id === id) ?? null;

  /* ---------------- KPIs ---------------- */

  /*
   * Os dois tiles em R$ seguem a régua do Painel: não se aplica é travessão;
   * se aplica e ninguém preencheu é estado vazio com o botão de quem preenche;
   * alguém preencheu é o número, com o aviso de que ele é piso. "R$ 0" por
   * campo em branco grita sem informar.
   */
  const kpiEntregue: Omit<KpiProps, 'label'> = totais.concluidas === 0
    ? { valor: '—', sub: 'Nenhuma iniciativa concluída' }
    : totais.entreguesSemValor === totais.concluidas
      ? {
          valor: null,
          vazio: {
            texto: `${plural(totais.concluidas, 'iniciativa concluída', 'iniciativas concluídas')}, nenhuma com valor de impacto declarado.`,
            acao: { label: 'Declarar valor', onClick: () => onIrPara('iniciativas') },
          },
        }
      : {
          valor: formatarMoeda(totais.entregue),
          sub: plural(totais.concluidas, 'iniciativa concluída', 'iniciativas concluídas'),
          title: formatarMoedaCheia(totais.entregue),
          alerta: totais.entreguesSemValor > 0
            ? `${totais.entreguesSemValor} sem valor de impacto`
            : undefined,
        };

  const kpiEmJogo: Omit<KpiProps, 'label'> = totais.ativas === 0
    ? { valor: '—', sub: 'Nenhuma iniciativa ativa' }
    : totais.emCursoSemValor === totais.ativas
      ? {
          valor: null,
          vazio: {
            texto: `${plural(totais.ativas, 'iniciativa ativa', 'iniciativas ativas')}, nenhuma com valor de impacto declarado.`,
            acao: { label: 'Declarar valor', onClick: () => onIrPara('iniciativas') },
          },
        }
      : {
          valor: formatarMoeda(totais.emJogo),
          sub: plural(totais.ativas, 'iniciativa ativa', 'iniciativas ativas'),
          title: formatarMoedaCheia(totais.emJogo),
          alerta: totais.emCursoSemValor > 0
            ? `${totais.emCursoSemValor} sem valor de impacto`
            : undefined,
        };

  const { ameacas } = totais;
  const kpiRiscos: Omit<KpiProps, 'label'> = ameacas.total === 0
    ? { valor: '—', sub: 'Nenhum risco chega a estes objetivos pelas iniciativas' }
    : {
        valor: `${ameacas.neutralizados} de ${ameacas.total}`,
        progresso: ameacas.neutralizados / ameacas.total,
        sub: ameacas.semTratamento > 0 ? `${ameacas.semTratamento} sem tratamento` : undefined,
        title: 'Só conta o mitigado confirmado. Tratamento entregue e ainda não fechado continua ameaçando.',
      };

  const pendentesDeNumero = totais.prontos + totais.semNumero;
  const kpiIndicadores: Omit<KpiProps, 'label'> = totais.ativos === 0
    ? { valor: '—', sub: 'Nenhum objetivo ativo à vista', acento: 'null' }
    : {
        valor: `${totais.melhorando} de ${totais.ativos}`,
        sub: `${plural(totais.prontos, 'pronto', 'prontos')} para atingir · ${totais.semNumero} sem número`,
        acento: pendentesDeNumero > 0 ? 'medio' : 'null',
      };

  /* ---------------- Composição do impacto ---------------- */

  const comprometido = totais.entregue + totais.emJogo;
  const comIniciativa = totais.concluidas + totais.ativas;
  const semValor = totais.entreguesSemValor + totais.emCursoSemValor;
  // O entregue só vira número quando alguma concluída declarou valor. Sem
  // concluída ele não se aplica; com todas em branco, "R$ 0 · 0%" seria o
  // campo vazio posando de resultado.
  const entregueDeclarado = totais.concluidas > 0 && totais.entreguesSemValor < totais.concluidas;
  const fatiasImpacto: Fatia[] = [
    ...todasVisiveis
      .filter(l => l.impacto.entregue > 0)
      .sort((a, b) => b.impacto.entregue - a.impacto.entregue)
      .map(l => ({
        chave: l.objetivo.id,
        serie: 'concluida',
        label: l.balde ? 'A classificar · balde da migração' : l.nome,
        valor: l.impacto.entregue,
        rotulo: formatarMoeda(l.impacto.entregue),
        onClick: () => abrirEIr(l.objetivo.id),
      })),
    // Em jogo é um bloco só: dividir por objetivo o que ainda não foi entregue
    // poria promessa lado a lado com resultado, na mesma cor de régua.
    ...(totais.emJogo > 0
      ? [{
          chave: 'em_jogo', serie: 'em_jogo', label: 'Em jogo · iniciativas ativas',
          valor: totais.emJogo, rotulo: formatarMoeda(totais.emJogo),
        }]
      : []),
  ];

  /* ---------------- Render ---------------- */

  if (loading && objetivos.length === 0) {
    return (
      <div className="tab-page-lg">
        <div className="app-loading" role="status" aria-label="Carregando objetivos…">
          <div className="skeleton-table">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton-row" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-page-lg">
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button className="error-banner-dismiss" onClick={clearError} aria-label="Fechar aviso">×</button>
        </div>
      )}

      {dialogoConfirmacao}

      <div className="page-bar">
        <div>
          <div className="page-title">Objetivos</div>
          <div className="page-subtitle">
            {plural(ativosNoPortfolio, 'objetivo ativo', 'objetivos ativos')} ·
            {' '}{plural(atingidos, 'atingido', 'atingidos')} ·
            {' '}o que cada um já rendeu, o que está em jogo e o que ainda ameaça
          </div>
        </div>
        <div className="actions-row">
          {encerrados > 0 && (
            <button className="btn btn-ghost" onClick={() => setMostrarEncerrados(v => !v)}>
              {mostrarEncerrados ? 'Ocultar abandonados' : `Mostrar abandonados · ${encerrados}`}
            </button>
          )}
          <button className="btn btn-navy" onClick={() => setCriando(true)}>+ Novo objetivo</button>
        </div>
      </div>

      {objetivos.length > 0 && (
        <KpiRow colunas={4}>
          <Kpi label="Impacto entregue" acento="baixo" {...kpiEntregue} />
          <Kpi label="Em jogo" acento="brand" {...kpiEmJogo} />
          <Kpi label="Riscos neutralizados" acento="baixo" {...kpiRiscos} />
          <Kpi label="Indicadores melhorando" {...kpiIndicadores} />
        </KpiRow>
      )}

      {todasVisiveis.length === 0 ? (
        <div className="card">
          {objetivos.length === 0 ? (
            <EmptyState
              message="Nenhum objetivo cadastrado"
              hint="O objetivo é o porquê: o resultado de negócio que as iniciativas movem. Poucos e ativos — três a seis dão conta de um ano."
              action={{ label: '+ Novo objetivo', onClick: () => setCriando(true) }}
            />
          ) : (
            <EmptyState
              message="Nenhum objetivo à vista"
              hint={idsDoRecorte
                ? 'Nenhum objetivo sobrou neste recorte — a lacuna que o trouxe até aqui já foi resolvida.'
                : 'Os objetivos cadastrados estão todos abandonados. Mostre-os para consultar ou reativar.'}
              action={!idsDoRecorte && encerrados > 0
                ? { label: `Mostrar abandonados · ${encerrados}`, onClick: () => setMostrarEncerrados(true) }
                : undefined}
            />
          )}
        </div>
      ) : (
        <>
          <section className="card objetivos-impacto" aria-labelledby="objetivos-impacto-titulo">
            <div className="section-title" id="objetivos-impacto-titulo">De onde vem o impacto</div>
            {comprometido > 0 && (entregueDeclarado ? (
              <div className="bento-sub">
                <span className="tabular">{formatarMoeda(totais.entregue)}</span> entregues de
                {' '}<span className="tabular">{formatarMoeda(comprometido)}</span> comprometidos ·
                {' '}<span className="tabular">{formatarPct(totais.entregue / comprometido)}</span> já virou resultado
              </div>
            ) : (
              <div className="bento-sub">
                <span className="tabular">{formatarMoeda(totais.emJogo)}</span> em jogo ·
                {' '}{totais.concluidas === 0
                  ? 'nenhuma iniciativa concluída ainda'
                  : `${plural(totais.concluidas, 'concluída', 'concluídas')} sem valor de impacto declarado`}
              </div>
            ))}
            <Composicao
              fatias={fatiasImpacto}
              vazio={comIniciativa === 0
                ? 'Nenhuma iniciativa concluída ou ativa nos objetivos à vista — ainda não há entrega para somar.'
                : semValor === comIniciativa
                  ? 'Nenhuma iniciativa daqui tem valor de impacto declarado. O valor entra pela ficha de cada '
                    + 'iniciativa, no campo Impacto financeiro — sem ele não dá para dizer o que as entregas renderam.'
                  : 'O valor de impacto declarado nas iniciativas daqui soma zero — não há o que compor.'}
            />
            {semValor > 0 && semValor < comIniciativa && (
              <div className="bento-lacuna">
                <span aria-hidden="true">▲</span>
                {plural(semValor, 'iniciativa sem valor de impacto', 'iniciativas sem valor de impacto')} — os totais são piso
              </div>
            )}
          </section>

          <div className="objetivos-bloco">
            <div className="objetivos-ferramentas">
              <div className="objetivos-ordenar">
                <span className="objetivo-rotulo" id="objetivos-ordenar-rotulo">Ordenar</span>
                <div className="view-toggle" role="group" aria-labelledby="objetivos-ordenar-rotulo">
                  {CRITERIOS_OBJETIVOS.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className={criterio === c.id ? 'active' : ''}
                      aria-pressed={criterio === c.id}
                      onClick={() => trocarCriterio(c.id)}
                    >
                      {c.rotulo}
                    </button>
                  ))}
                </div>
              </div>
              <span className="objetivos-estado" aria-live="polite">{textoEstado}</span>
              <div className="actions-row objetivos-ferramentas-acoes">
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-pressed={reordenando}
                  disabled={criterio !== 'manual' || (naVista.length < 2 && !reordenando)}
                  title={criterio !== 'manual' ? 'Volte ao critério Manual para reordenar' : undefined}
                  onClick={() => setModoReordenar(v => !v)}
                >
                  Reordenar
                </button>
                <button type="button" className="btn btn-ghost" onClick={alternarTudo} disabled={reordenando}>
                  {tudoAberto ? 'Recolher tudo' : 'Expandir tudo'}
                </button>
              </div>
            </div>
            <div className="sr-only" aria-live="polite">{anuncio}</div>

            <ListaObjetivos
              linhas={naVista}
              baldes={baldes}
              abertos={abertos}
              onAlternar={alternar}
              onAbrir={id => setAbertos(prev => (prev.includes(id) ? prev : [...prev, id]))}
              podeReordenar={criterio === 'manual'}
              reordenando={reordenando}
              onMover={mover}
              onSoltar={soltar}
              totais={totais}
              onEditar={id => setEditando(porId(id))}
              onMedir={id => setMedindo(porId(id))}
              onDeclararValor={() => onIrPara('iniciativas')}
              detalhe={l => (
                <ObjetivoDetalhe
                  id={`objetivo-detalhe-${l.objetivo.id}`}
                  linha={l}
                  onEditar={() => setEditando(l.objetivo)}
                  onMedir={() => setMedindo(l.objetivo)}
                  onDeclarar={() => { void declararAtingido(l.objetivo); }}
                  onCriarIniciativa={() => onCriarIniciativa(l.objetivo.id)}
                  onAbrirIniciativa={onAbrirIniciativa}
                  onAbrirRisco={onAbrirRisco}
                />
              )}
            />
          </div>
        </>
      )}

      {iniciativas.some(i => !i.objetivo_id) && (
        <div className="card">
          <div className="section-title">
            {plural(iniciativas.filter(i => !i.objetivo_id).length, 'iniciativa sem objetivo', 'iniciativas sem objetivo')}
          </div>
          <div className="bento-sub">
            Não deveriam existir — a regra recusa iniciativa sem objetivo na gravação.
            Provavelmente o objetivo delas foi excluído. Reatribua pelo detalhe de cada uma.
          </div>
          <div className="lista-linhas">
            {iniciativas.filter(i => !i.objetivo_id).map(i => (
              <div className="lista-linha" key={i.id}>
                <button
                  className="lista-texto link-ini objetivo-ini-nome"
                  onClick={() => onAbrirIniciativa(i.id)}
                >
                  {i.nome || 'Iniciativa sem nome'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {criando && (
        <ObjetivoModal
          pessoas={pessoas}
          erro={error} onSalvar={salvarNovo}
          onClose={() => setCriando(false)}
        />
      )}

      {medindo && (
        <MedicaoModal
          key={medindo.id}
          objetivo={medindo}
          medicoes={medicoes}
          pf={pf}
          onClose={() => setMedindo(null)}
        />
      )}

      {editando && (
        <ObjetivoModal
          key={editando.id}
          objetivo={editando}
          pessoas={pessoas}
          erro={error} onSalvar={dados => patchEntidade('objetivos', editando.id, dados, editando.version)}
          onExcluir={() => { void excluir(editando); }}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}
