import { describe, it, expect } from 'vitest';
import type { Pessoa, StoredTask } from '../types';
import { buildTaskRows } from './taskRows';
import { saudeTrabalho } from './portfolioMetrics';
import {
  SEM_DONO, agruparPorDono, alternarDono, filtrarPorDono, grupoDaLinha, opcoesDeDono, pessoaDoAutor,
} from './agrupamentoDono';

function tarefa(p: Partial<StoredTask> = {}): StoredTask {
  return {
    id: 't1', tipo: '', tarefa: 'Fazer algo', detalhes: '',
    g: null, u: null, t: null, status: 'A fazer', responsavel: '', obs: '',
    prazo: null, dono_id: null, risco_id: null, iniciativa_id: null,
    triagem: '', indicador_sucesso: '', version: 1, anexos: [],
    ...p,
  };
}

function pessoa(id: string, nome: string, ativo = true): Pessoa {
  return { id, nome, ativo } as unknown as Pessoa;
}

const HOJE = '2026-11-23';
const PESSOAS = [
  pessoa('p1', 'João Fernando'),
  pessoa('p2', 'Hugo Braga'),
  pessoa('p3', 'Ana Antiga', false),
  pessoa('p4', 'Derylson'),
];

function linhas(tasks: StoredTask[]) {
  return buildTaskRows(tasks, { riscos: [], iniciativas: [], pessoas: PESSOAS, hoje: HOJE });
}

