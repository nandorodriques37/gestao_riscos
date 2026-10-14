// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import type { Nota } from '../../types';
import { EditorNota } from './EditorNota';
import { FAIXA_TOQUE } from './BarraFormatoMovel';
import { lojaDoMenu } from './menuBarra';
import { pontoDoCursor } from './uploadsDeImagem';

// ---------- A faixa de toque, controlável ----------
// O jsdom não tem `matchMedia`. Esta casa só a consulta da faixa de toque: se
// a barra (ou a bolha) perguntasse por outra, ficaria de fora.
let toque = true;
const ouvintes = new Set<() => void>();

function faixa(consulta: string) {
  return {
    get matches() { return consulta === FAIXA_TOQUE && toque; },
    media: consulta,
    addEventListener: (_: string, fn: () => void) => { ouvintes.add(fn); },
    removeEventListener: (_: string, fn: () => void) => { ouvintes.delete(fn); },
  };
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(faixa) });
  // O jsdom não mede layout. A seleção ganha uma linha de verdade no meio da
  // tela (a bolha, no teste de controle, precisa estar "à vista").
  const linha = () => ({ x: 100, y: 200, top: 200, left: 100, right: 180, bottom: 220, width: 80, height: 20, toJSON: () => ({}) }) as DOMRect;
  Range.prototype.getBoundingClientRect = linha;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () { /* nada */ } }) as unknown as DOMRectList;
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 390 });
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 800 });
  if (!document.elementFromPoint) document.elementFromPoint = () => null;
  // O ProseMirror rola até o cursor; o jsdom não rola.
  window.scrollBy = () => undefined;
});

afterEach(() => {
  cleanup();
  toque = true;
  ouvintes.clear();
  vi.restoreAllMocks();
  delete (window as { visualViewport?: unknown }).visualViewport;
});

// ---------- A página ----------

const NOTA_ID = '11111111-1111-4111-8111-111111111111';
const TEXTO = 'Polviztra no CD04 - Atrasado a 28 dias';

function doc(...paragrafos: string[]): string {
  return JSON.stringify({
    type: 'doc',
    content: paragrafos.map(t => ({ type: 'paragraph', content: t ? [{ type: 'text', text: t }] : [] })),
  });
}

function nota(conteudo: string): Nota {
  return {
    id: NOTA_ID, titulo: 'Triagem', conteudo, fixada: false, autor: 'Ana', editado_por: 'Ana',
    version: 1, updated_at: '2026-10-14T12:00:00Z', created_at: '2026-10-01T12:00:00Z',
  } as Nota;
}

async function montar(conteudo = doc(TEXTO)) {
  const { container } = render(
    <>
      <input aria-label="Título da página" defaultValue="Triagem" />
      <EditorNota nota={nota(conteudo)} recarregar={0} onChange={() => undefined} />
    </>,
  );
  // O TipTap avisa "create" num setTimeout 0.
  await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  const el = container.querySelector('.nota-doc') as (HTMLElement & { editor?: Editor }) | null;
  if (!el?.editor) throw new Error('editor não montou');
  return { editor: el.editor, container };
}

async function focar(editor: Editor, from = 1, to = from) {
  await act(async () => {
    editor.view.focus();
    editor.commands.setTextSelection({ from, to });
  });
}

const barra = () => screen.queryByRole('toolbar', { name: 'Formatação' });
const bolha = () => screen.queryByRole('toolbar', { name: 'Formatar seleção' });
const botao = (nome: string) => within(barra() as HTMLElement).getByRole('button', { name: nome });

// ---------- Quando aparece ----------

it('a faixa é a de toque do CLAUDE.md: ponteiro grosso até 1100px', () => {
  expect(FAIXA_TOQUE).toBe('(pointer: coarse) and (max-width: 1100px)');
});

it('fora da faixa de toque não aparece, nem com o editor focado', async () => {
  toque = false;
  const { editor } = await montar();
  await focar(editor);
  expect(editor.view.hasFocus()).toBe(true);
  expect(barra()).toBeNull();
});

