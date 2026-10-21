import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useEditorState, type Editor } from '@tiptap/react';
import type { EditorState } from '@tiptap/pm/state';
import { blocoPorId } from '../../lib/blocosNota';
import { abrirMenuBarra, lojaDoMenu } from './menuBarra';
import { blocoDaSelecao, inserirAbaixo } from './moverBloco';
import { IconeBloco } from './MenuBarraView';

/**
 * A faixa de toque do CLAUDE.md: ponteiro grosso até 1100px — a mesma do
 * bloco único de `tokens.css` que leva `--tap-min` a 44px. Nela quem formata
 * é esta barra; fora dela, a bolha sobre a seleção (`BolhaFormato`, que lê
 * esta constante). Uma das duas, nunca as duas.
 */
export const FAIXA_TOQUE = '(pointer: coarse) and (max-width: 1100px)';

/**
 * Barra de formatação do celular e do tablet: presa à base da parte VISÍVEL
 * da tela, logo acima do teclado, enquanto o editor tem o foco. É o painel
 * "Barra de formato" do canvas aprovado (Mobile-Anotacao): Inserir bloco,
 * Imagem, Título, as três listas | Destaque, Negrito, e "Concluir" fixo na
 * ponta, fora da rolagem.
 *
 * - Os botões não tiram o foco do editor (o `pointerdown` e o `mousedown` são
 *   cancelados): o teclado fica aberto e o cursor, onde estava.
 * - A posição acompanha o `visualViewport`: o teclado do iOS não encolhe o
 *   layout, só a parte visível, e uma barra presa a `bottom: 0` ficaria atrás
 *   dele. Sem `visualViewport`, fica na base com a faixa segura.
 * - Enquanto ela aparece, a barra inferior de navegação sai (`notas-movel.css`)
 *   — as duas nunca se empilham — e o ProseMirror rola o cursor para acima
 *   dela em vez de deixá-lo atrás.
 * - Mora num portal no `<body>`: uma camada fixa não pode depender de nenhum
 *   ancestral estar livre de `transform`.
 */
export interface BarraFormatoMovelProps {
  /** O editor da página — o mesmo que o `EditorNota` cria. */
  editor: Editor | null;
}

// ---------- A faixa de toque ----------

function consultaDaFaixa(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(FAIXA_TOQUE)
    : null;
}

function assinarFaixa(aviso: () => void): () => void {
  const consulta = consultaDaFaixa();
  if (!consulta) return () => {};
  consulta.addEventListener('change', aviso);
  return () => consulta.removeEventListener('change', aviso);
}

const lerFaixa = () => consultaDaFaixa()?.matches ?? false;
const foraDaFaixa = () => false;

export function BarraFormatoMovel({ editor }: BarraFormatoMovelProps) {
  // Lida no primeiro render e de novo ao cruzar o corte (girar o tablet).
  const naFaixa = useSyncExternalStore(assinarFaixa, lerFaixa, foraDaFaixa);
  if (!naFaixa || !editor || editor.isDestroyed) return null;
  return <Barra editor={editor} />;
}

// ---------- Ícones (SVG inline, cor do token via currentColor) ----------

