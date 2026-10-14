// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Highlight } from '@tiptap/extension-highlight';
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state';
import { BolhaFormato, MSG_LINK_RECUSADO } from './BolhaFormato';
// A mesma regra do EditorNota (`lib/links.ts`): só web e e-mail. A bolha não
// tem lista própria, e é isso que o teste do link confere.
import { linkPermitidoNoEditor } from '../../lib/links';

const TEXTO = 'Polviztra no CD04 - Atrasado a 28 dias';

let editorAtual: Editor | null = null;

function Banco() {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https', isAllowedUri: linkPermitidoNoEditor },
      }),
      Highlight.configure({ multicolor: false }),
    ],
    content: `<p>${TEXTO}</p><hr><p>Ruptura FQM Farma</p>`,
    injectCSS: false,
  });
  editorAtual = editor;
  return (
    <div>
      <input aria-label="Título da página" defaultValue="Triagem" />
      <EditorContent editor={editor} />
      <BolhaFormato editor={editor} />
    </div>
  );
}

function ed(): Editor {
  if (!editorAtual) throw new Error('editor não montou');
  return editorAtual;
}

/** Foca o editor e seleciona "Polviztra" (posições 1–10). */
async function selecionar(from = 1, to = 10) {
  await act(async () => {
    ed().view.focus();
    ed().commands.setTextSelection({ from, to });
  });
}

const barra = () => screen.queryByRole('toolbar', { name: 'Formatar seleção' });
// A bolha espera 250 ms de seleção parada (`updateDelay` do plugin); folga para máquina ocupada.
const ESPERA = { timeout: 3000 };
const esperarBarra = () => waitFor(() => expect(barra()).not.toBeNull(), ESPERA);

beforeAll(() => {
  // O jsdom não mede layout: o ProseMirror e o Floating UI pedem retângulos.
  // A seleção ganha uma linha de verdade no meio da tela; com retângulo zerado
  // no canto, o Floating UI a daria por fora da vista e esconderia a bolha.
  const linha = () => ({ x: 100, y: 200, top: 200, left: 100, right: 180, bottom: 220, width: 80, height: 20, toJSON: () => ({}) }) as DOMRect;
  Range.prototype.getBoundingClientRect = linha;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () { /* nada */ } }) as unknown as DOMRectList;
  // A janela do jsdom mede 0×0 (clientWidth/clientHeight do <html>): para o
  // Floating UI, tudo estaria fora da vista.
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1280 });
  Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 800 });
  if (!document.elementFromPoint) document.elementFromPoint = () => null;
});

afterEach(() => {
  cleanup();
  editorAtual = null;
  vi.restoreAllMocks();
});

it('surge sobre uma seleção de texto, e não com o cursor parado', async () => {
  render(<Banco />);
  await act(async () => {
    ed().view.focus();
    ed().commands.setTextSelection(3);
  });
  await new Promise(r => setTimeout(r, 600));
  expect(barra()).toBeNull();

  await selecionar();
  await esperarBarra();
  const nomes = Array.from(barra()!.querySelectorAll('button')).map(b => b.getAttribute('aria-label'));
  expect(nomes).toEqual([
    'Negrito (Ctrl+B)',
    'Itálico (Ctrl+I)',
    'Sublinhado (Ctrl+U)',
    'Tachado (Ctrl+Shift+S)',
    'Destaque (Ctrl+Shift+H)',
    'Inserir link',
  ]);
  // A bolha mora numa camada própria no <body>, fora do cartão da página.
  expect(barra()!.closest('.nota-bolha-camada')?.parentElement).toBe(document.body);
  // Tabindex móvel: um botão só na ordem do Tab.
  expect(Array.from(barra()!.querySelectorAll('button')).filter(b => b.tabIndex === 0)).toHaveLength(1);
});