it('na faixa de toque aparece só com o editor focado, num portal no <body>, e sai quando o foco vai para outro campo', async () => {
  const { editor } = await montar();
  expect(barra()).toBeNull();

  await focar(editor);
  expect(barra()).not.toBeNull();
  expect(barra()!.parentElement).toBe(document.body);
  const nomes = Array.from(barra()!.querySelectorAll('button')).map(b => b.getAttribute('aria-label'));
  expect(nomes).toEqual([
    'Inserir bloco',
    'Inserir imagem',
    'Título 2',
    'Lista numerada',
    'Lista com marcadores',
    'Lista de tarefas',
    'Destaque',
    'Negrito',
    'Concluir edição',
  ]);
  // "Concluir" fica fora da fileira que rola.
  expect(botao('Concluir edição').closest('.nota-formato-rolagem')).toBeNull();
  expect(botao('Negrito').closest('.nota-formato-rolagem')).not.toBeNull();
  // Tabindex móvel: um botão só na ordem do Tab.
  expect(Array.from(barra()!.querySelectorAll('button')).filter(b => b.tabIndex === 0)).toHaveLength(1);

  await act(async () => { screen.getByLabelText('Título da página').focus(); });
  expect(editor.view.hasFocus()).toBe(false);
  expect(barra()).toBeNull();
});

it('na faixa de toque a bolha não aparece sobre a seleção — fora dela, aparece e a barra não', async () => {
  const { editor } = await montar();
  await focar(editor, 1, 10);
  expect(barra()).not.toBeNull();
  // A bolha espera 250 ms de seleção parada; folga para máquina ocupada.
  await act(async () => { await new Promise(r => setTimeout(r, 600)); });
  expect(bolha()).toBeNull();
  cleanup();

  toque = false;
  const outro = await montar();
  await focar(outro.editor, 1, 10);
  await waitFor(() => expect(bolha()).not.toBeNull(), { timeout: 3000 });
  expect(barra()).toBeNull();
});

it('página só de leitura (bloco que o editor não lê) não mostra a barra', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const conteudo = JSON.stringify({ type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'select *', marks: [{ type: 'code' }] }] },
  ] });
  const { editor } = await montar(conteudo);
  expect(editor.isEditable).toBe(false);
  await act(async () => { editor.view.focus(); });
  expect(barra()).toBeNull();
});

// ---------- O que cada botão faz ----------

it('Negrito liga e desliga a marca sem tirar o foco do editor, e o aria-pressed acompanha', async () => {
  const { editor } = await montar();
  await focar(editor, 1, 10);
  const negrito = botao('Negrito');
  expect(negrito.getAttribute('aria-pressed')).toBe('false');

  // O toque não leva o foco para o botão: o teclado do celular fica aberto.
  expect(fireEvent.pointerDown(negrito)).toBe(false);
  expect(fireEvent.mouseDown(negrito)).toBe(false);
  fireEvent.click(negrito);
  expect(editor.view.hasFocus()).toBe(true);
  expect(editor.getHTML()).toContain('<strong>Polviztra</strong>');
  await waitFor(() => expect(botao('Negrito').getAttribute('aria-pressed')).toBe('true'));

  fireEvent.click(botao('Negrito'));
  expect(editor.isActive('bold')).toBe(false);
  await waitFor(() => expect(botao('Negrito').getAttribute('aria-pressed')).toBe('false'));
});

it('Destaque, Título e as listas alternam o que está no cursor', async () => {
  const { editor } = await montar();
  await focar(editor, 1, 10);

  fireEvent.click(botao('Destaque'));
  expect(editor.getHTML()).toContain('<mark>Polviztra</mark>');
  await waitFor(() => expect(botao('Destaque').getAttribute('aria-pressed')).toBe('true'));

  fireEvent.click(botao('Título 2'));
  expect(editor.isActive('heading', { level: 2 })).toBe(true);
  await waitFor(() => expect(botao('Título 2').getAttribute('aria-pressed')).toBe('true'));
  fireEvent.click(botao('Título 2'));
  expect(editor.isActive('heading')).toBe(false);

  fireEvent.click(botao('Lista numerada'));
  expect(editor.isActive('orderedList')).toBe(true);
  await waitFor(() => expect(botao('Lista numerada').getAttribute('aria-pressed')).toBe('true'));

  // Outra lista troca a do cursor; a mesma lista desfaz.
  fireEvent.click(botao('Lista com marcadores'));
  expect(editor.isActive('bulletList')).toBe(true);
  expect(editor.isActive('orderedList')).toBe(false);
  await waitFor(() => expect(botao('Lista numerada').getAttribute('aria-pressed')).toBe('false'));
  fireEvent.click(botao('Lista com marcadores'));
  expect(editor.isActive('bulletList')).toBe(false);

  fireEvent.click(botao('Lista de tarefas'));
  expect(editor.isActive('taskList')).toBe(true);
  await waitFor(() => expect(botao('Lista de tarefas').getAttribute('aria-pressed')).toBe('true'));
  expect(editor.view.hasFocus()).toBe(true);
});

