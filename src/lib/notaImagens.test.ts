import { describe, it, expect } from 'vitest';
import {
  ehSrcDaNota, ehUuid, imagemIdDoSrc, imagensCitadas, imagensDoDoc, lerDoc, notaImagemUrl, profundidadeDoDoc,
} from './notaImagens';

const NOTA = '3b8a5924-3580-40b6-b02d-c8fec9f80cb5';
const OUTRA = '11111111-2222-4333-8444-555555555555';
const IMG = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const IMG2 = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

describe('src da imagem de uma página', () => {
  it('aceita só o caminho relativo da própria página', () => {
    expect(ehSrcDaNota(notaImagemUrl(NOTA, IMG), NOTA)).toBe(true);
    expect(imagemIdDoSrc(notaImagemUrl(NOTA, IMG.toUpperCase()), NOTA)).toBe(IMG);
  });

  it('recusa imagem de fora, embutida, temporária, de outra página ou com extensão', () => {
    expect(ehSrcDaNota('https://exemplo.com/print.png', NOTA)).toBe(false);
    expect(ehSrcDaNota('data:image/png;base64,iVBORw0KGgo=', NOTA)).toBe(false);
    expect(ehSrcDaNota('blob:http://localhost/abc', NOTA)).toBe(false);
    expect(ehSrcDaNota(notaImagemUrl(OUTRA, IMG), NOTA)).toBe(false);
    expect(ehSrcDaNota(notaImagemUrl(NOTA, IMG) + '.png', NOTA)).toBe(false);
    expect(ehSrcDaNota('http://app' + notaImagemUrl(NOTA, IMG), NOTA)).toBe(false);
    expect(ehSrcDaNota(undefined, NOTA)).toBe(false);
  });

  it('reconhece uuid', () => {
    expect(ehUuid(NOTA)).toBe(true);
    expect(ehUuid('x')).toBe(false);
    expect(ehUuid(42)).toBe(false);
  });
});

describe('lerDoc', () => {
  it('lê o documento do editor e recusa o resto', () => {
    expect(lerDoc('{"type":"doc","content":[]}')).toEqual({ type: 'doc', content: [] });
    expect(lerDoc('')).toBeNull();
    expect(lerDoc('  ')).toBeNull();
    expect(lerDoc('{"type":"paragraph"}')).toBeNull();
    expect(lerDoc('[1,2]')).toBeNull();
    expect(lerDoc('não é json')).toBeNull();
    expect(lerDoc(null)).toBeNull();
  });
});

describe('imagens do documento', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Pysha' }] },
      { type: 'image', attrs: { src: notaImagemUrl(NOTA, IMG), alt: 'print.png' } },
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [{ type: 'image', attrs: { src: notaImagemUrl(NOTA, IMG2), alt: 'b' } }] }],
      },
      { type: 'image', attrs: { src: 'https://fora/x.png' } },
    ],
  };

  it('segue a ordem do documento, inclusive dentro de listas', () => {
    expect(imagensDoDoc(doc).map(i => i.alt)).toEqual(['print.png', 'b', undefined]);
    expect(imagensDoDoc(null)).toEqual([]);
  });

  it('cita só as imagens desta página', () => {
    expect([...imagensCitadas(doc, NOTA)]).toEqual([IMG, IMG2]);
    expect(imagensCitadas(doc, OUTRA).size).toBe(0);
  });

  it('percorre documento muito aninhado sem estourar a pilha', () => {
    let no: Record<string, unknown> = { type: 'image', attrs: { src: notaImagemUrl(NOTA, IMG) } };
    for (let i = 0; i < 50_000; i++) no = { type: 'bulletList', content: [no] };
    expect(imagensDoDoc({ type: 'doc', content: [no] })).toHaveLength(1);
  });

  it('mede a profundidade sem recursão', () => {
    expect(profundidadeDoDoc(null)).toBe(0);
    expect(profundidadeDoDoc({ type: 'doc', content: [] })).toBe(1);
    expect(profundidadeDoDoc(doc)).toBe(4);
    let no: Record<string, unknown> = { type: 'paragraph' };
    for (let i = 0; i < 50_000; i++) no = { type: 'blockquote', content: [no] };
    expect(profundidadeDoDoc({ type: 'doc', content: [no] })).toBe(50_002);
  });
});
