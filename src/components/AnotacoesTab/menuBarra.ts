// Menu "/" da página: digitar uma barra abre a lista de blocos sob o cursor.
//
// A detecção é do `@tiptap/suggestion` (o mesmo plugin das menções do TipTap):
// ele acha a "/" e o texto depois dela, desenha a decoração sobre o "/consulta"
// e avisa quando o menu abre, muda e fecha. Este arquivo liga esse ciclo a uma
// LOJA por editor, que a tela (`MenuBarraView.tsx`) assina com
// `useSyncExternalStore`. O teclado nunca sai do editor: ↑ ↓ Enter Tab e Esc
// chegam pelo `onKeyDown` do plugin, e o item ativo é anunciado ao leitor de
// tela pelo `aria-activedescendant` no próprio elemento editável.
//
// O que cada bloco faz no documento mora em `aplicarBloco`, que a barra de
// formato do celular (Lote 4) reaproveita sem passar pelo menu.
import { Extension, type Editor, type Range } from '@tiptap/react';
import { PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { Node as NoPM } from '@tiptap/pm/model';
import { Suggestion, exitSuggestion, type SuggestionProps } from '@tiptap/suggestion';
import { filtrarBlocos, type BlocoNota, type IdBloco } from '../../lib/blocosNota';
import { pontoDoCursor, type PontoDeInsercao } from './uploadsDeImagem';

export const chaveMenuBarra = new PluginKey('menuBarra');

/** O texto-fantasma depois da "/" sozinha (canvas: "Digite para filtrar"). */
export const FANTASMA_MENU_BARRA = 'Digite para filtrar';

export interface EstadoMenuBarra {
  aberto: boolean;
  /** O texto digitado depois da "/". */
  consulta: string;
  itens: readonly BlocoNota[];
  /** O item ativo (realçado) em `itens`. */
  indice: number;
  /** Onde o "/consulta" está na tela agora (viewport). Lido a cada medida. */
  retangulo: (() => DOMRect | null) | null;
}

export const MENU_BARRA_FECHADO: EstadoMenuBarra = Object.freeze({
  aberto: false,
  consulta: '',
  itens: [],
  indice: 0,
  retangulo: null,
});

const ATRIBUTOS_ARIA = ['aria-expanded', 'aria-controls', 'aria-activedescendant', 'aria-autocomplete'] as const;

let sequencia = 0;

/**
 * O estado do menu de UM editor. Fica fora do React porque quem o muda é o
 * plugin (a cada transação e a cada tecla), e fora do documento porque abrir,
 * filtrar e navegar não são edição.
 */
export class LojaMenuBarra {
  /** Prefixo dos ids do listbox e das opções (um por editor). */
  readonly id: string;
  private estado: EstadoMenuBarra = MENU_BARRA_FECHADO;
  private readonly ouvintes = new Set<() => void>();
  /** O "/consulta" no documento: é o que sai quando um bloco é aplicado. */
  private intervalo: Range | null = null;
  /** O elemento editável, que leva os atributos ARIA enquanto o menu está aberto. */
  private dom: HTMLElement | null = null;
  private seletor: (() => boolean) | null = null;
  /** Onde a imagem escolhida vai entrar, mapeado a cada edição enquanto o seletor está aberto. */
  private pendente: { ponto: PontoDeInsercao; doc: NoPM } | null = null;
  private readonly editor: Editor;

  constructor(editor: Editor) {
    this.editor = editor;
    sequencia += 1;
    this.id = `nota-menu-${sequencia}`;
  }

  get idDaLista(): string {
    return `${this.id}-lista`;
  }

  get idDoTitulo(): string {
    return `${this.id}-titulo`;
  }

  idDaOpcao(id: IdBloco): string {
    return `${this.id}-${id}`;
  }

  // ---------- Assinatura (useSyncExternalStore) ----------
  assinar = (ouvinte: () => void): (() => void) => {
    this.ouvintes.add(ouvinte);
    return () => { this.ouvintes.delete(ouvinte); };
  };

  ler = (): EstadoMenuBarra => this.estado;

  private definir(estado: EstadoMenuBarra) {
    this.estado = estado;
    this.sincronizarAria();
    for (const ouvinte of [...this.ouvintes]) ouvinte();
  }

  // ---------- Ciclo do plugin ----------
  /** onStart e onUpdate. Filtra aqui, na hora: a lista não espera a busca assíncrona do plugin. */
  mostrar(props: SuggestionProps<BlocoNota, BlocoNota>) {
    const anterior = this.estado;
    const consulta = props.query;
    const mudou = !anterior.aberto || consulta !== anterior.consulta;
    const itens = mudou ? filtrarBlocos(consulta) : anterior.itens;
    this.intervalo = props.range;
    this.dom = props.editor.view.dom;
    this.definir({
      aberto: true,
      consulta,
      itens,
      indice: mudou ? 0 : Math.min(anterior.indice, Math.max(0, itens.length - 1)),
      retangulo: props.clientRect ?? null,
    });
  }

  fechar() {
    this.intervalo = null;
    if (this.estado.aberto) this.definir(MENU_BARRA_FECHADO);
  }

  // ---------- Navegação ----------
  escolher(indice: number) {
    const { itens } = this.estado;
    if (!this.estado.aberto || itens.length === 0) return;
    const novo = ((indice % itens.length) + itens.length) % itens.length;
    if (novo !== this.estado.indice) this.definir({ ...this.estado, indice: novo });
  }

  mover(delta: number) {
    this.escolher(this.estado.indice + delta);
  }

  /** Aplica o bloco (o ativo, sem argumento). Falso quando não há o que aplicar. */
  aplicar(bloco?: BlocoNota): boolean {
    const alvo = bloco ?? this.estado.itens[this.estado.indice];
    const intervalo = this.intervalo;
    if (!this.estado.aberto || !alvo || !intervalo) return false;
    aplicarBloco(this.editor, alvo.id, intervalo);
    return true;
  }

  /**
   * As teclas do menu. Verdadeiro = a tecla foi do menu (o editor não a vê).
   * Sem nenhum bloco na lista, Enter e Tab seguem para o editor: o texto
   * digitado fica como está.
   */
  tecla(event: KeyboardEvent): boolean {
    if (event.isComposing) return false;
    const comModificador = event.ctrlKey || event.metaKey || event.altKey;
    const temItens = this.estado.itens.length > 0;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        if (!temItens || comModificador) return false;
        this.mover(event.key === 'ArrowDown' ? 1 : -1);
        return true;
      case 'Enter':
      case 'Tab':
        if (!temItens || comModificador || event.shiftKey) return false;
        this.aplicar();
        return true;
      case 'Escape':
      case 'Esc':
        // O plugin fecha o menu e mantém o texto; a tecla não sobe para a página.
        event.stopPropagation();
        return true;
      default:
        return false;
    }
  }

  // ---------- Leitor de tela ----------
  private sincronizarAria() {
    const dom = this.dom;
    if (!dom) return;
    const { aberto, itens, indice } = this.estado;
    if (!aberto) {
      for (const atributo of ATRIBUTOS_ARIA) dom.removeAttribute(atributo);
      return;
    }
    dom.setAttribute('aria-expanded', 'true');
    dom.setAttribute('aria-controls', this.idDaLista);
    dom.setAttribute('aria-autocomplete', 'list');
    const ativo = itens[indice];
    if (ativo) dom.setAttribute('aria-activedescendant', this.idDaOpcao(ativo.id));
    else dom.removeAttribute('aria-activedescendant');
  }

  /** Editor destruído: nada fica pendurado no elemento nem no seletor. */
  encerrar() {
    this.fechar();
    if (this.dom) for (const atributo of ATRIBUTOS_ARIA) this.dom.removeAttribute(atributo);
    this.dom = null;
    this.pendente = null;
  }

  // ---------- Imagem ----------
  /** A tela registra quem abre o seletor de arquivos (o `<input type=file>` escondido). */
  registrarSeletor(abrir: () => boolean): () => void {
    this.seletor = abrir;
    return () => { if (this.seletor === abrir) this.seletor = null; };
  }

  podeEscolherImagem(): boolean {
    return this.seletor !== null;
  }

  /**
   * Guarda o lugar da imagem ANTES de abrir o seletor (no celular o teclado
   * fecha e a seleção some) e abre. Precisa rodar dentro do gesto da pessoa
   * (tecla ou clique), senão o navegador bloqueia o seletor.
   */
  pedirImagem(): boolean {
    if (!this.seletor || this.editor.isDestroyed) return false;
    this.pendente = { ponto: pontoDoCursor(this.editor.state), doc: this.editor.state.doc };
    return this.seletor();
  }

  /**
   * O lugar guardado, levado pelas edições que aconteceram enquanto o seletor
   * estava aberto (outra imagem que terminou de subir, por exemplo). Se o
   * documento foi trocado inteiro nesse meio-tempo (página recarregada), vale
   * o cursor de agora.
   */
  tomarPonto(): PontoDeInsercao {
    const pendente = this.pendente;
    this.pendente = null;
    if (pendente && pendente.doc === this.editor.state.doc) return pendente.ponto;
    return pontoDoCursor(this.editor.state);
  }

  descartarPonto() {
    this.pendente = null;
  }

  mapear(tr: Transaction) {
    const pendente = this.pendente;
    if (!pendente || !tr.docChanged || tr.before !== pendente.doc) return;
    this.pendente = {
      // Associação à direita, como os marcadores de envio: o que entra
      // exatamente no lugar fica antes da imagem.
      ponto: { pos: tr.mapping.map(pendente.ponto.pos, 1), substituir: pendente.ponto.substituir },
      doc: tr.doc,
    };
  }
}

