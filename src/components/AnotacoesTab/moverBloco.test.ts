import { describe, expect, it } from 'vitest';
import { getSchema, type JSONContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Highlight } from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import type { Node as NoPM } from '@tiptap/pm/model';
import { EditorState, NodeSelection, TextSelection, type Command, type Transaction } from '@tiptap/pm/state';
import { history, undo } from '@tiptap/pm/history';
import { blocoDaSelecao, blocoEm, faixaMovel, inserirAbaixo, moverBloco, selecionarBloco } from './moverBloco';

// O esquema do editor da página (o mesmo conjunto de nós do EditorNota).
const schema = getSchema([
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, code: false, codeBlock: false }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Highlight,
  Image.configure({ inline: false }),
]);

const t = (texto: string): JSONContent => ({ type: 'text', text: texto });
const p = (texto = ''): JSONContent => ({ type: 'paragraph', content: texto ? [t(texto)] : [] });
const h = (nivel: number, texto: string): JSONContent => ({ type: 'heading', attrs: { level: nivel }, content: [t(texto)] });
const li = (texto: string, ...resto: JSONContent[]): JSONContent => ({ type: 'listItem', content: [p(texto), ...resto] });
const ol = (...itens: JSONContent[]): JSONContent => ({ type: 'orderedList', content: itens });
const ul = (...itens: JSONContent[]): JSONContent => ({ type: 'bulletList', content: itens });
const tarefa = (texto: string, checked = false): JSONContent => ({ type: 'taskItem', attrs: { checked }, content: [p(texto)] });
const tarefas = (...itens: JSONContent[]): JSONContent => ({ type: 'taskList', content: itens });
const img: JSONContent = { type: 'image', attrs: { src: '/api/notas/n/imagens/i', alt: 'print' } };

function docDe(...blocos: JSONContent[]): NoPM {
  return schema.nodeFromJSON({ type: 'doc', content: blocos });
}

/** A posição logo depois do texto `trecho` (o cursor no fim dele). */
function depoisDe(doc: NoPM, trecho: string): number {
  let achado = -1;
  doc.descendants((no, pos) => {
    if (achado >= 0) return false;
    if (no.isText && no.text?.includes(trecho)) achado = pos + no.text.indexOf(trecho) + trecho.length;
    return true;
  });
  if (achado < 0) throw new Error(`"${trecho}" não está no documento`);
  return achado;
}

/** O começo (posição antes) do primeiro nó do tipo dado cujo texto é `texto`. */
function inicioDe(doc: NoPM, tipo: string, texto?: string): number {
  let achado = -1;
  doc.descendants((no, pos) => {
    if (achado >= 0) return false;
    if (no.type.name === tipo && (texto === undefined || no.textContent === texto)) achado = pos;
    return true;
  });
  if (achado < 0) throw new Error(`${tipo} "${texto}" não está no documento`);
  return achado;
}

function cursorEm(doc: NoPM, trecho: string, comHistorico = false): EditorState {
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, depoisDe(doc, trecho)),
    plugins: comHistorico ? [history()] : [],
  });
}

function aplicar(state: EditorState, comando: Command): { ok: boolean; state: EditorState; tr: Transaction | null } {
  let tr: Transaction | null = null;
  const ok = comando(state, t2 => { tr = t2; });
  return { ok, state: tr ? state.apply(tr) : state, tr };
}

/** Os blocos de primeiro nível como texto curto: "p:A", "h2:Ana", "ol[1|2]". */
function forma(no: NoPM): string {
  const nome = no.type.name;
  if (nome === 'doc') return no.content.content.map(forma).join(' ');
  if (nome === 'paragraph') return `p:${no.textContent}`;
  if (nome === 'heading') return `h${no.attrs.level as number}:${no.textContent}`;
  if (nome === 'image') return 'img';
  if (nome === 'horizontalRule') return 'hr';
  if (nome === 'listItem' || nome === 'taskItem') {
    const [primeiro, ...resto] = no.content.content;
    const sub = resto.map(forma).join(' ');
    return `${primeiro?.textContent ?? ''}${sub ? ` ${sub}` : ''}`;
  }
  const sigla = nome === 'orderedList' ? 'ol' : nome === 'bulletList' ? 'ul' : nome === 'taskList' ? 'tl' : nome;
  return `${sigla}[${no.content.content.map(forma).join('|')}]`;
}