it('Negrito liga e desliga a marca, e o aria-pressed acompanha', async () => {
  render(<Banco />);
  await selecionar();
  await esperarBarra();

  const negrito = screen.getByRole('button', { name: 'Negrito (Ctrl+B)' });
  expect(negrito.getAttribute('aria-pressed')).toBe('false');

  fireEvent.click(negrito);
  expect(ed().isActive('bold')).toBe(true);
  expect(ed().getHTML()).toContain('<strong>Polviztra</strong>');
  await waitFor(() => expect(negrito.getAttribute('aria-pressed')).toBe('true'));

  fireEvent.click(negrito);
  expect(ed().isActive('bold')).toBe(false);
  await waitFor(() => expect(negrito.getAttribute('aria-pressed')).toBe('false'));
});

it('Destaque usa o marca-texto (Ctrl+Shift+H) e marca o botão', async () => {
  render(<Banco />);
  await selecionar();
  await esperarBarra();
  const destaque = screen.getByRole('button', { name: 'Destaque (Ctrl+Shift+H)' });
  expect(destaque.getAttribute('aria-keyshortcuts')).toBe('Control+Shift+H');
  fireEvent.click(destaque);
  expect(ed().getHTML()).toContain('<mark>Polviztra</mark>');
  await waitFor(() => expect(destaque.getAttribute('aria-pressed')).toBe('true'));
});

it('o campo do link recusa javascript: e aceita "www.exemplo.com" como https', async () => {
  const usuario = userEvent.setup();
  const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);
  render(<Banco />);
  await selecionar();
  await esperarBarra();

  fireEvent.click(screen.getByRole('button', { name: 'Inserir link' }));
  const campo = await screen.findByRole('textbox', { name: 'Endereço do link' });
  expect(campo.getAttribute('placeholder')).toBe('Cole ou digite o link');
  await waitFor(() => expect(document.activeElement).toBe(campo));
  // O foco no campo não fecha a bolha.
  expect(barra()).not.toBeNull();

  await usuario.type(campo, 'javascript:alert(1){Enter}');
  expect((await screen.findByRole('alert')).textContent).toBe(MSG_LINK_RECUSADO);
  expect(campo.getAttribute('aria-invalid')).toBe('true');
  expect(ed().isActive('link')).toBe(false);
  expect(ed().getHTML()).not.toContain('href');

  await usuario.clear(campo);
  await usuario.type(campo, 'www.exemplo.com{Enter}');
  expect(screen.queryByRole('textbox', { name: 'Endereço do link' })).toBeNull();
  expect(ed().getHTML()).toContain('href="https://www.exemplo.com"');
  expect(ed().state.doc.textBetween(1, 10)).toBe('Polviztra');

  // Seleção dentro do link: endereço legível, Abrir e Remover link.
  await esperarBarra();
  const editar = await screen.findByRole('button', { name: 'Editar link' });
  expect(editar.hasAttribute('data-ativo')).toBe(true);
  const grupo = screen.getByRole('group', { name: 'Link da seleção' });
  expect(grupo.querySelector('.nota-bolha-url')?.textContent).toBe('www.exemplo.com');
  expect(grupo.querySelector('.nota-bolha-url')?.getAttribute('title')).toBe('https://www.exemplo.com');

  fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
  expect(abrir).toHaveBeenCalledWith('https://www.exemplo.com', '_blank', 'noopener,noreferrer');

  fireEvent.click(screen.getByRole('button', { name: 'Remover link' }));
  expect(ed().getHTML()).not.toContain('href');
});

it('link gravado com href que não é endereço (nulo, número) não derruba a bolha nem oferece Abrir', async () => {
  const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);
  render(<Banco />);
  for (const href of [5, null]) {
    act(() => {
      const marca = ed().schema.marks.link.create({ href });
      ed().view.dispatch(ed().state.tr.addMark(1, 10, marca));
    });
    await selecionar();
    await esperarBarra();
    expect(await screen.findByRole('button', { name: 'Editar link' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Abrir' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remover link' })).toBeTruthy();
    // A regra é a mesma do editor: o <a> sai sem endereço, sem lançar.
    expect(document.querySelector('.ProseMirror a')?.getAttribute('href')).toBe('');
  }
  expect(abrir).not.toHaveBeenCalled();
});

