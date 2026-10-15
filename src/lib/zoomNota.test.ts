// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { ZOOM_PADRAO, gravarZoomNota, lerZoomNota, passoZoom } from './zoomNota';

afterEach(() => localStorage.clear());

describe('zoom de leitura das Anotações', () => {
  it('sem nada gravado, vale o padrão', () => {
    expect(lerZoomNota()).toBe(ZOOM_PADRAO);
  });

  it('lê o degrau gravado', () => {
    gravarZoomNota(130);
    expect(lerZoomNota()).toBe(130);
  });

  it('valor fora dos degraus ou corrompido cai no padrão', () => {
    localStorage.setItem('riskMatrix.notas.zoom.v1', '120');
    expect(lerZoomNota()).toBe(ZOOM_PADRAO);
    localStorage.setItem('riskMatrix.notas.zoom.v1', '{');
    expect(lerZoomNota()).toBe(ZOOM_PADRAO);
  });

  it('o passo para nas pontas', () => {
    expect(passoZoom(100, 1)).toBe(115);
    expect(passoZoom(100, -1)).toBe(90);
    expect(passoZoom(150, 1)).toBe(150);
    expect(passoZoom(90, -1)).toBe(90);
  });
});