describe('moverBloco', () => {
  it('troca dois parágrafos e o cursor vai junto, no mesmo ponto do texto', () => {
    const inicio = cursorEm(docDe(p('Alfa'), p('Beta'), p('Gama')), 'Be');
    const cima = aplicar(inicio, moverBloco('cima'));
    expect(cima.ok).toBe(true);
    expect(forma(cima.state.doc)).toBe('p:Beta p:Alfa p:Gama');
    expect(cima.state.selection.empty).toBe(true);
    expect(cima.state.selection.from).toBe(depoisDe(cima.state.doc, 'Be'));

    const baixo = aplicar(inicio, moverBloco('baixo'));
    expect(forma(baixo.state.doc)).toBe('p:Alfa p:Gama p:Beta');
    expect(baixo.state.selection.from).toBe(depoisDe(baixo.state.doc, 'Be'));
  });

  it('troca itens dentro da lista, sem sair dela nem trocar de lista', () => {
    const inicio = cursorEm(docDe(p('Antes'), ol(li('Um'), li('Dois'), li('Três')), p('Depois')), 'Dois');
    const cima = aplicar(inicio, moverBloco('cima'));
    expect(forma(cima.state.doc)).toBe('p:Antes ol[Dois|Um|Três] p:Depois');
    expect(cima.state.selection.from).toBe(depoisDe(cima.state.doc, 'Dois'));

    const baixo = aplicar(inicio, moverBloco('baixo'));
    expect(forma(baixo.state.doc)).toBe('p:Antes ol[Um|Três|Dois] p:Depois');
  });

  it('na borda não faz nada e não despacha transação', () => {
    const doc = docDe(p('Alfa'), ol(li('Um'), li('Dois')), p('Fim'));
    for (const [trecho, direcao] of [['Alfa', 'cima'], ['Fim', 'baixo'], ['Um', 'cima'], ['Dois', 'baixo']] as const) {
      const r = aplicar(cursorEm(doc, trecho), moverBloco(direcao));
      expect(r.ok).toBe(false);
      expect(r.tr).toBeNull();
      expect(r.state.doc.eq(doc)).toBe(true);
    }
  });

  it('título seguido de lista: o título passa pela lista inteira, de uma vez', () => {
    const inicio = cursorEm(docDe(h(2, 'Rafael Costa'), ol(li('Agenda'), li('Estoque parado')), h(2, 'Camila Nunes')), 'Costa');
    const baixo = aplicar(inicio, moverBloco('baixo'));
    expect(forma(baixo.state.doc)).toBe('ol[Agenda|Estoque parado] h2:Rafael Costa h2:Camila Nunes');
    // E a lista sobe por cima do título, inteira, com o cursor num item.
    const lista = aplicar(cursorEm(baixo.state.doc, 'Agenda'), moverBloco('cima'));
    expect(lista.ok).toBe(false); // o item é o bloco do cursor, e ele é o primeiro da lista
    const doTitulo = aplicar(cursorEm(baixo.state.doc, 'Costa'), moverBloco('cima'));
    expect(forma(doTitulo.state.doc)).toBe('h2:Rafael Costa ol[Agenda|Estoque parado] h2:Camila Nunes');
  });

  it('item de lista aninhada se move só dentro da lista dele', () => {
    const doc = docDe(ul(li('Pai', ul(li('A'), li('B'))), li('Tio')));
    const cima = aplicar(cursorEm(doc, 'B'), moverBloco('cima'));
    expect(forma(cima.state.doc)).toBe('ul[Pai ul[B|A]|Tio]');
    // O item de fora leva a lista aninhada junto.
    const pai = aplicar(cursorEm(doc, 'Pai'), moverBloco('baixo'));
    expect(forma(pai.state.doc)).toBe('ul[Tio|Pai ul[A|B]]');
    expect(aplicar(cursorEm(doc, 'B'), moverBloco('baixo')).ok).toBe(false);
  });

  it('tarefa marcada continua marcada depois de mover', () => {
    const doc = docDe(tarefas(tarefa('Ligar'), tarefa('Pedido conferido - OK', true)));
    const r = aplicar(cursorEm(doc, 'conferido'), moverBloco('cima'));
    expect(forma(r.state.doc)).toBe('tl[Pedido conferido - OK|Ligar]');
    expect(r.state.doc.firstChild?.firstChild?.attrs.checked).toBe(true);
  });

  it('lista numerada que começa em 4 mantém o início', () => {
    const lista: JSONContent = { ...ol(li('Falta de caixas'), li('Falta de etiquetas')), attrs: { start: 4 } };
    const r = aplicar(cursorEm(docDe(lista), 'etiquetas'), moverBloco('cima'));
    expect(forma(r.state.doc)).toBe('ol[Falta de etiquetas|Falta de caixas]');
    expect(r.state.doc.firstChild?.attrs.start).toBe(4);
  });

  it('bloco selecionado inteiro (a imagem) continua selecionado depois de mover', () => {
    const doc = docDe(p('Antes'), img, p('Depois'));
    const pos = inicioDe(doc, 'image');
    const inicio = EditorState.create({ doc, selection: NodeSelection.create(doc, pos) });
    const baixo = aplicar(inicio, moverBloco('baixo'));
    expect(forma(baixo.state.doc)).toBe('p:Antes p:Depois img');
    const sel = baixo.state.selection;
    expect(sel).toBeInstanceOf(NodeSelection);
    expect((sel as NodeSelection).node.type.name).toBe('image');

    const cima = aplicar(aplicar(baixo.state, moverBloco('cima')).state, moverBloco('cima'));
    expect(forma(cima.state.doc)).toBe('img p:Antes p:Depois');
    expect((cima.state.selection as NodeSelection).node.type.name).toBe('image');
  });

  it('item selecionado pela alça se move dentro da lista', () => {
    const doc = docDe(ol(li('Um'), li('Dois'), li('Três')));
    const pos = inicioDe(doc, 'listItem', 'Três');
    const inicio = EditorState.create({ doc, selection: NodeSelection.create(doc, pos) });
    const r = aplicar(inicio, moverBloco('cima'));
    expect(forma(r.state.doc)).toBe('ol[Um|Três|Dois]');
    expect((r.state.selection as NodeSelection).node.textContent).toBe('Três');
  });

  it('seleção que pega vários blocos move todos juntos', () => {
    const doc = docDe(p('Alfa'), p('Beta'), p('Gama'), p('Delta'));
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, depoisDe(doc, 'B'), depoisDe(doc, 'Ga')) });
    const r = aplicar(state, moverBloco('cima'));
    expect(forma(r.state.doc)).toBe('p:Beta p:Gama p:Alfa p:Delta');
    expect(r.state.doc.textBetween(r.state.selection.from, r.state.selection.to)).toBe('etaGa');
  });

  it('Ctrl+Z desfaz o movimento, e só ele: o que foi digitado antes fica', () => {
    let state = cursorEm(docDe(p('Alfa'), p('Beta')), 'Beta', true);
    state = state.apply(state.tr.insertText('!'));
    state = aplicar(state, moverBloco('cima')).state;
    expect(forma(state.doc)).toBe('p:Beta! p:Alfa');
    state = aplicar(state, undo).state;
    expect(forma(state.doc)).toBe('p:Alfa p:Beta!');
    state = aplicar(state, undo).state;
    expect(forma(state.doc)).toBe('p:Alfa p:Beta');
  });

  it('página de um bloco só: a faixa existe (a tecla é consumida), mas não há para onde ir', () => {
    const doc = docDe(p('Alfa'));
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 1) });
    expect(faixaMovel(state)).not.toBeNull();
    expect(aplicar(state, moverBloco('cima')).ok).toBe(false);
    expect(aplicar(state, moverBloco('baixo')).ok).toBe(false);
  });
});

