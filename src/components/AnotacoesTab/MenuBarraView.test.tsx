// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { MenuBarraView } from './MenuBarraView';
import { FANTASMA_MENU_BARRA, MenuBarra, janelaVisivel, posicionarMenu, type JanelaVisivel } from './menuBarra';
import type { PontoDeInsercao } from './uploadsDeImagem';

beforeAll(() => {
  // O jsdom não mede layout; o ProseMirror pede retângulos ao rolar até o cursor.
  const vazio = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect;
  Range.prototype.getBoundingClientRect = vazio;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () { /* nada */ } }) as unknown as DOMRectList;
  if (!document.elementFromPoint) document.elementFromPoint = () => null;
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Pagina({ conteudo, onImagens }: { conteudo: string; onImagens: (arquivos: File[], ponto: PontoDeInsercao) => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, code: false, codeBlock: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      MenuBarra,
    ],
    content: conteudo,
    injectCSS: false,
    editorProps: { attributes: { class: 'nota-doc', 'aria-label': 'Texto da página' } },
  });
  return (
    <>
      <EditorContent editor={editor} />
      <MenuBarraView editor={editor} onImagens={onImagens} />
    </>
  );
}

function montar(conteudo = '<p></p>') {
  const onImagens = vi.fn<(arquivos: File[], ponto: PontoDeInsercao) => void>();
  const { container } = render(<Pagina conteudo={conteudo} onImagens={onImagens} />);
  const dom = container.querySelector('.nota-doc') as (HTMLElement & { editor?: Editor }) | null;
  if (!dom?.editor) throw new Error('editor não montou');
  const editor = dom.editor;
  act(() => { editor.commands.focus('end'); });
  return { editor, dom, onImagens };
}

/** Escreve como quem digita: uma transação por tecla, com o cursor no fim. */
function digitar(editor: Editor, texto: string) {
  for (const letra of texto) {
    act(() => { editor.view.dispatch(editor.state.tr.insertText(letra)); });
  }
}

function tecla(dom: HTMLElement, key: string, extra: Partial<KeyboardEventInit> = {}) {
  fireEvent.keyDown(dom, { key, ...extra });
}

/** O texto do documento, sem os separadores de bloco que o `getText` põe. */
function texto(editor: Editor): string {
  return editor.state.doc.textContent;
}

function opcoes() {
  return within(screen.getByRole('listbox')).queryAllByRole('option');
}

function nomes() {
  return opcoes().map(o => o.querySelector('.nota-menu-nome')?.textContent);
}

