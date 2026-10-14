import { useEffect, useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import type { Editor } from '@tiptap/react';
import type { Node as NoPM } from '@tiptap/pm/model';
import { NodeSelection, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import {
  blocoDaSelecao,
  blocoEm,
  ehItem,
  ehLista,
  inserirAbaixo,
  marcarArrastado,
  selecionarBloco,
  type Bloco,
} from './moverBloco';

export interface AlcaBlocoProps {
  /** O editor da página (`useEditor`). Nulo enquanto ele não existe. */
  editor: Editor | null;
}

/** Onde a alça se prende, nas coordenadas da âncora: a borda esquerda do bloco e o meio da primeira linha. */
interface Posicao {
  pos: number;
  topo: number;
  esquerda: number;
  /** O bloco inteiro está selecionado (clique na alça): a alça fica marcada. */
  selecionado: boolean;
}

type Arraste = NonNullable<EditorView['dragging']>;

const quadro: (fn: () => void) => number = typeof requestAnimationFrame === 'function'
  ? fn => requestAnimationFrame(fn)
  : fn => window.setTimeout(fn, 16);

const cancelarQuadro: (id: number) => void = typeof cancelAnimationFrame === 'function'
  ? id => cancelAnimationFrame(id)
  : id => window.clearTimeout(id);

function alturaDaLinha(el: HTMLElement): number {
  const estilo = getComputedStyle(el);
  const linha = Number.parseFloat(estilo.lineHeight);
  if (Number.isFinite(linha)) return linha;
  const fonte = Number.parseFloat(estilo.fontSize);
  return Number.isFinite(fonte) ? fonte * 1.2 : 0;
}

/**
 * Onde desenhar a alça de um bloco. O item de lista prende a alça na borda da
 * LISTA, antes do número ou da caixa da tarefa; o resto, na borda do próprio
 * bloco. Na vertical, o meio da primeira linha (o divisor, mais baixo que
 * uma linha, fica com o meio dele).
 */
function medir(view: EditorView, bloco: Bloco, ancora: HTMLElement): Omit<Posicao, 'selecionado'> | null {
  const el = view.nodeDOM(bloco.pos);
  if (!(el instanceof HTMLElement)) return null;
  const caixa = el.getBoundingClientRect();
  const borda = ehItem(bloco.no) && el.parentElement ? el.parentElement.getBoundingClientRect().left : caixa.left;
  const origem = ancora.getBoundingClientRect();
  const linha = Math.max(Math.min(alturaDaLinha(el), caixa.height), 0);
  return { pos: bloco.pos, topo: caixa.top - origem.top + linha / 2, esquerda: borda - origem.left };
}

/** O filho de `pai` mais perto da altura `y` (distância zero = a altura cai dentro dele). */
function maisPerto(view: EditorView, pai: NoPM, inicio: number, y: number): { bloco: Bloco; dentro: boolean } | null {
  let melhor: Bloco | null = null;
  let menor = Number.POSITIVE_INFINITY;
  let pos = inicio;
  for (let i = 0; i < pai.childCount; i++) {
    const no = pai.child(i);
    const el = view.nodeDOM(pos);
    if (el instanceof HTMLElement) {
      const r = el.getBoundingClientRect();
      const distancia = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      if (distancia < menor) {
        melhor = { pos, no };
        menor = distancia;
      }
    }
    pos += no.nodeSize;
  }
  return melhor ? { bloco: melhor, dentro: menor === 0 } : null;
}

/**
 * O bloco da linha onde está o ponteiro. Conta só a ALTURA: na calha, à
 * esquerda do texto, o ponteiro está fora de qualquer bloco (e um ponto na
 * margem da lista seria a lista inteira, não o item), mas a linha é a mesma.
 * Dentro de uma lista desce até o item, e dentro do item até a lista
 * aninhada que contém a linha.
 */
function blocoNaAltura(view: EditorView, y: number): Bloco | null {
  const topo = maisPerto(view, view.state.doc, 0, y);
  if (!topo) return null;
  let atual = topo.bloco;
  let lista: Bloco | null = ehLista(atual.no) ? atual : null;
  while (lista) {
    const item = maisPerto(view, lista.no, lista.pos + 1, y);
    if (!item || !ehItem(item.bloco.no)) break;
    atual = item.bloco;
    const dentro = maisPerto(view, item.bloco.no, item.bloco.pos + 1, y);
    lista = dentro && dentro.dentro && ehLista(dentro.bloco.no) ? dentro.bloco : null;
  }
  return atual;
}

function mesmaPosicao(a: Posicao | null, b: Posicao | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.pos === b.pos && a.topo === b.topo && a.esquerda === b.esquerda && a.selecionado === b.selecionado;
}

function IconeMais() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconeAlca() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M3 3h.01M7 3h.01M3 8h.01M7 8h.01M3 13h.01M7 13h.01" />
    </svg>
  );
}

