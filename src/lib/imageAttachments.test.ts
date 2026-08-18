import { describe, it, expect } from 'vitest';
import {
  base64Bytes, comExtensaoDe, formatBytes, isImageFile, scaledSize, MAX_IMAGE_DIMENSION,
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