describe('blocoDaSelecao e blocoEm', () => {
  it('o cursor num item é o item; num título, o título; numa citação, a citação', () => {
    const doc = docDe(
      h(2, 'Meus'),
      ol(li('Orientar equipe', ol(li('Piloto novo')))),
      { type: 'blockquote', content: [p('Citado')] },
    );
    expect(blocoDaSelecao(cursorEm(doc, 'Meus'))?.no.type.name).toBe('heading');
    expect(blocoDaSelecao(cursorEm(doc, 'Orientar'))?.pos).toBe(inicioDe(doc, 'listItem'));
    const aninhado = blocoDaSelecao(cursorEm(doc, 'Piloto'));
    expect(aninhado?.no.textContent).toBe('Piloto novo');
    expect(aninhado?.no.type.name).toBe('listItem');
    expect(blocoDaSelecao(cursorEm(doc, 'Citado'))?.no.type.name).toBe('blockquote');
  });

  it('a imagem selecionada é a própria imagem', () => {
    const doc = docDe(p('A'), img);
    const pos = inicioDe(doc, 'image');
    const state = EditorState.create({ doc, selection: NodeSelection.create(doc, pos) });
    expect(blocoDaSelecao(state)).toEqual({ pos, no: doc.child(1) });
  });

  it('blocoEm aceita só bloco de primeiro nível ou item de lista', () => {
    const doc = docDe(p('A'), ol(li('Um')));
    expect(blocoEm(doc, 0)?.no.type.name).toBe('paragraph');
    expect(blocoEm(doc, inicioDe(doc, 'listItem'))?.no.type.name).toBe('listItem');
    // O parágrafo de dentro do item não é bloco da alça.
    expect(blocoEm(doc, inicioDe(doc, 'listItem') + 1)).toBeNull();
    expect(blocoEm(doc, doc.content.size)).toBeNull();
  });

  it('selecionarBloco seleciona o bloco inteiro', () => {
    const doc = docDe(p('A'), ol(li('Um'), li('Dois')));
    const pos = inicioDe(doc, 'listItem', 'Dois');
    const r = aplicar(EditorState.create({ doc }), selecionarBloco(pos));
    expect(r.state.selection).toBeInstanceOf(NodeSelection);
    expect(r.state.selection.from).toBe(pos);
  });
});

