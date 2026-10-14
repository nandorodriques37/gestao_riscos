import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { blocoPorId, type IdBloco } from '../../lib/blocosNota';
import { ACCEPT_IMAGEM_NOTA } from '../../lib/imageAttachments';
import { plural } from '../../lib/portfolioLabels';
import { IconeImagem } from './ImagemNotaView';
import {
  MENU_BARRA_FECHADO,
  janelaVisivel,
  lojaDoMenu,
  posicionarMenu,
  type EstadoMenuBarra,
  type LojaMenuBarra,
  type LugarDoMenu,
} from './menuBarra';
import type { PontoDeInsercao } from './uploadsDeImagem';

export interface MenuBarraViewProps {
  /** O editor da página (`useEditor`). Nulo enquanto ele não existe. */
  editor: Editor | null;
  /**
   * Os arquivos escolhidos no item "Imagem", com o lugar onde entram (o
   * cursor na hora em que o item foi escolhido). Vão para o MESMO caminho da
   * imagem colada — preparo, marcador e envio são do editor.
   */
  onImagens(arquivos: File[], ponto: PontoDeInsercao): void;
}

// Ícones em SVG inline, os do canvas. `currentColor`: a cor vem do token.
function Svg({ children, traco = 2 }: { children: ReactNode; traco?: number }) {
  return (
    <svg
      width="16"
      height="16"
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

/**
 * O ícone de um bloco: a sigla escrita (H1, H2, H3) ou o desenho. Também
 * serve à barra de formato do celular.
 */
export function IconeBloco({ id }: { id: IdBloco }) {
  const sigla = blocoPorId(id).sigla;
  if (sigla) return <>{sigla}</>;
  switch (id) {
    case 'texto':
      return <Svg><path d="M6 5h12" /><path d="M12 5v14" /><path d="M9 19h6" /></Svg>;
    case 'numerada':
      return (
        <Svg traco={1.8}>
          <path d="M11 6h9M11 12h9M11 18h9" />
          <path d="M4 5l2-1v5" />
          <path d="M4 14.5a1.5 1.5 0 0 1 3 0c0 1-3 2.5-3 4.5h3" />
        </Svg>
      );
    case 'marcadores':
      return (
        <Svg>
          <path d="M10 6h10M10 12h10M10 18h10" />
          <path d="M5 6h.01M5 12h.01M5 18h.01" strokeWidth={3} />
        </Svg>
      );
    case 'tarefas':
      return (
        <Svg traco={1.8}>
          <rect x="3.5" y="4" width="6" height="6" rx="1.5" />
          <path d="M5 7l1 1 2-2" />
          <rect x="3.5" y="14" width="6" height="6" rx="1.5" />
          <path d="M13 7h8M13 17h8" />
        </Svg>
      );
    case 'citacao':
      return <Svg><path d="M5 5v14" /><path d="M10 8h9M10 12h9M10 16h6" /></Svg>;
    case 'divisor':
      return <Svg><path d="M4 12h16" /><path d="M8 6h8M8 18h8" strokeOpacity={0.45} /></Svg>;
    case 'imagem':
      return <IconeImagem tamanho={16} />;
    default:
      return null;
  }
}

const nadaAssinar = () => () => {};
const lerFechado = () => MENU_BARRA_FECHADO;

/**
 * A tela do menu "/" (a lógica é a extensão `MenuBarra`, em `menuBarra.ts`).
 * Fica montada enquanto o editor existe: é dona do `<input type=file>`
 * escondido do item "Imagem" e da região que anuncia quantos blocos a busca
 * achou. A lista em si só existe com o menu aberto, num portal no `<body>` —
 * fora do cartão da página, que a cortaria, e fora de qualquer ancestral com
 * `transform`.
 */
export function MenuBarraView({ editor, onImagens }: MenuBarraViewProps) {
  const loja = editor ? lojaDoMenu(editor) : null;
  const estado = useSyncExternalStore(loja ? loja.assinar : nadaAssinar, loja ? loja.ler : lerFechado, lerFechado);
  const inputRef = useRef<HTMLInputElement>(null);
  const onImagensRef = useRef(onImagens);
  onImagensRef.current = onImagens;

  // O item "Imagem" chama isto dentro do gesto da pessoa (tecla ou clique):
  // o `click()` do seletor precisa disso.
  useEffect(() => {
    if (!loja) return;
    return loja.registrarSeletor(() => {
      const input = inputRef.current;
      if (!input) return false;
      input.click();
      return true;
    });
  }, [loja]);

  // Desistir do seletor não deixa um lugar guardado para trás.
  useEffect(() => {
    const input = inputRef.current;
    if (!input || !loja) return;
    const desistiu = () => loja.descartarPonto();
    input.addEventListener('cancel', desistiu);
    return () => input.removeEventListener('cancel', desistiu);
  }, [loja]);

  function escolheu(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = ''; // permite escolher o mesmo arquivo de novo
    if (!loja || !editor || editor.isDestroyed) return;
    const ponto = loja.tomarPonto();
    if (arquivos.length > 0) onImagensRef.current(arquivos, ponto);
  }

  const anuncio = !estado.aberto
    ? ''
    : estado.itens.length > 0
      ? plural(estado.itens.length, 'bloco', 'blocos')
      : `Nenhum bloco com “${estado.consulta}”`;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_IMAGEM_NOTA}
        multiple
        hidden
        tabIndex={-1}
        aria-hidden="true"
        onChange={escolheu}
      />
      <span className="sr-only" role="status">{anuncio}</span>
      {estado.aberto && loja && createPortal(<ListaDeBlocos loja={loja} estado={estado} />, document.body)}
    </>
  );
}