it('Inserir bloco abre o menu "/" no cursor', async () => {
  const { editor } = await montar(doc(''));
  await focar(editor);
  fireEvent.click(botao('Inserir bloco'));
  expect(editor.state.doc.textContent).toBe('/');
  expect(within(screen.getByRole('listbox')).getAllByRole('option')[0].textContent).toContain('Texto');
});

it('Inserir bloco num parágrafo com texto abre o menu numa linha nova abaixo — a linha escrita fica como está', async () => {
  const { editor } = await montar(doc('Ruptura FQM Farma'));
  await focar(editor, 4);
  fireEvent.click(botao('Inserir bloco'));
  const blocos: string[] = [];
  editor.state.doc.forEach(no => { blocos.push(`${no.type.name}:${no.textContent}`); });
  expect(blocos).toEqual(['paragraph:Ruptura FQM Farma', 'paragraph:/']);
  expect(screen.getByRole('listbox')).toBeTruthy();
});

it('Imagem pede o seletor da página, que oferece galeria e câmera (sem capture), com o lugar guardado antes', async () => {
  const { editor, container } = await montar(doc(TEXTO, 'Ruptura FQM Farma'));
  await focar(editor, 5);
  const noCursor = pontoDoCursor(editor.state);
  const loja = lojaDoMenu(editor);
  const pedir = vi.spyOn(loja, 'pedirImagem');
  const input = container.querySelector<HTMLInputElement>('input[type="file"][multiple]');
  expect(input).not.toBeNull();
  expect(input!.hasAttribute('capture')).toBe(false);
  const abrir = vi.spyOn(input!, 'click').mockImplementation(() => undefined);

  fireEvent.click(botao('Inserir imagem'));
  expect(pedir).toHaveBeenCalledTimes(1);
  expect(abrir).toHaveBeenCalledTimes(1);

  // O seletor abriu, o teclado desceu e a seleção foi parar em outro lugar:
  // a imagem entra onde o cursor estava na hora do toque.
  act(() => { editor.commands.setTextSelection(editor.state.doc.content.size - 1); });
  expect(pontoDoCursor(editor.state)).not.toEqual(noCursor);
  expect(loja.tomarPonto()).toEqual(noCursor);
});

it('Concluir tira o foco do editor e a barra sai', async () => {
  const { editor } = await montar();
  await focar(editor, 3);
  await act(async () => { fireEvent.click(botao('Concluir edição')); });
  expect(editor.view.hasFocus()).toBe(false);
  expect(barra()).toBeNull();
});

// ---------- Acima do teclado ----------

it('a distância até a base vem do visualViewport e acompanha o teclado', async () => {
  const vv = Object.assign(new EventTarget(), { width: 390, height: 500, offsetTop: 0, offsetLeft: 0, scale: 1 });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
  const { editor } = await montar();
  await focar(editor);

  const el = barra()!;
  // Layout de 800px, parte visível de 500: o teclado ocupa 300.
  expect(el.style.getPropertyValue('--nota-formato-base')).toBe('300px');
  expect(el.hasAttribute('data-teclado')).toBe(true);

  // O teclado desce: a barra volta à base, com a faixa segura.
  vv.height = 800;
  act(() => { vv.dispatchEvent(new Event('resize')); });
  await waitFor(() => expect(el.style.getPropertyValue('--nota-formato-base')).toBe('0px'));
  expect(el.hasAttribute('data-teclado')).toBe(false);
});

it('o topo da barra vai para o <html> enquanto ela existe — o aviso da página sobe acima dela', async () => {
  const vv = Object.assign(new EventTarget(), { width: 390, height: 500, offsetTop: 0, offsetLeft: 0, scale: 1 });
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
  const { editor } = await montar();
  await focar(editor);
  const raiz = document.documentElement;
  // jsdom não mede: a altura da barra é 0, e o topo é o teclado.
  expect(raiz.style.getPropertyValue('--nota-formato-topo')).toBe('300px');

  await act(async () => { fireEvent.click(botao('Concluir edição')); });
  expect(barra()).toBeNull();
  expect(raiz.style.getPropertyValue('--nota-formato-topo')).toBe('');
});
