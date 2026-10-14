// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import { GapCursor } from '@tiptap/pm/gapcursor';
import type { Nota, NotaImagem } from '../../types';

// O envio e o preparo saem da rede e do canvas: aqui são falsos controlados.
const envio = vi.hoisted(() => ({
  resolver: null as null | ((img: NotaImagem) => void),
  chamadas: [] as Array<{ notaId: string; nome: string }>,
}));

vi.mock('../../lib/notasApi', async importOriginal => ({
  ...(await importOriginal<typeof import('../../lib/notasApi')>()),
  uploadNotaImagem: (notaId: string, imagem: { nome: string }) => {
    envio.chamadas.push({ notaId, nome: imagem.nome });
    return new Promise<NotaImagem>(resolve => { envio.resolver = resolve; });
  },
}));

// O preparo de verdade usa canvas (o jsdom não tem): o falso mantém a recusa
// por formato, que é regra, e devolve uma cópia "reduzida" de 800×450.
vi.mock('../../lib/imageAttachments', async importOriginal => {
  const real = await importOriginal<typeof import('../../lib/imageAttachments')>();
  return {
    ...real,
    prepareAttachment: async (file: File, opcoes?: { aceitos?: string }) => {
      const aceitos = opcoes?.aceitos ?? real.ACCEPT_IMAGE_MIMES;
      if (!real.isImageFile(file, aceitos)) {
        throw new real.ImagemRecusadaError('formato', `Formato não aceito. Use ${real.listaDeFormatos(aceitos)}.`);
      }
      return { nome: file.name, mime: file.type, dados: 'AAAA', largura: 800, altura: 450 };
    },
  };
});

import { EditorNota } from './EditorNota';

const NOTA_ID = '11111111-1111-4111-8111-111111111111';
const IMG_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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

function editorDe(container: HTMLElement): Editor {
  const el = container.querySelector('.nota-doc') as (HTMLElement & { editor?: Editor }) | null;
  if (!el?.editor) throw new Error('editor não montou');
  return el.editor;
}

/** O TipTap avisa "create" num setTimeout 0; o editor só emite depois disso. */
async function aposCriar() {
  await act(async () => { await new Promise(r => setTimeout(r, 10)); });
}

beforeAll(() => {
  // O jsdom não mede layout; o ProseMirror pede retângulos ao rolar até o cursor.
  const vazio = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect;
  Range.prototype.getBoundingClientRect = vazio;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () { /* nada */ } }) as unknown as DOMRectList;
  if (!document.elementFromPoint) document.elementFromPoint = () => null;
});

beforeEach(() => { envio.resolver = null; envio.chamadas = []; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('abrir a página não chama onChange, nem pela normalização do documento', async () => {
  const onChange = vi.fn();
  // Termina num título: o TipTap acrescenta o parágrafo final ao abrir.
  const conteudo = JSON.stringify({ type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Rafael Costa' }] }] });
  const { container } = render(<EditorNota nota={nota(conteudo)} recarregar={0} onChange={onChange} />);
  await aposCriar();
  const editor = editorDe(container);
  expect(editor.getText()).toContain('Rafael Costa');
  editor.commands.focus('end');
  editor.commands.blur();
  await act(async () => { await new Promise(r => setTimeout(r, 350)); });
  expect(onChange).not.toHaveBeenCalled();
  expect(container.querySelector('.nota-doc')?.getAttribute('aria-label')).toBe('Texto da página');
});

it('digitar emite na hora, depois no máximo a cada ~300 ms, e uma última vez com o texto final', async () => {
  const onChange = vi.fn();
  const { container } = render(<EditorNota nota={nota(doc('Olá'))} recarregar={0} onChange={onChange} />);
  await aposCriar();
  const editor = editorDe(container);

  act(() => { editor.commands.insertContentAt(editor.state.doc.content.size - 1, ' mundo'); });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0][0]).toContain('Olá mundo');

  act(() => { editor.commands.insertContentAt(editor.state.doc.content.size - 1, '!'); });
  act(() => { editor.commands.insertContentAt(editor.state.doc.content.size - 1, '!'); });
  expect(onChange).toHaveBeenCalledTimes(1);

  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2), { timeout: 1000 });
  expect(onChange.mock.calls[1][0]).toContain('Olá mundo!!');
  expect(JSON.parse(onChange.mock.calls[1][0]).type).toBe('doc');
});