describe('menu "/"', () => {
  it('"/" num bloco vazio abre a lista inteira, com o primeiro item ativo e o fantasma', () => {
    const { editor, dom } = montar();
    digitar(editor, '/');
    expect(nomes()).toEqual([
      'Texto', 'Título 1', 'Título 2', 'Título 3', 'Lista numerada',
      'Lista com marcadores', 'Lista de tarefas', 'Citação', 'Divisor', 'Imagem',
    ]);
    expect(opcoes()[0]).toHaveProperty('ariaSelected', 'true');
    const gatilho = dom.querySelector('.nota-menu-gatilho--vazio');
    expect(gatilho?.getAttribute('data-decoration-content')).toBe(FANTASMA_MENU_BARRA);
    // Atalho de markdown no chip; Imagem com a dica escrita.
    expect(opcoes()[2].querySelector('kbd')?.textContent).toBe('##');
    expect(opcoes()[9].querySelector('.nota-menu-dica')?.textContent).toBe('colar ou enviar');
    expect(screen.getByRole('status').textContent).toBe('10 blocos');
    // O popover sai no <body>, fora do editor.
    expect(dom.contains(screen.getByRole('listbox'))).toBe(false);
  });

  it('"/tit", ↓, Enter: vira Título 2 e o "/tit" sai', () => {
    const { editor, dom } = montar();
    digitar(editor, '/tit');
    expect(nomes()).toEqual(['Título 1', 'Título 2', 'Título 3']);
    expect(screen.getByRole('status').textContent).toBe('3 blocos');

    tecla(dom, 'ArrowDown');
    const ativo = opcoes().find(o => o.getAttribute('aria-selected') === 'true');
    expect(ativo?.textContent).toContain('Título 2');
    // O editor aponta para a lista e para o item ativo.
    expect(dom.getAttribute('aria-expanded')).toBe('true');
    expect(dom.getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id);
    expect(dom.getAttribute('aria-activedescendant')).toBe(ativo?.id);

    tecla(dom, 'Enter');
    expect(editor.getJSON().content?.[0]).toEqual({ type: 'heading', attrs: { level: 2 } });
    expect(texto(editor)).toBe('');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(dom.hasAttribute('aria-expanded')).toBe(false);
    expect(dom.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('↑ no primeiro item vai para o último, e Tab também aplica', () => {
    const { editor, dom } = montar();
    digitar(editor, '/');
    tecla(dom, 'ArrowUp');
    expect(opcoes()[9].getAttribute('aria-selected')).toBe('true');
    tecla(dom, 'ArrowDown');
    expect(opcoes()[0].getAttribute('aria-selected')).toBe('true');
    tecla(dom, 'ArrowDown');
    tecla(dom, 'Tab');
    expect(editor.getJSON().content?.[0]).toEqual({ type: 'heading', attrs: { level: 1 } });
  });

  it('Esc fecha e mantém o texto; continuar digitando não reabre', () => {
    const { editor, dom } = montar();
    digitar(editor, '/tit');
    tecla(dom, 'Escape');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(texto(editor)).toBe('/tit');
    expect(dom.hasAttribute('aria-expanded')).toBe(false);
    digitar(editor, 'u');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(texto(editor)).toBe('/titu');
  });

  it('sem bloco que case: avisa, e Enter só segue o texto', () => {
    const { editor, dom } = montar();
    digitar(editor, '/xyz');
    expect(opcoes()).toHaveLength(0);
    expect(document.querySelector('.nota-menu-vazio strong')?.textContent).toBe('Nenhum bloco com “xyz”');
    expect(screen.getByRole('status').textContent).toBe('Nenhum bloco com “xyz”');
    expect(dom.hasAttribute('aria-activedescendant')).toBe(false);
    tecla(dom, 'Enter');
    const blocos: string[] = [];
    editor.state.doc.forEach(no => { blocos.push(`${no.type.name}:${no.textContent}`); });
    expect(blocos).toEqual(['paragraph:/xyz', 'paragraph:']);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('a consulta aceita espaço enquanto algum bloco casa; uma frase comum fecha o menu', () => {
    const { editor, dom } = montar();
    digitar(editor, '/lista num');
    expect(nomes()).toEqual(['Lista numerada']);
    tecla(dom, 'Enter');
    expect(editor.getJSON().content?.[0].type).toBe('orderedList');

    const outro = montar();
    digitar(outro.editor, '/isto é');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(texto(outro.editor)).toBe('/isto é');
  });

  it('a "/" colada numa palavra é texto (datas, e/ou); depois de espaço abre', () => {
    const { editor } = montar('<p>14</p>');
    digitar(editor, '/10 e');
    expect(screen.queryByRole('listbox')).toBeNull();
    digitar(editor, ' /ci');
    expect(nomes()).toEqual(['Citação']);
  });

  it('clicar num item aplica sem tirar o foco do editor', () => {
    const { editor } = montar('<p>Pauta</p>');
    digitar(editor, ' /');
    const citacao = opcoes().find(o => o.textContent?.includes('Citação')) as HTMLElement;
    // O mousedown é cancelado: o cursor fica onde está.
    expect(fireEvent.mouseDown(citacao)).toBe(false);
    fireEvent.mouseMove(citacao);
    expect(citacao.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(citacao);
    expect(editor.getJSON().content?.[0].type).toBe('blockquote');
    expect(texto(editor)).toBe('Pauta ');
  });

  it('escolher o tipo que o bloco já tem não desfaz o bloco', () => {
    const { editor, dom } = montar('<ol><li><p>um</p></li></ol>');
    digitar(editor, ' /num');
    tecla(dom, 'Enter');
    expect(editor.getJSON().content?.[0].type).toBe('orderedList');
    expect(texto(editor)).toBe('um ');

    const titulo = montar('<h1>Hugo</h1>');
    digitar(titulo.editor, ' /h1');
    tecla(titulo.dom, 'Enter');
    expect(titulo.editor.getJSON().content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 1 } });
  });

  it('Texto tira o item da lista; Divisor insere a linha no lugar do bloco vazio', () => {
    const { editor, dom } = montar('<ul><li><p>item</p></li></ul>');
    digitar(editor, ' /texto');
    tecla(dom, 'Enter');
    const tipos = (editor.getJSON().content ?? []).map(b => b.type);
    expect(tipos[0]).toBe('paragraph');
    expect(tipos).not.toContain('bulletList');
    expect(texto(editor)).toBe('item ');

    const div = montar('<p>Antes</p><p></p>');
    digitar(div.editor, '/div');
    tecla(div.dom, 'Enter');
    // O parágrafo vazio vira a linha (sem deixar uma linha em branco em cima),
    // e o cursor desce para um parágrafo novo.
    expect((div.editor.getJSON().content ?? []).map(b => b.type)).toEqual(['paragraph', 'horizontalRule', 'paragraph']);
    expect(texto(div.editor)).toBe('Antes');
  });

  it('Ctrl+Z depois de aplicar devolve o "/consulta" digitado', () => {
    const { editor, dom } = montar();
    digitar(editor, '/tarefa');
    tecla(dom, 'Enter');
    expect(editor.getJSON().content?.[0].type).toBe('taskList');
    act(() => { editor.commands.undo(); });
    expect(editor.getJSON().content?.[0].type).toBe('paragraph');
  });

  it('Imagem abre o seletor (várias, formatos da nota) e entrega os arquivos com o lugar do cursor', () => {
    const clique = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const { editor, dom, onImagens } = montar('<p>Antes</p><p></p>');
    digitar(editor, '/img');
    tecla(dom, 'Enter');
    expect(clique).toHaveBeenCalledTimes(1);
    expect(texto(editor)).not.toContain('/img');

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.multiple).toBe(true);
    expect(input.accept).toBe('image/png,image/jpeg,image/webp,image/gif');

    const arquivo = new File(['x'], 'print.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [arquivo] } });
    expect(onImagens).toHaveBeenCalledTimes(1);
    const [arquivos, ponto] = onImagens.mock.calls[0];
    expect(arquivos).toEqual([arquivo]);
    // Bloco do cursor vazio: a imagem ocupa o lugar dele.
    expect(ponto).toEqual({ pos: editor.state.doc.content.size, substituir: true });
  });
});

describe('posicionarMenu', () => {
  const janela: JanelaVisivel = { topo: 0, base: 800, esquerda: 0, direita: 1200, alturaLayout: 800 };

  it('abre embaixo do "/consulta" quando cabe', () => {
    const lugar = posicionarMenu({ top: 100, bottom: 120, left: 300 }, { altura: 440, largura: 320 }, janela);
    expect(lugar).toEqual({ lado: 'abaixo', left: 300, top: 124, espaco: 668 });
  });

  it('perto do pé da tela, vira para cima ancorado pelo bottom', () => {
    const lugar = posicionarMenu({ top: 700, bottom: 720, left: 300 }, { altura: 440, largura: 320 }, janela);
    expect(lugar).toEqual({ lado: 'acima', left: 300, bottom: 104, espaco: 688 });
  });

  it('sem espaço inteiro em lado nenhum, fica no maior, com rolagem por dentro', () => {
    const baixa: JanelaVisivel = { ...janela, base: 500, alturaLayout: 500 };
    const lugar = posicionarMenu({ top: 200, bottom: 220, left: 10 }, { altura: 440, largura: 320 }, baixa);
    expect(lugar.lado).toBe('abaixo');
    expect(lugar.espaco).toBe(268);
  });

  it('não sai pela direita nem pela esquerda da tela', () => {
    expect(posicionarMenu({ top: 100, bottom: 120, left: 1100 }, { altura: 100, largura: 320 }, janela).left).toBe(872);
    expect(posicionarMenu({ top: 100, bottom: 120, left: -20 }, { altura: 100, largura: 320 }, janela).left).toBe(8);
  });
});

describe('janelaVisivel', () => {
  function chrome(classe: string, caixa: { top: number; bottom: number }) {
    const el = document.createElement(classe === 'app-header' ? 'header' : classe === 'nota-formato' ? 'div' : 'nav');
    el.className = classe;
    el.getBoundingClientRect = () => ({ ...caixa, left: 0, right: 0, x: 0, y: caixa.top, width: 0, height: caixa.bottom - caixa.top, toJSON: () => ({}) });
    document.body.appendChild(el);
    return el;
  }

  afterEach(() => {
    document.querySelectorAll('.app-header, .nav-bottom, .nota-formato').forEach(el => el.remove());
  });

  it('sem cabeçalho nem barra, é a janela inteira', () => {
    expect(janelaVisivel()).toMatchObject({ topo: 0, base: window.innerHeight });
  });

  it('desconta o cabeçalho fixo e a barra inferior: o menu não abre por cima deles', () => {
    chrome('app-header', { top: 0, bottom: 56 });
    chrome('nav-bottom', { top: window.innerHeight - 64, bottom: window.innerHeight });
    expect(janelaVisivel()).toMatchObject({ topo: 56, base: window.innerHeight - 64 });
    // Os 400px caberiam acima só contando a faixa do cabeçalho: sem ela, o
    // lado maior é o de baixo, com rolagem por dentro.
    const ancora = { top: 420, bottom: 440, left: 0 };
    const caixa = { altura: 400, largura: 320 };
    expect(posicionarMenu(ancora, caixa, { ...janelaVisivel(), topo: 0, base: 820 }).lado).toBe('acima');
    expect(posicionarMenu(ancora, caixa, { ...janelaVisivel(), base: 820 }).lado).toBe('abaixo');
  });

  it('desconta a barra de formato do toque: o menu do "Inserir bloco" não a cobre', () => {
    // Acima do teclado (a 300px da base), como a `BarraFormatoMovel` fica.
    const topo = window.innerHeight - 300 - 48;
    chrome('nota-formato', { top: topo, bottom: topo + 48 });
    expect(janelaVisivel().base).toBe(topo);
  });

  it('barra escondida (display: none) não conta', () => {
    const barra = chrome('nav-bottom', { top: 600, bottom: 664 });
    barra.style.display = 'none';
    expect(janelaVisivel().base).toBe(window.innerHeight);
  });
});
