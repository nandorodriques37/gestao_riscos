// Mover blocos de uma página: as setas (Alt+Shift+↑ ↓), o "+" e a alça "⋮⋮"
// da calha esquerda (a tela é `AlcaBloco.tsx`).
//
// O que se move é o bloco de primeiro nível (parágrafo, título, a lista
// inteira, citação, divisor, imagem) ou o ITEM dentro da lista dele — nunca o
// parágrafo de dentro de um item, que deixaria o item sem texto. Mover é trocar
// de lugar com o vizinho do mesmo contêiner; na borda não acontece nada (o
// primeiro item não sai da lista pelas setas: para isso há o arraste).
//
// Cada movimento é uma transação só, com o histórico fechado antes dela:
// Ctrl+Z desfaz um movimento por vez e nunca leva junto o que foi digitado
// antes. O vizinho é que sai e volta do outro lado; o bloco movido não é
// recriado, então a seleção (texto ou bloco inteiro) vai junto com ele pelo
// mapeamento da própria transação, e os marcadores de envio de imagem também.
import { Extension } from '@tiptap/react';
import type { Node as NoPM, NodeRange } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey, TextSelection, type Command, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { closeHistory } from '@tiptap/pm/history';

const LISTAS = new Set(['bulletList', 'orderedList', 'taskList']);
const ITENS = new Set(['listItem', 'taskItem']);

export type Direcao = 'cima' | 'baixo';

/** Um bloco que a alça e as setas tratam, e onde ele começa no documento. */
export interface Bloco {
  pos: number;
  no: NoPM;
}

export function ehLista(no: NoPM): boolean {
  return LISTAS.has(no.type.name);
}

export function ehItem(no: NoPM): boolean {
  return ITENS.has(no.type.name);
}

/** Onde mover faz sentido: a página, ou uma lista (que reordena os itens dela). */
function ehConteiner(no: NoPM): boolean {
  return no.type.name === 'doc' || ehLista(no);
}

/**
 * Os blocos irmãos que a seleção toca, no contêiner movível mais fundo que
 * contém a seleção inteira. Cursor num item: o item. Seleção de vários
 * itens da mesma lista: os itens. Seleção que sai da lista: os blocos de
 * primeiro nível. Cursor de lacuna (sem bloco): nada.
 */
export function faixaMovel(state: EditorState): NodeRange | null {
  const { $from, $to } = state.selection;
  return $from.blockRange($to, ehConteiner);
}

/** Alt+Shift+↑ / ↓: troca o bloco (ou os blocos) da seleção com o vizinho. Falso na borda. */
export function moverBloco(direcao: Direcao): Command {
  return (state, dispatch) => {
    const faixa = faixaMovel(state);
    if (!faixa) return false;
    const { parent, startIndex, endIndex, start, end } = faixa;
    if (direcao === 'cima') {
      if (startIndex === 0) return false;
      if (dispatch) {
        const vizinho = parent.child(startIndex - 1);
        // Primeiro entra a cópia depois do bloco, depois sai o original: as
        // posições de antes do bloco não mudam até a remoção.
        const tr = state.tr.insert(end, vizinho).delete(start - vizinho.nodeSize, start);
        dispatch(closeHistory(tr).scrollIntoView());
      }
      return true;
    }
    if (endIndex >= parent.childCount) return false;
    if (dispatch) {
      const vizinho = parent.child(endIndex);
      const tr = state.tr.delete(end, end + vizinho.nodeSize).insert(start, vizinho);
      dispatch(closeHistory(tr).scrollIntoView());
    }
    return true;
  };
}

/**
 * O bloco da alça a partir de uma cadeia de nós (do primeiro nível para
 * dentro): o item de lista mais fundo, ou o bloco de primeiro nível.
 */
function escolher(cadeia: Bloco[]): Bloco | null {
  for (let i = cadeia.length - 1; i > 0; i--) {
    if (ehItem(cadeia[i].no) && ehLista(cadeia[i - 1].no)) return cadeia[i];
  }
  return cadeia[0] ?? null;
}

/** O bloco onde está o cursor (ou o bloco selecionado inteiro): é a ele que a alça se prende sem o ponteiro. */
export function blocoDaSelecao(state: EditorState): Bloco | null {
  const { selection } = state;
  const $de = selection.$from;
  const cadeia: Bloco[] = [];
  for (let d = 1; d <= $de.depth; d++) cadeia.push({ pos: $de.before(d), no: $de.node(d) });
  if (selection instanceof NodeSelection) {
    cadeia.push({ pos: selection.from, no: selection.node });
  } else if ($de.depth === 0) {
    // Cursor de lacuna entre dois blocos (antes de uma imagem, de um divisor).
    const depois = $de.nodeAfter;
    const antes = $de.nodeBefore;
    if (depois) cadeia.push({ pos: $de.pos, no: depois });
    else if (antes) cadeia.push({ pos: $de.pos - antes.nodeSize, no: antes });
  }
  return escolher(cadeia);
}

