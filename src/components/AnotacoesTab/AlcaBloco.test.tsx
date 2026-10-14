// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it } from 'vitest';
import { EditorContent, Extension, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Suggestion } from '@tiptap/suggestion';
import { NodeSelection, PluginKey, TextSelection } from '@tiptap/pm/state';
import { undo } from '@tiptap/pm/history';
import type { Node as NoPM } from '@tiptap/pm/model';
import { AlcaBloco } from './AlcaBloco';
import { MoverBloco } from './moverBloco';

// O menu "/" de verdade é de outra etapa: aqui, uma sugestão com a mesma
// barra prova que o "+" deixa a "/" num lugar onde o menu abre.
const menu = { aberturas: [] as string[] };
const BarraDeTeste = Extension.create({
  name: 'barraDeTeste',
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('barraDeTeste'),
        char: '/',
        render: () => ({ onStart: props => { menu.aberturas.push(props.query); } }),
      }),
    ];
  },
});

let atual: Editor | null = null;

function Pagina({ content }: { content: JSONContent }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, code: false, codeBlock: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      MoverBloco,
      BarraDeTeste,
    ],
    content,
    injectCSS: false,
  });
  atual = editor;
  return (
    <div className="nota-upload-zona">
      <EditorContent editor={editor} />
      <AlcaBloco editor={editor} />
    </div>
  );
}

const t = (texto: string): JSONContent => ({ type: 'text', text: texto });
const p = (texto: string): JSONContent => ({ type: 'paragraph', content: [t(texto)] });
const li = (texto: string): JSONContent => ({ type: 'listItem', content: [p(texto)] });
const doc = (...blocos: JSONContent[]): JSONContent => ({ type: 'doc', content: blocos });

function editor(): Editor {
  if (!atual) throw new Error('editor não montou');
  return atual;
}

/** Os blocos de primeiro nível como texto ("p:A", "ol[1|2]"). */
function forma(no: NoPM): string {
  const nome = no.type.name;
  if (nome === 'doc') return no.content.content.map(forma).join(' ');
  if (nome === 'paragraph') return `p:${no.textContent}`;
  if (nome === 'listItem') return no.textContent;
  return `${nome === 'orderedList' ? 'ol' : nome}[${no.content.content.map(forma).join('|')}]`;
}

function posDe(tipo: string, texto: string): number {
  let achado = -1;
  editor().state.doc.descendants((no, pos) => {
    if (achado < 0 && no.type.name === tipo && no.textContent === texto) achado = pos;
    return achado < 0;
  });
  if (achado < 0) throw new Error(`${tipo} "${texto}" não está no documento`);
  return achado;
}

/**
 * O jsdom não mede layout. Cada bloco ganha uma faixa de altura própria, uma
 * linha de 20px por bloco, empilhadas na ordem do documento — o bastante para
 * a alça achar o bloco sob o ponteiro.
 */
function medirBlocos() {
  const view = editor().view;
  const marcar = (pos: number, inicio: number, fim: number) => {
    const el = view.nodeDOM(pos) as HTMLElement;
    const caixa = { x: 80, y: inicio * 20, top: inicio * 20, bottom: fim * 20, left: 80, right: 600, width: 520, height: (fim - inicio) * 20 };
    Object.defineProperty(el, 'getBoundingClientRect', { configurable: true, value: () => ({ ...caixa, toJSON: () => caixa }) });
  };
  let linha = 0;
  view.state.doc.forEach((no, pos) => {
    const inicio = linha;
    if (no.type.name === 'orderedList') {
      no.forEach((_item, deslocamento) => {
        marcar(pos + 1 + deslocamento, linha, linha + 1);
        linha += 1;
      });
    } else {
      linha += 1;
    }
    marcar(pos, inicio, linha);
  });
}

async function passarOMouse(y: number) {
  medirBlocos();
  fireEvent.mouseMove(editor().view.dom, { clientX: 300, clientY: y });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Inserir bloco abaixo' })).toBeTruthy());
}

beforeAll(() => {
  // O ProseMirror pede retângulos ao rolar até o cursor.
  const vazio = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect;
  Range.prototype.getBoundingClientRect = vazio;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () { /* nada */ } }) as unknown as DOMRectList;
  if (!document.elementFromPoint) document.elementFromPoint = () => null;
});

beforeEach(() => { menu.aberturas = []; atual = null; });
afterEach(() => { cleanup(); });

