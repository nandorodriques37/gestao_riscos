// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ImageLightbox, type ImagemDoVisor } from './ImageLightbox';

afterEach(() => { cleanup(); });

const IMAGENS: ImagemDoVisor[] = [
  { id: 'a', nome: 'print.webp', src: '/api/notas/n/imagens/a', tamanho: 1_258_291 },
  { id: 'b', nome: 'grafico.png', src: '/api/notas/n/imagens/b' },
];

function Abridor() {
  const [aberto, setAberto] = useState<number | null>(null);
  return (
    <>
      <button type="button" onClick={() => setAberto(0)}>Ver imagem</button>
      {aberto != null && (
        <ImageLightbox imagens={IMAGENS} index={aberto} onIndexChange={setAberto} onClose={() => setAberto(null)} />
      )}
    </>
  );
}

it('Baixar aponta para o endereço da imagem, com o nome dela', () => {
  render(<Abridor />);
  fireEvent.click(screen.getByRole('button', { name: 'Ver imagem' }));
  const baixar = screen.getByRole('link', { name: /Baixar/ });
  expect(baixar.getAttribute('href')).toBe('/api/notas/n/imagens/a');
  expect(baixar.getAttribute('download')).toBe('print.webp');
  // Tamanho só quando se sabe; a posição quando há mais de uma.
  expect(screen.getByText('1,2 MB · 1 de 2')).toBeTruthy();
});

it('as setas percorrem as imagens e o tamanho some quando não é conhecido', () => {
  render(<Abridor />);
  fireEvent.click(screen.getByRole('button', { name: 'Ver imagem' }));
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' });
  expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Imagem: grafico.png');
  expect(screen.getByText('2 de 2')).toBeTruthy();
  expect(screen.getByRole('link', { name: /Baixar/ }).getAttribute('href')).toBe('/api/notas/n/imagens/b');
});

it('Esc fecha e devolve o foco a quem abriu', () => {
  render(<Abridor />);
  const abrir = screen.getByRole('button', { name: 'Ver imagem' });
  abrir.focus();
  fireEvent.click(abrir);
  const dialogo = screen.getByRole('dialog');
  expect(document.activeElement).toBe(dialogo);
  fireEvent.keyDown(dialogo, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(abrir);
});
