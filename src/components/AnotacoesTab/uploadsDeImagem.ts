// Lugar reservado das imagens que estão subindo para a página.
//
// O marcador NÃO é um nó do documento: é uma decoração (widget) que vive no
// estado de um plugin. Por isso nada do que acontece com ele — aparecer,
// avançar de 0 a 100%, falhar, sumir — muda o documento: o salvamento
// automático não dispara, o Ctrl+Z não o enxerga e o JSON da página nunca
// carrega um `blob:` ou um `data:`. Só a inserção final, com o endereço que o
// servidor devolveu, é uma transação comum (entra no salvamento e no desfazer).
// É o modelo do exemplo de upload do ProseMirror.
//
// A posição de cada marcador é mapeada a cada edição, então quem continua
// escrevendo enquanto a imagem sobe não a desloca para o lugar errado. O
// mapeamento é feito aqui, e não pelo DecorationSet: o conjunto apaga o widget
// cuja posição foi removida (juntar dois parágrafos com Backspace bastaria), e
// o envio seguiria sem ter onde cair.
import { Extension } from '@tiptap/react';
import { Fragment, Slice, type Node as NoPM, type NodeType } from '@tiptap/pm/model';
import { NodeSelection, Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { canSplit, dropPoint } from '@tiptap/pm/transform';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

/** Onde a imagem vai entrar. */
export interface PontoDeInsercao {
  /** Posição entre blocos (o marcador fica aqui). */
  pos: number;
  /**
   * O bloco logo antes de `pos` estava vazio quando a imagem chegou: ela ocupa
   * o lugar dele, em vez de deixar uma linha em branco em cima.
   */
  substituir: boolean;
}

export interface Marcador extends PontoDeInsercao {
  id: string;
  /** O elemento onde a tela desenha o estado do envio (um portal do React). */
  el: HTMLElement;
  /** Desempate entre marcadores na mesma posição: o primeiro colado fica em cima. */
  ordem: number;
}

interface EstadoUploads {
  marcadores: readonly Marcador[];
  decos: DecorationSet;
}

type Acao = { adicionar: Marcador[] } | { remover: string };

export const chaveUploads = new PluginKey<EstadoUploads>('uploadsDeImagem');

const VAZIO: EstadoUploads = { marcadores: [], decos: DecorationSet.empty };

function decorar(doc: NoPM, marcadores: readonly Marcador[]): DecorationSet {
  return DecorationSet.create(doc, marcadores.map(m => Decoration.widget(m.pos, m.el, {
    key: `upload-${m.id}`,
    // Lado positivo: texto digitado exatamente na posição fica ANTES do
    // marcador, e marcadores na mesma posição saem na ordem em que chegaram.
    side: 1 + m.ordem,
    ignoreSelection: true,
    // Os botões do marcador (Tentar de novo, Remover) são da tela, não do editor.
    stopEvent: () => true,
  })));
}

function plugin(): Plugin<EstadoUploads> {
  return new Plugin<EstadoUploads>({
    key: chaveUploads,
    state: {
      init: () => VAZIO,
      apply(tr, estado, _antes, depois) {
        const acao = tr.getMeta(chaveUploads) as Acao | undefined;
        if (!acao && (estado.marcadores.length === 0 || !tr.docChanged)) return estado;
        let marcadores = estado.marcadores;
        if (tr.docChanged) {
          // Associação à direita: o que entra exatamente no lugar do marcador
          // (inclusive a imagem do marcador vizinho) fica antes dele.
          marcadores = marcadores.map(m => ({ ...m, pos: tr.mapping.map(m.pos, 1) }));
        }
        if (acao && 'adicionar' in acao) marcadores = [...marcadores, ...acao.adicionar];
        if (acao && 'remover' in acao) marcadores = marcadores.filter(m => m.id !== acao.remover);
        if (marcadores.length === 0) return VAZIO;
        return { marcadores, decos: decorar(depois.doc, marcadores) };
      },
    },
    props: {
      decorations: state => chaveUploads.getState(state)?.decos,
    },
  });
}

/** A extensão do editor. O estado dos envios mora na tela (`EditorNota`). */
export const UploadsDeImagem = Extension.create({
  name: 'uploadsDeImagem',
  addProseMirrorPlugins() {
    return [plugin()];
  },
});

/** Põe os marcadores na página. Não muda o documento nem entra no desfazer. */
export function adicionarMarcadores(view: EditorView, marcadores: Marcador[]): void {
  if (marcadores.length === 0) return;
  view.dispatch(view.state.tr.setMeta(chaveUploads, { adicionar: marcadores } satisfies Acao).setMeta('addToHistory', false));
}

/** Tira um marcador (Remover, envio cancelado). Também fora do documento. */
export function removerMarcador(view: EditorView, id: string): void {
  if (!marcadorDe(view.state, id)) return;
  view.dispatch(view.state.tr.setMeta(chaveUploads, { remover: id } satisfies Acao).setMeta('addToHistory', false));
}

export function marcadorDe(state: EditorState, id: string): Marcador | null {
  return chaveUploads.getState(state)?.marcadores.find(m => m.id === id) ?? null;
}

export function marcadoresDe(state: EditorState): readonly Marcador[] {
  return chaveUploads.getState(state)?.marcadores ?? [];
}

function ehItemDeLista(no: NoPM): boolean {
  return no.type.name === 'listItem' || no.type.name === 'taskItem';
}

/**
 * Logo abaixo do bloco do cursor. Num item de lista o bloco é o item inteiro:
 * a imagem entra entre dois itens e a lista se divide (ver `inserirBloco`).
 * Com o bloco do cursor vazio, a imagem ocupa o lugar dele.
 */
export function pontoDoCursor(state: EditorState): PontoDeInsercao {
  const sel = state.selection;
  if (sel instanceof NodeSelection) return { pos: sel.to, substituir: false };
  const $fim = sel.$to;
  let d = $fim.depth;
  while (d > 0 && !$fim.node(d).isTextblock) d--;
  if (d === 0) return { pos: sel.to, substituir: false };
  if (d >= 2 && ehItemDeLista($fim.node(d - 1)) && $fim.index(d - 1) === 0) {
    return { pos: $fim.after(d - 1), substituir: false };
  }
  return { pos: $fim.after(d), substituir: $fim.node(d).content.size === 0 };
}

/**
 * Onde o arquivo solto cai: o mesmo ponto que o cursor de soltar mostrou
 * (`dropPoint` é a conta que ele faz), a partir da posição sob o ponteiro.
 */
export function pontoDoArraste(state: EditorState, pos: number): PontoDeInsercao {
  const tipo = state.schema.nodes.image;
  if (!tipo) return { pos, substituir: false };
  const ponto = dropPoint(state.doc, pos, new Slice(Fragment.from(tipo.create()), 0, 0));
  return { pos: ponto ?? pos, substituir: false };
}

/**
 * Insere um bloco em `pos`, subindo até um pai que o aceite. No meio de uma
 * lista, divide a lista em duas e a numerada continua a contagem na segunda
 * metade; no meio de um parágrafo (dois blocos que se juntaram enquanto a
 * imagem subia), divide o parágrafo.
 */
function inserirBloco(tr: Transaction, pos: number, no: NoPM): void {
  let p = Math.max(0, Math.min(pos, tr.doc.content.size));
  // A profundidade de qualquer documento real é bem menor que isto; o teto só
  // impede que um esquema inesperado prenda o laço.
  for (let passo = 0; passo < 64; passo++) {
    const $p = tr.doc.resolve(p);
    const pai = $p.parent;
    const i = $p.index();
    if (!pai.isTextblock && pai.canReplaceWith(i, i, no.type)) { tr.insert(p, no); return; }
    if ($p.depth === 0) break;
    if ($p.parentOffset === 0) { p = $p.before(); continue; }
    if ($p.parentOffset === pai.content.size || !canSplit(tr.doc, p)) { p = $p.after(); continue; }
    tr.split(p);
    const segunda = tr.doc.nodeAt(p + 1);
    if (segunda && pai.type.name === 'orderedList' && segunda.type === pai.type) {
      const inicio = typeof pai.attrs.start === 'number' ? pai.attrs.start : 1;
      tr.setNodeMarkup(p + 1, undefined, { ...segunda.attrs, start: inicio + i });
    }
    p += 1;
  }
  tr.insert(tr.doc.content.size, no);
}

/**
 * A transação que troca o marcador pela imagem. É COMUM — entra no
 * salvamento automático e no Ctrl+Z — e não mexe na seleção de quem continua
 * escrevendo em outro ponto da página.
 */
export function trocarMarcadorPorImagem(state: EditorState, id: string, tipo: NodeType, attrs: Record<string, unknown>): Transaction {
  const tr = state.tr.setMeta(chaveUploads, { remover: id } satisfies Acao);
  const marcador = marcadorDe(state, id);
  const no = tipo.create(attrs);
  if (!marcador) {
    inserirBloco(tr, state.doc.content.size, no);
    return tr;
  }
  if (marcador.substituir) {
    const $p = state.doc.resolve(marcador.pos);
    const antes = $p.nodeBefore;
    const i = $p.index();
    if (antes && antes.isTextblock && antes.content.size === 0 && i > 0 && $p.parent.canReplaceWith(i - 1, i, tipo)) {
      tr.replaceWith(marcador.pos - antes.nodeSize, marcador.pos, no);
      return tr;
    }
  }
  inserirBloco(tr, marcador.pos, no);
  return tr;
}