it('Esc no campo do link cancela sem criar link e devolve o foco ao editor', async () => {
  const usuario = userEvent.setup();
  render(<Banco />);
  await selecionar();
  await esperarBarra();
  fireEvent.click(screen.getByRole('button', { name: 'Inserir link' }));
  const campo = await screen.findByRole('textbox', { name: 'Endereço do link' });
  await usuario.type(campo, 'exemplo.com');
  await usuario.keyboard('{Escape}');
  expect(screen.queryByRole('textbox', { name: 'Endereço do link' })).toBeNull();
  expect(ed().getHTML()).not.toContain('href');
  expect(ed().view.hasFocus()).toBe(true);
  expect(ed().state.selection.from).toBe(1);
  expect(ed().state.selection.to).toBe(10);
});

it('←/→ andam entre os botões da barra, com volta', async () => {
  render(<Banco />);
  await selecionar();
  await esperarBarra();
  const botoes = Array.from(barra()!.querySelectorAll('button'));
  act(() => botoes[0].focus());
  fireEvent.keyDown(botoes[0], { key: 'ArrowLeft' });
  expect(document.activeElement).toBe(botoes[botoes.length - 1]);
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
  expect(document.activeElement).toBe(botoes[0]);
  fireEvent.keyDown(document.activeElement!, { key: 'End' });
  expect(document.activeElement).toBe(botoes[botoes.length - 1]);
  await waitFor(() => expect(botoes[botoes.length - 1].tabIndex).toBe(0));
  expect(botoes[0].tabIndex).toBe(-1);
});

it('sai quando o foco vai para o título, mesmo logo depois de um clique na barra', async () => {
  render(<Banco />);
  await selecionar();
  await esperarBarra();
  const negrito = screen.getByRole('button', { name: 'Negrito (Ctrl+B)' });
  // O clique de mouse não tira o foco do editor (mousedown com preventDefault).
  const evento = fireEvent.mouseDown(negrito);
  expect(evento).toBe(false);
  fireEvent.click(negrito, { detail: 1 });
  expect(ed().view.hasFocus()).toBe(true);
  // Passa a atualização adiada do plugin (250 ms): a bolha continua, e nada pendente a fecharia.
  await act(async () => { await new Promise(r => setTimeout(r, 600)); });
  expect(barra()).not.toBeNull();

  act(() => (screen.getByRole('textbox', { name: 'Título da página' }) as HTMLInputElement).focus());
  await waitFor(() => expect(barra()).toBeNull(), ESPERA);
});

it('não surge para a seleção de um bloco (nó), só para texto', async () => {
  render(<Banco />);
  await act(async () => {
    ed().view.focus();
    // O divisor entre os dois parágrafos: o mesmo caso da imagem selecionada.
    let pos = -1;
    ed().state.doc.forEach((no, offset) => { if (no.type.name === 'horizontalRule') pos = offset; });
    ed().view.dispatch(ed().state.tr.setSelection(NodeSelection.create(ed().state.doc, pos)));
  });
  await new Promise(r => setTimeout(r, 600));
  expect(ed().state.selection instanceof NodeSelection).toBe(true);
  expect(barra()).toBeNull();
});

it('não surge com o menu "/" aberto (uma sugestão ativa)', async () => {
  render(<Banco />);
  // O estado que o @tiptap/suggestion guarda enquanto o menu está aberto.
  const chave = new PluginKey('menuDeTeste');
  act(() => {
    ed().registerPlugin(new Plugin({
      key: chave,
      state: { init: () => ({ active: true, range: { from: 1, to: 2 }, query: '' }), apply: (_tr, s) => s },
    }));
  });
  await selecionar();
  await act(async () => { await new Promise(r => setTimeout(r, 600)); });
  expect(barra()).toBeNull();

  act(() => { ed().unregisterPlugin(chave); });
  await selecionar(1, 5);
  await esperarBarra();
});
