// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { SEM_DONO, type OpcaoDono } from '../../lib/agrupamentoDono';
import { EtiquetasPessoas, FiltroPessoas } from './FiltroPessoas';

afterEach(cleanup);

const OPCOES: OpcaoDono[] = [
  { id: 'p1', nome: 'Hugo Braga', semDono: false, abertas: 8 },
  { id: 'p2', nome: 'João Fernando', semDono: false, abertas: 9 },
  { id: SEM_DONO, nome: 'Sem dono', semDono: true, abertas: 49 },
];

/** Monta o filtro com estado de verdade e expõe a seleção atual. */
function montar(inicial: string[] = [], autorId: string | null = 'p2') {
  let atual = inicial;
  function Casca() {
    const [sel, setSel] = useState(inicial);
    atual = sel;
    return (
      <>
        <FiltroPessoas opcoes={OPCOES} selecionados={sel} onChange={setSel} autorId={autorId} />
        <EtiquetasPessoas opcoes={OPCOES} selecionados={sel} onChange={setSel} />
      </>
    );
  }
  render(<Casca />);
  return { selecao: () => atual };
}

const gatilho = () => screen.getByRole('button', { name: /pessoas/i });
const abrir = () => fireEvent.click(gatilho());

it('sem recorte diz "Todas as pessoas" e mostra todas marcadas', () => {
  montar();
  expect(gatilho().textContent).toContain('Todas as pessoas');
  abrir();
  const caixas = screen.getAllByRole('checkbox') as HTMLInputElement[];
  expect(caixas).toHaveLength(3);
  expect(caixas.every(c => c.checked)).toBe(true);
});

it('desmarcar uma vira "todas menos ela" e o botão conta o recorte', () => {
  const f = montar();
  abrir();
  fireEvent.click(screen.getByRole('checkbox', { name: /Sem dono/ }));
  expect(f.selecao()).toEqual(['p1', 'p2']);
  expect(gatilho().textContent).toContain('2 de 3');
});

it('"Só as minhas" recorta pela ficha do autor', () => {
  const f = montar();
  abrir();
  fireEvent.click(screen.getByRole('button', { name: 'Só as minhas' }));
  expect(f.selecao()).toEqual(['p2']);
});

it('sem ficha do autor, o atalho não aparece', () => {
  montar([], null);
  abrir();
  expect(screen.queryByRole('button', { name: 'Só as minhas' })).toBeNull();
});

it('"Todas" desfaz o recorte', () => {
  const f = montar(['p1']);
  abrir();
  fireEvent.click(screen.getByRole('button', { name: 'Todas' }));
  expect(f.selecao()).toEqual([]);
});

it('a busca ignora acento e caixa', () => {
  montar();
  abrir();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar pessoa' }), { target: { value: 'joao' } });
  expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  expect(screen.getByText('João Fernando')).toBeTruthy();
});

it('Esc fecha o painel e devolve o foco ao botão', () => {
  montar();
  abrir();
  expect(screen.getByRole('dialog', { name: 'Filtrar por pessoa' })).toBeTruthy();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(gatilho());
});

it('a etiqueta tira a pessoa do recorte sem abrir o painel', () => {
  const f = montar(['p1', 'p2']);
  fireEvent.click(screen.getByRole('button', { name: 'Tirar Hugo Braga do filtro' }));
  expect(f.selecao()).toEqual(['p2']);
});
