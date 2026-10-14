import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode } from 'react';
import type { Nota } from '../../types';
import type { MotivoNaoSalvo, NotaSaveStatus, UseNotas } from '../../hooks/useNotas';
import { useSessionState } from '../../hooks/useSessionState';
import { EmptyState } from '../common/EmptyState';
import { useConfirmacao } from '../common/Confirmacao';
import { filtrarNotas, linhasDaNota, ordenarNotas, tituloDaAba, type RecorteNotas } from '../../lib/notas';
import { imagensDoDoc, lerDoc } from '../../lib/notaImagens';
import { guardNavigation } from '../../lib/navigation';
import { plural } from '../../lib/portfolioLabels';
import { ListaNotas } from './ListaNotas';
import { CabecalhoNota, type EstadoGravacao } from './CabecalhoNota';
import { EditorNota } from './EditorNota';

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

/** O que está na tela da página aberta — pode estar à frente da lista (conflito). */
interface TextoNaTela { id: string; titulo: string; conteudo: string }

/**
 * Página cujo texto o servidor recusou: fica só na tela, sem salvamento
 * automático, até a pessoa escolher o que fazer com ele.
 */
interface Retida { id: string; motivo: MotivoNaoSalvo }

/**
 * Teto da espera ao sair de uma página com gravação na fila. Quase sempre a
 * resposta chega antes; numa conexão pendurada, a saída não pode travar — o
 * que ficou na fila continua no hook, e uma recusa depois disso vira aviso.
 */
const ESPERA_AO_SAIR = 3000;

/** O que sair agora descarta, por motivo da recusa. */
const SAIR_DESCARTA: Record<MotivoNaoSalvo, string> = {
  conflito: 'Outra pessoa editou esta página e o que você escreveu ainda não foi gravado. Sair agora descarta o seu texto.',
  excluida: 'Outra pessoa excluiu esta página e o que você escreveu não foi gravado. Sair agora descarta o seu texto.',
  recusada: 'O servidor recusou o que você escreveu, e o texto ainda não foi gravado. Sair agora descarta o seu texto.',
};

/** O porquê, no aviso de uma página que já saiu da tela. */
function porqueNaoSalvou(motivo: MotivoNaoSalvo, mensagem: string): string {
  if (motivo === 'conflito') return 'outra pessoa editou a página.';
  if (motivo === 'excluida') return 'outra pessoa excluiu a página.';
  return mensagem || 'o servidor recusou.';
}

/**
 * O documento sem as imagens. "Recriar com o meu texto" cria outra página: as
 * imagens da excluída foram junto com ela (cascade), e o servidor não aceita
 * imagem na criação. Pelo `reviver`, sem recursão própria.
 */
function semImagens(conteudo: string): string {
  const doc = lerDoc(conteudo);
  if (!doc || imagensDoDoc(doc).length === 0) return conteudo;
  const limpo = JSON.parse(conteudo, (_chave, valor: unknown) => (Array.isArray(valor)
    ? valor.filter(no => !(no && typeof no === 'object' && (no as { type?: unknown }).type === 'image'))
    : valor)) as { content?: unknown[] };
  return Array.isArray(limpo.content) && limpo.content.length > 0 ? JSON.stringify(limpo) : '';
}

/**
 * Lista e página lado a lado só acima de 760px. Abaixo, a lista É a tela e a
 * página abre por cima dela: escolher a primeira página sozinho ali faria o
 * "‹ Páginas" virar um botão que não sai do lugar. Sem `matchMedia` (testes,
 * pré-renderização), vale a tela larga.
 */