it('desmontar descarrega o texto que ainda não tinha saído', async () => {
  const onChange = vi.fn();
  const { container, unmount } = render(<EditorNota nota={nota(doc('A'))} recarregar={0} onChange={onChange} />);
  await aposCriar();
  const editor = editorDe(container);
  act(() => { editor.commands.insertContentAt(editor.state.doc.content.size - 1, 'B'); });
  act(() => { editor.commands.insertContentAt(editor.state.doc.content.size - 1, 'C'); });
  expect(onChange).toHaveBeenCalledTimes(1);
  unmount();
  expect(onChange).toHaveBeenCalledTimes(2);
  expect(onChange.mock.calls[1][0]).toContain('ABC');
});

it('recarregar troca o texto pelo do servidor sem chamar onChange, e o desfazer não traz o antigo', async () => {
  const onChange = vi.fn();
  const { container, rerender } = render(<EditorNota nota={nota(doc('Meu texto'))} recarregar={0} onChange={onChange} />);
  await aposCriar();
  const editor = editorDe(container);
  act(() => { editor.commands.insertContentAt(editor.state.doc.content.size - 1, ' local'); });
  act(() => { editor.commands.insertContentAt(editor.state.doc.content.size - 1, '!'); });
  expect(onChange).toHaveBeenCalledTimes(1);

  rerender(<EditorNota nota={nota(doc('Texto dela'))} recarregar={1} onChange={onChange} />);
  expect(editor.getText()).toBe('Texto dela');
  // O "!" marcado para sair foi descartado com o resto do texto local.
  await act(async () => { await new Promise(r => setTimeout(r, 350)); });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(editor.can().undo()).toBe(false);

  // Mudar a nota SEM mudar `recarregar` não toca no texto da tela.
  rerender(<EditorNota nota={nota(doc('Outra versão'))} recarregar={1} onChange={onChange} />);
  expect(editor.getText()).toBe('Texto dela');
});

function colarHtml(editor: Editor, html: string, arquivos: File[] = []) {
  const evento = {
    clipboardData: { files: arquivos, getData: (tipo: string) => (tipo === 'text/html' ? html : '') },
    preventDefault: () => undefined,
  } as unknown as ClipboardEvent;
  act(() => { editor.view.pasteHTML(html, evento); });
}

it('HTML colado com <img> da web cola o texto, deixa a imagem de fora e avisa', async () => {
  const onChange = vi.fn();
  const { container } = render(<EditorNota nota={nota(doc(''))} recarregar={0} onChange={onChange} />);
  await aposCriar();
  const editor = editorDe(container);
  colarHtml(editor, '<p>Antes</p><img src="https://cdn.site.com/foto.png" alt="foto"><p>Depois</p>');
  expect(editor.getText()).toContain('Antes');
  expect(editor.getText()).toContain('Depois');
  expect(JSON.stringify(editor.getJSON())).not.toContain('https://');
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText(/1 imagem da web não foi colada/)).toBeTruthy();
  await waitFor(() => expect(onChange).toHaveBeenCalled());
  expect(onChange.mock.calls.every(([c]) => !String(c).includes('https://'))).toBe(true);
});

it('imagem desta página entra pelo HTML colado', async () => {
  const { container } = render(<EditorNota nota={nota(doc(''))} recarregar={0} onChange={vi.fn()} />);
  await aposCriar();
  const editor = editorDe(container);
  colarHtml(editor, `<p>Print</p><img src="/api/notas/${NOTA_ID}/imagens/${IMG_ID}" alt="print.webp">`);
  const json = JSON.stringify(editor.getJSON());
  expect(json).toContain(`/api/notas/${NOTA_ID}/imagens/${IMG_ID}`);
});

