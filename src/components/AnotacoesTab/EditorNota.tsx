import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, type Editor, type JSONContent, type UseEditorOptions } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Link } from '@tiptap/extension-link';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Highlight } from '@tiptap/extension-highlight';
import { Placeholder } from '@tiptap/extensions';
import type { Node as NoPM, Schema } from '@tiptap/pm/model';
import { EditorState, NodeSelection, Selection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Nota } from '../../types';
import { imagemIdDoSrc, imagensDoDoc, lerDoc, notaImagemUrl, type NoDoc } from '../../lib/notaImagens';
import {
  ACCEPT_IMAGEM_NOTA,
  ImagemRecusadaError,
  MAX_IMAGE_DIMENSION_NOTA,
  QUALIDADE_NOTA,
  arquivoDeDataUrl,
  base64Bytes,
  comExtensaoDe,
  prepareAttachment,
  type PreparedAttachment,
} from '../../lib/imageAttachments';
import { MSG_SEM_CONEXAO, ehCancelamento, uploadNotaImagem } from '../../lib/notasApi';
import { avisoImagensDaWeb, escolherColagem, imagensDoHtmlColado } from '../../lib/colagem';
import { guardNavigation } from '../../lib/navigation';
import { linkPermitidoNoEditor } from '../../lib/links';
import { plural } from '../../lib/portfolioLabels';
import { useConfirmacao } from '../common/Confirmacao';
import { ImageLightbox, type ImagemDoVisor } from '../common/ImageLightbox';
import { ImagemNota } from './imagemNota';
import { EnvioImagemView, IconeImagem, type EnvioImagem } from './ImagemNotaView';
import {
  UploadsDeImagem,
  adicionarMarcadores,
  marcadoresDe,
  pontoDoArraste,
  pontoDoCursor,
  removerMarcador,
  trocarMarcadorPorImagem,
  type Marcador,
  type PontoDeInsercao,
} from './uploadsDeImagem';
import { MenuBarra } from './menuBarra';
import { MenuBarraView } from './MenuBarraView';
import { BolhaFormato } from './BolhaFormato';
import { BarraFormatoMovel } from './BarraFormatoMovel';
import { AlcaBloco } from './AlcaBloco';
import { MoverBloco } from './moverBloco';
import { semBlocoSelecionado } from './selecaoInicial';

/**
 * Props do editor de uma página. É o CONTRATO entre a página (AnotacoesTab) e
 * o editor.
 */
export interface EditorNotaProps {
  /**
   * A página. O editor é montado com `key={nota.id}` e lê `nota.conteudo` SÓ
   * ao montar e quando `recarregar` muda — nunca a cada atualização do
   * servidor, para um conflito nunca apagar o texto local.
   */
  nota: Nota;
  /** Incrementado pela página para trocar o texto da tela pelo do servidor ("Carregar a dela"). */
  recarregar: number;
  /** Documento serializado (JSON do TipTap). Nunca chamado ao abrir nem ao recarregar. */
  onChange(conteudo: string): void;
  /** Quantas imagens estão subindo agora (0 quando nenhuma). */
  onUploads?(emAndamento: number): void;
  /** Foca o fim do documento ao montar. */
  autoFocus?: boolean;
}

/**
 * Ritmo do `onChange`: na hora na primeira mudança depois de um intervalo
 * quieto, depois no máximo a cada INTERVALO enquanto o texto muda, e uma
 * última vez com o estado final. Nunca há mais que isto de texto que só existe
 * na tela — é o que mantém o hook protegendo quem digita sem pausa (ele só
 * segura a versão de outra pessoa enquanto há gravação pendente).
 */
const INTERVALO_ONCHANGE = 300;

const PLACEHOLDER = 'Escreva, ou digite / para inserir um bloco';

const OPCOES_PREPARO = { maxDimension: MAX_IMAGE_DIMENSION_NOTA, qualidade: QUALIDADE_NOTA, aceitos: ACCEPT_IMAGEM_NOTA };

/**
 * O Link sem os atributos do HTML de origem. `class`, `rel`, `target` e
 * `title` de um link colado não são guardados nem desenhados: os de fora
 * trocariam os padrões seguros e uma classe do próprio app (`lightbox`, `btn`)
 * ganharia o estilo global dela. Quem escreve `target` e `rel` no `<a>` é só o
 * `HTMLAttributes` da configuração, abaixo. A regra de quais endereços viram
 * link é a de `lib/links.ts`, a mesma da barra flutuante.
 */