function telaLarga(): boolean {
  return typeof window === 'undefined' || typeof window.matchMedia !== 'function'
    || window.matchMedia('(min-width: 761px)').matches;
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

/** "As 24 linhas e as 3 imagens da página somem junto. Não há lixeira." */
function consequenciaDeExcluir(conteudo: string): ReactNode {
  const linhas = linhasDaNota(conteudo);
  const imagens = imagensDoDoc(lerDoc(conteudo)).length;
  if (linhas === 0 && imagens === 0) return 'A página some. Não há lixeira.';
  const partes: ReactNode[] = [];
  if (linhas > 0) partes.push(linhas === 1 ? <>A <b>única linha</b></> : <>As <b>{linhas} linhas</b></>);
  if (imagens > 0) {
    const artigo = partes.length === 0 ? (imagens === 1 ? 'A' : 'As') : (imagens === 1 ? 'a' : 'as');
    partes.push(imagens === 1 ? <>{artigo} <b>imagem</b></> : <>{artigo} <b>{imagens} imagens</b></>);
  }
  const verbo = linhas + imagens > 1 ? 'somem' : 'some';
  return (
    <>
      {partes[0]}{partes[1] && <> e {partes[1]}</>} da página {verbo} junto. Não há lixeira.
    </>
  );
}

export function AnotacoesTab({ notas, autor, onPedirNome, selecionada, onSelecionar }: AnotacoesTabProps) {
  const lista = notas.notas;
  const agora = useAgora();
  const [busca, setBusca] = useSessionState('anotacoes.busca', '');
  const [recorte, setRecorte] = useSessionState<RecorteNotas>('anotacoes.recorte', 'todas');
  const [confirmar, dialogo] = useConfirmacao();
  const [criando, setCriando] = useState(false);
  const [erroCriar, setErroCriar] = useState<string | null>(null);

  // O hook devolve um objeto novo a cada render (as funções dentro dele são
  // estáveis). Callbacks e efeitos o leem por ref para não rodar à toa — e o
  // descarregamento do desmontar alcança o hook depois que a aba já saiu.
  const api = useRef(notas);
  const autorRef = useRef(autor);
  useLayoutEffect(() => { api.current = notas; autorRef.current = autor; });

  /* ---------------------------------------------------------------------- */
  /* Lista: busca, recorte, ordem                                           */
  /* ---------------------------------------------------------------------- */

  const visiveis = useMemo(
    () => ordenarNotas(filtrarNotas(lista, { busca, recorte, autor })),
    [lista, busca, recorte, autor],
  );
  const contagens = useMemo<Record<RecorteNotas, number>>(() => ({
    todas: filtrarNotas(lista, { busca, recorte: 'todas', autor }).length,
    minhas: filtrarNotas(lista, { busca, recorte: 'minhas', autor }).length,
  }), [lista, busca, autor]);
  const fixadas = useMemo(() => visiveis.filter(n => n.fixada), [visiveis]);
  const recentes = useMemo(() => visiveis.filter(n => !n.fixada), [visiveis]);
  const { titulo, subtitulo } = tituloDaAba(lista, agora);
  const visiveisRef = useRef(visiveis);
  useLayoutEffect(() => { visiveisRef.current = visiveis; });

  // Id que não existe (página excluída, link velho) é o mesmo que nenhum —
  // menos quando o texto de quem escrevia nela só existe na tela: a página
  // excluída por outra pessoa continua aberta, a partir do texto guardado,
  // até a pessoa recriar ou descartar.
  const daLista = selecionada ? lista.find(n => n.id === selecionada) ?? null : null;
  const orfa = selecionada && !daLista ? notas.naoSalvas.get(selecionada) : undefined;
  const aberta = daLista ?? orfa?.nota ?? null;
  const abertaId = aberta?.id ?? null;
  /** O texto recusado da página aberta, se houver. Fora da lista, a página foi excluída. */
  const guardada = aberta ? notas.naoSalvas.get(aberta.id) : undefined;
  const motivoGuardado: MotivoNaoSalvo | undefined = guardada && (daLista ? guardada.motivo : 'excluida');
  // As outras páginas com texto recusado: um aviso com nome para cada uma.
  const naoSalvasFora = useMemo(
    () => [...notas.naoSalvas].filter(([id]) => id !== abertaId),
    [notas.naoSalvas, abertaId],
  );

  /* ---------------------------------------------------------------------- */
  /* Página aberta: texto na tela, conflito, recarga                         */
  /* ---------------------------------------------------------------------- */

  // Duas recargas: o corpo e o título trocam juntos no "Carregar a dela", mas
  // uma versão de fora que só mudou o título não pode devolver o cursor do
  // editor ao início.
  const [recarregar, setRecarregar] = useState(0);
  const [recarregarTitulo, setRecarregarTitulo] = useState(0);
  // Texto retido, envio de imagem e foco do título valem para UMA página:
  // guardar o id evita que a página seguinte nasça com a faixa da anterior.
  const [retida, setRetida] = useState<Retida | null>(null);
  const [resolvendo, setResolvendo] = useState(false);
  const [envios, setEnvios] = useState<{ id: string; n: number }>({ id: '', n: 0 });
  const [focarTituloId, setFocarTituloId] = useState<string | null>(null);
  const local = useRef<TextoNaTela | null>(null);
  const retidaRef = useRef<Retida | null>(null);
  /** Páginas deixadas com o texto retido: o último texto que o editor descarregar ao sair não grava por cima da outra pessoa. */
  const deixadasEmConflito = useRef(new Set<string>());
  const statusAnterior = useRef<NotaSaveStatus | undefined>(undefined);
  const motivoAnterior = useRef<MotivoNaoSalvo | undefined>(undefined);
  /** Página sendo excluída: nem a escolha automática nem o guard de conflito a tocam. */
  const excluindo = useRef<string | null>(null);
  /**
   * A pessoa disse "Descartar e sair" desta página. O texto guardado só sai
   * quando a página sai de fato (outro guard ainda pode dizer "ficar") — e a
   * aba que desmonta também descarta, pelo mesmo sinal.
   */
  const descartarAoSair = useRef<string | null>(null);

  const statusAberta = aberta ? notas.saveStatus[aberta.id] : undefined;
  const motivoNaTela = aberta && retida?.id === aberta.id ? retida.motivo : null;
  const emConflito = motivoNaTela === 'conflito';
  const enviando = aberta && envios.id === aberta.id ? envios.n : 0;

  /** Liga (com motivo) ou desliga a retenção do texto da página `id`. */
  const reter = useCallback((id: string, motivo: MotivoNaoSalvo | null) => {
    retidaRef.current = motivo ? { id, motivo } : null;
    if (motivo) deixadasEmConflito.current.add(id);
    else deixadasEmConflito.current.delete(id);
    descartarAoSair.current = null;
    setRetida(retidaRef.current);
  }, []);

  // Um efeito só, e nesta ordem: o 409 troca o texto da lista e o estado de
  // gravação na mesma renderização, então a transição para 'conflict' é
  // olhada ANTES da "mudança que veio de fora" — senão o texto do servidor
  // seria recarregado por cima do que a pessoa escreveu. De layout para a
  // faixa e a recarga entrarem no mesmo quadro que a lista nova.
  useLayoutEffect(() => {
    if (!aberta) { local.current = null; return; }
    const l = local.current;
    if (!l || l.id !== aberta.id) {
      // A anterior saiu depois de um "Descartar e sair": o texto guardado dela vai junto.
      if (l && descartarAoSair.current === l.id) api.current.descartarTexto(l.id);
      descartarAoSair.current = null;
      // Troca de página: a tela parte da versão da lista, sem recarregar nada
      // — ou do texto recusado, se a página saiu da tela com ele.
      const texto = guardada?.nota ?? aberta;
      local.current = { id: aberta.id, titulo: texto.titulo, conteudo: texto.conteudo };
      statusAnterior.current = statusAberta;
      motivoAnterior.current = motivoGuardado;
      reter(aberta.id, motivoGuardado ?? null);
      // A faixa da página diz isso; o aviso genérico do hook seria um segundo banner.
      if (motivoGuardado) api.current.clearError();
      setResolvendo(false);
      return;
    }
    const antes = statusAnterior.current;
    statusAnterior.current = statusAberta;
    const motivoAntes = motivoAnterior.current;
    motivoAnterior.current = motivoGuardado;
    // O servidor recusou o texto desta página agora (ou mudou o porquê: o
    // "Manter a minha" que encontra a página excluída).
    if (motivoGuardado && motivoGuardado !== motivoAntes) {
      reter(aberta.id, motivoGuardado);
      api.current.clearError();
      return;
    }
    if (statusAberta === 'conflict' && antes !== 'conflict') {
      reter(aberta.id, 'conflito');
      api.current.clearError();
      return;
    }
    if (retidaRef.current) return;
    // Versão de outra pessoa que chegou com a tela limpa (o editor nunca
    // segura mais que ~300 ms de texto): troca em silêncio.
    if (aberta.conteudo !== l.conteudo || aberta.titulo !== l.titulo) {
      local.current = { id: aberta.id, titulo: aberta.titulo, conteudo: aberta.conteudo };
      if (aberta.conteudo !== l.conteudo) setRecarregar(r => r + 1);
      if (aberta.titulo !== l.titulo) setRecarregarTitulo(r => r + 1);
    }
  }, [aberta, statusAberta, guardada, motivoGuardado, reter]);

  // A aba que desmonta depois de um "Descartar e sair" leva o texto guardado.
  // Nunca na montagem (o StrictMode desmonta e remonta uma vez): o sinal só
  // existe depois de alguém confirmar.
  useEffect(() => () => {
    const id = descartarAoSair.current;
    if (id) api.current.descartarTexto(id);
  }, []);

  /**
   * Toda edição da página passa por aqui. O `id` vem amarrado de quem chamou:
   * o editor descarrega o último texto ao desmontar, quando a seleção já é
   * outra página.
   */
  const salvar = useCallback((id: string, patch: { titulo?: string; conteudo?: string }) => {
    const l = local.current;
    if (l && l.id === id) {
      local.current = { ...l, ...patch };
      // Texto retido fica só na tela até a pessoa escolher.
      if (retidaRef.current?.id === id) return;
    } else if (deixadasEmConflito.current.has(id)) {
      return;
    } else if (api.current.textoNaoSalvo(id)) {
      // Página que já saiu da tela com o texto recusado: o resto vai para o
      // mesmo lugar, e não para a fila — gravaria sem ninguém escolher.
      api.current.guardarTexto(id, patch);
      return;
    }
    api.current.update(id, { ...patch, editado_por: autorRef.current });
  }, []);

  // Sair da página (trocar, voltar à lista, sair da aba) grava o que ficou na
  // fila do hook. No próximo tique: o editor que desmonta descarrega o último
  // texto DEPOIS desta limpeza, e ele precisa entrar no mesmo envio.
  useEffect(() => {
    if (!abertaId) return;
    return () => { setTimeout(() => { void api.current.flushPending(); }, 0); };
  }, [abertaId]);

  function aoSairDaPagina(e: FocusEvent<HTMLElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setTimeout(() => { void api.current.flushPending(); }, 0);
  }

  // Sair com gravação na fila espera a resposta: se o servidor recusar agora
  // (outra pessoa gravou ou excluiu a página), a faixa aparece com o texto na
  // tela, ANTES de a página sair — depois, o editor já teria desmontado. Só
  // enquanto há o que gravar: um guard sempre registrado faria todo Voltar do
  // navegador passar pela pergunta.
  const gravando = statusAberta === 'saving' || statusAberta === 'error';
  useEffect(() => {
    if (!abertaId || !gravando) return;
    const id = abertaId;
    return guardNavigation(async () => {
      if (retidaRef.current?.id === id || excluindo.current !== null) return true;
      if (!api.current.hasPendingWrite(id)) return true;
      let relogio: ReturnType<typeof setTimeout> | undefined;
      const teto = new Promise<void>(resolve => { relogio = setTimeout(resolve, ESPERA_AO_SAIR); });
      try {
        await Promise.race([api.current.flushPending(), teto]);
      } finally {
        clearTimeout(relogio);
      }
      return !api.current.textoNaoSalvo(id);
    });
  }, [abertaId, gravando]);

  // Texto retido não está em lugar nenhum além da tela: sair da página, da
  // aba ou do navegador pergunta antes de descartar.
  useEffect(() => {
    if (!motivoNaTela || !abertaId) return;
    const id = abertaId;
    const soltar = guardNavigation(async () => {
      if (excluindo.current !== null) return true;
      const ok = await confirmar({
        titulo: 'Sair sem salvar o seu texto?',
        consequencia: SAIR_DESCARTA[motivoNaTela],
        rotuloConfirmar: 'Descartar e sair',
        rotuloManter: 'Ficar',
      });
      if (ok) descartarAoSair.current = id;
      return ok;
    });
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisar);
    return () => { soltar(); window.removeEventListener('beforeunload', avisar); };
  }, [motivoNaTela, abertaId, confirmar]);

  /* ---------------------------------------------------------------------- */
  /* Seleção                                                                 */
  /* ---------------------------------------------------------------------- */

  // Escolha automática da primeira página, só com as duas colunas na tela.
  const escolhendo = useRef(false);
  useEffect(() => {
    if (notas.loading || aberta || escolhendo.current || !telaLarga()) return;
    const candidatas = (visiveis.length > 0 ? visiveis : ordenarNotas(lista)).filter(n => n.id !== excluindo.current);
    if (candidatas.length === 0) return;
    escolhendo.current = true;
    void onSelecionar(candidatas[0].id, { substituir: true }).finally(() => { escolhendo.current = false; });
  }, [notas.loading, aberta, visiveis, lista, onSelecionar]);

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

  function alternarFixada() {
    // A página excluída não tem o que fixar: o PATCH voltaria 404.
    if (!aberta || motivoNaTela === 'excluida') return;
    api.current.update(aberta.id, { fixada: !aberta.fixada, editado_por: autor });
  }

  async function excluir() {
    if (!aberta) return;
    const nota = aberta;
    const tela = local.current?.id === nota.id ? local.current : nota;
    const nome = tela.titulo.trim() || 'Sem título';
    const ok = await confirmar({
      titulo: `Excluir “${nome}”?`,
      consequencia: consequenciaDeExcluir(tela.conteudo),
      rotuloConfirmar: 'Excluir',
      rotuloManter: 'Manter',
    });
    if (!ok) return;
    // Primeiro sai da página (o editor desmonta e descarrega o último texto),
    // depois exclui (o hook descarta o pendente). Na ordem inversa o PATCH do
    // desmontar bateria num id apagado e o hook tentaria para sempre.
    const proxima = telaLarga()
      ? vizinha(visiveisRef.current, nota.id) ?? vizinha(ordenarNotas(api.current.notas), nota.id)
      : null;
    const jaExcluida = motivoNaTela === 'excluida';
    excluindo.current = nota.id;
    try {
      if (!(await onSelecionar(proxima, { substituir: true }))) return;
      // Outra pessoa já excluiu: no servidor não há o que apagar (o DELETE
      // voltaria 404), só o texto guardado nesta tela.
      if (jaExcluida) {
        api.current.descartarTexto(nota.id);
        void api.current.refresh();
      } else {
        await api.current.remove(nota.id);
      }
    } finally {
      excluindo.current = null;
    }
  }

  /**
   * "Manter a minha" (conflito) e "Tentar de novo" (o servidor recusou e a
   * pessoa corrigiu o texto): grava o texto da tela agora.
   */
  async function gravarTextoDaTela() {
    const l = local.current;
    if (!aberta || !l || l.id !== aberta.id) return;
    const id = aberta.id;
    setResolvendo(true);
    try {
      // Grava o texto da tela sobre a versão do servidor. Sem versão
      // explícita: o hook grava antes o que estiver na fila desta página (um
      // Fixar feito durante o conflito) e só então lê a versão da lista — a
      // versão lida no clique já seria velha, e o 409 viria da própria pessoa.
      const ok = await api.current.saveNow(id, { titulo: l.titulo, conteudo: l.conteudo, editado_por: autor });
      const agoraNaTela = local.current;
      if (!ok || agoraNaTela?.id !== id) return;
      api.current.descartarTexto(id);
      reter(id, null);
      // O que a pessoa escreveu enquanto a gravação ia e voltava segue pelo
      // caminho normal.
      if (agoraNaTela.titulo !== l.titulo || agoraNaTela.conteudo !== l.conteudo) {
        api.current.update(id, { titulo: agoraNaTela.titulo, conteudo: agoraNaTela.conteudo, editado_por: autor });
      }
    } finally {
      setResolvendo(false);
    }
  }

  /**
   * Outra pessoa excluiu a página: o texto da tela vira uma página nova, que
   * abre no lugar. A excluída sai sem perguntar — o texto dela está na nova.
   */
  async function recriar() {
    const l = local.current;
    if (!aberta || !l || l.id !== aberta.id) return;
    const antiga = aberta;
    setResolvendo(true);
    setErroCriar(null);
    try {
      const nova = await api.current.add({
        titulo: l.titulo,
        conteudo: semImagens(l.conteudo),
        fixada: antiga.fixada,
        autor: antiga.autor || autorRef.current,
        editado_por: autorRef.current,
      });
      excluindo.current = antiga.id;
      try {
        await onSelecionar(nova.id);
      } finally {
        excluindo.current = null;
      }
      api.current.descartarTexto(antiga.id);
      // A linha da excluída que ainda estiver na lista sai na releitura.
      void api.current.refresh();
    } catch (err) {
      setErroCriar(err instanceof Error && err.message ? err.message : 'Não foi possível recriar a página.');
    } finally {
      setResolvendo(false);
    }
  }

  async function carregarDela() {
    if (!aberta) return;
    const id = aberta.id;
    const minhas = linhasDaNota(local.current?.id === id ? local.current.conteudo : aberta.conteudo);
    const dela = linhasDaNota(aberta.conteudo);
    const ok = await confirmar({
      titulo: 'Descartar o seu texto e carregar a versão salva?',
      consequencia: (
        <>
          O seu texto, com <b>{plural(minhas, 'linha', 'linhas')}</b>, sai da tela, e a página
          {' '}volta à versão salva, com <b>{plural(dela, 'linha', 'linhas')}</b>.
        </>
      ),
      rotuloConfirmar: 'Carregar a dela',
      rotuloManter: 'Manter',
    });
    if (!ok) return;
    const servidor = api.current.notas.find(n => n.id === id);
    if (!servidor || local.current?.id !== id) return;
    local.current = { id, titulo: servidor.titulo, conteudo: servidor.conteudo };
    // Sai junto com o texto guardado: o editor relê a página da lista, sem ele.
    api.current.descartarTexto(id);
    reter(id, null);
    setRecarregar(r => r + 1);
    setRecarregarTitulo(r => r + 1);
  }

  /* ---------------------------------------------------------------------- */
  /* Render                                                                  */
  /* ---------------------------------------------------------------------- */

  const estado: EstadoGravacao = motivoNaTela === 'excluida' ? 'excluida'
    : motivoNaTela === 'recusada' ? 'recusada'
    : resolvendo ? 'salvando'
    : emConflito ? 'conflito'
    : statusAberta === 'error' ? 'erro'
    : enviando > 0 ? 'enviando'
    : statusAberta === 'saving' ? 'salvando'
    : 'salvo';
  /**
   * O que a faixa de erro diz. `null` é falta de rede ("Sem conexão…"); senão,
   * a mensagem do servidor — um 500 não é queda de conexão, e um 400 de
   * limite diz o que a pessoa precisa fazer.
   */
  const mensagemFaixa = estado === 'recusada'
    ? guardada?.mensagem || notas.error || null
    : estado === 'erro' && !notas.semConexao ? notas.error : null;
  // A página aberta já tem faixa própria no cabeçalho, e as outras páginas
  // com texto recusado têm aviso com nome: o genérico do hook seria um segundo.
  const comFaixa = estado === 'erro' || estado === 'recusada' || estado === 'excluida' || estado === 'conflito';
  const erroDoHook = notas.error && !comFaixa && naoSalvasFora.length === 0 ? notas.error : null;
  const erro = erroCriar ?? erroDoHook;
  const semPaginas = !notas.loading && lista.length === 0 && !aberta;
  // O editor e o título montam com o texto recusado, quando a página volta à tela com ele.
  const notaNaTela = aberta && guardada
    ? { ...aberta, titulo: guardada.nota.titulo, conteudo: guardada.nota.conteudo }
    : aberta;
  const imagensNaTela = notaNaTela ? imagensDoDoc(lerDoc(notaNaTela.conteudo)).length : 0;

  return (
    <div className="tab-page notas-page" data-aberta={aberta ? 'true' : undefined}>
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
          message="Nenhuma página ainda"
          hint="As páginas guardam resumos, pautas e pendências da equipe. Todos veem, e cada página guarda quem escreveu."
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
            carregando={notas.loading}
          />

          <div className="notas-coluna">
            {aberta && notaNaTela ? (
              <>
                <button type="button" className="btn btn-ghost notas-voltar" onClick={() => void onSelecionar(null)}>
                  <span aria-hidden="true">‹</span> Páginas
                </button>
                <section
                  className="notas-pagina"
                  aria-label={`Página ${aberta.titulo.trim() || 'Sem título'}`}
                  onBlur={aoSairDaPagina}
                >
                  <CabecalhoNota
                    key={aberta.id}
                    nota={notaNaTela}
                    recarregar={recarregarTitulo}
                    focarTitulo={focarTituloId === aberta.id}
                    onTituloFocado={() => setFocarTituloId(null)}
                    onTitulo={t => salvar(aberta.id, { titulo: t })}
                    estado={estado}
                    mensagem={mensagemFaixa}
                    imagensPerdidas={estado === 'excluida' ? imagensNaTela : 0}
                    enviando={enviando}
                    conflito={emConflito}
                    resolvendo={resolvendo}
                    agora={agora}
                    onFixar={alternarFixada}
                    onExcluir={() => void excluir()}
                    onManterMinha={() => void gravarTextoDaTela()}
                    onCarregarDela={() => void carregarDela()}
                    onRecriar={() => void recriar()}
                    onTentarAgora={() => void (estado === 'recusada' ? gravarTextoDaTela() : api.current.flushPending())}
                  />
                  <div className="notas-corpo">
                    <EditorNota
                      key={aberta.id}
                      nota={notaNaTela}
                      recarregar={recarregar}
                      onChange={c => salvar(aberta.id, { conteudo: c })}
                      onUploads={n => setEnvios(e => (e.id === aberta.id && e.n === n ? e : { id: aberta.id, n }))}
                    />
                  </div>
                  <p className="notas-dica">
                    <span><kbd>/</kbd> insere um bloco</span>
                    <span><kbd>##</kbd> título</span>
                    <span><kbd>1.</kbd> lista numerada</span>
                    <span><kbd>-</kbd> marcadores</span>
                    <span><kbd>[]</kbd> tarefa</span>
                    <span><kbd>&gt;</kbd> citação</span>
                    <span><kbd>Ctrl+Shift+H</kbd> destaque</span>
                    <span><kbd>Ctrl+V</kbd> cola imagem</span>
                    <span><kbd>Alt+Shift+↑ ↓</kbd> move o bloco</span>
                  </p>
                </section>
              </>
            ) : null}
          </div>
        </div>
      )}

      {dialogo}
    </div>
  );
}