function mesmoLugar(a: LugarDoMenu, b: LugarDoMenu): boolean {
  return a.lado === b.lado && a.left === b.left && a.top === b.top && a.bottom === b.bottom && a.espaco === b.espaco;
}

/**
 * O popover. O foco nunca sai do editor: o item ativo é o realce (e o
 * `aria-activedescendant` do editor), e o `mousedown` cancelado mantém o
 * cursor onde está ao clicar num item ou rolar a lista.
 */
function ListaDeBlocos({ loja, estado }: { loja: LojaMenuBarra; estado: EstadoMenuBarra }) {
  const caixaRef = useRef<HTMLDivElement>(null);
  const [lugar, setLugar] = useState<LugarDoMenu | null>(null);

  // Mede antes de pintar (sem salto) e de novo a cada rolagem, redimensionamento
  // ou teclado do celular — o "/consulta" se move com a página.
  useLayoutEffect(() => {
    let quadro = 0;
    function medir() {
      quadro = 0;
      const caixa = caixaRef.current;
      const ancora = estado.retangulo?.();
      if (!caixa || !ancora) return;
      const novo = posicionarMenu(ancora, { altura: caixa.scrollHeight, largura: caixa.offsetWidth }, janelaVisivel());
      setLugar(atual => (atual && mesmoLugar(atual, novo) ? atual : novo));
    }
    function agendar(evento: Event) {
      // Rolar a própria lista não move o "/consulta".
      if (evento.target instanceof Node && caixaRef.current?.contains(evento.target)) return;
      if (!quadro) quadro = requestAnimationFrame(medir);
    }
    medir();
    const vv = window.visualViewport;
    window.addEventListener('scroll', agendar, true);
    window.addEventListener('resize', agendar);
    vv?.addEventListener('resize', agendar);
    vv?.addEventListener('scroll', agendar);
    return () => {
      if (quadro) cancelAnimationFrame(quadro);
      window.removeEventListener('scroll', agendar, true);
      window.removeEventListener('resize', agendar);
      vv?.removeEventListener('resize', agendar);
      vv?.removeEventListener('scroll', agendar);
    };
  }, [estado]);

  // O item ativo sempre à vista dentro da lista (que rola quando falta espaço).
  useLayoutEffect(() => {
    const caixa = caixaRef.current;
    if (!caixa) return;
    if (estado.indice === 0) {
      caixa.scrollTop = 0;
      return;
    }
    const ativo = caixa.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
    if (!ativo) return;
    const topo = ativo.offsetTop;
    const fundo = topo + ativo.offsetHeight;
    if (topo < caixa.scrollTop) caixa.scrollTop = topo;
    else if (fundo > caixa.scrollTop + caixa.clientHeight) caixa.scrollTop = fundo - caixa.clientHeight;
  }, [estado.indice, estado.itens, lugar]);

  const estilo = {
    left: lugar?.left ?? 0,
    top: lugar?.top,
    bottom: lugar?.bottom,
    visibility: lugar ? undefined : 'hidden',
    '--nota-menu-espaco': lugar ? `${lugar.espaco}px` : undefined,
  } as CSSProperties;

  return (
    <div
      ref={caixaRef}
      className="nota-menu"
      data-lado={lugar?.lado}
      style={estilo}
      onMouseDown={e => e.preventDefault()}
    >
      <p className="nota-menu-grupo" id={loja.idDoTitulo}>Blocos</p>
      <ul className="nota-menu-lista" id={loja.idDaLista} role="listbox" aria-labelledby={loja.idDoTitulo}>
        {estado.itens.map((bloco, i) => (
          <li
            key={bloco.id}
            id={loja.idDaOpcao(bloco.id)}
            role="option"
            aria-selected={i === estado.indice}
            className="nota-menu-item"
            onMouseMove={() => loja.escolher(i)}
            onClick={() => loja.aplicar(bloco)}
          >
            <span className="nota-menu-icone" aria-hidden="true"><IconeBloco id={bloco.id} /></span>
            <span className="nota-menu-nome">{bloco.nome}</span>
            {bloco.atalho
              ? <kbd className="nota-menu-atalho" aria-hidden="true">{bloco.atalho}</kbd>
              : bloco.dica && <span className="nota-menu-dica">{bloco.dica}</span>}
          </li>
        ))}
      </ul>
      {estado.itens.length === 0 && (
        <p className="nota-menu-vazio">
          <strong>Nenhum bloco com “{estado.consulta}”</strong>
          <span>Enter mantém o texto como está.</span>
        </p>
      )}
    </div>
  );
}