const lojas = new WeakMap<Editor, LojaMenuBarra>();

/** A loja do menu deste editor (criada na primeira chamada). */
export function lojaDoMenu(editor: Editor): LojaMenuBarra {
  let loja = lojas.get(editor);
  if (!loja) {
    loja = new LojaMenuBarra(editor);
    lojas.set(editor, loja);
  }
  return loja;
}

// ---------- Onde a "/" vale ----------

/**
 * A "/" abre o menu no começo de um bloco ou depois de um espaço — "14/10" e
 * "e/ou" continuam texto. O plugin já confere o caractere anterior dentro do
 * mesmo pedaço de texto; aqui a conferência atravessa a troca de marca (uma
 * "/" sem negrito logo depois de uma palavra em negrito).
 *
 * A consulta pode ter espaço ("lista num"), mas só enquanto algum bloco casa:
 * uma frase comum que começa com "/" não deixa o menu aberto. E "/ " (barra e
 * espaço) é texto, não pedido de menu.
 */
export function barraValida(state: EditorState, intervalo: Range): boolean {
  const $de = state.doc.resolve(intervalo.from);
  if (!$de.parent.isTextblock || $de.parent.type.spec.code) return false;
  if ($de.parentOffset > 0) {
    const antes = state.doc.textBetween(intervalo.from - 1, intervalo.from, '\n', '￼');
    if (!/\s/.test(antes)) return false;
  }
  const consulta = state.doc.textBetween(Math.min(intervalo.from + 1, intervalo.to), intervalo.to, '\n', '￼');
  if (/^\s/.test(consulta)) return false;
  if (/\s/.test(consulta) && filtrarBlocos(consulta).length === 0) return false;
  return true;
}