const LinkSeguro = Link.extend({
  addAttributes() {
    const descartado = { default: null, rendered: false, parseHTML: () => null };
    return { ...this.parent?.(), class: descartado, rel: descartado, target: descartado, title: descartado };
  },
});

/** Aviso da página cujo documento tem bloco ou marca fora do esquema deste editor. */
export const MSG_DOC_ILEGIVEL = 'Esta página tem um bloco que este editor não lê. Nada foi alterado.';

/**
 * O documento gravado, lido pelo esquema do editor. Página vazia (ou texto que
 * nem é documento) vira página em branco; `null` é um documento que o esquema
 * NÃO lê — um bloco ou marca que este editor não tem (o `code`, desligado; um
 * import futuro). Esse não pode abrir em branco: a primeira tecla gravaria o
 * vazio por cima do conteúdo real.
 */
function docDoConteudo(schema: Schema, conteudo: string): NoPM | null {
  const json = lerDoc(conteudo);
  if (!json) return schema.topNodeType.createAndFill() as NoPM;
  try {
    const doc = schema.nodeFromJSON(json);
    doc.check();
    return doc;
  } catch {
    return null;
  }
}

/** De onde vêm os bytes: o arquivo colado, ou a imagem de outra página, baixada na hora do envio. */
type Fonte = File | (() => Promise<File>);

interface Novo {
  fonte: Fonte;
  nome: string;
  bytes: number;
}

function deArquivo(arquivo: File): Novo {
  return { fonte: arquivo, nome: arquivo.name || 'imagem', bytes: arquivo.size };
}

function mimeDoDataUrl(src: string): string {
  return /^data:([^;,]+)/i.exec(src)?.[1]?.toLowerCase() ?? 'image/png';
}

export const MSG_OUTRA_PAGINA_SUMIU = 'A imagem da outra página não existe mais.';
export const MSG_OUTRA_PAGINA_SEM_CONEXAO = 'Sem conexão: não deu para buscar a imagem da outra página.';
const MSG_OUTRA_PAGINA_FALHOU = 'O servidor não entregou a imagem da outra página.';

/**
 * Imagem de outra página: mesma origem, a rota pública da imagem. Reenviada
 * para esta. Toda falha sai com mensagem nossa — nunca o texto cru do
 * navegador ("Failed to fetch"). Imagem que não existe mais (404: a página foi
 * excluída ou a imagem foi varrida) é recusa, não erro: tentar de novo traria
 * o mesmo 404.
 */
async function baixarDeOutraPagina(src: string, nome: string): Promise<File> {
  let resposta: Response;
  try {
    resposta = await fetch(src, { credentials: 'same-origin' });
  } catch {
    throw new Error(MSG_OUTRA_PAGINA_SEM_CONEXAO);
  }
  if (resposta.status === 404 || resposta.status === 410) {
    throw new ImagemRecusadaError('ilegivel', MSG_OUTRA_PAGINA_SUMIU);
  }
  if (!resposta.ok) throw new Error(MSG_OUTRA_PAGINA_FALHOU);
  let blob: Blob;
  try {
    blob = await resposta.blob();
  } catch {
    throw new Error(MSG_OUTRA_PAGINA_SEM_CONEXAO);
  }
  return new File([blob], comExtensaoDe(nome || 'imagem', blob.type || 'image/png'), { type: blob.type });
}

function previaDe(fonte: Fonte | undefined): string | undefined {
  if (!(fonte instanceof File) || typeof URL.createObjectURL !== 'function') return undefined;
  return URL.createObjectURL(fonte);
}

function soltarPrevia(url: string | undefined) {
  if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
}

const EM_CURSO = new Set<EnvioImagem['fase']>(['fila', 'preparando', 'enviando']);

/**
 * O corpo de uma página da aba Anotações: um editor de blocos (TipTap) que
 * grava sozinho. Títulos, listas, tarefas, citação, divisor, destaque, link e
 * imagem. Atalhos de markdown (`##`, `1.`, `-`, `[]`, `>`, `---`) valem ao
 * digitar; "/" abre o menu de blocos (`menuBarra.ts`), a seleção de texto
 * mostra a barra de formato (`BolhaFormato`) e a calha esquerda tem o "+" e a
 * alça que move o bloco (`AlcaBloco`, `moverBloco.ts`). No toque (ponteiro
 * grosso até 1100px) a bolha cede à barra acima do teclado
 * (`BarraFormatoMovel`).
 *
 * Imagem entra colada, arrastada, solta de fora da página ou escolhida no
 * item "Imagem" do menu "/" — os quatro pelo mesmo `enfileirar`. Enquanto sobe, o
 * lugar dela é um marcador FORA do documento (`uploadsDeImagem.ts`): o
 * documento só recebe o bloco com o endereço final, numa transação comum.
 */
