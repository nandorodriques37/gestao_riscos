// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import type { Pessoa, StoredTask } from '../../types';
import { buildTaskRows } from '../../lib/taskRows';
import { SEM_DONO, opcoesDeDono } from '../../lib/agrupamentoDono';
import { TarefasKanban } from './TarefasKanban';

beforeAll(() => {
  // O quadro mede a própria posição; jsdom não tem ResizeObserver.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
});
afterEach(cleanup);

function tarefa(p: Partial<StoredTask>): StoredTask {
  return {
    id: 't', tipo: '', tarefa: 'Tarefa', detalhes: '',
    g: null, u: null, t: null, status: 'A fazer', responsavel: '', obs: '',
    prazo: null, dono_id: null, risco_id: null, iniciativa_id: null,
    triagem: '', indicador_sucesso: '', version: 1, anexos: [],
    ...p,
  };
}

const PESSOAS = [
  { id: 'p1', nome: 'João Fernando', ativo: true },
  { id: 'p2', nome: 'Hugo Braga', ativo: true },
  { id: 'p3', nome: 'Derylson', ativo: true },
] as unknown as Pessoa[];

const ROWS = buildTaskRows([
  tarefa({ id: 'a', tarefa: 'Plano de excessos', dono_id: 'p1' }),
  tarefa({ id: 'b', tarefa: 'Calendarização', dono_id: 'p2', prazo: '2026-01-01' }),
  tarefa({ id: 'c', tarefa: 'Ruptura CD10', dono_id: null }),
], { riscos: [], iniciativas: [], pessoas: PESSOAS, hoje: '2026-11-23' });

function montar() {
  const onMove = vi.fn();
  const onStatus = vi.fn();
  render(
    <TarefasKanban
      rows={ROWS}
      groupBy="responsavel"
      onMove={onMove}
      onOpen={() => {}}
      onToggleConcluida={() => {}}
      onAdd={() => {}}
      onDraggingChange={() => {}}
      pessoas={PESSOAS}
      opcoesDono={opcoesDeDono(ROWS, PESSOAS)}
      onStatus={onStatus}
    />,
  );
  return { onMove, onStatus };
}

const colunas = () => screen.getAllByRole('region').map(r => r.getAttribute('aria-label'));

it('uma coluna por pessoa com tarefa, atrasadas primeiro e "Sem dono" no fim', () => {
  montar();
  expect(colunas()).toEqual([
    'Hugo Braga: 1 tarefa',
    'João Fernando: 1 tarefa',
    'Sem dono: 1 tarefa',
  ]);
  expect(screen.getByText('1 atrasada')).toBeTruthy();
});

it('o menu ⋯ passa para qualquer pessoa do cadastro, inclusive quem não tem coluna', () => {
  const { onMove } = montar();
  fireEvent.click(screen.getByRole('button', { name: 'Mover tarefa: Plano de excessos' }));
  const menu = screen.getByRole('menu', { name: 'Passar para' });
  // Derylson não tem tarefa e por isso não tem coluna — mas recebe pelo menu.
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Derylson' }));
  expect(onMove).toHaveBeenCalledWith(0, 'p3');
});

it('a pessoa de agora fica desabilitada no menu, e "Sem dono" é destino', () => {
  const { onMove } = montar();
  fireEvent.click(screen.getByRole('button', { name: 'Mover tarefa: Plano de excessos' }));
  const menu = screen.getByRole('menu');
  expect((within(menu).getByRole('menuitem', { name: 'João Fernando' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Sem dono' }));
  expect(onMove).toHaveBeenCalledWith(0, SEM_DONO);
});

it('o status muda pelo menu, já que o arraste agora troca o dono', () => {
  const { onStatus, onMove } = montar();
  fireEvent.click(screen.getByRole('button', { name: 'Mover tarefa: Calendarização' }));
  const menu = screen.getByRole('menu');
  expect(within(menu).getByText('Mudar status')).toBeTruthy();
  expect((within(menu).getByRole('menuitem', { name: 'A fazer' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Em andamento' }));
  expect(onStatus).toHaveBeenCalledWith(1, 'Em andamento');
  expect(onMove).not.toHaveBeenCalled();
});
