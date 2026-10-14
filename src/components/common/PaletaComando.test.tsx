// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PaletaComando, type AberturaPorTipo, type ItemPaleta, type TipoItemPaleta } from './PaletaComando';
import { gruposCom } from '../NavRail/secoes';

afterEach(cleanup);

/** Um item por tipo, cada um achável por uma palavra que só ele tem. */
const UM_DE_CADA: Record<TipoItemPaleta, ItemPaleta & { busca: string }> = {
  objetivo: { tipo: 'objetivo', id: 'o1', rotulo: 'Reduzir ruptura nas lojas', busca: 'ruptura' },
  iniciativa: { tipo: 'iniciativa', id: 'i1', rotulo: 'Revisar malha de CDs', busca: 'malha' },
  risco: { tipo: 'risco', id: 'r1', rotulo: 'Falta de embalagem no depósito', busca: 'embalagem' },
  tarefa: { tipo: 'tarefa', id: 't1', rotulo: 'Ligar para a transportadora', busca: 'transportadora' },
  pessoa: { tipo: 'pessoa', id: 'p1', rotulo: 'Camila Simões', busca: 'simoes' },
  nota: { tipo: 'nota', id: 'n1', rotulo: 'Reunião regional', sub: 'Material de apoio da região sul', busca: 'regional' },
};

const destino = () => vi.fn<(id: string) => void>();

function abertura() {
  return {
    objetivo: destino(), iniciativa: destino(), risco: destino(), tarefa: destino(), pessoa: destino(), nota: destino(),
  } satisfies AberturaPorTipo;
}

function montar(itens: ItemPaleta[], abrir = abertura()) {
  const onIrPara = vi.fn();
  const onFechar = vi.fn();
  render(
    <PaletaComando aberta onFechar={onFechar} grupos={gruposCom(true)} itens={itens} onIrPara={onIrPara} abrir={abrir} />,
  );
  const campo = screen.getByRole('combobox', { name: 'Buscar e navegar' });
  const buscar = (texto: string) => fireEvent.change(campo, { target: { value: texto } });
  return { abrir, onIrPara, onFechar, campo, buscar };
}

const PAGINA_TRIAGEM: ItemPaleta = {
  tipo: 'nota', id: 'n-triagem', rotulo: 'Triagem', sub: 'Meus · Revisar com a Ana o painel de vendas',
};

it('lista a página com o tipo escrito, e a página "Triagem" não se confunde com a aba Triagem', () => {
  const { buscar } = montar([PAGINA_TRIAGEM]);
  buscar('triagem');

  const opcoes = screen.getAllByRole('option');
  expect(opcoes).toHaveLength(2);
  const [secao, pagina] = opcoes;

  // A seção vem em "Ir para", sem etiqueta; a página vem no grupo dela, com
  // "Página" escrito no próprio item — o cabeçalho do grupo é só visual.
  expect(secao.textContent).toBe('Triagem');
  expect(within(pagina).getByText('Página')).toBeTruthy();
  expect(within(pagina).getByText('Triagem')).toBeTruthy();
  expect(pagina.textContent).toContain('Revisar com a Ana');
  expect(screen.getByText('Páginas')).toBeTruthy();

  // Nome acessível distinto: um leitor de tela também separa as duas.
  expect(screen.getByRole('option', { name: 'Triagem' })).toBe(secao);
  expect(screen.getByRole('option', { name: /Triagem.*Página/ })).toBe(pagina);

  // Página não é camada da cadeia: sem quadradinho colorido, como Pessoas.
  expect(pagina.hasAttribute('data-camada')).toBe(false);
});

it('acha a página pelo começo do texto, não só pelo título', () => {
  const { buscar } = montar([PAGINA_TRIAGEM]);
  buscar('vendas');
  expect(screen.getAllByRole('option').map(o => o.id)).toEqual(['paleta-nota:n-triagem']);
});

it('escolher a página abre a página pelo id, e não a seção', () => {
  const { abrir, onIrPara, onFechar, buscar } = montar([PAGINA_TRIAGEM]);
  buscar('triagem');

  fireEvent.click(screen.getByRole('option', { name: /Página/ }));

  expect(onFechar).toHaveBeenCalledTimes(1);
  expect(abrir.nota).toHaveBeenCalledTimes(1);
  expect(abrir.nota).toHaveBeenCalledWith('n-triagem');
  expect(onIrPara).not.toHaveBeenCalled();
  expect(abrir.pessoa).not.toHaveBeenCalled();
});

it('escolher a seção Triagem vai para a aba, e não abre a página', () => {
  const { abrir, onIrPara, buscar, campo } = montar([PAGINA_TRIAGEM]);
  buscar('triagem');

  // A seção é a primeira opção: Enter a abre.
  fireEvent.keyDown(campo, { key: 'Enter' });

  expect(onIrPara).toHaveBeenCalledWith('triagem');
  expect(abrir.nota).not.toHaveBeenCalled();
});

it('cada tipo abre pelo seu próprio destino — nenhum cai em Pessoas', () => {
  // `Record<TipoItemPaleta, …>` acima: um tipo novo sem item aqui não compila.
  for (const tipo of Object.keys(UM_DE_CADA) as TipoItemPaleta[]) {
    const { busca, ...item } = UM_DE_CADA[tipo];
    const { abrir, onIrPara, campo, buscar } = montar(Object.values(UM_DE_CADA));
    buscar(busca);

    const opcoes = screen.getAllByRole('option');
    expect(opcoes.map(o => o.id), tipo).toEqual([`paleta-${tipo}:${item.id}`]);
    fireEvent.keyDown(campo, { key: 'Enter' });

    for (const outro of Object.keys(abrir) as TipoItemPaleta[]) {
      if (outro === tipo) expect(abrir[outro], tipo).toHaveBeenCalledWith(item.id);
      else expect(abrir[outro], `${tipo} → ${outro}`).not.toHaveBeenCalled();
    }
    expect(onIrPara).not.toHaveBeenCalled();
    cleanup();
  }
});

it('o mapa de destinos exige um destino para cada tipo', () => {
  const semPagina = {
    objetivo: () => {}, iniciativa: () => {}, risco: () => {}, tarefa: () => {}, pessoa: () => {},
  };
  // @ts-expect-error — falta `nota`: o App não compila esquecendo um tipo.
  const abrir: AberturaPorTipo = semPagina;
  expect(Object.keys(abrir)).not.toContain('nota');
});