it('colar um print: o marcador fica fora do documento e a imagem entra com o endereço final', async () => {
  const onChange = vi.fn();
  const onUploads = vi.fn();
  const { container } = render(<EditorNota nota={nota(doc('Linha'))} recarregar={0} onChange={onChange} onUploads={onUploads} />);
  await aposCriar();
  const editor = editorDe(container);
  const print = new File([new Uint8Array([1, 2, 3])], 'print.png', { type: 'image/png' });
  colarHtml(editor, '', [print]);

  await waitFor(() => expect(envio.chamadas).toHaveLength(1));
  expect(envio.chamadas[0]).toEqual({ notaId: NOTA_ID, nome: 'print.png' });
  expect(onUploads).toHaveBeenLastCalledWith(1);
  expect(screen.getByRole('progressbar')).toBeTruthy();
  // O marcador não é documento: nada foi emitido nem entrou no JSON.
  expect(onChange).not.toHaveBeenCalled();
  expect(JSON.stringify(editor.getJSON())).not.toContain('image');

  await act(async () => { envio.resolver?.({ id: IMG_ID, nome: 'print.png', mime: 'image/png', tamanho: 3 }); });
  await waitFor(() => expect(onChange).toHaveBeenCalled());
  const json = JSON.parse(onChange.mock.calls.at(-1)?.[0] as string) as { content: Array<{ type: string; attrs?: Record<string, unknown> }> };
  expect(json.content.map(n => n.type)).toEqual(['paragraph', 'image', 'paragraph']);
  expect(json.content[1].attrs).toMatchObject({ src: `/api/notas/${NOTA_ID}/imagens/${IMG_ID}`, alt: 'print.png', width: 800, height: 450 });
  expect(onUploads).toHaveBeenLastCalledWith(0);
  expect(screen.queryByRole('progressbar')).toBeNull();
  // Inserção comum: o Ctrl+Z tira a imagem.
  act(() => { editor.commands.undo(); });
  expect(JSON.stringify(editor.getJSON())).not.toContain(IMG_ID);
});

/** Põe o cursor no fim do bloco de texto que contém `texto`. */
function cursorEm(editor: Editor, texto: string) {
  let alvo = -1;
  editor.state.doc.descendants((no, pos) => {
    if (alvo < 0 && no.isTextblock && no.textContent === texto) alvo = pos + 1 + no.content.size;
  });
  if (alvo < 0) throw new Error(`bloco "${texto}" não encontrado`);
  act(() => { editor.commands.setTextSelection(alvo); });
}

async function colarPrintEEnviar(editor: Editor) {
  colarHtml(editor, '', [new File([new Uint8Array([1])], 'print.png', { type: 'image/png' })]);
  await waitFor(() => expect(envio.resolver).not.toBeNull());
  await act(async () => { envio.resolver?.({ id: IMG_ID, nome: 'print.png', mime: 'image/png', tamanho: 1 }); });
}

it('no meio de uma lista numerada, a imagem divide a lista e a numeração continua', async () => {
  const lista = JSON.stringify({
    type: 'doc',
    content: [{
      type: 'orderedList',
      attrs: { start: 1 },
      content: ['um', 'dois', 'três'].map(t => ({ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })),
    }],
  });
  const onChange = vi.fn();
  const { container } = render(<EditorNota nota={nota(lista)} recarregar={0} onChange={onChange} />);
  await aposCriar();
  const editor = editorDe(container);
  cursorEm(editor, 'dois');
  await colarPrintEEnviar(editor);
  await waitFor(() => expect(onChange).toHaveBeenCalled());
  const blocos = (editor.getJSON().content ?? []).map(b => [b.type, b.attrs?.start ?? null, (b.content ?? []).length]);
  expect(blocos.slice(0, 3)).toEqual([
    ['orderedList', 1, 2],
    ['image', null, 0],
    ['orderedList', 3, 1],
  ]);
});

it('com o cursor num parágrafo vazio, a imagem ocupa o lugar dele', async () => {
  const { container } = render(<EditorNota nota={nota(doc('Antes', '', 'Depois'))} recarregar={0} onChange={vi.fn()} />);
  await aposCriar();
  const editor = editorDe(container);
  cursorEm(editor, '');
  await colarPrintEEnviar(editor);
  await waitFor(() => expect(JSON.stringify(editor.getJSON())).toContain(IMG_ID));
  expect((editor.getJSON().content ?? []).map(b => b.type)).toEqual(['paragraph', 'image', 'paragraph']);
  expect(editor.getText()).toContain('Antes');
  expect(editor.getText()).toContain('Depois');
});