// ---------- O que cada bloco faz ----------

const LISTAS = new Set(['bulletList', 'orderedList', 'taskList']);

/** A lista mais próxima em volta do cursor (a de dentro, numa lista aninhada). */
function listaDoCursor(state: EditorState): string | null {
  const $de = state.selection.$from;
  for (let d = $de.depth; d > 0; d--) {
    const nome = $de.node(d).type.name;
    if (LISTAS.has(nome)) return nome;
  }
  return null;
}

function dentroDe(state: EditorState, nome: string): boolean {
  const $de = state.selection.$from;
  for (let d = $de.depth; d > 0; d--) if ($de.node(d).type.name === nome) return true;
  return false;
}

/**
 * Transforma o bloco do cursor (ou insere, no caso do divisor e da imagem).
 * Com `intervalo`, o "/consulta" sai na MESMA transação: um Ctrl+Z desfaz o
 * bloco e devolve o texto digitado.
 *
 * Escolher o tipo que o bloco já tem não desfaz nada: "Título 1" num título 1
 * continua título 1, e "Lista numerada" dentro de uma lista numerada não tira
 * o item da lista (os comandos `toggle*` desfariam).
 *
 * "Imagem" abre o seletor de arquivos que a tela registrou; falso se não há.
 */
export function aplicarBloco(editor: Editor, id: IdBloco, intervalo?: Range | null): boolean {
  if (editor.isDestroyed) return false;
  const loja = lojaDoMenu(editor);
  if (id === 'imagem' && !loja.podeEscolherImagem()) return false;

  const state = editor.state;
  let cadeia = editor.chain().focus();
  if (intervalo) cadeia = cadeia.deleteRange(intervalo);
  const lista = listaDoCursor(state);

  switch (id) {
    case 'texto':
      // Num item de lista ou numa citação, o parágrafo sai do envoltório.
      return cadeia.setParagraph().run();
    case 'titulo1':
      return cadeia.setHeading({ level: 1 }).run();
    case 'titulo2':
      return cadeia.setHeading({ level: 2 }).run();
    case 'titulo3':
      return cadeia.setHeading({ level: 3 }).run();
    case 'numerada':
      return (lista === 'orderedList' ? cadeia : cadeia.toggleOrderedList()).run();
    case 'marcadores':
      return (lista === 'bulletList' ? cadeia : cadeia.toggleBulletList()).run();
    case 'tarefas':
      return (lista === 'taskList' ? cadeia : cadeia.toggleTaskList()).run();
    case 'citacao':
      return (dentroDe(state, 'blockquote') ? cadeia : cadeia.setBlockquote()).run();
    case 'divisor':
      return cadeia.setHorizontalRule().run();
    case 'imagem':
      cadeia.run();
      return loja.pedirImagem();
  }
}