function Svg({ children, traco = 2 }: { children: ReactNode; traco?: number }) {
  return (
    <svg
      width="20"
      height="20"
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

/** O "+" da margem do bloco (`AlcaBloco`): o mesmo pedido, o menu "/". */
const ICONE_MAIS = <Svg traco={2.2}><path d="M12 5v14M5 12h14" /></Svg>;
/** O da bolha (`BolhaFormato`). */
const ICONE_NEGRITO = <Svg traco={2.4}><path d="M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z" /></Svg>;
/** Recuo de lista: as linhas de texto com a seta para a direita (sub-item) ou para a esquerda. */
const ICONE_AVANCAR = <Svg><path d="M11 6h9M11 12h9M11 18h9M4 9l3 3-3 3" /></Svg>;
const ICONE_RECUAR = <Svg><path d="M11 6h9M11 12h9M11 18h9M7 9l-3 3 3 3" /></Svg>;
const ICONE_CONCLUIR = <Svg traco={2.6}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
/** A própria cor do marca-texto com um "A" — a mesma amostra da bolha. */
const ICONE_DESTAQUE = <span className="nota-bolha-amostra" aria-hidden="true">A</span>;

// ---------- Estado do editor que a barra mostra ----------

type Lista = 'orderedList' | 'bulletList' | 'taskList';
const LISTAS: ReadonlySet<string> = new Set<Lista>(['orderedList', 'bulletList', 'taskList']);

/** O item que o Tab e o Shift+Tab movem: o da tarefa tem tipo próprio. */
const itemDaLista = (lista: Lista) => (lista === 'taskList' ? 'taskItem' : 'listItem');

/** A lista mais próxima em volta do cursor (a de dentro, numa lista aninhada): é a que o botão alterna. */
function listaDoCursor(state: EditorState): Lista | null {
  const $de = state.selection.$from;
  for (let d = $de.depth; d > 0; d--) {
    const nome = $de.node(d).type.name;
    if (LISTAS.has(nome)) return nome as Lista;
  }
  return null;
}

interface Estado {
  focado: boolean;
  editavel: boolean;
  negrito: boolean;
  destaque: boolean;
  titulo: boolean;
  lista: Lista | null;
}

const PARADO: Estado = { focado: false, editavel: false, negrito: false, destaque: false, titulo: false, lista: null };

function lerEstado(editor: Editor): Estado {
  // Numa renderização fatiada o `useEditor` pode destruir a instância antes
  // desta leitura (ver `temExtensao` em BolhaFormato).
  if (editor.isDestroyed) return PARADO;
  return {
    focado: editor.isFocused,
    editavel: editor.isEditable,
    negrito: editor.isActive('bold'),
    destaque: editor.isActive('highlight'),
    titulo: editor.isActive('heading', { level: 2 }),
    lista: listaDoCursor(editor.state),
  };
}

// ---------- Posição: acima do teclado ----------

/**
 * Quanto a parte visível da tela termina acima da base do layout — a altura
 * do teclado no iOS (e no Android que só encolhe a parte visível). Zero sem
 * `visualViewport`, ou quando o teclado encolhe o próprio layout.
 */
function alturaDoTeclado(): number {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!vv) return 0;
  const alturaLayout = document.documentElement.clientHeight || window.innerHeight;
  return Math.max(0, Math.round(alturaLayout - (vv.offsetTop + vv.height)));
}

/** Folga entre o cursor e a barra quando o ProseMirror rola até ele (a `--sp-2`). */
const FOLGA_CURSOR = 8;
/** O `scrollMargin` padrão do ProseMirror, mantido nos outros três lados. */
const MARGEM_PADRAO = 5;

/** O botão não fica com o foco: o editor continua focado e o teclado, aberto. */
function segurarFoco(event: SyntheticEvent) {
  event.preventDefault();
}

/** Foco de volta no editor, já — quem chegou à barra pelo Tab volta ao texto. */
function focarEditor(editor: Editor) {
  if (!editor.isDestroyed && !editor.view.hasFocus()) editor.view.focus();
}

/**
 * "Inserir bloco" é o "+" da margem (`AlcaBloco`): o menu "/" numa linha nova
 * logo abaixo do bloco do cursor — ou no próprio bloco, se ele está vazio.
 * Escrever a "/" no meio do texto faria o bloco escolhido TRANSFORMAR a linha
 * já escrita, e o botão diz inserir. Sem bloco à mão (seleção da página
 * inteira), a "/" vai no cursor.
 */
function inserirBloco(editor: Editor) {
  const { view } = editor;
  const bloco = blocoDaSelecao(view.state);
  if (bloco && inserirAbaixo(bloco.pos)(view.state, view.dispatch)) focarEditor(editor);
  else abrirMenuBarra(editor);
}

interface Acao {
  id: string;
  rotulo: string;
  icone: ReactNode;
  /** `aria-pressed`: só nos botões que ligam e desligam. */
  pressionado?: boolean;
  /** Separador antes do botão (entre as listas e o Destaque). */
  separar?: boolean;
  acionar(): void;
}

function Barra({ editor }: { editor: Editor }) {
  const estado = useEditorState<Estado>({ editor, selector: ({ editor: ed }) => lerEstado(ed) }) ?? PARADO;
  const raizRef = useRef<HTMLDivElement>(null);
  const botoesRef = useRef<Array<HTMLButtonElement | null>>([]);
  /** Foco num botão da barra (Tab, leitor de tela): ela fica enquanto ele estiver lá. */
  const [focoNaBarra, setFocoNaBarra] = useState(false);
  /** O botão que recebe o Tab (tabindex móvel, como na bolha). */
  const [foco, setFoco] = useState(0);

  const mostrar = estado.editavel && (estado.focado || focoNaBarra);

  // A barra saiu sem um `blur` (a página travou como só leitura com o foco
  // num botão): o foco guardado não a traz de volta sozinho depois.
  useEffect(() => {
    if (!mostrar) setFocoNaBarra(false);
  }, [mostrar]);

  // Acima do teclado: a distância até a base vem do `visualViewport` e chega
  // ao CSS por `--nota-formato-base`. Medida antes de pintar, sem salto.
  useLayoutEffect(() => {
    const el = raizRef.current;
    if (!mostrar || !el) return;
    let quadro = 0;
    let alturaAplicada = 0;
    const raiz = document.documentElement;

    // O ProseMirror rola o cursor para dentro da parte visível da tela, sem
    // saber da barra: com estas margens, a linha que se digita fica acima dela.
    function margens(altura: number) {
      if (altura === alturaAplicada || editor.isDestroyed) return;
      alturaAplicada = altura;
      const embaixo = altura + FOLGA_CURSOR;
      editor.view.setProps({
        scrollThreshold: { top: 0, right: 0, bottom: embaixo, left: 0 },
        scrollMargin: { top: MARGEM_PADRAO, right: MARGEM_PADRAO, bottom: embaixo, left: MARGEM_PADRAO },
      });
    }

    function medir() {
      quadro = 0;
      if (!el) return;
      const teclado = alturaDoTeclado();
      el.style.setProperty('--nota-formato-base', `${teclado}px`);
      // Com o teclado aberto a faixa segura do iPhone fica atrás dele.
      el.toggleAttribute('data-teclado', teclado > 0);
      margens(el.offsetHeight);
      // Onde a barra começa, contado da base: o aviso da página (snackbar)
      // sobe para cima dela em vez de cobrir os botões (`notas-movel.css`).
      raiz.style.setProperty('--nota-formato-topo', `${teclado + el.offsetHeight}px`);
    }

    function agendar() {
      if (!quadro) quadro = requestAnimationFrame(medir);
    }

    medir();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', agendar);
    vv?.addEventListener('scroll', agendar);
    window.addEventListener('resize', agendar);
    return () => {
      if (quadro) cancelAnimationFrame(quadro);
      vv?.removeEventListener('resize', agendar);
      vv?.removeEventListener('scroll', agendar);
      window.removeEventListener('resize', agendar);
      raiz.style.removeProperty('--nota-formato-topo');
      if (alturaAplicada > 0 && !editor.isDestroyed) {
        editor.view.setProps({ scrollThreshold: undefined, scrollMargin: undefined });
      }
    };
  }, [editor, mostrar]);

  if (!mostrar) return null;

  /** Toda ação passa por aqui: página só de leitura não recebe nada. */
  function executar(acao: () => void) {
    if (editor.isDestroyed || !editor.isEditable) return;
    acao();
  }

  function alternar(comando: (ed: Editor) => void) {
    executar(() => {
      focarEditor(editor);
      comando(editor);
    });
  }

  const acoes: Acao[] = [
    {
      id: 'bloco',
      rotulo: 'Inserir bloco',
      icone: ICONE_MAIS,
      acionar: () => executar(() => { inserirBloco(editor); }),
    },
    {
      id: 'imagem',
      rotulo: 'Inserir imagem',
      icone: <IconeBloco id="imagem" />,
      // O mesmo seletor do menu "/" (sem `capture`: o sistema oferece galeria
      // e câmera). `pedirImagem` guarda o lugar do cursor ANTES de abrir — o
      // teclado fecha e a seleção some. Sem focar o editor: o teclado não
      // precisa subir para descer logo em seguida.
      acionar: () => executar(() => { lojaDoMenu(editor).pedirImagem(); }),
    },
    {
      id: 'titulo',
      rotulo: blocoPorId('titulo2').nome,
      icone: <IconeBloco id="titulo2" />,
      pressionado: estado.titulo,
      acionar: () => alternar(ed => { ed.chain().toggleHeading({ level: 2 }).run(); }),
    },
    {
      id: 'numerada',
      rotulo: blocoPorId('numerada').nome,
      icone: <IconeBloco id="numerada" />,
      pressionado: estado.lista === 'orderedList',
      acionar: () => alternar(ed => { ed.chain().toggleOrderedList().run(); }),
    },
    {
      id: 'marcadores',
      rotulo: blocoPorId('marcadores').nome,
      icone: <IconeBloco id="marcadores" />,
      pressionado: estado.lista === 'bulletList',
      acionar: () => alternar(ed => { ed.chain().toggleBulletList().run(); }),
    },
    {
      id: 'tarefas',
      rotulo: blocoPorId('tarefas').nome,
      icone: <IconeBloco id="tarefas" />,
      pressionado: estado.lista === 'taskList',
      acionar: () => alternar(ed => { ed.chain().toggleTaskList().run(); }),
    },
    // O teclado do celular não tem Tab: o sub-item (1 → a, b, c) e a volta
    // ficam aqui, só enquanto o cursor está numa lista.
    ...(estado.lista ? listaRecuo(estado.lista) : []),
    {
      id: 'destaque',
      rotulo: 'Destaque',
      icone: ICONE_DESTAQUE,
      pressionado: estado.destaque,
      separar: true,
      acionar: () => alternar(ed => { ed.chain().toggleHighlight().run(); }),
    },
    {
      id: 'negrito',
      rotulo: 'Negrito',
      icone: ICONE_NEGRITO,
      pressionado: estado.negrito,
      acionar: () => alternar(ed => { ed.chain().toggleBold().run(); }),
    },
  ];
  function listaRecuo(lista: Lista): Acao[] {
    const item = itemDaLista(lista);
    return [
      {
        id: 'avancar',
        rotulo: 'Transformar em sub-item',
        icone: ICONE_AVANCAR,
        acionar: () => alternar(ed => { ed.chain().sinkListItem(item).run(); }),
      },
      {
        id: 'recuar',
        rotulo: 'Voltar um nível',
        icone: ICONE_RECUAR,
        acionar: () => alternar(ed => { ed.chain().liftListItem(item).run(); }),
      },
    ];
  }
  const total = acoes.length + 1; // + Concluir
  // Os botões de recuo entram e saem com a lista: o índice guardado não pode
  // apontar para além do último, senão nenhum botão fica alcançável pelo Tab.
  const focoAtual = Math.min(foco, total - 1);

  /** Fim da edição: o editor perde o foco, o teclado desce e a barra sai junto. */
  function concluir() {
    const ativo = document.activeElement;
    if (ativo instanceof HTMLElement && raizRef.current?.contains(ativo)) ativo.blur();
    if (!editor.isDestroyed) editor.view.dom.blur();
    // Sem seleção no documento, o iOS não reabre o teclado sobre ela.
    window.getSelection()?.removeAllRanges();
    setFocoNaBarra(false);
  }

  function irPara(indice: number) {
    const alvo = ((indice % total) + total) % total;
    setFoco(alvo);
    botoesRef.current[alvo]?.focus();
  }

  function navegar(event: ReactKeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case 'ArrowRight': irPara(focoAtual + 1); break;
      case 'ArrowLeft': irPara(focoAtual - 1); break;
      case 'Home': irPara(0); break;
      case 'End': irPara(total - 1); break;
      default: return;
    }
    event.preventDefault();
  }

  function saiuDoFoco(event: ReactFocusEvent<HTMLDivElement>) {
    const para = event.relatedTarget;
    if (!(para instanceof Node && event.currentTarget.contains(para))) setFocoNaBarra(false);
  }

  function botao(acao: Pick<Acao, 'rotulo' | 'icone' | 'pressionado' | 'acionar'>, indice: number, classe = '') {
    return (
      <button
        ref={el => { botoesRef.current[indice] = el; }}
        type="button"
        className={`nota-formato-btn${classe}`}
        aria-label={acao.rotulo}
        aria-pressed={acao.pressionado}
        tabIndex={indice === focoAtual ? 0 : -1}
        onFocus={() => setFoco(indice)}
        onClick={acao.acionar}
      >
        {acao.icone}
      </button>
    );
  }

  return createPortal(
    <div
      ref={raizRef}
      className="nota-formato"
      role="toolbar"
      aria-label="Formatação"
      aria-orientation="horizontal"
      onPointerDown={segurarFoco}
      onMouseDown={segurarFoco}
      onKeyDown={navegar}
      onFocus={() => setFocoNaBarra(true)}
      onBlur={saiuDoFoco}
    >
      <div className="nota-formato-rolagem">
        {acoes.map((acao, i) => (
          <Fragment key={acao.id}>
            {acao.separar && <span className="nota-formato-sep" aria-hidden="true" />}
            {botao(acao, i)}
          </Fragment>
        ))}
      </div>
      {botao({ rotulo: 'Concluir edição', icone: ICONE_CONCLUIR, acionar: concluir }, acoes.length, ' nota-formato-concluir')}
    </div>,
    document.body,
  );
}