it('a imagem que ocupa o parágrafo vazio do cursor não fica selecionada: a próxima tecla (a legenda) vai para depois dela', async () => {
  // Página nova (corpo vazio) e Enter no fim do texto: nos dois, a imagem fica por último.
  for (const conteudo of ['', doc('Texto', '')]) {
    const { container, unmount } = render(<EditorNota nota={nota(conteudo)} recarregar={0} onChange={vi.fn()} />);
    await aposCriar();
    const editor = editorDe(container);
    if (conteudo) cursorEm(editor, '');
    else act(() => { editor.commands.focus('end'); });
    await colarPrintEEnviar(editor);
    await waitFor(() => expect(JSON.stringify(editor.getJSON())).toContain(IMG_ID));
    expect(editor.state.selection.empty).toBe(true);
    act(() => { editor.commands.insertContent('Legenda'); });
    const blocos = (editor.getJSON().content ?? []).map(b => (b.type === 'paragraph' ? `p:${(b.content ?? []).map(t => (t as { text?: string }).text ?? '').join('')}` : b.type));
    expect(blocos).toEqual(conteudo ? ['p:Texto', 'image', 'p:Legenda'] : ['image', 'p:Legenda']);
    unmount();
    envio.resolver = null;
  }
});

it('quem continua escrevendo enquanto a imagem sobe não a desloca', async () => {
  const { container } = render(<EditorNota nota={nota(doc('Primeiro', 'Segundo'))} recarregar={0} onChange={vi.fn()} />);
  await aposCriar();
  const editor = editorDe(container);
  cursorEm(editor, 'Primeiro');
  colarHtml(editor, '', [new File([new Uint8Array([1])], 'print.png', { type: 'image/png' })]);
  await waitFor(() => expect(envio.resolver).not.toBeNull());
  // Texto novo ANTES do ponto da imagem, enquanto ela sobe.
  act(() => { editor.commands.insertContentAt(1, 'Título — '); });
  await act(async () => { envio.resolver?.({ id: IMG_ID, nome: 'print.png', mime: 'image/png', tamanho: 1 }); });
  await waitFor(() => expect(JSON.stringify(editor.getJSON())).toContain(IMG_ID));
  const blocos = editor.getJSON().content ?? [];
  expect(blocos.map(b => b.type)).toEqual(['paragraph', 'image', 'paragraph']);
  expect(editor.state.doc.firstChild?.textContent).toBe('Título — Primeiro');
});

it('formato não aceito vira bloco âmbar com a lista de formatos, sem subir nada', async () => {
  const { container } = render(<EditorNota nota={nota(doc('Linha'))} recarregar={0} onChange={vi.fn()} />);
  await aposCriar();
  const editor = editorDe(container);
  colarHtml(editor, '', [new File([new Uint8Array([1])], 'IMG_2048.heic', { type: 'image/heic' })]);
  expect(await screen.findByText('Formato não aceito')).toBeTruthy();
  expect(screen.getByText('Use PNG, JPG, WebP ou GIF.')).toBeTruthy();
  expect(container.querySelector('[data-fase="recusada"]')).toBeTruthy();
  expect(envio.chamadas).toHaveLength(0);
  act(() => { screen.getByRole('button', { name: 'Remover' }).click(); });
  expect(screen.queryByText('Formato não aceito')).toBeNull();
});

