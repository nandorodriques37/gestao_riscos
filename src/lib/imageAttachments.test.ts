import { describe, it, expect } from 'vitest';
import {
  base64Bytes, comExtensaoDe, formatBytes, isImageFile, scaledSize, MAX_IMAGE_DIMENSION,
  ACCEPT_IMAGE_MIMES, ACCEPT_IMAGEM_NOTA, MAX_IMAGE_DIMENSION_NOTA, QUALIDADE_NOTA,
  ImagemRecusadaError, arquivoDeDataUrl, listaDeFormatos, prepareAttachment,
} from './imageAttachments';

// Só a lógica pura: o preparo em si depende de canvas e FileReader, que não
// existem no ambiente de teste — o que precisa estar certo aqui é a conta.

describe('base64Bytes', () => {
  it('devolve o tamanho do binário, descontando o padding', () => {
    expect(base64Bytes('')).toBe(0);
    expect(base64Bytes('QUJD')).toBe(3);
    expect(base64Bytes('QUJDRA==')).toBe(4);
    expect(base64Bytes('QUJDREU=')).toBe(5);
  });
});

describe('scaledSize', () => {
  it('não amplia imagem menor que o teto', () => {
    expect(scaledSize(800, 600, MAX_IMAGE_DIMENSION)).toEqual({ width: 800, height: 600 });
  });

  it('reduz pelo maior lado, mantendo a proporção', () => {
    expect(scaledSize(4000, 2000, 1600)).toEqual({ width: 1600, height: 800 });
    expect(scaledSize(2000, 4000, 1600)).toEqual({ width: 800, height: 1600 });
  });

  it('nunca chega a zero num lado muito estreito', () => {
    expect(scaledSize(6000, 1, 1600).height).toBe(1);
  });

  it('aguenta dimensão inválida sem dividir por zero', () => {
    expect(scaledSize(0, 0, 1600)).toEqual({ width: 0, height: 0 });
  });
});

describe('isImageFile', () => {
  it('aceita os formatos suportados e recusa o resto', () => {
    expect(isImageFile({ type: 'image/png' })).toBe(true);
    expect(isImageFile({ type: 'IMAGE/JPEG' })).toBe(true);
    expect(isImageFile({ type: 'image/svg+xml' })).toBe(false);
    expect(isImageFile({ type: 'application/pdf' })).toBe(false);
    expect(isImageFile({ type: '' })).toBe(false);
  });
});

describe('formatBytes', () => {
  it('usa a unidade legível e a vírgula decimal do português', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1_572_864)).toBe('1,5 MB');
  });
});

describe('comExtensaoDe', () => {
  it('troca a extensão pela do formato realmente enviado', () => {
    expect(comExtensaoDe('foto.png', 'image/webp')).toBe('foto.webp');
    expect(comExtensaoDe('foto.HEIC', 'image/jpeg')).toBe('foto.jpg');
    expect(comExtensaoDe('sem-extensao', 'image/webp')).toBe('sem-extensao.webp');
  });
});

describe('imagens de página (aba Anotações)', () => {
  it('constantes da nota: 2400px, qualidade 0,9 e sem AVIF', () => {
    expect(MAX_IMAGE_DIMENSION_NOTA).toBe(2400);
    expect(QUALIDADE_NOTA).toBe(0.9);
    expect(ACCEPT_IMAGEM_NOTA).toBe('image/png,image/jpeg,image/webp,image/gif');
  });

  it('o teto da nota reduz um print 4K pelo maior lado', () => {
    expect(scaledSize(3840, 2160, MAX_IMAGE_DIMENSION_NOTA)).toEqual({ width: 2400, height: 1350 });
  });

  it('isImageFile segue a lista recebida; sem lista, a das tarefas', () => {
    expect(isImageFile({ type: 'image/avif' })).toBe(true);
    expect(isImageFile({ type: 'image/avif' }, ACCEPT_IMAGEM_NOTA)).toBe(false);
    expect(isImageFile({ type: 'image/gif' }, ACCEPT_IMAGEM_NOTA)).toBe(true);
    expect(isImageFile({ type: 'image/svg+xml' }, ACCEPT_IMAGEM_NOTA)).toBe(false);
  });

  it('serve direto de filtro: o índice do .filter não vira lista', () => {
    const arquivos = [{ type: 'image/avif' }, { type: 'application/pdf' }, { type: 'image/png' }];
    expect(arquivos.filter(isImageFile)).toEqual([{ type: 'image/avif' }, { type: 'image/png' }]);
  });

  it('a mensagem de formato sai da lista, sem citar o que a lista não tem', async () => {
    expect(listaDeFormatos(ACCEPT_IMAGEM_NOTA)).toBe('PNG, JPG, WebP ou GIF');
    expect(listaDeFormatos(ACCEPT_IMAGE_MIMES)).toBe('PNG, JPG, WebP, GIF ou AVIF');
    const heic = new File([new Uint8Array([1, 2, 3])], 'IMG_2048.heic', { type: 'image/heic' });
    const erro = await prepareAttachment(heic, { aceitos: ACCEPT_IMAGEM_NOTA }).catch(e => e);
    expect(erro).toBeInstanceOf(ImagemRecusadaError);
    expect(erro.motivo).toBe('formato');
    expect(erro.message).toBe('Formato não aceito. Use PNG, JPG, WebP ou GIF.');
    const avif = new File([new Uint8Array([1])], 'foto.avif', { type: 'image/avif' });
    expect((await prepareAttachment(avif, { aceitos: ACCEPT_IMAGEM_NOTA }).catch(e => e)).message).not.toMatch(/AVIF|anexar/);
  });
});

describe('arquivoDeDataUrl', () => {
  it('decodifica base64 com o MIME do próprio dado', async () => {
    const f = arquivoDeDataUrl('data:image/png;base64,QUJD', 'colada.png');
    expect(f.name).toBe('colada.png');
    expect(f.type).toBe('image/png');
    expect(new Uint8Array(await f.arrayBuffer())).toEqual(new Uint8Array([65, 66, 67]));
  });

  it('aceita dado percent-encoded (sem base64)', async () => {
    const f = arquivoDeDataUrl('data:text/plain,ol%C3%A1', 'x.txt');
    expect(await f.text()).toBe('olá');
  });

  it('recusa o que não é data URL ou não decodifica', () => {
    expect(() => arquivoDeDataUrl('https://exemplo.com/a.png', 'a.png')).toThrow(ImagemRecusadaError);
    expect(() => arquivoDeDataUrl('data:image/png;base64,@@@', 'a.png')).toThrow(ImagemRecusadaError);
  });
});