describe('inserirAbaixo (o "+")', () => {
  function inserir(doc: NoPM, pos: number) {
    const r = aplicar(EditorState.create({ doc }), inserirAbaixo(pos));
    const { selection } = r.state;
    return { ...r, antesDoCursor: r.state.doc.textBetween(selection.from - 1, selection.from) };
  }

  it('abaixo de um parágrafo: parágrafo novo com "/" e o cursor depois dela', () => {
    const r = inserir(docDe(p('Alfa'), p('Beta')), 0);
    expect(forma(r.state.doc)).toBe('p:Alfa p:/ p:Beta');
    expect(r.state.selection.empty).toBe(true);
    expect(r.antesDoCursor).toBe('/');
    expect(r.state.selection.$from.parent.type.name).toBe('paragraph');
  });

  it('abaixo de um título, da imagem e do divisor: parágrafo', () => {
    expect(forma(inserir(docDe(h(2, 'Ana'), p('x')), 0).state.doc)).toBe('h2:Ana p:/ p:x');
    const comImagem = docDe(p('A'), img);
    expect(forma(inserir(comImagem, inicioDe(comImagem, 'image')).state.doc)).toBe('p:A img p:/');
    const comDivisor = docDe({ type: 'horizontalRule' }, p('B'));
    expect(forma(inserir(comDivisor, 0).state.doc)).toBe('hr p:/ p:B');
  });

  it('abaixo de um item: item novo na mesma lista; tarefa nova desmarcada', () => {
    const lista = docDe(ol(li('Um'), li('Dois')));
    const r = inserir(lista, inicioDe(lista, 'listItem', 'Um'));
    expect(forma(r.state.doc)).toBe('ol[Um|/|Dois]');
    expect(r.antesDoCursor).toBe('/');

    const comTarefa = docDe(tarefas(tarefa('Feita', true)));
    const t2 = inserir(comTarefa, inicioDe(comTarefa, 'taskItem'));
    expect(forma(t2.state.doc)).toBe('tl[Feita|/]');
    expect(t2.state.doc.firstChild?.child(1).attrs.checked).toBe(false);
  });

  it('bloco vazio não ganha vizinho: a "/" entra nele', () => {
    const vazio = docDe(p('A'), p(), p('B'));
    expect(forma(inserir(vazio, inicioDe(vazio, 'paragraph', '')).state.doc)).toBe('p:A p:/ p:B');
    const itemVazio = docDe(ul(li('Um'), li('')));
    expect(forma(inserir(itemVazio, inicioDe(itemVazio, 'listItem', '')).state.doc)).toBe('ul[Um|/]');
  });

  it('um passo só no desfazer', () => {
    const doc = docDe(p('Alfa'));
    let state = EditorState.create({ doc, plugins: [history()] });
    state = aplicar(state, inserirAbaixo(0)).state;
    expect(forma(state.doc)).toBe('p:Alfa p:/');
    state = aplicar(state, undo).state;
    expect(state.doc.eq(doc)).toBe(true);
  });
});