it('sair com imagem subindo pergunta antes (Sair / Esperar)', async () => {
  const { canNavigate } = await import('../../lib/navigation');
  const { container } = render(<EditorNota nota={nota(doc('Linha'))} recarregar={0} onChange={vi.fn()} />);
  await aposCriar();
  const editor = editorDe(container);
  expect(await canNavigate()).toBe(true);
  colarHtml(editor, '', [new File([new Uint8Array([1])], 'print.png', { type: 'image/png' })]);
  await waitFor(() => expect(envio.resolver).not.toBeNull());

  let resposta: Promise<boolean> = Promise.resolve(true);
  act(() => { resposta = canNavigate(); });
  expect(await screen.findByText('1 imagem ainda está subindo')).toBeTruthy();
  expect(screen.getByText('Sair agora descarta a imagem.')).toBeTruthy();
  act(() => { screen.getByRole('button', { name: 'Esperar' }).click(); });
  expect(await resposta).toBe(false);

  await act(async () => { envio.resolver?.({ id: IMG_ID, nome: 'print.png', mime: 'image/png', tamanho: 1 }); });
  await waitFor(() => expect(JSON.stringify(editor.getJSON())).toContain(IMG_ID));
  expect(await canNavigate()).toBe(true);
});

// ---------- Arrastar um arquivo sobre o marcador de envio ----------

/** Evento de arraste com arquivos (o jsdom não tem DragEvent). */
function arraste(tipo: string, arquivos: File[]): Event {
  const e = new Event(tipo, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'dataTransfer', { value: { files: arquivos, types: ['Files'], getData: () => '' } });
  Object.defineProperty(e, 'clientX', { value: 10 });
  Object.defineProperty(e, 'clientY', { value: 10 });
  return e;
}

it('soltar um arquivo em cima de uma imagem que está subindo insere a imagem, sem o navegador abrir o arquivo', async () => {
  const { container } = render(<EditorNota nota={nota(doc('Um', 'Dois'))} recarregar={0} onChange={vi.fn()} />);
  await aposCriar();
  const editor = editorDe(container);
  colarHtml(editor, '', [new File([new Uint8Array([1])], 'a.png', { type: 'image/png' })]);
  await waitFor(() => expect(container.querySelector('.nota-upload')).not.toBeNull());
  const marcador = container.querySelector('.nota-upload') as HTMLElement;
  const dentro = marcador.querySelector('figure') ?? marcador;

  // O editor cancela o dragover sobre o marcador (e sobre o que há dentro dele).
  for (const alvo of [marcador, dentro]) {
    const passando = arraste('dragover', [new File([new Uint8Array([1])], 'b.png', { type: 'image/png' })]);
    act(() => { alvo.dispatchEvent(passando); });
    expect(passando.defaultPrevented).toBe(true);
  }

  const soltando = arraste('drop', [new File([new Uint8Array([1])], 'c.png', { type: 'image/png' })]);
  act(() => { marcador.dispatchEvent(soltando); });
  expect(soltando.defaultPrevented).toBe(true);
  await waitFor(() => expect(container.querySelectorAll('.nota-upload')).toHaveLength(2));
});

it('o marcador continua guardando os cliques dos botões dele; só o arraste de arquivo passa', async () => {
  const { marcadorParaEvento } = await import('./uploadsDeImagem');
  expect(marcadorParaEvento(new Event('mousedown'))).toBe(true);
  expect(marcadorParaEvento(new Event('click'))).toBe(true);
  // Arrastar a miniatura do bloco não começa um arraste do documento.
  expect(marcadorParaEvento(new Event('dragstart'))).toBe(true);
  for (const tipo of ['dragenter', 'dragover', 'dragleave', 'drop']) {
    expect(marcadorParaEvento(new Event(tipo))).toBe(false);
  }
});

// ---------- Links ----------

function docComLink(...marcas: unknown[]): string {
  return JSON.stringify({
    type: 'doc',
    // Texto puro entre as marcas: duas marcas iguais lado a lado viram um <a> só.
    content: [{ type: 'paragraph', content: marcas.flatMap((mark, i) => [{ type: 'text', text: `link${i}`, marks: [mark] }, { type: 'text', text: ' · ' }]) }],
  });
}

it('marca de link malformada (href nulo, numérico ou ausente) abre sem derrubar a tela', async () => {
  const conteudo = docComLink({ type: 'link' }, { type: 'link', attrs: { href: null } }, { type: 'link', attrs: { href: 5 } });
  let container!: HTMLElement;
  expect(() => { ({ container } = render(<EditorNota nota={nota(conteudo)} recarregar={0} onChange={vi.fn()} />)); }).not.toThrow();
  await aposCriar();
  expect(editorDe(container).getText()).toContain('link2');
  const links = Array.from(container.querySelectorAll('.nota-doc a'));
  expect(links).toHaveLength(3);
  for (const a of links) expect(a.getAttribute('href')).toBe('');
});

