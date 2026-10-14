import { describe, expect, it } from 'vitest';
import { getSchema, type JSONContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import type { Node as NoPM } from '@tiptap/pm/model';
import { NodeSelection, Selection, TextSelection } from '@tiptap/pm/state';
import { GapCursor } from '@tiptap/pm/gapcursor';
import { semBlocoSelecionado } from './selecaoInicial';

const schema = getSchema([
  StarterKit.configure({ heading: { levels: [1, 2, 3] }, code: false, codeBlock: false }),
  Image.configure({ inline: false }),
]);

const t = (texto: string): JSONContent => ({ type: 'text', text: texto });
const p = (texto = ''): JSONContent => ({ type: 'paragraph', content: texto ? [t(texto)] : [] });
const li = (texto: string): JSONContent => ({ type: 'listItem', content: [p(texto)] });
const img: JSONContent = { type: 'image', attrs: { src: '/api/notas/n/imagens/i', alt: 'print' } };
const hr: JSONContent = { type: 'horizontalRule' };

function docDe(...blocos: JSONContent[]): NoPM {
  return schema.nodeFromJSON({ type: 'doc', content: blocos });
}

describe('semBlocoSelecionado', () => {
  it('página que começa com imagem: o cursor de lacuna antes dela, não a imagem', () => {
    const doc = docDe(img, { type: 'bulletList', content: [li('Primeiro item')] });
    const inicio = Selection.atStart(doc);
    expect(inicio).toBeInstanceOf(NodeSelection); // o que o ProseMirror faria sozinho
    const sel = semBlocoSelecionado(inicio);
    expect(sel).toBeInstanceOf(GapCursor);
    expect(sel.from).toBe(0);
  });

  it('página que começa com divisor: idem', () => {
    const doc = docDe(hr, p('Texto'));
    const sel = semBlocoSelecionado(Selection.atStart(doc));
    expect(sel).toBeInstanceOf(GapCursor);
    expect(sel.from).toBe(0);
  });

  it('imagem no começo de uma citação: a lacuna fica dentro da citação, antes da imagem', () => {
    const doc = docDe({ type: 'blockquote', content: [img, p('Legenda')] });
    const inicio = Selection.atStart(doc);
    expect(inicio).toBeInstanceOf(NodeSelection);
    const sel = semBlocoSelecionado(inicio);
    expect(sel).toBeInstanceOf(GapCursor);
    expect(sel.from).toBe(1);
  });

  it('seleção de texto e cursor comum passam como estão', () => {
    const doc = docDe(p('Olá'), img);
    const cursor = Selection.atStart(doc);
    expect(cursor).toBeInstanceOf(TextSelection);
    expect(semBlocoSelecionado(cursor)).toBe(cursor);
    const trecho = TextSelection.create(doc, 1, 3);
    expect(semBlocoSelecionado(trecho)).toBe(trecho);
  });

  it('imagem selecionada no meio do texto: a lacuna não vale entre dois parágrafos, e o cursor vai para o texto seguinte', () => {
    const doc = docDe(p('Antes'), img, p('Depois'));
    const posImg = doc.child(0).nodeSize;
    const sel = semBlocoSelecionado(NodeSelection.create(doc, posImg));
    expect(sel).toBeInstanceOf(TextSelection);
    expect(doc.textBetween(sel.from, sel.from + 6)).toBe('Depois');
  });
});
