import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Nota } from '../../types';
import type { MotivoNaoSalvo, UseNotas } from '../../hooks/useNotas';
import { useSessionState } from '../../hooks/useSessionState';
import { EmptyState } from '../common/EmptyState';
import { filtrarNotas, ordenarNotas, tituloDaAba, type RecorteNotas } from '../../lib/notas';
import { gravarZoomNota, lerZoomNota, type ZoomNota } from '../../lib/zoomNota';
import { ListaNotas } from './ListaNotas';
import { ESPERA_AO_SAIR, PaginaNota } from './PaginaNota';

/**
 * Props da aba Anotações. É o CONTRATO com o `App`: o nome exportado e estas
 * props não mudam sem mudar o `App` junto.
 */
export interface AnotacoesTabProps {
  /**
   * As páginas. O hook mora no `App` (como `useTasks`): o salvamento
   * automático pendente sobrevive à troca de aba, e o `App` relê a lista ao
   * entrar na aba e quando a janela volta ao foco.
   */
  notas: UseNotas;
  /** Nome do chip de autor; `''` quando ninguém se identificou. */
  autor: string;
  /** Abre o mesmo pedido de nome do chip de autor do header. */
  onPedirNome: () => void;
  /** Página aberta, lida da URL (`#tab=anotacoes&nota=<id>`). */
  selecionada: string | null;
  /**
   * Abre uma página (ou volta à lista, com `null`). Passa pelos guards de
   * navegação — um envio de imagem em andamento pergunta antes — e resolve
   * `false` quando alguém disse "não". `substituir` troca a entrada do
   * histórico em vez de empilhar: é para a escolha automática da primeira
   * página, senão o Voltar do navegador quica de volta nela.
   */
  onSelecionar: (id: string | null, opcoes?: { substituir?: boolean }) => Promise<boolean>;
}

/**
 * Página pedida pela URL que a lista desta tela não tem: o link que alguém
 * acabou de mandar, de uma página criada depois da última leitura. A tela
 * relê uma vez antes de dizer que ela não existe — e, nesse meio-tempo, não
 * escolhe outra página no lugar (a URL pedida seria trocada pela primeira).
 */
interface Conferencia { id: string; fase: 'conferindo' | 'feita' }


/** O que a tela diz quando a página pedida pelo link não veio nem depois de reler. */
const PAGINA_INEXISTENTE = 'Esta página não existe mais ou foi excluída.';


/** O porquê, no aviso de uma página que já saiu da tela. */
function porqueNaoSalvou(motivo: MotivoNaoSalvo, mensagem: string): string {
  if (motivo === 'conflito') return 'outra pessoa editou a página.';
  if (motivo === 'excluida') return 'outra pessoa excluiu a página.';
  return mensagem || 'o servidor recusou.';
}


/**
 * Lista e página lado a lado só acima de 960px — o mesmo corte de notas.css,
 * que é quem esconde um dos lados. Abaixo, a lista É a tela e a página abre
 * por cima dela: escolher a primeira página sozinho ali faria o "‹ Páginas"
 * virar um botão que não sai do lugar. Sem `matchMedia` (testes,
 * pré-renderização), vale a tela larga.
 *
 * Por que 960 e não 760: com o rail de 76px, as duas colunas deixavam o texto
 * com ~33 caracteres por linha a 761px e ~46 a 901px. Daqui para baixo a
 * página fica sozinha (~68 a 761px); a 961px, já com a lista, ~55.
 */
const DUAS_COLUNAS = '(min-width: 961px)';
function telaLarga(): boolean {
  return typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    || window.matchMedia(DUAS_COLUNAS).matches;
}

/**
 * Relógio de minuto para o "há 5 min" não envelhecer com a página parada. Só
 * redesenha: quem relê as páginas é o `App`, nunca a aba.
 */
function useAgora(): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return agora;
}

/** A página ao lado da que sai: a seguinte na ordem da lista, ou a anterior. */
function vizinha(ordem: readonly Nota[], id: string): string | null {
  const i = ordem.findIndex(n => n.id === id);
  if (i < 0) return ordem[0]?.id ?? null;
  return ordem[i + 1]?.id ?? ordem[i - 1]?.id ?? null;
}