it('link colado perde class, rel, target e title de fora e sai com os padrões seguros', async () => {
  const { container } = render(<EditorNota nota={nota(doc('x'))} recarregar={0} onChange={vi.fn()} />);
  await aposCriar();
  const editor = editorDe(container);
  cursorEm(editor, 'x');
  colarHtml(editor, '<p><a class="btn lightbox" target="_self" rel="opener" title="t" href="https://x.com">Ver</a> <a href="java&#9;script:alert(1)">b</a> <a href="data:text/html,oi">c</a> <a href="vbscript:msgbox(1)">d</a></p>');
  const a = container.querySelector('.nota-doc a[href="https://x.com"]');
  expect(a).not.toBeNull();
  expect(a?.getAttribute('target')).toBe('_blank');
  expect(a?.getAttribute('rel')).toBe('noopener noreferrer nofollow');
  expect(a?.hasAttribute('class')).toBe(false);
  expect(a?.hasAttribute('title')).toBe(false);
  const json = JSON.stringify(editor.getJSON());
  expect(json).not.toMatch(/lightbox|_self|opener"|"title":"t"/);
  // Os esquemas perigosos não viram link.
  expect(container.querySelectorAll('.nota-doc a')).toHaveLength(1);
  expect(json).not.toMatch(/script:|data:/);
});

it('domínio e e-mail digitados viram link (https: e mailto:); javascript: não', async () => {
  const { container } = render(<EditorNota nota={nota(doc('x'))} recarregar={0} onChange={vi.fn()} />);
  await aposCriar();
  const editor = editorDe(container);
  cursorEm(editor, 'x');
  act(() => { editor.commands.insertContent(' www.paguemenos.com.br '); });
  act(() => { editor.commands.insertContent('fulano@empresa.com.br '); });
  act(() => { editor.commands.insertContent('javascript:alert(1) '); });
  const hrefs = Array.from(container.querySelectorAll('.nota-doc a')).map(a => a.getAttribute('href'));
  expect(hrefs).toEqual(['https://www.paguemenos.com.br', 'mailto:fulano@empresa.com.br']);
});

// ---------- Documento que o esquema não lê ----------

it('documento com bloco fora do esquema abre só para leitura, avisa e não grava nada', async () => {
  const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const conteudo = JSON.stringify({ type: 'doc', content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Pauta da semana' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'rodar ' }, { type: 'text', text: 'select *', marks: [{ type: 'code' }] }] },
  ] });
  const onChange = vi.fn();
  const { container, rerender } = render(<EditorNota nota={nota(conteudo)} recarregar={0} onChange={onChange} autoFocus />);
  await aposCriar();
  const editor = editorDe(container);
  expect(screen.getByText('Esta página tem um bloco que este editor não lê. Nada foi alterado.')).toBeTruthy();
  expect(editor.isEditable).toBe(false);
  expect(container.querySelector('.nota-doc')?.getAttribute('contenteditable')).toBe('false');

  // Nem texto, nem imagem: nada vira edição por cima do conteúdo gravado.
  act(() => { editor.commands.insertContent('x'); });
  colarHtml(editor, '', [new File([new Uint8Array([1])], 'print.png', { type: 'image/png' })]);
  act(() => { editor.commands.blur(); });
  await act(async () => { await new Promise(r => setTimeout(r, 400)); });
  expect(onChange).not.toHaveBeenCalled();
  expect(container.querySelector('.nota-upload')).toBeNull();

  // "Carregar a dela" com um documento legível: a página volta a ser editável.
  rerender(<EditorNota nota={nota(doc('Versão legível'))} recarregar={1} onChange={onChange} />);
  expect(screen.queryByText(/este editor não lê/)).toBeNull();
  expect(editor.isEditable).toBe(true);
  expect(editor.getText()).toBe('Versão legível');
  act(() => { editor.commands.insertContentAt(editor.state.doc.content.size - 1, '!'); });
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(onChange.mock.calls[0][0]).toContain('Versão legível!');

  // E uma versão nova ilegível trava de novo, sem emitir.
  rerender(<EditorNota nota={nota(conteudo)} recarregar={2} onChange={onChange} />);
  expect(editor.isEditable).toBe(false);
  expect(screen.getByText(/este editor não lê/)).toBeTruthy();
  await act(async () => { await new Promise(r => setTimeout(r, 400)); });
  expect(onChange).toHaveBeenCalledTimes(1);
  aviso.mockRestore();
});