/**
 * Abre o menu onde está o cursor, escrevendo a "/" (com um espaço antes,
 * se o cursor está colado numa palavra). Para o "+" da margem do bloco e a
 * barra do celular, que pedem o menu sem a pessoa digitar.
 */
export function abrirMenuBarra(editor: Editor): boolean {
  if (editor.isDestroyed) return false;
  const { state } = editor;
  const { from } = state.selection;
  const $de = state.selection.$from;
  const antes = $de.parentOffset > 0 ? state.doc.textBetween(from - 1, from, '\n', '￼') : '';
  const texto = antes && !/\s/.test(antes) ? ' /' : '/';
  return editor.chain().focus().insertContent(texto).run();
}

// ---------- Posição na tela ----------

/** Distância entre o "/consulta" e o menu, e o mínimo de folga até a borda da tela. */
const VAO_MENU = 4;
const MARGEM_MENU = 8;

export interface JanelaVisivel {
  topo: number;
  base: number;
  esquerda: number;
  direita: number;
  /** Altura do bloco que posiciona o `position: fixed` (para o `bottom`). */
  alturaLayout: number;
}

export interface LugarDoMenu {
  lado: 'abaixo' | 'acima';
  left: number;
  /** `top` quando abre para baixo, `bottom` quando abre para cima. */
  top?: number;
  bottom?: number;
  /** Altura disponível no lado escolhido: vira o teto do menu (com rolagem por dentro). */
  espaco: number;
}

/**
 * Abre para baixo do "/consulta" quando cabe; senão, para o lado com mais
 * espaço (para cima, perto do pé da tela ou com o teclado do celular aberto).
 * Para cima ancora pelo `bottom`, então a altura final do menu não importa.
 * Na horizontal, alinha com a "/" sem sair da tela.
 */
export function posicionarMenu(
  ancora: Pick<DOMRect, 'top' | 'bottom' | 'left'>,
  caixa: { altura: number; largura: number },
  janela: JanelaVisivel,
): LugarDoMenu {
  const abaixo = janela.base - (ancora.bottom + VAO_MENU) - MARGEM_MENU;
  const acima = ancora.top - VAO_MENU - janela.topo - MARGEM_MENU;
  const lado: LugarDoMenu['lado'] =
    caixa.altura <= abaixo ? 'abaixo' : caixa.altura <= acima || acima > abaixo ? 'acima' : 'abaixo';
  const minimo = janela.esquerda + MARGEM_MENU;
  const maximo = janela.direita - caixa.largura - MARGEM_MENU;
  const left = Math.round(Math.max(minimo, Math.min(ancora.left, maximo)));
  if (lado === 'abaixo') {
    return { lado, left, top: Math.round(ancora.bottom + VAO_MENU), espaco: Math.max(0, Math.floor(abaixo)) };
  }
  return {
    lado,
    left,
    bottom: Math.round(janela.alturaLayout - (ancora.top - VAO_MENU)),
    espaco: Math.max(0, Math.floor(acima)),
  };
}

