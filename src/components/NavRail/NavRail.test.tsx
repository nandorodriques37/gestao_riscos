// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { NavRail } from './NavRail';

/**
 * O jsdom não tem `matchMedia`. Um MediaQueryList de mentira, controlável: o
 * `NavRail` guarda a consulta na primeira leitura, então todos os testes do
 * arquivo falam com esta mesma instância e trocam só o `matches`.
 */
const ouvintes = new Set<() => void>();
const consulta = {
  matches: false,
  media: '(max-width: 1100px)',
  addEventListener: (_: string, fn: () => void) => { ouvintes.add(fn); },
  removeEventListener: (_: string, fn: () => void) => { ouvintes.delete(fn); },
};

function largura(estreita: boolean) {
  act(() => {
    consulta.matches = estreita;
    ouvintes.forEach(fn => fn());
  });
}

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => consulta),
  });
});

afterEach(() => {
  cleanup();
  consulta.matches = false;
});

function montar(props: { expandido?: boolean; triagemPendente?: number } = {}) {
  const onToggle = vi.fn();
  const onChangeTab = vi.fn();
  const { container } = render(
    <NavRail
      tab="tarefas"
      onChangeTab={onChangeTab}
      expandido={props.expandido ?? true}
      onToggle={onToggle}
      mostrarTriagem
      triagemPendente={props.triagemPendente ?? 3}
    />,
  );
  const rail = container.querySelector('.nav-rail') as HTMLElement;
  const nav = screen.getByRole('navigation', { name: 'Seções' });
  return { rail, nav, onToggle, onChangeTab };
}

it('acima de 1100px obedece à preferência e oferece o botão de recolher', () => {
  const { rail, nav } = montar({ expandido: true });

  expect(rail.dataset.expandido).toBe('true');
  expect(screen.getByRole('button', { name: 'Recolher o menu' })).toBeTruthy();
  // Expandido, o nome vem do rótulo escrito — sem tooltip repetindo o texto.
  const tarefas = within(nav).getByRole('button', { name: 'Tarefas' });
  expect(tarefas.getAttribute('title')).toBeNull();
  expect(tarefas.getAttribute('aria-current')).toBe('page');
});

it('entre 761 e 1100px recolhe à força: só ícones, nome no tooltip e no leitor, sem botão', () => {
  consulta.matches = true;
  const { rail, nav } = montar({ expandido: true });

  expect(rail.dataset.expandido).toBe('false');
  expect(screen.queryByRole('button', { name: /Recolher o menu|Expandir o menu/ })).toBeNull();

  const itens = within(nav).getAllByRole('button');
  // Oito destinos + Triagem, cada um com nome e tooltip iguais ao rótulo.
  expect(itens).toHaveLength(9);
  for (const item of itens) {
    const nome = item.getAttribute('aria-label') ?? '';
    expect(nome).not.toBe('');
    expect(nome.startsWith(item.getAttribute('title') ?? '\u0000')).toBe(true);
  }

  const tarefas = within(nav).getByRole('button', { name: 'Tarefas' });
  expect(tarefas.getAttribute('title')).toBe('Tarefas');
  expect(tarefas.getAttribute('aria-current')).toBe('page');

  // O contador da fila continua na tela (selo) e entra no nome.
  const triagem = within(nav).getByRole('button', { name: 'Triagem, 3 na fila' });
  expect(triagem.querySelector('.rail-item-count')?.textContent).toBe('3');

  // Os grupos continuam nomeados para o leitor, mesmo com o rótulo virando filete.
  expect(within(nav).getAllByRole('group').map(g => g.getAttribute('aria-label')))
    .toEqual(['Direção', 'Risco', 'Execução', 'Migração']);
});

it('cruzar o corte não mexe na preferência: voltando a crescer, o rail reabre', () => {
  const { rail, onToggle } = montar({ expandido: true });
  expect(rail.dataset.expandido).toBe('true');

  largura(true);
  expect(rail.dataset.expandido).toBe('false');
  expect(screen.queryByRole('button', { name: 'Recolher o menu' })).toBeNull();

  largura(false);
  expect(rail.dataset.expandido).toBe('true');
  expect(screen.getByRole('button', { name: 'Recolher o menu' })).toBeTruthy();
  expect(onToggle).not.toHaveBeenCalled();
});

it('recolhido pela pessoa acima de 1100px continua com o botão de expandir', () => {
  const { rail } = montar({ expandido: false });
  expect(rail.dataset.expandido).toBe('false');
  expect(screen.getByRole('button', { name: 'Expandir o menu' })).toBeTruthy();
});