// ---------- Imagem de outra página ----------

const OUTRA_ID = '22222222-2222-4222-8222-222222222222';

it('imagem de outra página que não existe mais vira recusa: âmbar, sem "Tentar de novo" e fora da guarda de saída', async () => {
  const { canNavigate } = await import('../../lib/navigation');
  const busca = vi.fn(async () => new Response('', { status: 404 }));
  vi.stubGlobal('fetch', busca);
  try {
    const { container } = render(<EditorNota nota={nota(doc('Linha'))} recarregar={0} onChange={vi.fn()} />);
    await aposCriar();
    const editor = editorDe(container);
    colarHtml(editor, `<p>Print</p><img src="/api/notas/${OUTRA_ID}/imagens/${IMG_ID}" alt="print.png">`);
    expect(await screen.findByText('A imagem da outra página não existe mais.')).toBeTruthy();
    const bloco = container.querySelector('[data-fase="recusada"]') as HTMLElement;
    expect(bloco).not.toBeNull();
    expect(bloco.textContent).toContain('Imagem indisponível');
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
    expect(busca).toHaveBeenCalledTimes(1);
    expect(envio.chamadas).toHaveLength(0);
    // Nada a perder: sair não pergunta.
    expect(await canNavigate()).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('falha de rede ao buscar a imagem de outra página mostra a mensagem em português, nunca a do navegador', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
  try {
    const { container } = render(<EditorNota nota={nota(doc('Linha'))} recarregar={0} onChange={vi.fn()} />);
    await aposCriar();
    const editor = editorDe(container);
    colarHtml(editor, `<p>Print</p><img src="/api/notas/${OUTRA_ID}/imagens/${IMG_ID}" alt="print.png">`);
    expect(await screen.findByText(/^Sem conexão: não deu para buscar a imagem da outra página\./)).toBeTruthy();
    expect(container.textContent).not.toContain('Failed to fetch');
    expect(container.querySelector('[data-fase="erro"]')).not.toBeNull();
    // Rede é passageira: aqui o "Tentar de novo" faz sentido.
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
  } finally {
    vi.unstubAllGlobals();
  }
});

// ---------- Imagem colada num item de lista vazio ----------

function lista(tipo: 'bulletList' | 'orderedList', itens: string[]): string {
  return JSON.stringify({
    type: 'doc',
    content: [{
      type: tipo,
      ...(tipo === 'orderedList' ? { attrs: { start: 1 } } : {}),
      content: itens.map(t => ({ type: 'listItem', content: [{ type: 'paragraph', content: t ? [{ type: 'text', text: t }] : [] }] })),
    }],
  });
}

function resumo(editor: Editor) {
  return (editor.getJSON().content ?? []).map(b => [b.type, (b.content ?? []).length, b.attrs?.start ?? null]);
}

it('com o cursor num item de lista vazio no fim da lista, a imagem ocupa o lugar do item', async () => {
  const { container } = render(<EditorNota nota={nota(lista('bulletList', ['um', '']))} recarregar={0} onChange={vi.fn()} />);
  await aposCriar();
  const editor = editorDe(container);
  cursorEm(editor, '');
  await colarPrintEEnviar(editor);
  await waitFor(() => expect(JSON.stringify(editor.getJSON())).toContain(IMG_ID));
  expect(resumo(editor)).toEqual([['bulletList', 1, null], ['image', 0, null], ['paragraph', 0, null]]);
});

it('item vazio no meio de uma lista numerada: a lista se divide ali, sem item sobrando', async () => {
  const { container } = render(<EditorNota nota={nota(lista('orderedList', ['um', '', 'três']))} recarregar={0} onChange={vi.fn()} />);
  await aposCriar();
  const editor = editorDe(container);
  cursorEm(editor, '');
  await colarPrintEEnviar(editor);
  await waitFor(() => expect(JSON.stringify(editor.getJSON())).toContain(IMG_ID));
  expect(resumo(editor).slice(0, 3)).toEqual([['orderedList', 1, 1], ['image', 0, null], ['orderedList', 1, 2]]);
});

it('lista de um item só, vazio: a imagem toma o lugar da lista', async () => {
  const { container } = render(<EditorNota nota={nota(lista('bulletList', ['']))} recarregar={0} onChange={vi.fn()} />);
  await aposCriar();
  const editor = editorDe(container);
  cursorEm(editor, '');
  await colarPrintEEnviar(editor);
  await waitFor(() => expect(JSON.stringify(editor.getJSON())).toContain(IMG_ID));
  expect(resumo(editor).map(([tipo]) => tipo)).toEqual(['image', 'paragraph']);
});

// ---------- Imagem que não carregou ----------

it('página que começa com imagem abre sem a imagem selecionada, e a primeira tecla não a substitui', async () => {
  const comImagemNoTopo = (texto: string) => JSON.stringify({ type: 'doc', content: [
    { type: 'image', attrs: { src: `/api/notas/${NOTA_ID}/imagens/${IMG_ID}`, alt: 'print.png' } },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: texto }] }] }] },
  ] });
  const onChange = vi.fn();
  const { container, rerender } = render(<EditorNota nota={nota(comImagemNoTopo('Primeiro item'))} recarregar={0} onChange={onChange} />);
  await aposCriar();
  const editor = editorDe(container);
  await waitFor(() => expect(container.querySelector('.nota-imagem')).not.toBeNull());
  expect(editor.state.selection).toBeInstanceOf(GapCursor);
  expect(container.querySelector('.nota-imagem[data-selecionada]')).toBeNull();
  await act(async () => { await new Promise(r => setTimeout(r, 350)); });
  expect(onChange).not.toHaveBeenCalled();

  // "Carregar a dela" com o cursor no topo também não seleciona a imagem.
  rerender(<EditorNota nota={nota(comImagemNoTopo('Item dela'))} recarregar={1} onChange={onChange} />);
  expect(editor.getText()).toContain('Item dela');
  expect(editor.state.selection).toBeInstanceOf(GapCursor);

  // Enter no título foca o corpo pela seleção guardada: digitar cria um parágrafo acima.
  act(() => { editor.view.focus(); editor.commands.insertContent('abc'); });
  expect((editor.getJSON().content ?? []).map(b => b.type)).toEqual(['paragraph', 'image', 'bulletList', 'paragraph']);
  expect(editor.getText()).toMatch(/^abc/);
});

