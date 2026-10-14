import {
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { BubbleMenu, type BubbleMenuProps } from '@tiptap/react/menus';
import { AllSelection, Plugin, PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { linkPermitido } from '../../lib/links';

/**
 * Barra flutuante de formatação da aba Anotações: surge sobre uma seleção de
 * TEXTO e oferece Negrito, Itálico, Sublinhado, Tachado, Destaque e Link — o
 * painel "Barra flutuante" do canvas aprovado.
 *
 * Não aparece:
 * - com a seleção vazia, só com espaço, ou de nó (a imagem selecionada tem a
 *   barra própria dela);
 * - fora do editor (o campo do título é outro elemento: o editor perde o foco
 *   e a barra sai junto);
 * - com o menu "/" aberto (qualquer `@tiptap/suggestion` ativa);
 * - em aparelho só de toque até 760px — lá a barra de formato fica acima do
 *   teclado (Lote 4).
 *
 * A bolha mora numa camada própria no `<body>`: nenhum `overflow` de cartão a
 * corta e nenhum `transform` de ancestral a desloca. É `absolute` no documento,
 * então rola junto com a página sem esperar o reposicionamento.
 */
export interface BolhaFormatoProps {
  /** O editor da página — o mesmo que o `EditorNota` cria. */
  editor: Editor | null;
}

export function BolhaFormato({ editor }: BolhaFormatoProps) {
  if (!editor || editor.isDestroyed) return null;
  return <Bolha editor={editor} />;
}

// ---------- Atalhos ----------

const MAC = typeof navigator !== 'undefined'
  && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');

/** "Ctrl+Shift+S" no texto; "Control+Shift+S" no `aria-keyshortcuts`. No Mac, ⌘ e Meta. */
function atalho(...teclas: string[]): { texto: string; aria: string } {
  return {
    texto: [MAC ? '⌘' : 'Ctrl', ...teclas].join('+'),
    aria: [MAC ? 'Meta' : 'Control', ...teclas].join('+'),
  };
}

// ---------- Ícones (SVG inline, cor do token via currentColor) ----------

function Svg({ children, traco = 2 }: { children: ReactNode; traco?: number }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={traco}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const ICONE_NEGRITO = <Svg traco={2.4}><path d="M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z" /></Svg>;
const ICONE_ITALICO = <Svg><path d="M19 4h-9M14 20H5M15 4L9 20" /></Svg>;
const ICONE_SUBLINHADO = <Svg><path d="M6 4v6a6 6 0 0 0 12 0V4M4 21h16" /></Svg>;
const ICONE_TACHADO = <Svg><path d="M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6M4 12h16" /></Svg>;
const ICONE_LINK = (
  <Svg>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </Svg>
);
/** O botão Destaque mostra a própria cor do marca-texto com um "A", como no canvas. */
const ICONE_DESTAQUE = <span className="nota-bolha-amostra" aria-hidden="true">A</span>;

// ---------- Marcas ----------

type Marca = 'bold' | 'italic' | 'underline' | 'strike' | 'highlight';

interface BotaoMarca {
  marca: Marca;
  rotulo: string;
  atalho: { texto: string; aria: string };
  icone: ReactNode;
  /** Separador antes do botão (entre Tachado e Destaque). */
  separar?: boolean;
}

/**
 * Na ordem do canvas. Os atalhos são os que as extensões já registram:
 * StarterKit (Mod-b, Mod-i, Mod-u, Mod-Shift-s) e Highlight (Mod-Shift-h).
 */
const MARCAS: readonly BotaoMarca[] = [
  { marca: 'bold', rotulo: 'Negrito', atalho: atalho('B'), icone: ICONE_NEGRITO },
  { marca: 'italic', rotulo: 'Itálico', atalho: atalho('I'), icone: ICONE_ITALICO },
  { marca: 'underline', rotulo: 'Sublinhado', atalho: atalho('U'), icone: ICONE_SUBLINHADO },
  { marca: 'strike', rotulo: 'Tachado', atalho: atalho('Shift', 'S'), icone: ICONE_TACHADO },
  { marca: 'highlight', rotulo: 'Destaque', atalho: atalho('Shift', 'H'), icone: ICONE_DESTAQUE, separar: true },
];

/**
 * Foco de volta no editor, já: o `focus()` dos comandos do TipTap espera o
 * próximo quadro, e nesse meio-tempo o botão ou o campo que tinha o foco pode
 * sumir da bolha — o foco cairia no `<body>` e a bolha fecharia.
 */
function focarEditor(editor: Editor): void {
  if (!editor.isDestroyed && !editor.view.hasFocus()) editor.view.focus();
}

function alternarMarca(editor: Editor, marca: Marca, focar: boolean): void {
  if (focar) focarEditor(editor);
  const cadeia = editor.chain();
  switch (marca) {
    case 'bold': cadeia.toggleBold().run(); break;
    case 'italic': cadeia.toggleItalic().run(); break;
    case 'underline': cadeia.toggleUnderline().run(); break;
    case 'strike': cadeia.toggleStrike().run(); break;
    case 'highlight': cadeia.toggleHighlight().run(); break;
  }
}

/**
 * Lido no render da `Bolha`. Numa renderização fatiada, o `useEditor` do
 * TipTap pode destruir a instância (o relógio de 1 ms de quem ainda não
 * montou) entre a conferência do `BolhaFormato` e o render da `Bolha`: aí o
 * `extensionManager` já é `null`, e o erro derrubava a renderização inteira
 * (o React refazia tudo de forma síncrona). A passada seguinte vem com o
 * editor novo.
 */
function temExtensao(editor: Editor, nome: string): boolean {
  return !editor.isDestroyed && editor.extensionManager.extensions.some(e => e.name === nome);
}

// ---------- Link ----------

export const MSG_LINK_RECUSADO = 'Use um link da web (https://…) ou mailto:.';
const MSG_LINK_VAZIO = 'Cole ou digite um endereço.';

// A regra de quais endereços viram link é `linkPermitido` (`lib/links.ts`), a
// mesma com que o `EditorNota` configura a extensão Link — não há segunda
// lista. Aqui ela roda sem a validação padrão do TipTap: o endereço já passou
// por `normalizarLink`, então o que chega sem esquema não é da web. O
// `setLink` confere de novo ao aplicar.

/**
 * O que a pessoa cola vira endereço: "www.exemplo.com" e "exemplo.com.br/x"
 * ganham `https://`, "fulano@empresa.com" ganha `mailto:`. Quem já traz
 * esquema (https:, mailto:, javascript:…) passa como veio — e a regra do
 * editor decide. Porta ("exemplo.com:8080") não é esquema.
 */
function normalizarLink(bruto: string): string {
  const s = bruto.trim();
  if (!s) return '';
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(s)) return s;
  if (s.startsWith('//')) return `https:${s}`;
  if (/^[^\s@/:]+@[^\s@/]+\.[^\s@/]+$/.test(s)) return `mailto:${s}`;
  if (/^[^\s/?#@]+\.[^\s/?#.]{2,}(?:[:/?#]\S*)?$/.test(s)) return `https://${s}`;
  return s;
}

/** O endereço como se lê: sem `https://`, sem `mailto:` e sem a barra final. O inteiro vai no `title`. */
function linkParaLer(href: string): string {
  return href.replace(/^https?:\/\//i, '').replace(/^mailto:/i, '').replace(/\/$/, '');
}

// ---------- Quando mostrar ----------

/** Aparelho só de toque e estreito: a barra de formato do celular assume (Lote 4). */
const SO_TOQUE_ESTREITO = '(hover: none) and (pointer: coarse) and (max-width: 760px)';

function soToqueEstreito(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(SO_TOQUE_ESTREITO).matches;
}

/**
 * Uma sugestão do `@tiptap/suggestion` (o menu "/") aberta. Lida pelo estado
 * de qualquer plugin com a forma dela — sem depender da chave que a etapa do
 * menu escolheu. Por construção já não coincidem (a sugestão só vive com a
 * seleção vazia); a checagem segura o caso de alguém mudar isso.
 */
function sugestaoAberta(state: EditorState): boolean {
  return state.plugins.some(plugin => {
    const s = plugin.getState(state) as { active?: unknown; range?: unknown; query?: unknown } | undefined;
    return !!s && typeof s === 'object' && s.active === true && 'range' in s && 'query' in s;
  });
}

/** Altura do header fixo: a bolha não sobe para baixo dele — vira para baixo da seleção. */
function alturaDoTopo(): number {
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return 0;
  const valor = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h'));
  return Number.isFinite(valor) ? valor : 0;
}

/** Distância entre a bolha e a linha selecionada, e da borda da janela (--sp-2). */
const FOLGA = 8;

// ---------- Seleção visível enquanto o foco está no campo do link ----------

type Alvo = { from: number; to: number } | null;

/**
 * Com o foco no campo do link, o navegador apaga o realce da seleção do
 * editor; a pessoa perde de vista o trecho que vai virar link. Uma decoração
 * (fora do documento, fora do desfazer) mantém o trecho marcado.
 */
function pluginDoAlvo(chave: PluginKey<DecorationSet>): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: chave,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, atual) {
        const meta = tr.getMeta(chave) as Alvo | undefined;
        if (meta === null) return DecorationSet.empty;
        if (meta) {
          const to = Math.min(meta.to, tr.doc.content.size);
          if (meta.from >= to) return DecorationSet.empty;
          return DecorationSet.create(tr.doc, [Decoration.inline(meta.from, to, { class: 'nota-bolha-alvo' })]);
        }
        return atual.map(tr.mapping, tr.doc);
      },
    },
    props: { decorations: estado => chave.getState(estado) },
  });
}