describe('agruparPorDono', () => {
  it('conta abertas, atrasadas, GUT crítico e a divisão por status', () => {
    const [g] = agruparPorDono(linhas([
      tarefa({ id: 'a', dono_id: 'p1', status: 'A fazer', prazo: '2026-01-01', g: 5, u: 5, t: 4 }),
      tarefa({ id: 'b', dono_id: 'p1', status: 'Em andamento', g: 3, u: 3, t: 3 }),
      tarefa({ id: 'c', dono_id: 'p1', status: 'Concluída', prazo: '2026-01-01', g: 5, u: 5, t: 5 }),
      tarefa({ id: 'd', dono_id: 'p1', status: 'Cancelada' }),
    ]), PESSOAS);

    expect(g).toMatchObject({
      id: 'p1', nome: 'João Fernando', semDono: false,
      abertas: 2, atrasadas: 1, criticas: 1, aFazer: 1, emAndamento: 1, concluidas: 1,
    });
    // Concluída e cancelada continuam no grupo: o recorte de status é da tela.
    expect(g.linhas.map(r => r.task.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('ordena por atrasadas, depois GUT crítico, depois nome; "Sem dono" por último', () => {
    const grupos = agruparPorDono(linhas([
      tarefa({ id: 's', dono_id: null, prazo: '2026-01-01' }),
      tarefa({ id: 's2', dono_id: null, prazo: '2026-01-01' }),
      tarefa({ id: 'd', dono_id: 'p4' }),
      tarefa({ id: 'j', dono_id: 'p1', g: 5, u: 5, t: 5 }),
      tarefa({ id: 'h', dono_id: 'p2', prazo: '2026-01-01' }),
    ]), PESSOAS);

    expect(grupos.map(g => g.nome)).toEqual(['Hugo Braga', 'João Fernando', 'Derylson', 'Sem dono']);
  });

  it('"Sem dono" é dono_id nulo — a mesma conta do título da aba', () => {
    const tasks = [
      tarefa({ id: 'a', dono_id: null, responsavel: 'Derylson' }),
      tarefa({ id: 'b', dono_id: null }),
      tarefa({ id: 'c', dono_id: 'p4' }),
    ];
    const grupos = agruparPorDono(linhas(tasks), PESSOAS);
    const sem = grupos.find(g => g.id === SEM_DONO);

    // O texto congelado em `responsavel` não cria um segundo "Derylson".
    expect(grupos.filter(g => g.nome === 'Derylson')).toHaveLength(1);
    expect(sem?.abertas).toBe(saudeTrabalho(tasks, HOJE).semDono);
  });

  it('marca a pessoa inativa que ainda segura trabalho', () => {
    const [g] = agruparPorDono(linhas([tarefa({ dono_id: 'p3' })]), PESSOAS);
    expect(g).toMatchObject({ nome: 'Ana Antiga', inativa: true });
  });

  it('não cria grupo para quem não tem linha', () => {
    expect(agruparPorDono([], PESSOAS)).toEqual([]);
  });
});

describe('opcoesDeDono', () => {
  it('lista ativos e o inativo com tarefa, em ordem alfabética, com "Sem dono" no fim', () => {
    const opcoes = opcoesDeDono(linhas([
      tarefa({ id: 'a', dono_id: 'p3' }),
      tarefa({ id: 'b', dono_id: null }),
      tarefa({ id: 'c', dono_id: 'p1', status: 'Concluída' }),
    ]), PESSOAS);

    expect(opcoes.map(o => [o.nome, o.abertas])).toEqual([
      ['Ana Antiga', 1], ['Derylson', 0], ['Hugo Braga', 0], ['João Fernando', 0], ['Sem dono', 1],
    ]);
  });

  it('deixa o inativo sem tarefa e "Sem dono" de fora quando não há nada deles', () => {
    const nomes = opcoesDeDono(linhas([tarefa({ dono_id: 'p1' })]), PESSOAS).map(o => o.nome);
    expect(nomes).not.toContain('Ana Antiga');
    expect(nomes).not.toContain('Sem dono');
  });
});

describe('filtrarPorDono', () => {
  const rows = linhas([
    tarefa({ id: 'a', dono_id: 'p1' }),
    tarefa({ id: 'b', dono_id: 'p2' }),
    tarefa({ id: 'c', dono_id: null }),
  ]);

  it('lista vazia não recorta', () => {
    expect(filtrarPorDono(rows, [])).toHaveLength(3);
  });

  it('recorta pelas pessoas marcadas, inclusive "Sem dono"', () => {
    expect(filtrarPorDono(rows, ['p1', SEM_DONO]).map(r => r.task.id)).toEqual(['a', 'c']);
  });

  it('grupoDaLinha devolve a ficha ou SEM_DONO', () => {
    expect(rows.map(grupoDaLinha)).toEqual(['p1', 'p2', SEM_DONO]);
  });
});

describe('alternarDono', () => {
  const TODOS = ['p1', 'p2', SEM_DONO];

  it('desmarcar a partir de "todas" vira todas menos ela', () => {
    expect(alternarDono([], 'p2', TODOS)).toEqual(['p1', SEM_DONO]);
  });

  it('marcar a última que faltava volta a lista vazia', () => {
    expect(alternarDono(['p1', SEM_DONO], 'p2', TODOS)).toEqual([]);
  });

  it('marca e desmarca dentro de um recorte parcial', () => {
    expect(alternarDono(['p1'], 'p2', ['p1', 'p2', 'p3'])).toEqual(['p1', 'p2']);
    expect(alternarDono(['p1', 'p2'], 'p1', ['p1', 'p2', 'p3'])).toEqual(['p2']);
  });

  it('descarta id que não existe mais', () => {
    expect(alternarDono(['fantasma', 'p1'], 'p2', ['p1', 'p2', 'p3'])).toEqual(['p1', 'p2']);
  });
});

describe('pessoaDoAutor', () => {
  it('casa o autor com a ficha ignorando acento e caixa', () => {
    expect(pessoaDoAutor('  joao FERNANDO ', PESSOAS)?.id).toBe('p1');
  });

  it('devolve nulo para autor vazio ou sem ficha', () => {
    expect(pessoaDoAutor('', PESSOAS)).toBeNull();
    expect(pessoaDoAutor('Fulano', PESSOAS)).toBeNull();
  });
});