it('"Imagem indisponível" oferece Tentar de novo, que pede o arquivo outra vez, e não afirma perda', async () => {
  const conteudo = JSON.stringify({ type: 'doc', content: [
    { type: 'image', attrs: { src: `/api/notas/${NOTA_ID}/imagens/${IMG_ID}`, alt: 'print.png' } },
    { type: 'paragraph' },
  ] });
  const { container } = render(<EditorNota nota={nota(conteudo)} recarregar={0} onChange={vi.fn()} />);
  await aposCriar();
  const primeira = await waitFor(() => {
    const img = container.querySelector('.nota-imagem img');
    expect(img).not.toBeNull();
    return img as HTMLImageElement;
  });
  act(() => { primeira.dispatchEvent(new Event('error')); });
  expect(await screen.findByText('Imagem indisponível')).toBeTruthy();
  expect(screen.getByText('A imagem não carregou agora. Pode ser a conexão: tente de novo antes de remover.')).toBeTruthy();
  expect(container.textContent).not.toMatch(/não volta/);
  act(() => { screen.getByRole('button', { name: 'Tentar de novo' }).click(); });
  const nova = container.querySelector('.nota-imagem img');
  expect(nova).not.toBeNull();
  expect(nova).not.toBe(primeira);
  expect(screen.queryByText('Imagem indisponível')).toBeNull();
});