/** O bloco que começa em `pos`, se ainda for um bloco que a alça trata. */
export function blocoEm(doc: NoPM, pos: number): Bloco | null {
  if (pos < 0 || pos >= doc.content.size) return null;
  const no = doc.nodeAt(pos);
  if (!no || !no.isBlock) return null;
  const $pos = doc.resolve(pos);
  const valido = $pos.depth === 0 || (ehItem(no) && ehLista($pos.parent));
  return valido ? { pos, no } : null;
}

/** Clique na alça: o bloco inteiro fica selecionado (Delete apaga, as setas movem). */
export function selecionarBloco(pos: number): Command {
  return (state, dispatch) => {
    const no = state.doc.nodeAt(pos);
    if (!no || !NodeSelection.isSelectable(no)) return false;
    if (dispatch) dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)).scrollIntoView());
    return true;
  };
}

function textoVazio(no: NoPM | null | undefined): boolean {
  return !!no && no.isTextblock && no.content.size === 0;
}

/**
 * O "+" da calha: um bloco vazio logo abaixo, com uma "/" digitada nele —
 * é o que abre o menu de blocos ali. Abaixo de um item, o novo é um item da
 * mesma lista (tarefa nova nasce desmarcada); abaixo do resto, um parágrafo.
 * Bloco que já está vazio não ganha um vizinho: a "/" entra nele mesmo.
 */
export function inserirAbaixo(pos: number): Command {
  return (state, dispatch) => {
    const no = state.doc.nodeAt(pos);
    if (!no || !no.isBlock) return false;
    const $pos = state.doc.resolve(pos);
    const tr = state.tr;
    let cursor: number;
    if (textoVazio(no)) {
      cursor = pos + 1;
    } else if (ehItem(no) && no.childCount === 1 && textoVazio(no.firstChild)) {
      cursor = pos + 2;
    } else if (ehItem(no) && ehLista($pos.parent)) {
      const novo = no.type.createAndFill(no.type.name === 'taskItem' ? { checked: false } : null);
      if (!novo) return false;
      tr.insert(pos + no.nodeSize, novo);
      cursor = pos + no.nodeSize + 2;
    } else {
      const paragrafo = state.schema.nodes.paragraph;
      const depois = $pos.index() + 1;
      if (!paragrafo || !$pos.parent.canReplaceWith(depois, depois, paragrafo)) return false;
      tr.insert(pos + no.nodeSize, paragrafo.create());
      cursor = pos + no.nodeSize + 1;
    }
    if (dispatch) {
      tr.setSelection(TextSelection.create(tr.doc, cursor)).insertText('/');
      dispatch(closeHistory(tr).scrollIntoView());
    }
    return true;
  };
}

// ---------- O bloco que está sendo arrastado ----------

/** Estado do plugin: onde começa o bloco que a alça está arrastando (o original, esmaecido). */
export const chaveAlcaBloco = new PluginKey<number | null>('alcaBloco');

/**
 * Esmaece (ou deixa de esmaecer) o bloco de origem de um arraste. Não é
 * edição: fica fora do histórico e não dispara o salvamento.
 */
export function marcarArrastado(view: EditorView, pos: number | null): void {
  if (view.isDestroyed || chaveAlcaBloco.getState(view.state) === pos) return;
  view.dispatch(view.state.tr.setMeta(chaveAlcaBloco, { arrastado: pos }).setMeta('addToHistory', false));
}

/**
 * As setas e o esmaecido do arraste. A alça (`AlcaBloco`) é a tela; esta
 * extensão é o que vale também sem ela, no teclado.
 */
export const MoverBloco = Extension.create({
  name: 'moverBloco',

  addKeyboardShortcuts() {
    // Num bloco que não tem para onde ir, a tecla é consumida mesmo assim:
    // o padrão do navegador (estender a seleção até o parágrafo) surpreenderia.
    const mover = (direcao: Direcao) => () => {
      const { state, view } = this.editor;
      return moverBloco(direcao)(state, view.dispatch) || faixaMovel(state) !== null;
    };
    return {
      'Alt-Shift-ArrowUp': mover('cima'),
      'Alt-Shift-ArrowDown': mover('baixo'),
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<number | null>({
        key: chaveAlcaBloco,
        state: {
          init: () => null,
          apply(tr, atual) {
            const meta = tr.getMeta(chaveAlcaBloco) as { arrastado: number | null } | undefined;
            if (meta) return meta.arrastado;
            if (atual === null || !tr.docChanged) return atual;
            // O bloco saiu (o soltar o removeu do lugar antigo): nada a esmaecer.
            const mapeado = tr.mapping.mapResult(atual);
            return mapeado.deleted ? null : mapeado.pos;
          },
        },
        props: {
          decorations(state) {
            const pos = chaveAlcaBloco.getState(state);
            if (pos === null || pos === undefined) return null;
            const no = state.doc.nodeAt(pos);
            if (!no || !no.isBlock) return null;
            return DecorationSet.create(state.doc, [Decoration.node(pos, pos + no.nodeSize, { class: 'nota-bloco-arrastado' })]);
          },
        },
      }),
    ];
  },
});