/**
 * Os controles do bloco na calha esquerda da página, como no Notion: "+"
 * abre um bloco novo abaixo com o menu "/", e a alça "⋮⋮" arrasta o bloco
 * (ou o seleciona inteiro, no clique). Aparecem ao lado do bloco sob o
 * ponteiro e, sem ponteiro, do bloco do cursor.
 *
 * Montado DENTRO do contêiner posicionado do editor (`.nota-upload-zona`),
 * depois do `EditorContent`: a âncora de tamanho zero é a origem das medidas,
 * e a alça rola junto com o texto. Não abre camada fixa nem portal.
 *
 * Pelo teclado não há alça: "/" abre o menu onde se digita, e Alt+Shift+↑ ↓
 * movem o bloco (`MoverBloco`, em `moverBloco.ts`). Por isso os botões ficam
 * fora da ordem do Tab — tabular do texto para um controle que some quando o
 * texto perde o foco deixaria o foco no nada. Some no celular e sem mouse.
 */
export function AlcaBloco({ editor }: AlcaBlocoProps) {
  const ancoraRef = useRef<HTMLDivElement>(null);
  const alcaRef = useRef<HTMLDivElement>(null);
  const [posicao, setPosicao] = useState<Posicao | null>(null);
  const [arrastando, setArrastando] = useState(false);
  /** O bloco que a alça está mostrando agora (é sobre ele que os botões agem). */
  const alvoRef = useRef<Bloco | null>(null);
  const arrasteRef = useRef<Arraste | null>(null);
  /**
   * `ponteiro`: a última posição do mouse sobre o texto, ou nulo fora dele (e
   * depois de uma edição, até o mouse andar de novo). `sobreAlca`: o mouse
   * está na própria alça, que então não troca de bloco.
   */
  const rastro = useRef({ ponteiro: null as { x: number; y: number } | null, sobreAlca: false, quadro: 0 });
  const agendarRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return undefined;
    const ed = editor;
    const view = ed.view;
    const dom = view.dom;
    const r = rastro.current;

    function calcular() {
      r.quadro = 0;
      // Durante o arraste a alça não sai do lugar nem desmonta: o fim do
      // arraste chega no elemento de onde ele saiu, e um elemento fora da
      // página não recebe evento — `view.dragging` ficaria preso, e o próximo
      // arquivo solto viraria o bloco velho.
      if (ed.isDestroyed || arrasteRef.current) return;
      const ancora = ancoraRef.current;
      let bloco: Bloco | null = null;
      if (ancora && ed.isEditable) {
        if (r.sobreAlca && alvoRef.current) bloco = blocoEm(ed.state.doc, alvoRef.current.pos);
        if (!bloco && r.ponteiro) bloco = blocoNaAltura(view, r.ponteiro.y);
        if (!bloco && (view.hasFocus() || r.sobreAlca)) bloco = blocoDaSelecao(ed.state);
      }
      const medida = bloco && ancora ? medir(view, bloco, ancora) : null;
      const selecao = ed.state.selection;
      const nova: Posicao | null = medida
        ? { ...medida, selecionado: selecao instanceof NodeSelection && selecao.from === medida.pos }
        : null;
      alvoRef.current = nova ? bloco : null;
      setPosicao(anterior => (mesmaPosicao(anterior, nova) ? anterior : nova));
    }

    function agendar() {
      if (r.quadro) return;
      r.quadro = quadro(calcular);
    }
    agendarRef.current = agendar;

    function aoMover(ev: MouseEvent) {
      // Sobre o marcador de uma imagem subindo não há bloco: a alça do vizinho confundiria.
      const sob = ev.target instanceof Element ? ev.target : null;
      r.ponteiro = sob?.closest('.nota-upload') ? null : { x: ev.clientX, y: ev.clientY };
      r.sobreAlca = false;
      agendar();
    }

    function aoSair(ev: MouseEvent) {
      if (ev.relatedTarget instanceof Node && alcaRef.current?.contains(ev.relatedTarget)) return;
      r.ponteiro = null;
      agendar();
    }

    function aoTransacionar({ transaction }: { transaction: Transaction }) {
      // Escrever (ou soltar, ou o "+") esconde a alça do ponteiro até o mouse
      // andar de novo; quem fica é a do bloco do cursor.
      if (transaction.docChanged) {
        r.ponteiro = null;
        r.sobreAlca = false;
      }
      agendar();
    }

    const observador = typeof ResizeObserver === 'function' ? new ResizeObserver(() => agendar()) : null;
    observador?.observe(dom);
    dom.addEventListener('mousemove', aoMover);
    dom.addEventListener('mouseleave', aoSair);
    ed.on('transaction', aoTransacionar);
    ed.on('focus', agendar);
    ed.on('blur', agendar);
    agendar();

    return () => {
      if (r.quadro) cancelarQuadro(r.quadro);
      r.quadro = 0;
      r.ponteiro = null;
      r.sobreAlca = false;
      agendarRef.current = () => undefined;
      // Saiu no meio de um arraste (trocou de página): o editor não guarda o recorte.
      const arraste = arrasteRef.current;
      arrasteRef.current = null;
      if (arraste && !view.isDestroyed) {
        if (view.dragging === arraste) view.dragging = null;
        marcarArrastado(view, null);
      }
      observador?.disconnect();
      dom.removeEventListener('mousemove', aoMover);
      dom.removeEventListener('mouseleave', aoSair);
      ed.off('transaction', aoTransacionar);
      ed.off('focus', agendar);
      ed.off('blur', agendar);
    };
  }, [editor]);

  if (!editor) return null;

  function viewViva(): EditorView | null {
    return editor && !editor.isDestroyed ? editor.view : null;
  }

  function naAlca() {
    rastro.current.sobreAlca = true;
  }

  function saiuDaAlca(ev: ReactMouseEvent<HTMLDivElement>) {
    const r = rastro.current;
    r.sobreAlca = false;
    const view = viewViva();
    if (!(ev.relatedTarget instanceof Node) || !view?.dom.contains(ev.relatedTarget)) r.ponteiro = null;
    agendarRef.current();
  }

  function inserir() {
    const view = viewViva();
    const alvo = alvoRef.current;
    if (!view || !alvo) return;
    if (inserirAbaixo(alvo.pos)(view.state, view.dispatch)) view.focus();
  }

  function selecionar() {
    const view = viewViva();
    const alvo = alvoRef.current;
    if (!view || !alvo) return;
    selecionarBloco(alvo.pos)(view.state, view.dispatch);
    view.focus();
  }

  /**
   * O arraste é o do próprio ProseMirror: a alça seleciona o bloco inteiro e
   * entrega o recorte em `view.dragging`. Soltar, o traço de onde ele entra
   * (o Dropcursor, em --brand) e o desfazer são os do editor.
   */
  function comecarArraste(ev: ReactDragEvent<HTMLDivElement>) {
    const view = viewViva();
    const alvo = alvoRef.current;
    const dados = ev.dataTransfer;
    const bloco = view && alvo ? blocoEm(view.state.doc, alvo.pos) : null;
    if (!view || !bloco || !dados || !NodeSelection.isSelectable(bloco.no)) {
      ev.preventDefault();
      return;
    }
    const selecao = NodeSelection.create(view.state.doc, bloco.pos);
    view.dispatch(view.state.tr.setSelection(selecao));
    const recorte = selecao.content();
    const { dom, text } = view.serializeForClipboard(recorte);
    dados.clearData();
    dados.setData('text/html', dom.innerHTML);
    dados.setData('text/plain', text);
    dados.effectAllowed = 'copyMove';
    const el = view.nodeDOM(bloco.pos);
    if (el instanceof HTMLElement) {
      const caixa = el.getBoundingClientRect();
      dados.setDragImage(el, 0, Math.min(Math.max(ev.clientY - caixa.top, 0), caixa.height));
    }
    const arraste: Arraste = { slice: recorte, move: true };
    view.dragging = arraste;
    arrasteRef.current = arraste;
    setArrastando(true);
    // Esmaecer o original só depois do retrato da cópia levantada, que o
    // navegador tira ao fim deste evento — antes, a cópia sairia apagada.
    window.setTimeout(() => {
      if (!view.isDestroyed && view.dragging === arraste) marcarArrastado(view, bloco.pos);
    }, 0);
  }

  function terminarArraste() {
    setArrastando(false);
    const view = viewViva();
    const arraste = arrasteRef.current;
    arrasteRef.current = null;
    agendarRef.current();
    if (!view) return;
    // Como o do próprio ProseMirror: em alguns navegadores o fim do arraste
    // chega antes do soltar, que ainda precisa do recorte.
    window.setTimeout(() => {
      if (view.isDestroyed) return;
      if (arraste && view.dragging === arraste) view.dragging = null;
      marcarArrastado(view, null);
    }, 50);
  }

  return (
    <div ref={ancoraRef} className="nota-alca-ancora">
      {posicao && (
        <div
          ref={alcaRef}
          className="nota-alca"
          style={{ top: posicao.topo, left: posicao.esquerda }}
          data-arrastando={arrastando || undefined}
          data-selecionado={posicao.selecionado || undefined}
          onMouseMove={naAlca}
          onMouseLeave={saiuDaAlca}
        >
          <button
            type="button"
            className="nota-alca-btn"
            aria-label="Inserir bloco abaixo"
            title="Inserir bloco abaixo"
            tabIndex={-1}
            // O foco fica no texto: o menu "/" abre onde o cursor está.
            onMouseDown={ev => ev.preventDefault()}
            onClick={inserir}
          >
            <IconeMais />
          </button>
          {/* Um <div>: o Firefox não arrasta <button>. */}
          <div
            role="button"
            className="nota-alca-btn nota-alca-arrastar"
            aria-label="Arrastar para mover o bloco"
            aria-keyshortcuts="Alt+Shift+ArrowUp Alt+Shift+ArrowDown"
            title="Arraste para mover · clique para selecionar · Alt+Shift+↑ ↓ pelo teclado"
            draggable
            onClick={selecionar}
            onDragStart={comecarArraste}
            onDragEnd={terminarArraste}
          >
            <IconeAlca />
          </div>
        </div>
      )}
    </div>
  );
}
