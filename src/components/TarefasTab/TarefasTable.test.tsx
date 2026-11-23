// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Pessoa, StoredTask } from '../../types';
import { buildTaskRows } from '../../lib/taskRows';
import { agruparPorDono } from '../../lib/agrupamentoDono';
import { TarefasTable } from './TarefasTable';

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
] as unknown as Pessoa[];

const ROWS = buildTaskRows([
  tarefa({ id: 'a', tarefa: 'Plano de excessos', dono_id: 'p1' }),
  tarefa({ id: 'b', tarefa: 'Calendarização', dono_id: 'p2', prazo: '2026-01-01' }),
  tarefa({ id: 'c', tarefa: 'Ruptura CD10', dono_id: null }),
], { riscos: [], iniciativas: [], pessoas: PESSOAS, hoje: '2026-11-23' });

const nada = () => {};

function Tabela({ agrupada }: { agrupada: boolean }) {
  const [fechados, setFechados] = useState<string[]>([]);
  return (
    <TarefasTable
      rows={ROWS}
      colWidths={{}}
      onColWidthChange={nada}
      sortKey="gut"
      sortDir="desc"
      onSort={nada}
      onOpenEdit={nada}
      onToggleConcluida={nada}
      onDeleteRow={nada}
      density="compact"
      grupos={agrupada ? agruparPorDono(ROWS, PESSOAS) : null}
      fechados={fechados}
      onToggleGrupo={id => setFechados(f => (f.includes(id) ? f.filter(x => x !== id) : [...f, id]))}
    />
  );
}

/** Só a tabela: os cartões do celular também estão no DOM. */
const tabela = () => within(screen.getByRole('table'));

describe('Lista agrupada por responsável', () => {
  it('mostra um cabeçalho por pessoa, atrasadas primeiro e "Sem dono" por último', () => {
    render(<Tabela agrupada />);
    const grupos = tabela().getAllByRole('button', { expanded: true });
    expect(grupos.map(b => b.textContent)).toEqual([
      expect.stringContaining('Hugo Braga'),
      expect.stringContaining('João Fernando'),
      expect.stringContaining('Sem dono'),
    ]);
    expect(grupos[0].textContent).toContain('1 atrasada');
  });

  it('tira a coluna Responsável — o grupo já diz quem é', () => {
    render(<Tabela agrupada />);
    expect(tabela().queryByRole('columnheader', { name: /Responsável/ })).toBeNull();
  });

  it('recolher esconde só as linhas daquele grupo', () => {
    render(<Tabela agrupada />);
    fireEvent.click(tabela().getByRole('button', { name: /Hugo Braga/ }));
    expect(tabela().queryByRole('button', { name: 'Editar tarefa: Calendarização' })).toBeNull();
    expect(tabela().getByRole('button', { name: 'Editar tarefa: Plano de excessos' })).toBeTruthy();
    expect(tabela().getByRole('button', { name: /Hugo Braga/ }).getAttribute('aria-expanded')).toBe('false');
  });

  it('sem agrupar, é a tabela de sempre, com a coluna Responsável', () => {
    render(<Tabela agrupada={false} />);
    expect(tabela().getByRole('columnheader', { name: /Responsável/ })).toBeTruthy();
    expect(tabela().queryByRole('button', { expanded: true })).toBeNull();
    expect(tabela().getAllByRole('button', { name: /^Editar tarefa/ })).toHaveLength(3);
  });
});