/**
 * A borda do chrome fixo que cobre o texto: a de baixo do cabeçalho (sticky
 * no topo) e a de cima da barra inferior do celular. Medidas, não lidas do
 * token: a barra inferior só existe até 820px e o cabeçalho pode ter rolado.
 */
function bordaDoChrome(seletor: string, lado: 'bottom' | 'top'): number | null {
  const el = document.querySelector(seletor);
  if (!(el instanceof HTMLElement) || getComputedStyle(el).display === 'none') return null;
  const caixa = el.getBoundingClientRect();
  return caixa.height > 0 ? caixa[lado] : null;
}

/**
 * A parte da tela que a pessoa vê (no celular, acima do teclado), sem o
 * cabeçalho e a barra inferior: o menu fica acima deles na pilha (z-index), e
 * aberto para cima cobriria a migalha e a busca.
 */
export function janelaVisivel(): JanelaVisivel {
  const alturaLayout = document.documentElement.clientHeight || window.innerHeight;
  const vv = window.visualViewport;
  const janela = vv
    ? { topo: vv.offsetTop, base: vv.offsetTop + vv.height, esquerda: vv.offsetLeft, direita: vv.offsetLeft + vv.width, alturaLayout }
    : { topo: 0, base: window.innerHeight, esquerda: 0, direita: window.innerWidth, alturaLayout };
  const cabecalho = bordaDoChrome('.app-header', 'bottom');
  if (cabecalho !== null && cabecalho > janela.topo) janela.topo = Math.min(cabecalho, janela.base);
  const barra = bordaDoChrome('.nav-bottom', 'top');
  if (barra !== null && barra < janela.base && barra > janela.topo) janela.base = barra;
  return janela;
}

// ---------- A extensão ----------

/**
 * O menu "/" no editor. A tela é `MenuBarraView` (`MenuBarraView.tsx`), montada
 * pelo `EditorNota` ao lado do `EditorContent`.
 */
export const MenuBarra = Extension.create({
  name: 'menuBarra',
  // Antes dos atalhos das listas: com o menu aberto, Enter e Tab num item de
  // lista aplicam o bloco em vez de quebrar ou recuar o item.
  priority: 1100,

  addProseMirrorPlugins() {
    const editor = this.editor;
    const loja = lojaDoMenu(editor);
    return [
      Suggestion<BlocoNota, BlocoNota>({
        editor,
        pluginKey: chaveMenuBarra,
        char: '/',
        allowSpaces: true,
        allowedPrefixes: [' ', ' '],
        decorationTag: 'span',
        decorationClass: 'nota-menu-gatilho',
        decorationEmptyClass: 'nota-menu-gatilho--vazio',
        decorationContent: FANTASMA_MENU_BARRA,
        allow: ({ state, range }) => barraValida(state, range),
        // A lista é filtrada pela loja, na hora; o plugin não precisa buscar nada.
        items: () => [],
        command: ({ editor: ed, range, props }) => { aplicarBloco(ed, props.id, range); },
        render: () => ({
          onStart: props => loja.mostrar(props),
          onUpdate: props => loja.mostrar(props),
          onExit: () => loja.fechar(),
          onKeyDown: ({ event }) => loja.tecla(event),
        }),
      }),
    ];
  },

  onTransaction({ transaction }) {
    lojaDoMenu(this.editor).mapear(transaction);
  },

  /**
   * O foco saiu do editor (Tab para fora, clique na página): o menu fecha e o
   * texto fica. Trocar de janela não conta — na volta o menu continua lá. Os
   * itens do menu não roubam o foco (o `mousedown` deles é cancelado).
   */
  onBlur() {
    const loja = lojaDoMenu(this.editor);
    if (!loja.ler().aberto || this.editor.isDestroyed) return;
    if (typeof document !== 'undefined' && !document.hasFocus()) return;
    exitSuggestion(this.editor.view, chaveMenuBarra);
  },

  onDestroy() {
    lojaDoMenu(this.editor).encerrar();
  },
});
