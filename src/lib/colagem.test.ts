// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  avisoImagensDaWeb,
  escolherColagem,
  imagensDoHtmlColado,
  srcRelativo,
  textoDoHtml,
} from './colagem';

const NOTA = '11111111-1111-4111-8111-111111111111';
const OUTRA = '22222222-2222-4222-8222-222222222222';
const IMG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const IMG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ORIGEM = 'https://riscos.exemplo.com';
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('textoDoHtml', () => {
  it('ignora estilo, comentário e espaço do HTML do Excel', () => {
    const html = '<html><head><style>td { color: red }</style></head><body><!--StartFragment--><img src="x.png">&nbsp;<!--EndFragment--></body></html>';
    expect(textoDoHtml(html)).toBe('');
  });

  it('devolve o texto visível com espaços colapsados', () => {
    expect(textoDoHtml('<table><tr><td>Caixas</td>\n<td>Depósito 2</td></tr></table>')).toBe('Caixas Depósito 2');
  });
});

describe('escolherColagem', () => {
  it('sem arquivo é sempre conteúdo', () => {
    expect(escolherColagem({ arquivos: [], html: '' })).toBe('conteudo');
    expect(escolherColagem({ arquivos: [], html: '<img src="https://x/y.png">' })).toBe('conteudo');
  });

  it('print de tela (arquivo sem HTML) sobe como imagem', () => {
    expect(escolherColagem({ arquivos: ['image/png'], html: '' })).toBe('arquivos');
  });

  it('"Copiar imagem" do navegador (arquivo + HTML só com a <img>) sobe como imagem', () => {
    expect(escolherColagem({ arquivos: ['image/png'], html: '<meta charset="utf-8"><img src="https://site/foto.png" alt="foto">' })).toBe('arquivos');
  });

  it('Excel e Word (HTML COM texto + um PNG junto) colam o texto', () => {
    const excel = '<html><head><style>.xl65 { mso-number-format: General }</style></head><body><table><tr><td class="xl65">Fornecedor</td><td>Dias</td></tr></table></body></html>';
    expect(escolherColagem({ arquivos: ['image/png'], html: excel })).toBe('conteudo');
  });

  it('arquivo que não é imagem também é arquivo: vira bloco recusado, não some', () => {
    expect(escolherColagem({ arquivos: ['application/pdf'], html: '' })).toBe('arquivos');
  });
});

describe('srcRelativo', () => {
  it('tira a origem quando é a mesma da aba', () => {
    expect(srcRelativo(`${ORIGEM}/api/notas/${NOTA}/imagens/${IMG_A}`, ORIGEM)).toBe(`/api/notas/${NOTA}/imagens/${IMG_A}`);
  });

  it('mantém endereço de outra origem e o relativo como estão', () => {
    expect(srcRelativo('https://outro.site/a.png', ORIGEM)).toBe('https://outro.site/a.png');
    expect(srcRelativo(`/api/notas/${NOTA}/imagens/${IMG_A}`, ORIGEM)).toBe(`/api/notas/${NOTA}/imagens/${IMG_A}`);
    expect(srcRelativo(null, ORIGEM)).toBe('');
  });
});

describe('imagensDoHtmlColado', () => {
  it('separa embutida, de outra página e da web; a desta página não entra em nenhuma', () => {
    const html = [
      '<p>Texto</p>',
      `<img src="${PNG_1PX}" alt="print">`,
      `<img src="/api/notas/${OUTRA}/imagens/${IMG_B}" alt="grafico.webp">`,
      `<img src="${ORIGEM}/api/notas/${OUTRA}/imagens/${IMG_A}">`,
      `<img src="/api/notas/${NOTA}/imagens/${IMG_A}" alt="minha">`,
      '<img src="https://cdn.site.com/foto.jpg">',
      '<img src="blob:https://x/123">',
      '<img src="file:///C:/Users/eu/clip_image002.png">',
      '<img alt="sem endereço">',
    ].join('');
    const r = imagensDoHtmlColado(html, NOTA, ORIGEM);
    expect(r.embutidas).toEqual([{ src: PNG_1PX, nome: 'print' }]);
    expect(r.deOutraPagina).toEqual([
      { src: `/api/notas/${OUTRA}/imagens/${IMG_B}`, nome: 'grafico.webp' },
      { src: `/api/notas/${OUTRA}/imagens/${IMG_A}`, nome: '' },
    ]);
    expect(r.daWeb).toBe(3);
  });

  it('HTML vazio não tem imagem', () => {
    expect(imagensDoHtmlColado('', NOTA, ORIGEM)).toEqual({ embutidas: [], deOutraPagina: [], daWeb: 0 });
  });
});

describe('avisoImagensDaWeb', () => {
  it('conta no singular e no plural', () => {
    expect(avisoImagensDaWeb(0)).toBe('');
    expect(avisoImagensDaWeb(1)).toMatch(/^1 imagem da web não foi colada\./);
    expect(avisoImagensDaWeb(3)).toMatch(/^3 imagens da web não foram coladas\./);
  });
});