it('sem ponteiro nem foco, a alça não aparece', () => {
  render(<Pagina content={doc(p('Alfa'), p('Beta'))} />);
  expect(screen.queryByRole('button', { name: 'Inserir bloco abaixo' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Arrastar para mover o bloco' })).toBeNull();
});

it('"+" abre um parágrafo abaixo do bloco sob o ponteiro com "/" digitada, e o menu abre ali', async () => {
  render(<Pagina content={doc(p('Alfa'), p('Beta'), p('Gama'))} />);
  await passarOMouse(30); // a linha de "Beta"
  fireEvent.mouseDown(screen.getByRole('button', { name: 'Inserir bloco abaixo' }));
  fireEvent.click(screen.getByRole('button', { name: 'Inserir bloco abaixo' }));

  const ed = editor();
  expect(forma(ed.state.doc)).toBe('p:Alfa p:Beta p:/ p:Gama');
  const { selection } = ed.state;
  expect(selection.empty).toBe(true);
  expect(ed.state.doc.textBetween(selection.from - 1, selection.from)).toBe('/');
  expect(menu.aberturas).toEqual(['']);
  // Desfazer tira a "/" e o parágrafo juntos.
  act(() => { undo(ed.state, ed.view.dispatch); });
  expect(forma(ed.state.doc)).toBe('p:Alfa p:Beta p:Gama');
});

it('sobre um item de lista, a alça é do item: o clique seleciona só ele', async () => {
  render(<Pagina content={doc(p('Meus'), { type: 'orderedList', content: [li('Um'), li('Dois'), li('Três')] })} />);
  await passarOMouse(50); // a segunda linha da lista
  fireEvent.click(screen.getByRole('button', { name: 'Arrastar para mover o bloco' }));

  const sel = editor().state.selection;
  expect(sel).toBeInstanceOf(NodeSelection);
  expect((sel as NodeSelection).node.type.name).toBe('listItem');
  expect((sel as NodeSelection).node.textContent).toBe('Dois');
  await waitFor(() => expect(document.querySelector('.nota-alca')?.hasAttribute('data-selecionado')).toBe(true));
});

it('arrastar pela alça move o bloco pelo soltar do próprio editor, e Ctrl+Z devolve', async () => {
  render(<Pagina content={doc(p('Alfa'), p('Beta'), p('Gama'))} />);
  await passarOMouse(10); // "Alfa"
  const ed = editor();
  const dados = {
    tipos: new Map<string, string>(),
    imagem: null as Element | null,
    effectAllowed: 'all',
    dropEffect: 'none',
    get types() { return [...this.tipos.keys()]; },
    files: [] as File[],
    clearData() { this.tipos.clear(); },
    setData(tipo: string, valor: string) { this.tipos.set(tipo, valor); },
    getData(tipo: string) { return this.tipos.get(tipo) ?? ''; },
    setDragImage(el: Element) { this.imagem = el; },
  };
  const alca = screen.getByRole('button', { name: 'Arrastar para mover o bloco' });
  fireEvent.dragStart(alca, { dataTransfer: dados, clientY: 10 });

  // O bloco inteiro é o recorte, e a cópia levantada é o próprio bloco.
  expect(ed.view.dragging?.move).toBe(true);
  expect(ed.view.dragging?.slice.content.firstChild?.textContent).toBe('Alfa');
  expect(dados.getData('text/plain')).toBe('Alfa');
  expect(dados.getData('text/html')).toContain('Alfa');
  expect(dados.imagem).toBe(ed.view.nodeDOM(0));
  // O original fica esmaecido enquanto a cópia anda.
  await waitFor(() => expect((ed.view.nodeDOM(0) as HTMLElement).classList.contains('nota-bloco-arrastado')).toBe(true));

  // Soltar depois de "Gama": o editor resolve onde (o jsdom não acha posição por coordenada).
  const fim = ed.state.doc.content.size;
  ed.view.posAtCoords = () => ({ pos: fim, inside: -1 });
  fireEvent.drop(ed.view.dom, { dataTransfer: dados, clientX: 300, clientY: 70 });
  fireEvent.dragEnd(alca, { dataTransfer: dados });

  expect(forma(ed.state.doc)).toBe('p:Beta p:Gama p:Alfa');
  expect(ed.view.dragging).toBeNull();
  expect(document.querySelector('.nota-bloco-arrastado')).toBeNull();
  act(() => { undo(ed.state, ed.view.dispatch); });
  expect(forma(ed.state.doc)).toBe('p:Alfa p:Beta p:Gama');
});

it('arraste cancelado (Esc) devolve o editor ao normal', async () => {
  render(<Pagina content={doc(p('Alfa'), p('Beta'))} />);
  await passarOMouse(30);
  const ed = editor();
  const dados = { clearData() {}, setData() {}, getData: () => '', setDragImage() {}, effectAllowed: 'all', types: [] };
  const alca = screen.getByRole('button', { name: 'Arrastar para mover o bloco' });
  fireEvent.dragStart(alca, { dataTransfer: dados, clientY: 30 });
  expect(ed.view.dragging).not.toBeNull();
  await waitFor(() => expect(document.querySelector('.nota-bloco-arrastado')).not.toBeNull());
  // Uma edição no meio do arraste (uma imagem que terminou de subir) não
  // desmonta a alça: é nela que o fim do arraste vai chegar.
  act(() => { ed.view.dispatch(ed.state.tr.insertText('!', 1)); });
  await act(async () => { await new Promise(r => setTimeout(r, 40)); });
  expect(alca.isConnected).toBe(true);
  fireEvent.dragEnd(alca, { dataTransfer: dados });
  await waitFor(() => expect(ed.view.dragging).toBeNull());
  await waitFor(() => expect(document.querySelector('.nota-bloco-arrastado')).toBeNull());
  expect(forma(ed.state.doc)).toBe('p:!Alfa p:Beta');
});

it('Alt+Shift+↓ e ↑ movem o bloco do cursor pelo teclado; na borda a tecla não faz nada', () => {
  render(<Pagina content={doc(p('Alfa'), { type: 'orderedList', content: [li('Um'), li('Dois')] }, p('Fim'))} />);
  const ed = editor();
  act(() => { ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, posDe('paragraph', 'Alfa') + 2))); });

  const tecla = (key: string) => fireEvent.keyDown(ed.view.dom, { key, altKey: true, shiftKey: true });
  tecla('ArrowDown');
  expect(forma(ed.state.doc)).toBe('ol[Um|Dois] p:Alfa p:Fim');
  tecla('ArrowUp');
  expect(forma(ed.state.doc)).toBe('p:Alfa ol[Um|Dois] p:Fim');
  tecla('ArrowUp');
  expect(forma(ed.state.doc)).toBe('p:Alfa ol[Um|Dois] p:Fim');

  // Num item, o item troca dentro da lista.
  act(() => { ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, posDe('listItem', 'Dois') + 3))); });
  tecla('ArrowUp');
  expect(forma(ed.state.doc)).toBe('p:Alfa ol[Dois|Um] p:Fim');
});