// ---------- A bolha ----------

type DeveMostrar = NonNullable<BubbleMenuProps['shouldShow']>;
type OpcoesFlutuantes = NonNullable<BubbleMenuProps['options']>;

interface Ativos {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  highlight: boolean;
  link: boolean;
  href: string;
  from: number;
  to: number;
}

function Bolha({ editor }: { editor: Editor }) {
  const idCampo = useId();
  const idErro = useId();

  const [chaveBolha] = useState(() => new PluginKey('notaBolha'));
  const [chaveAlvo] = useState(() => new PluginKey<DecorationSet>('notaBolhaAlvo'));

  const camadaRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const barraRef = useRef<HTMLDivElement | null>(null);
  const campoRef = useRef<HTMLInputElement | null>(null);
  const visivelRef = useRef(false);

  const [editando, setEditando] = useState(false);
  const [alvo, setAlvo] = useState<Alvo>(null);
  const [rascunho, setRascunho] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  /** O botão que recebe o Tab (tabindex móvel da barra). */
  const [foco, setFoco] = useState(0);
  const focoRef = useRef(foco);
  focoRef.current = foco;

  const ativos = useEditorState<Ativos>({
    editor,
    selector: ({ editor: ed }) => {
      const link = ed.isActive('link');
      const { from, to } = ed.state.selection;
      return {
        bold: ed.isActive('bold'),
        italic: ed.isActive('italic'),
        underline: ed.isActive('underline'),
        strike: ed.isActive('strike'),
        highlight: ed.isActive('highlight'),
        link,
        href: link ? String(ed.getAttributes('link').href ?? '') : '',
        from,
        to,
      };
    },
  });

  // ---------- Ganchos do plugin (criados uma vez; o que muda, lido por ref) ----------

  function esconder() {
    if (editor.isDestroyed || !visivelRef.current) return;
    editor.view.dispatch(editor.state.tr.setMeta(chaveBolha, 'hide'));
  }

  /** O foco está fora da bolha e do editor (o título, a lista, outro campo). */
  function focoFora(): boolean {
    if (editor.isDestroyed || editor.view.hasFocus()) return false;
    const ativo = document.activeElement;
    return !(ativo && camadaRef.current?.contains(ativo));
  }

  /** Confere depois que o foco assentou: no meio da troca, o `activeElement` ainda é o `<body>`. */
  function esconderSeFocoFora() {
    setTimeout(() => {
      if (focoFora()) esconder();
    }, 0);
  }

  const ganchosRef = useRef({ esconderSeFocoFora, esconder });
  ganchosRef.current = { esconderSeFocoFora, esconder };

  /** A camada própria no `<body>`, criada na primeira vez que a bolha aparece. */
  const [camada] = useState(() => (): HTMLElement => {
    let el = camadaRef.current;
    if (!el) {
      el = document.createElement('div');
      el.className = 'nota-bolha-camada';
      camadaRef.current = el;
    }
    if (!el.isConnected) document.body.appendChild(el);
    return el;
  });

  const [deveMostrar] = useState(() => {
    const regra: DeveMostrar = ({ editor: ed, view, state, from, to, element }) => {
      if (!ed.isEditable || soToqueEstreito()) return false;
      const { selection } = state;
      if (selection.empty) return false;
      // A imagem selecionada (NodeSelection) tem a barra dela; aqui só texto.
      if (!(selection instanceof TextSelection) && !(selection instanceof AllSelection)) return false;
      if (!state.doc.textBetween(from, to, ' ').trim()) return false;
      if (sugestaoAberta(state)) return false;
      const ativo = document.activeElement;
      return view.hasFocus() || (!!ativo && element.contains(ativo));
    };
    return regra;
  });

  const [opcoes] = useState<OpcoesFlutuantes>(() => {
    const topo = alturaDoTopo();
    return {
      strategy: 'absolute',
      placement: 'top',
      offset: FOLGA,
      // Sem espaço acima (perto do header), vai para baixo da seleção — nunca por cima da linha.
      flip: { fallbackPlacements: ['bottom'], padding: { top: topo + FOLGA, right: FOLGA, bottom: FOLGA, left: FOLGA } },
      shift: { padding: FOLGA },
      // A seleção rolou para baixo do header: a bolha some até ela voltar.
      hide: { padding: { top: topo } },
      onShow: () => {
        visivelRef.current = true;
        // O plugin põe a bolha inteira na ordem do Tab (tabindex 0); quem
        // recebe o Tab é o botão do tabindex móvel da barra.
        if (menuRef.current) menuRef.current.tabIndex = -1;
      },
      onHide: () => {
        visivelRef.current = false;
        setEditando(false);
        setErro(null);
        setFoco(0);
      },
    };
  });

  // ---------- Efeitos ----------

  // A decoração do trecho-alvo do link: registrada uma vez por editor.
  useEffect(() => {
    if (editor.isDestroyed) return;
    editor.registerPlugin(pluginDoAlvo(chaveAlvo));
    return () => {
      if (!editor.isDestroyed) editor.unregisterPlugin(chaveAlvo);
    };
  }, [editor, chaveAlvo]);

  // O trecho fica marcado enquanto o campo do link está aberto. Efeito, e não
  // chamada direta: o fechamento pode vir de dentro de uma atualização do editor.
  const alvoMarcado = useRef(false);
  useEffect(() => {
    const marcar = editando && !!alvo;
    if (editor.isDestroyed || (!marcar && !alvoMarcado.current)) return;
    alvoMarcado.current = marcar;
    editor.view.dispatch(editor.state.tr.setMeta(chaveAlvo, marcar ? alvo : null).setMeta('addToHistory', false));
  }, [editor, chaveAlvo, editando, alvo]);

  // Campo aberto: o foco vai para ele, com o endereço atual selecionado.
  useEffect(() => {
    if (!editando) return;
    campoRef.current?.focus();
    campoRef.current?.select();
  }, [editando]);

  // A seleção mudou com o campo aberto (outro trecho, ou a página recarregou): o campo era daquele trecho.
  useEffect(() => {
    if (editando && alvo && (alvo.from !== ativos.from || alvo.to !== ativos.to)) {
      setEditando(false);
      setErro(null);
    }
  }, [editando, alvo, ativos.from, ativos.to]);

  // A bolha mudou de altura (campo do link, erro, linha do link): reposiciona,
  // senão ela cresce para baixo e cobre a linha selecionada.
  const mostrarLinha = ativos.link && !editando;
  useEffect(() => {
    if (editor.isDestroyed || !visivelRef.current) return;
    editor.view.dispatch(editor.state.tr.setMeta(chaveBolha, 'updatePosition'));
  }, [editor, chaveBolha, editando, erro, mostrarLinha]);

  // Saída do editor. O plugin ignora a primeira saída depois de um clique na
  // bolha (o mousedown dela não tira o foco do editor): um clique no título
  // logo depois de um Negrito deixaria a bolha à vista. Aqui não.
  // Alt+F10 leva o foco à barra; Esc a dispensa.
  useEffect(() => {
    if (editor.isDestroyed) return;
    const aoSair = ({ event }: { event: FocusEvent }) => {
      const para = event.relatedTarget;
      if (para instanceof Node && camadaRef.current?.contains(para)) return;
      ganchosRef.current.esconderSeFocoFora();
    };
    const aoTeclar = (event: KeyboardEvent) => {
      if (!visivelRef.current) return;
      if (event.key === 'F10' && event.altKey) {
        const botoes = barraRef.current?.querySelectorAll<HTMLButtonElement>('button');
        if (!botoes || botoes.length === 0) return;
        event.preventDefault();
        botoes[Math.min(focoRef.current, botoes.length - 1)].focus();
      } else if (event.key === 'Escape') {
        ganchosRef.current.esconder();
      }
    };
    const dom = editor.view.dom;
    editor.on('blur', aoSair);
    dom.addEventListener('keydown', aoTeclar);
    return () => {
      editor.off('blur', aoSair);
      dom.removeEventListener('keydown', aoTeclar);
    };
  }, [editor]);

  // A camada sai com o componente.
  useEffect(() => () => {
    camadaRef.current?.remove();
    camadaRef.current = null;
  }, []);

  // ---------- Ações ----------

  const marcas = MARCAS.filter(m => temExtensao(editor, m.marca));
  const temLink = temExtensao(editor, 'link');
  const podeAbrir = ativos.link && linkPermitido(ativos.href);

  /** Enter/Espaço num botão dispara um clique com `detail` 0: aí o foco fica na barra. */
  const doTeclado = (e: ReactMouseEvent) => e.detail === 0;

  function abrirCampo() {
    setRascunho(ativos.href);
    setErro(null);
    setAlvo({ from: ativos.from, to: ativos.to });
    setEditando(true);
  }

  /** Fecha o campo do link. Com `voltar`, o foco (e a seleção) voltam ao editor ANTES de o campo sumir. */
  function fecharCampo(voltar: boolean) {
    if (voltar) focarEditor(editor);
    setEditando(false);
    setErro(null);
  }

  function aoClicarLink() {
    if (editando) fecharCampo(true);
    else abrirCampo();
  }

  function aplicar(e: FormEvent) {
    e.preventDefault();
    const href = normalizarLink(rascunho);
    if (!href) {
      // Apagar o endereço de um link e confirmar é tirar o link.
      if (!ativos.link) {
        setErro(MSG_LINK_VAZIO);
        return;
      }
      focarEditor(editor);
      editor.chain().extendMarkRange('link').unsetLink().run();
      fecharCampo(false);
      return;
    }
    if (!linkPermitido(href)) {
      setErro(MSG_LINK_RECUSADO);
      campoRef.current?.focus();
      return;
    }
    focarEditor(editor);
    const cadeia = editor.chain();
    (ativos.link ? cadeia.extendMarkRange('link') : cadeia).setLink({ href }).run();
    fecharCampo(false);
  }

  function abrirLink() {
    if (!linkPermitido(ativos.href)) return;
    window.open(ativos.href, '_blank', 'noopener,noreferrer');
  }

  function removerLink() {
    // A linha do link some junto: o foco vai antes para o editor.
    focarEditor(editor);
    editor.chain().extendMarkRange('link').unsetLink().run();
  }

  // ---------- Teclado e foco ----------

  /** ←/→ entre os botões (com volta), Home e End. Só na barra: o campo do link é texto. */
  function aoTeclarNaBarra(e: ReactKeyboardEvent<HTMLDivElement>) {
    const lista = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
    const atual = lista.indexOf(document.activeElement as HTMLButtonElement);
    if (atual < 0) return;
    let proximo: number;
    if (e.key === 'ArrowRight') proximo = (atual + 1) % lista.length;
    else if (e.key === 'ArrowLeft') proximo = (atual - 1 + lista.length) % lista.length;
    else if (e.key === 'Home') proximo = 0;
    else if (e.key === 'End') proximo = lista.length - 1;
    else return;
    e.preventDefault();
    setFoco(proximo);
    lista[proximo].focus();
  }

  /**
   * Esc em qualquer ponto da bolha fecha o campo e devolve o foco ao editor,
   * com a seleção. Tab que sairia da bolha também volta ao editor: a camada
   * fica no fim do `<body>`, e o próximo da ordem seria a barra do navegador.
   */
  function aoTeclarNaBolha(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      fecharCampo(true);
      return;
    }
    if (e.key !== 'Tab') return;
    const focaveis = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button, input'))
      .filter(el => el.tabIndex >= 0);
    const atual = focaveis.indexOf(document.activeElement as HTMLElement);
    if (e.shiftKey ? atual <= 0 : atual === focaveis.length - 1) {
      e.preventDefault();
      fecharCampo(true);
    }
  }

  /** O foco saiu da bolha para fora dela e do editor (Tab, clique na página). */
  function aoPerderFoco(e: ReactFocusEvent<HTMLDivElement>) {
    const para = e.relatedTarget;
    if (para instanceof Node && (camadaRef.current?.contains(para) || editor.view.dom.contains(para))) return;
    esconderSeFocoFora();
  }

  /** O clique de mouse num botão não tira o foco do editor: a seleção continua à vista. */
  function manterFocoNoEditor(e: ReactMouseEvent) {
    if (e.target instanceof Element && e.target.closest('button')) e.preventDefault();
  }

  // ---------- Desenho ----------

  const total = marcas.length + (temLink ? 1 : 0) + (mostrarLinha ? (podeAbrir ? 2 : 1) : 0);
  const focoSeguro = Math.min(foco, Math.max(0, total - 1));
  let indice = 0;
  /** Tabindex móvel: só um botão da barra fica na ordem do Tab. Na ordem do DOM. */
  function movel() {
    const i = indice++;
    return { tabIndex: i === focoSeguro ? 0 : -1, onFocus: () => setFoco(i) };
  }

  const rotuloLink = ativos.link ? 'Editar link' : 'Inserir link';

  return (
    <BubbleMenu
      editor={editor}
      pluginKey={chaveBolha}
      shouldShow={deveMostrar}
      appendTo={camada}
      options={opcoes}
      className="nota-bolha"
      ref={menuRef}
    >
      <div className="nota-bolha-corpo" onKeyDown={aoTeclarNaBolha} onBlur={aoPerderFoco}>
        <div
          ref={barraRef}
          className="nota-bolha-barra"
          role="toolbar"
          aria-label="Formatar seleção"
          aria-orientation="horizontal"
          aria-keyshortcuts="Alt+F10"
          onKeyDown={aoTeclarNaBarra}
          onMouseDown={manterFocoNoEditor}
        >
          <div className="nota-bolha-botoes">
            {marcas.map(m => {
              const rotulo = `${m.rotulo} (${m.atalho.texto})`;
              return (
                <span key={m.marca} className="nota-bolha-grupo">
                  {m.separar && <span className="nota-bolha-sep" aria-hidden="true" />}
                  <button
                    type="button"
                    className="nota-bolha-btn"
                    aria-label={rotulo}
                    title={rotulo}
                    aria-keyshortcuts={m.atalho.aria}
                    aria-pressed={ativos[m.marca]}
                    onClick={e => alternarMarca(editor, m.marca, !doTeclado(e))}
                    {...movel()}
                  >
                    {m.icone}
                  </button>
                </span>
              );
            })}
            {temLink && (
              <button
                type="button"
                className="nota-bolha-btn"
                data-ativo={ativos.link || undefined}
                aria-label={rotuloLink}
                title={rotuloLink}
                aria-expanded={editando}
                aria-controls={editando ? idCampo : undefined}
                onClick={aoClicarLink}
                {...movel()}
              >
                {ICONE_LINK}
              </button>
            )}
          </div>
          {mostrarLinha && (
            <div className="nota-bolha-linha" role="group" aria-label="Link da seleção">
              <span className="nota-bolha-url" title={ativos.href}>{linkParaLer(ativos.href)}</span>
              {podeAbrir && (
                <button type="button" className="nota-bolha-texto" onClick={abrirLink} {...movel()}>
                  Abrir
                </button>
              )}
              <button type="button" className="nota-bolha-texto" onClick={removerLink} {...movel()}>
                Remover link
              </button>
            </div>
          )}
        </div>
        {editando && (
          <form id={idCampo} className="nota-bolha-form" onSubmit={aplicar} noValidate>
            <input
              ref={campoRef}
              className="nota-bolha-campo"
              type="text"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="done"
              placeholder="Cole ou digite o link"
              aria-label="Endereço do link"
              aria-invalid={erro ? true : undefined}
              aria-describedby={erro ? idErro : undefined}
              value={rascunho}
              onChange={e => {
                setRascunho(e.target.value);
                if (erro) setErro(null);
              }}
            />
            <button type="submit" className="btn btn-navy">Aplicar</button>
            {erro && <p id={idErro} className="nota-bolha-erro" role="alert">{erro}</p>}
          </form>
        )}
      </div>
    </BubbleMenu>
  );
}