export function EditorNota({ nota, recarregar, onChange, onUploads, autoFocus }: EditorNotaProps) {
  const notaId = nota.id;
  const notaRef = useRef(nota);
  notaRef.current = nota;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onUploadsRef = useRef(onUploads);
  onUploadsRef.current = onUploads;
  const autoFocusRef = useRef(autoFocus);

  // ---------- Ritmo do onChange ----------
  const editorRef = useRef<Editor | null>(null);
  /** Falso até o documento da abertura estar normalizado: antes disso, mudança não é edição. */
  const prontoRef = useRef(false);
  /** O texto com que o editor foi montado (o `content` das opções, lidas uma vez). */
  const conteudoAbertoRef = useRef(nota.conteudo);
  /**
   * O documento gravado tem bloco ou marca que este editor não lê. A página
   * fica só para leitura e nada é emitido: abrir em branco e deixar escrever
   * gravaria o vazio por cima do conteúdo real.
   */
  const [ilegivel, setIlegivel] = useState(false);
  /** O JSON carregado ou emitido por último. Só se emite o que difere dele. */
  const ultimoRef = useRef<string | null>(null);
  /** O documento mais recente. Serializar só na hora de emitir, nunca a cada tecla. */
  const docRef = useRef<NoPM | null>(null);
  const ritmoRef = useRef<{ ultimaEmissao: number; timer: ReturnType<typeof setTimeout> | null }>({ ultimaEmissao: 0, timer: null });

  function cancelarRitmo() {
    const r = ritmoRef.current;
    if (r.timer) clearTimeout(r.timer);
    r.timer = null;
  }

  function emitir() {
    cancelarRitmo();
    ritmoRef.current.ultimaEmissao = Date.now();
    const doc = docRef.current;
    if (!doc) return;
    const json = JSON.stringify(doc.toJSON());
    if (json === ultimoRef.current) return;
    ultimoRef.current = json;
    onChangeRef.current(json);
  }

  function agendar() {
    const r = ritmoRef.current;
    if (r.timer) return; // já há uma emissão marcada; ela leva o estado de então
    const espera = INTERVALO_ONCHANGE - (Date.now() - r.ultimaEmissao);
    if (espera <= 0) emitir();
    else r.timer = setTimeout(emitir, espera);
  }

  /** Emite o que está marcado, sem esperar o intervalo (blur, desmontar). */
  function descarregar() {
    if (ritmoRef.current.timer) emitir();
  }

  /**
   * O documento que acabou de ser carregado é o "gravado": a normalização do
   * TipTap (o parágrafo final que o TrailingNode acrescenta) acontece aqui,
   * fora do desfazer e sem evento de mudança, e o resultado vira a referência.
   * Abrir uma página nunca grava nada, nem `editado_por`. `soltarBloco`: a
   * seleção de bloco que o ProseMirror inventou ao abrir vira cursor
   * (`semBlocoSelecionado`); falso quando foi a pessoa que escolheu o bloco.
   */
  function normalizar(editor: Editor, soltarBloco = true) {
    const tr = editor.state.tr;
    const selecao = soltarBloco ? semBlocoSelecionado(tr.selection) : tr.selection;
    if (selecao !== tr.selection) tr.setSelection(selecao);
    editor.view.dispatch(tr.setMeta('addToHistory', false).setMeta('preventUpdate', true));
    docRef.current = editor.state.doc;
    ultimoRef.current = JSON.stringify(editor.getJSON());
  }

  /** Só leitura, sem salvamento armado: o documento gravado fica como está no servidor. */
  function travar(editor: Editor) {
    cancelarRitmo();
    prontoRef.current = false;
    editor.setEditable(false, false);
    setIlegivel(true);
  }

  /** Documento legível de novo ("Carregar a dela" trouxe um que este editor lê). */
  function destravar(editor: Editor) {
    if (!editor.isEditable) editor.setEditable(true, false);
    setIlegivel(false);
  }

  // ---------- Envios de imagem ----------
  const [envios, setEnvios] = useState<EnvioImagem[]>([]);
  const fontes = useRef(new Map<string, Fonte>());
  const preparadas = useRef(new Map<string, PreparedAttachment>());
  const controles = useRef(new Map<string, AbortController>());
  const conteineres = useRef(new Map<string, HTMLElement>());
  const previas = useRef(new Map<string, string>());
  const fila = useRef<Promise<void>>(Promise.resolve());
  const montado = useRef(true);
  const sequencia = useRef(0);
  const trocando = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** O último número passado a `onUploads`. */
  const relatado = useRef(0);

  const [soltando, setSoltando] = useState(false);
  const soltandoRef = useRef(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [visor, setVisor] = useState<{ imagens: ImagemDoVisor[]; index: number } | null>(null);
  const [confirmar, dialogo] = useConfirmacao();

  function marcarSoltando(valor: boolean) {
    if (soltandoRef.current === valor) return;
    soltandoRef.current = valor;
    setSoltando(valor);
  }

  function atualizar(id: string, mudanca: Partial<EnvioImagem>) {
    if (!montado.current) return;
    setEnvios(lista => lista.map(e => (e.id === id ? { ...e, ...mudanca } : e)));
  }

  function vivo(id: string): boolean {
    return montado.current && fontes.current.has(id);
  }

  function esquecer(id: string) {
    fontes.current.delete(id);
    preparadas.current.delete(id);
    controles.current.delete(id);
    conteineres.current.delete(id);
    soltarPrevia(previas.current.get(id));
    previas.current.delete(id);
    if (montado.current) setEnvios(lista => lista.filter(e => e.id !== id));
  }

  function falhar(id: string, mensagem: string) {
    let previa = previas.current.get(id);
    if (!previa) {
      previa = previaDe(fontes.current.get(id));
      if (previa) previas.current.set(id, previa);
    }
    atualizar(id, { fase: 'erro', mensagem, previa });
  }

  /** Um envio por vez: o preparo usa canvas e o corpo é pesado. */
  function agendarEnvio(id: string) {
    fila.current = fila.current.then(() => processar(id)).catch(() => undefined);
  }

  async function processar(id: string): Promise<void> {
    if (!vivo(id)) return;
    let preparada = preparadas.current.get(id);
    if (!preparada) {
      atualizar(id, { fase: 'preparando', progresso: 0, mensagem: undefined, motivo: undefined, titulo: undefined });
      let arquivo: File;
      try {
        const fonte = fontes.current.get(id) as Fonte;
        arquivo = typeof fonte === 'function' ? await fonte() : fonte;
      } catch (err) {
        if (!vivo(id)) return;
        // A imagem da outra página não existe mais: recusa (âmbar, sem
        // "Tentar de novo", fora da guarda de saída) — não há o que reenviar.
        if (err instanceof ImagemRecusadaError) {
          atualizar(id, { fase: 'recusada', motivo: err.motivo, mensagem: err.message, titulo: 'Imagem indisponível' });
        } else {
          falhar(id, err instanceof Error && err.message ? err.message : MSG_SEM_CONEXAO);
        }
        return;
      }
      if (!vivo(id)) return;
      // Baixada uma vez: o "Tentar de novo" não busca a outra página de novo.
      fontes.current.set(id, arquivo);
      atualizar(id, { nome: arquivo.name || 'imagem', bytesOriginais: arquivo.size });
      try {
        preparada = await prepareAttachment(arquivo, OPCOES_PREPARO);
      } catch (err) {
        if (!vivo(id)) return;
        atualizar(id, {
          fase: 'recusada',
          motivo: err instanceof ImagemRecusadaError ? err.motivo : 'ilegivel',
          mensagem: err instanceof ImagemRecusadaError
            ? err.message
            : 'O arquivo pode estar corrompido, ou num formato que este navegador não lê.',
        });
        return;
      }
      if (!vivo(id)) return;
      preparadas.current.set(id, preparada);
    }

    const controle = new AbortController();
    controles.current.set(id, controle);
    atualizar(id, {
      fase: 'enviando',
      progresso: 0,
      mensagem: undefined,
      bytesEnviados: base64Bytes(preparada.dados),
      largura: preparada.largura,
      altura: preparada.altura,
    });
    try {
      const imagem = await uploadNotaImagem(
        notaId,
        { nome: preparada.nome, mime: preparada.mime, dados: preparada.dados },
        { signal: controle.signal, onProgresso: fracao => { if (vivo(id)) atualizar(id, { progresso: fracao }); } },
      );
      const editor = editorRef.current;
      if (!vivo(id) || !editor || editor.isDestroyed) return;
      // A página travou enquanto a imagem subia (a versão nova é ilegível):
      // nada entra num documento que não será gravado.
      if (!editor.isEditable) {
        remover(id);
        return;
      }
      const tipo = editor.schema.nodes.image;
      editor.view.dispatch(trocarMarcadorPorImagem(editor.state, id, tipo, {
        src: notaImagemUrl(notaId, imagem.id),
        alt: imagem.nome || preparada.nome,
        width: preparada.largura ?? null,
        height: preparada.altura ?? null,
      }));
      esquecer(id);
    } catch (err) {
      if (ehCancelamento(err) || !vivo(id)) return;
      falhar(id, err instanceof Error ? err.message : MSG_SEM_CONEXAO);
    } finally {
      if (controles.current.get(id) === controle) controles.current.delete(id);
    }
  }

  function enfileirar(novos: Novo[], ponto: PontoDeInsercao) {
    const editor = editorRef.current;
    // Página só de leitura (documento que este editor não lê): nada entra.
    if (!editor || editor.isDestroyed || !editor.isEditable || novos.length === 0) return;
    const estados: EnvioImagem[] = [];
    const marcadores: Marcador[] = [];
    for (const novo of novos) {
      sequencia.current += 1;
      const id = `envio-${sequencia.current}`;
      const el = document.createElement('div');
      el.className = 'nota-upload';
      el.contentEditable = 'false';
      conteineres.current.set(id, el);
      fontes.current.set(id, novo.fonte);
      estados.push({ id, fase: 'fila', nome: novo.nome, bytesOriginais: novo.bytes, progresso: 0 });
      marcadores.push({ id, pos: ponto.pos, substituir: ponto.substituir, el, ordem: sequencia.current });
    }
    adicionarMarcadores(editor.view, marcadores);
    setEnvios(lista => [...lista, ...estados]);
    for (const e of estados) agendarEnvio(e.id);
  }

  function remover(id: string) {
    controles.current.get(id)?.abort();
    const editor = editorRef.current;
    if (editor && !editor.isDestroyed) removerMarcador(editor.view, id);
    esquecer(id);
  }

  function tentarDeNovo(id: string) {
    atualizar(id, { fase: 'fila', progresso: 0, mensagem: undefined });
    agendarEnvio(id);
  }

  function escolherOutro(id: string) {
    trocando.current = id;
    inputRef.current?.click();
  }

  function trocarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo
    const id = trocando.current;
    trocando.current = null;
    if (!arquivo || !id || !vivo(id)) return;
    fontes.current.set(id, arquivo);
    preparadas.current.delete(id);
    soltarPrevia(previas.current.get(id));
    previas.current.delete(id);
    atualizar(id, { fase: 'fila', nome: arquivo.name || 'imagem', bytesOriginais: arquivo.size, progresso: 0, mensagem: undefined, motivo: undefined, titulo: undefined, previa: undefined });
    agendarEnvio(id);
  }

  /**
   * Imagens que vieram DENTRO de um HTML colado (ou solto). `data:` sobe como
   * arquivo; a de outra página do app é baixada e reenviada; a da web não
   * entra, e o aviso diz quantas ficaram de fora. O texto segue com o editor.
   */
  function trazerImagensDoHtml(html: string, ponto: PontoDeInsercao) {
    const { embutidas, deOutraPagina, daWeb } = imagensDoHtmlColado(html, notaId);
    const novos: Novo[] = [];
    for (const img of embutidas) {
      try {
        novos.push(deArquivo(arquivoDeDataUrl(img.src, comExtensaoDe(img.nome || 'imagem-colada', mimeDoDataUrl(img.src)))));
      } catch {
        // dado embutido ilegível: o editor já o deixou de fora e não há bytes para subir
      }
    }
    for (const img of deOutraPagina) {
      novos.push({ fonte: () => baixarDeOutraPagina(img.src, img.nome), nome: img.nome || 'imagem', bytes: 0 });
    }
    enfileirar(novos, ponto);
    if (daWeb > 0) setAviso(avisoImagensDaWeb(daWeb));
  }

  // ---------- Ganchos do editor (lidos por ref: as opções são criadas uma vez) ----------
  const acoes = {
    aoCriar(editor: Editor) {
      if (editor !== editorRef.current) return; // a instância descartada do StrictMode
      // O TipTap troca o documento que o esquema recusa por um vazio, com um
      // aviso no console. Aqui a recusa trava a página em vez de virar edição.
      if (!docDoConteudo(editor.schema, conteudoAbertoRef.current)) {
        travar(editor);
        return;
      }
      normalizar(editor);
      prontoRef.current = true;
      if (autoFocusRef.current) editor.commands.focus('end');
    },
    aoMudar(editor: Editor) {
      if (!prontoRef.current || editor !== editorRef.current) return;
      docRef.current = editor.state.doc;
      agendar();
    },
    descarregar,
    /** O item "Imagem" do menu "/": o mesmo caminho da imagem colada. */
    escolheuImagens(arquivos: File[], ponto: PontoDeInsercao) {
      enfileirar(arquivos.map(deArquivo), ponto);
    },
    colar(view: EditorView, event: ClipboardEvent): boolean {
      const dados = event.clipboardData;
      if (!dados) return false;
      const arquivos = Array.from(dados.files ?? []);
      const html = dados.getData('text/html') ?? '';
      if (escolherColagem({ arquivos: arquivos.map(f => f.type), html }) === 'arquivos') {
        event.preventDefault();
        enfileirar(arquivos.map(deArquivo), pontoDoCursor(view.state));
        return true;
      }
      if (html) trazerImagensDoHtml(html, pontoDoCursor(view.state));
      return false;
    },
    soltar(view: EditorView, event: DragEvent, moved: boolean): boolean {
      marcarSoltando(false);
      // Arraste de dentro da página (mover um bloco): é do ProseMirror.
      if (moved || view.dragging) return false;
      const dados = event.dataTransfer;
      if (!dados) return false;
      const arquivos = Array.from(dados.files ?? []);
      const html = dados.getData('text/html') ?? '';
      const sob = view.posAtCoords({ left: event.clientX, top: event.clientY });
      const ponto = sob ? pontoDoArraste(view.state, sob.pos) : pontoDoCursor(view.state);
      if (escolherColagem({ arquivos: arquivos.map(f => f.type), html }) === 'arquivos') {
        event.preventDefault();
        enfileirar(arquivos.map(deArquivo), ponto);
        return true;
      }
      if (html) trazerImagensDoHtml(html, ponto);
      return false;
    },
    /**
     * Antes do ProseMirror: ele só chama o `handleDrop` quando acha uma posição
     * sob o ponteiro, e sem ela o navegador abriria o arquivo no lugar do app.
     */
    caiu(view: EditorView, event: DragEvent): boolean {
      marcarSoltando(false);
      if (view.dragging) return false;
      const arquivos = Array.from(event.dataTransfer?.files ?? []);
      if (arquivos.length === 0 || view.posAtCoords({ left: event.clientX, top: event.clientY })) return false;
      const html = event.dataTransfer?.getData('text/html') ?? '';
      if (escolherColagem({ arquivos: arquivos.map(f => f.type), html }) !== 'arquivos') return false;
      event.preventDefault();
      enfileirar(arquivos.map(deArquivo), pontoDoCursor(view.state));
      return true;
    },
    arrastando(view: EditorView, event: DragEvent): boolean {
      const tipos = event.dataTransfer?.types;
      if (!view.dragging && tipos && Array.from(tipos).includes('Files')) marcarSoltando(true);
      return false;
    },
    saiuDoArraste(view: EditorView, event: DragEvent): boolean {
      const para = event.relatedTarget;
      if (!(para instanceof Node) || !view.dom.contains(para)) marcarSoltando(false);
      return false;
    },
    ampliar(pos: number) {
      const editor = editorRef.current;
      if (!editor) return;
      const imagens: ImagemDoVisor[] = imagensDoDoc(editor.getJSON() as NoDoc).map((img, i) => {
        const src = typeof img.src === 'string' ? img.src : '';
        return {
          id: imagemIdDoSrc(src, notaId) ?? `imagem-${i}`,
          nome: typeof img.alt === 'string' && img.alt ? img.alt : 'imagem',
          src,
        };
      });
      let index = 0;
      editor.state.doc.nodesBetween(0, pos, (no, p) => {
        if (no.type.name === 'image' && p < pos) index += 1;
      });
      if (imagens.length > 0) setVisor({ imagens, index: Math.min(index, imagens.length - 1) });
    },
  };
  const acoesRef = useRef(acoes);
  acoesRef.current = acoes;

  const [opcoes] = useState<UseEditorOptions>(() => ({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Sem desenho no canvas aprovado: não entram como bloco nem como marca.
        code: false,
        codeBlock: false,
        // O Link entra abaixo, sem os atributos do HTML de origem.
        link: false,
        // A cor do cursor de soltar vem da folha (token), não de um literal.
        dropcursor: { color: false, width: 3, class: 'nota-upload-cursor' },
      }),
      LinkSeguro.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        isAllowedUri: linkPermitidoNoEditor,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow', class: null },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
        a11y: { checkboxLabel: no => `Tarefa: ${no.textContent || 'sem texto'}` },
      }),
      Highlight.configure({ multicolor: false }),
      Placeholder.configure({
        placeholder: ({ node }) => (node.type.name === 'heading' ? 'Título' : PLACEHOLDER),
        emptyNodeClass: 'nota-placeholder',
      }),
      ImagemNota.configure({ notaId, onAmpliar: pos => acoesRef.current.ampliar(pos) }),
      UploadsDeImagem,
      MenuBarra,
      MoverBloco,
    ],
    content: lerDoc(nota.conteudo) as JSONContent | null,
    // O CSS que o TipTap injetaria tem cor fixa (o cursor de lacuna em preto);
    // as regras equivalentes moram em notas-editor.css, com token.
    injectCSS: false,
    editorProps: {
      attributes: { class: 'nota-doc', 'aria-label': 'Texto da página', 'aria-multiline': 'true' },
      handlePaste: (view, event) => acoesRef.current.colar(view, event),
      handleDrop: (view, event, _slice, moved) => acoesRef.current.soltar(view, event, moved),
      handleDOMEvents: {
        dragenter: (view, event) => acoesRef.current.arrastando(view, event),
        dragover: (view, event) => acoesRef.current.arrastando(view, event),
        dragleave: (view, event) => acoesRef.current.saiuDoArraste(view, event),
        drop: (view, event) => acoesRef.current.caiu(view, event),
      },
    },
    onCreate: ({ editor }) => acoesRef.current.aoCriar(editor),
    onUpdate: ({ editor }) => acoesRef.current.aoMudar(editor),
    onBlur: () => acoesRef.current.descarregar(),
  }));
  const editor = useEditor(opcoes);
  editorRef.current = editor;

  // "Carregar a dela": o texto da tela vira o do servidor. O que estava marcado
  // para o onChange é o texto que a pessoa escolheu jogar fora — não sai. O
  // estado é recriado inteiro, o que também zera o desfazer (Ctrl+Z não pode
  // trazer de volta o texto descartado por cima da versão da outra pessoa).
  const recarregarVisto = useRef(recarregar);
  useEffect(() => {
    if (recarregarVisto.current === recarregar) return;
    recarregarVisto.current = recarregar;
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed) return;
    cancelarRitmo();
    const marcadores = marcadoresDe(ed.state);
    // A imagem que a pessoa selecionou continua selecionada; só a seleção de
    // bloco que o `Selection.near` inventou é solta.
    const blocoEscolhido = ed.state.selection instanceof NodeSelection;
    const lido = docDoConteudo(ed.schema, notaRef.current.conteudo);
    // A versão do servidor tem bloco que este editor não lê: nada da tela vira
    // edição por cima dela. A página fica em branco, só para leitura.
    const doc = lido ?? (ed.schema.topNodeType.createAndFill() as NoPM);
    // O cursor fica perto de onde estava: a versão de fora chega também com a
    // tela limpa (a página recarrega em silêncio), e o cursor não pode pular
    // para o topo de quem só estava lendo.
    const selection = Selection.near(doc.resolve(Math.min(ed.state.selection.from, doc.content.size)));
    ed.view.updateState(EditorState.create({ schema: ed.schema, doc, plugins: ed.state.plugins, selection }));
    conteudoAbertoRef.current = notaRef.current.conteudo;
    if (lido) {
      destravar(ed);
      normalizar(ed, !blocoEscolhido);
      prontoRef.current = true;
    } else {
      travar(ed);
    }
    // Os envios em curso continuam; o lugar deles no texto descartado não existe mais.
    if (marcadores.length > 0) {
      const fim = ed.state.doc.content.size;
      adicionarMarcadores(ed.view, marcadores.map(m => ({ ...m, pos: fim, substituir: false })));
    }
  }, [recarregar]); // só a troca de `recarregar` recarrega; o resto vem por ref

  // Desmontar (trocar de página, sair da aba): o último texto sai, os envios param.
  useEffect(() => {
    montado.current = true;
    const mapaControles = controles.current;
    const mapaPrevias = previas.current;
    return () => {
      montado.current = false;
      descarregar();
      for (const controle of mapaControles.values()) controle.abort();
      mapaControles.clear();
      for (const url of mapaPrevias.values()) soltarPrevia(url);
      mapaPrevias.clear();
      if (relatado.current > 0) {
        relatado.current = 0;
        onUploadsRef.current?.(0);
      }
    };
  }, []); // só no desmontar

  const emAndamento = envios.filter(e => EM_CURSO.has(e.fase)).length;
  const falhas = envios.filter(e => e.fase === 'erro').length;

  useEffect(() => {
    if (relatado.current === emAndamento) return;
    relatado.current = emAndamento;
    onUploadsRef.current?.(emAndamento);
  }, [emAndamento]);

  // Sair com imagem subindo (ou que não subiu e só existe nesta tela) pergunta antes.
  useEffect(() => {
    if (emAndamento === 0 && falhas === 0) return;
    const total = emAndamento + falhas;
    const titulo = emAndamento > 0
      ? `${plural(emAndamento, 'imagem', 'imagens')} ${emAndamento === 1 ? 'ainda está subindo' : 'ainda estão subindo'}`
      : `${plural(falhas, 'imagem', 'imagens')} ${falhas === 1 ? 'não subiu' : 'não subiram'}`;
    const consequencia = total === 1 ? 'Sair agora descarta a imagem.' : `Sair agora descarta as ${total} imagens.`;
    const soltarGuarda = guardNavigation(() => confirmar({ titulo, consequencia, rotuloConfirmar: 'Sair', rotuloManter: 'Esperar' }));
    const avisarSaida = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', avisarSaida);
    return () => {
      soltarGuarda();
      window.removeEventListener('beforeunload', avisarSaida);
    };
  }, [emAndamento, falhas, confirmar]);

  // O aviso das imagens da web some sozinho: é informação, não pergunta.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 8000);
    return () => clearTimeout(t);
  }, [aviso]);

  const portais: ReactNode[] = [];
  for (const envio of envios) {
    const el = conteineres.current.get(envio.id);
    if (!el) continue;
    portais.push(createPortal(
      <EnvioImagemView
        envio={envio}
        onTentarDeNovo={() => tentarDeNovo(envio.id)}
        onRemover={() => remover(envio.id)}
        onEscolherOutro={() => escolherOutro(envio.id)}
      />,
      el,
      envio.id,
    ));
  }

  return (
    <div className="nota-upload-zona" data-soltando={soltando || undefined}>
      {ilegivel && <p className="nota-ilegivel" role="status">{MSG_DOC_ILEGIVEL}</p>}
      <EditorContent editor={editor} />
      <MenuBarraView editor={editor} onImagens={(arquivos, ponto) => acoesRef.current.escolheuImagens(arquivos, ponto)} />
      <BolhaFormato editor={editor} />
      <BarraFormatoMovel editor={editor} />
      <AlcaBloco editor={editor} />
      {soltando && (
        <p className="nota-upload-soltar" role="status">
          <IconeImagem />
          Solte para inserir a imagem
        </p>
      )}
      {portais}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_IMAGEM_NOTA}
        hidden
        tabIndex={-1}
        aria-hidden="true"
        onChange={trocarArquivo}
      />
      {aviso && createPortal(
        <div className="undo-snackbar" role="status" aria-live="polite">
          <span>{aviso}</span>
          <button type="button" className="undo-snackbar-dismiss" onClick={() => setAviso(null)} aria-label="Fechar aviso">×</button>
        </div>,
        document.body,
      )}
      {visor && (
        <ImageLightbox
          imagens={visor.imagens}
          index={visor.index}
          onIndexChange={index => setVisor(v => (v ? { ...v, index } : v))}
          onClose={() => setVisor(null)}
        />
      )}
      {dialogo}
    </div>
  );
}