it('sem ponteiro, com o cursor no texto, a alça é do bloco do cursor; e some quando o foco sai', async () => {
  render(<Pagina content={doc(p('Alfa'), { type: 'orderedList', content: [li('Um'), li('Dois')] })} />);
  const ed = editor();
  medirBlocos();
  act(() => {
    ed.view.focus();
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, posDe('listItem', 'Dois') + 3)));
  });
  expect(ed.view.hasFocus()).toBe(true);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Inserir bloco abaixo' })).toBeTruthy());
  // A alça do item "Dois" fica na linha dele (a segunda linha da lista: 40px a
  // 60px), na borda da lista — antes do número, não do texto do item.
  const alca = document.querySelector('.nota-alca') as HTMLElement;
  const topo = Number.parseFloat(alca.style.top);
  expect(topo).toBeGreaterThan(40);
  expect(topo).toBeLessThanOrEqual(50);
  expect(alca.style.left).toBe('80px');

  fireEvent.click(screen.getByRole('button', { name: 'Inserir bloco abaixo' }));
  // (O parágrafo vazio do fim é o TrailingNode do StarterKit, depois da lista.)
  expect(forma(ed.state.doc)).toBe('p:Alfa ol[Um|Dois|/] p:');
  expect(menu.aberturas).toEqual(['']);

  act(() => { (ed.view.dom as HTMLElement).blur(); });
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Inserir bloco abaixo' })).toBeNull());
});

it('com o editor só de leitura, a alça não aparece', async () => {
  render(<Pagina content={doc(p('Alfa'))} />);
  act(() => { editor().setEditable(false); });
  medirBlocos();
  fireEvent.mouseMove(editor().view.dom, { clientX: 300, clientY: 10 });
  await act(async () => { await new Promise(r => setTimeout(r, 40)); });
  expect(screen.queryByRole('button', { name: 'Inserir bloco abaixo' })).toBeNull();
});