export function AnotacoesTab({ notas, autor, onPedirNome, selecionada, onSelecionar }: AnotacoesTabProps) {
  const lista = notas.notas;
  const agora = useAgora();
  const [busca, setBusca] = useSessionState('anotacoes.busca', '');
  const [recorte, setRecorte] = useSessionState<RecorteNotas>('anotacoes.recorte', 'todas');
  const [criando, setCriando] = useState(false);
  const [erroCriar, setErroCriar] = useState<string | null>(null);
  const [zoom, setZoom] = useState<ZoomNota>(lerZoomNota);
  const mudarZoom = useCallback((z: ZoomNota) => { setZoom(z); gravarZoomNota(z); }, []);
  const [focarTituloId, setFocarTituloId] = useState<string | null>(null);
  /** A página mostra faixa própria: o aviso genérico do hook seria um segundo. */
  const [comFaixa, setComFaixa] = useState(false);
  /** Página sendo excluída: nem a escolha automática nem o guard de conflito a tocam. */
  const excluindo = useRef<string | null>(null);

  // O hook devolve um objeto novo a cada render (as funções dentro dele são
  // estáveis). Callbacks e efeitos o leem por ref para não rodar à toa — e o
  // descarregamento do desmontar alcança o hook depois que a aba já saiu.
  const api = useRef(notas);
  useLayoutEffect(() => { api.current = notas; });

  /**
   * A última versão confirmada de cada página, lida da lista em cada
   * renderização em que a linha É o que o servidor confirmou: sem gravação
   * na fila, sem texto retido, e o estado salvo (ou nunca editado, ou a
   * versão do servidor que o 409 trouxe). Serve à lista: a edição otimista
   * que o servidor recusou (um 400 de limite) fica na linha até alguém
   * decidir, e a lista a anunciava como se fosse da página.
   */
  const confirmadas = useRef(new Map<string, Nota>());
  useLayoutEffect(() => {
    for (const n of lista) {
      const status = notas.saveStatus[n.id];
      if (status !== undefined && status !== 'saved' && status !== 'conflict') continue;
      if (notas.naoSalvas.has(n.id) || notas.hasPendingWrite(n.id)) continue;
      confirmadas.current.set(n.id, n);
    }
  });

  /* ---------------------------------------------------------------------- */
  /* Lista: busca, recorte, ordem                                           */
  /* ---------------------------------------------------------------------- */

  // A lista mostra o que o servidor tem. A página com texto retido (recusado,
  // ou de uma página que outra pessoa excluiu) aparece na versão confirmada
  // enquanto a linha ainda for a mesma versão; o editor continua com o texto
  // da tela. No 409 a linha já é a do servidor, mais nova, e passa direto.
  const naLista = useMemo(() => {
    if (notas.naoSalvas.size === 0) return lista;
    return lista.map(n => {
      const c = notas.naoSalvas.has(n.id) ? confirmadas.current.get(n.id) : undefined;
      if (!c || c.version !== n.version) return n;
      if (c.titulo === n.titulo && c.conteudo === n.conteudo && c.editado_por === n.editado_por) return n;
      return { ...n, titulo: c.titulo, conteudo: c.conteudo, editado_por: c.editado_por };
    });
  }, [lista, notas.naoSalvas]);
  const visiveis = useMemo(
    () => ordenarNotas(filtrarNotas(naLista, { busca, recorte, autor })),
    [naLista, busca, recorte, autor],
  );
  const contagens = useMemo<Record<RecorteNotas, number>>(() => ({
    todas: filtrarNotas(naLista, { busca, recorte: 'todas', autor }).length,
    minhas: filtrarNotas(naLista, { busca, recorte: 'minhas', autor }).length,
  }), [naLista, busca, autor]);
  const fixadas = useMemo(() => visiveis.filter(n => n.fixada), [visiveis]);
  const recentes = useMemo(() => visiveis.filter(n => !n.fixada), [visiveis]);
  const { titulo, subtitulo } = tituloDaAba(naLista, agora);
  const visiveisRef = useRef(visiveis);
  useLayoutEffect(() => { visiveisRef.current = visiveis; });

  // Id que a lista não tem: a página foi excluída, ou é nova e esta tela ainda
  // não leu (ver `Conferencia`) — menos quando o texto de quem escrevia nela
  // só existe na tela: a página excluída por outra pessoa continua aberta, a
  // partir do texto guardado, até a pessoa recriar ou descartar.
  const daLista = selecionada ? lista.find(n => n.id === selecionada) ?? null : null;
  const orfa = selecionada && !daLista ? notas.naoSalvas.get(selecionada) : undefined;
  const aberta = daLista ?? orfa?.nota ?? null;
  const abertaId = aberta?.id ?? null;
  // As outras páginas com texto recusado: um aviso com nome para cada uma.
  const naoSalvasFora = useMemo(
    () => [...notas.naoSalvas].filter(([id]) => id !== abertaId),
    [notas.naoSalvas, abertaId],
  );

  // A conferência vale para UM id: trocar de seleção a esquece, e voltar ao
  // mesmo link relê de novo (a página pode ter sido criada nesse meio-tempo).
  const [conferencia, setConferencia] = useState<Conferencia | null>(null);
  if (conferencia && conferencia.id !== selecionada) setConferencia(null);
  const desconhecida = selecionada && !aberta ? selecionada : null;
  /** Relendo, ou a leitura inicial ainda não chegou: a página pode estar a caminho. */
  const procurando = desconhecida !== null
    && (notas.loading || conferencia?.id !== desconhecida || conferencia.fase === 'conferindo');
  /** Relida, e a página não veio. */
  const inexistente = desconhecida !== null && !procurando;

  /* ---------------------------------------------------------------------- */
  /* Seleção                                                                 */
  /* ---------------------------------------------------------------------- */

  // Página pedida que a lista não tem: relê uma vez antes de desistir dela. A
  // gravação na fila vai antes, com o mesmo teto da saída — o hook não relê
  // por cima de quem digita, e a releitura pulada diria "não existe" à toa.
  useEffect(() => {
    if (!desconhecida || notas.loading || conferencia?.id === desconhecida) return;
    const id = desconhecida;
    setConferencia({ id, fase: 'conferindo' });
    void (async () => {
      let relogio: ReturnType<typeof setTimeout> | undefined;
      try {
        if (api.current.hasPendingWrites()) {
          const teto = new Promise<void>(resolve => { relogio = setTimeout(resolve, ESPERA_AO_SAIR); });
          await Promise.race([api.current.flushPending(), teto]);
        }
        await api.current.refresh();
      } finally {
        clearTimeout(relogio);
        setConferencia(c => (c?.id === id ? { id, fase: 'feita' } : c));
      }
    })();
  }, [desconhecida, notas.loading, conferencia]);

  // Escolha automática da primeira página, só com as duas colunas na tela e
  // só sem página pedida: a pedida que a lista não tem passa pela conferência
  // acima, e trocá-la pela primeira apagaria da URL o link que a pessoa abriu.
  const escolhendo = useRef(false);
  useEffect(() => {
    if (notas.loading || selecionada || escolhendo.current || !telaLarga()) return;
    const candidatas = (visiveis.length > 0 ? visiveis : ordenarNotas(lista)).filter(n => n.id !== excluindo.current);
    if (candidatas.length === 0) return;
    escolhendo.current = true;
    void onSelecionar(candidatas[0].id, { substituir: true }).finally(() => { escolhendo.current = false; });
  }, [notas.loading, selecionada, visiveis, lista, onSelecionar]);

  // No celular, voltar à lista devolve o foco à linha da página que estava aberta.
  const ultimaAberta = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (abertaId) {
      if (ultimaAberta.current !== abertaId && !telaLarga()) window.scrollTo({ top: 0 });
      ultimaAberta.current = abertaId;
      return;
    }
    if (ultimaAberta.current && !telaLarga()) {
      document.getElementById(`nota-item-${ultimaAberta.current}`)?.focus();
    }
  }, [abertaId]);

  function abrir(id: string) {
    if (id === abertaId) return;
    void onSelecionar(id);
  }

  /** Excluída a página, a tela larga abre a vizinha na lista; a estreita volta à lista. */
  const depoisDeExcluir = useCallback((id: string) => (telaLarga()
    ? vizinha(visiveisRef.current, id) ?? vizinha(ordenarNotas(api.current.notas), id)
    : null), []);

  /* ---------------------------------------------------------------------- */
  /* Ações                                                                   */
  /* ---------------------------------------------------------------------- */

  async function novaPagina() {
    if (criando) return;
    setCriando(true);
    setErroCriar(null);
    try {
      const nova = await api.current.add({ titulo: '', conteudo: '', fixada: false, autor, editado_por: autor });
      // A página nova não tem texto: uma busca ativa a esconderia da lista
      // logo depois de criada, e "Minhas" sem nome também.
      if (busca.trim()) setBusca('');
      if (recorte === 'minhas' && !autor.trim()) setRecorte('todas');
      setFocarTituloId(nova.id);
      // Alguém disse "ficar" (imagem subindo, texto em conflito): a página
      // nova, ainda em branco e que ninguém abriu, não fica para trás.
      if (!(await onSelecionar(nova.id))) {
        setFocarTituloId(null);
        await api.current.remove(nova.id);
      }
    } catch (err) {
      setErroCriar(err instanceof Error && err.message ? err.message : 'Não foi possível criar a página.');
    } finally {
      setCriando(false);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Render                                                                  */
  /* ---------------------------------------------------------------------- */

  /** A página pedida não veio porque a releitura não chegou ao servidor — não porque ela não existe. */
  const semRedeParaConferir = inexistente && notas.semConexao;
  const erroDoHook = notas.error && !comFaixa && !semRedeParaConferir && naoSalvasFora.length === 0 ? notas.error : null;
  const erro = erroCriar ?? erroDoHook;
  const semPaginas = !notas.loading && lista.length === 0 && !aberta && !procurando;
  return (
    // `data-aberta` é "há página pedida", achada ou não: na tela estreita a
    // coluna da página aparece também para dizer que está abrindo, ou que a
    // página não existe — com o "‹ Páginas" de volta à lista.
    <div className="tab-page notas-page" data-aberta={selecionada && !semPaginas ? 'true' : undefined}>
      <div className="page-bar">
        <div>
          <h1 className="page-title">{titulo}</h1>
          <div className="page-subtitle">{subtitulo}</div>
        </div>
        <div className="actions-row">
          <button type="button" className="btn btn-navy" onClick={() => void novaPagina()} disabled={criando}>
            Nova página
          </button>
        </div>
      </div>

      {erro && (
        <div className="error-banner" role="alert">
          <span>{erro}</span>
          <button
            type="button"
            className="error-banner-dismiss"
            onClick={() => { setErroCriar(null); api.current.clearError(); }}
            aria-label="Fechar aviso"
          >
            ×
          </button>
        </div>
      )}

      {/* Página que saiu da tela e cujo texto o servidor recusou depois (o 409
          que chega após a troca de página, ou a conexão que volta): o texto
          não some — fica guardado, e o aviso diz onde está. */}
      {naoSalvasFora.map(([id, g]) => (
        <div key={id} className="error-banner" role="alert">
          <span>
            O seu texto em “{g.nota.titulo.trim() || 'Sem título'}” não foi salvo: {porqueNaoSalvou(g.motivo, g.mensagem)}
          </span>
          <button type="button" onClick={() => abrir(id)}>Abrir página</button>
        </div>
      ))}

      {semPaginas ? (
        <EmptyState
          contexto="Bloco de notas"
          message={inexistente ? PAGINA_INEXISTENTE : 'Nenhuma página ainda'}
          hint={inexistente
            ? 'O link é de uma página que não está mais aqui, e a aba não tem nenhuma outra. As páginas guardam resumos, pautas e pendências da equipe.'
            : 'As páginas guardam resumos, pautas e pendências da equipe. Todos veem, e cada página guarda quem escreveu.'}
          action={{ label: 'Nova página', onClick: () => void novaPagina() }}
        />
      ) : (
        <div className="notas-painel">
          <ListaNotas
            fixadas={fixadas}
            recentes={recentes}
            busca={busca}
            onBusca={setBusca}
            recorte={recorte}
            onRecorte={setRecorte}
            contagens={contagens}
            autor={autor}
            onPedirNome={onPedirNome}
            selecionada={abertaId}
            onAbrir={abrir}
            agora={agora}
            carregando={notas.loading || procurando}
          />

          <div className="notas-coluna">
            {selecionada && (
              <button type="button" className="btn btn-ghost notas-voltar" onClick={() => void onSelecionar(null)}>
                <span aria-hidden="true">‹</span> Páginas
              </button>
            )}
            {procurando && (
              <div className="notas-abrindo" role="status">
                <p className="notas-abrindo-texto">Abrindo a página…</p>
                {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton-row" />)}
              </div>
            )}
            {inexistente && (semRedeParaConferir ? (
              <EmptyState
                message="Sem conexão: não deu para abrir esta página"
                hint="A lista desta tela pode estar desatualizada. O link abre quando a conexão voltar."
                action={{ label: 'Tentar de novo', onClick: () => { api.current.clearError(); setConferencia(null); } }}
              />
            ) : (
              <EmptyState
                message={PAGINA_INEXISTENTE}
                hint="O link pode ser de uma página que alguém excluiu. As páginas da equipe estão na lista."
                action={{ label: 'Ver as páginas', onClick: () => void onSelecionar(null) }}
              />
            ))}
            <PaginaNota
              notas={notas}
              autor={autor}
              aberta={aberta}
              daLista={daLista !== null}
              agora={agora}
              zoom={zoom}
              onZoom={mudarZoom}
              focarTitulo={aberta !== null && focarTituloId === aberta.id}
              onTituloFocado={() => setFocarTituloId(null)}
              excluindo={excluindo}
              depoisDeExcluir={depoisDeExcluir}
              onSelecionar={onSelecionar}
              onErro={setErroCriar}
              onFaixa={setComFaixa}
            />
          </div>
        </div>
      )}

    </div>
  );
}
