import { describe, it, expect } from 'vitest';
import type { AcaoRisco, Pessoa } from '../types';
import {
  chaveDoNome, paraLinhas, linhasDeLegado, linhaVazia, diffPlano,
  resumoDoPlano, linhaAtrasada, salvarPlano,
  type ApiPlano, type LinhaPlano,
} from './planoDeAcao';

function pessoa(id: string, nome: string): Pessoa {
  return {
    id, nome, papel: '', area: '', dias_projeto_mes: null, ativo: true,
    version: 1, updated_at: '2026-01-01T00:00:00Z',
  };
}

function acao(over: Partial<AcaoRisco> & { id: string }): AcaoRisco {
  return {
    risco_id: 'r1', iniciativa_id: null, descricao: '', dono_id: null,
    prazo: null, indicador_sucesso: '', status: 'aberta', triagem: 'acao',
    version: 1, updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function linha(over: Partial<LinhaPlano> & { id: string }): LinhaPlano {
  return {
    nova: false, descricao: '', dono: '', prazo: '', status: 'aberta',
    iniciativa_id: null,
    ...over,
  };
}

describe('chaveDoNome', () => {
  it('ignora acento, caixa e espaço repetido', () => {
    expect(chaveDoNome('JOÃO  FERNANDO ')).toBe('joao fernando');
    expect(chaveDoNome('joao fernando')).toBe(chaveDoNome('JOÃO FERNANDO'));
  });

  it('não junta nomes que são de fato diferentes', () => {
    expect(chaveDoNome('João')).not.toBe(chaveDoNome('Joana'));
  });
});

describe('paraLinhas', () => {
  it('resolve o nome do dono a partir de pessoas', () => {
    const linhas = paraLinhas(
      [acao({ id: 'a1', descricao: 'Revisar', dono_id: 'p1', prazo: '2026-05-10' })],
      [pessoa('p1', 'KAUAN')],
    );
    expect(linhas[0]).toMatchObject({
      id: 'a1', nova: false, descricao: 'Revisar', dono: 'KAUAN', prazo: '2026-05-10',
    });
  });

  it('deixa o dono vazio quando a pessoa não existe mais', () => {
    const linhas = paraLinhas([acao({ id: 'a1', dono_id: 'sumiu' })], []);
    expect(linhas[0].dono).toBe('');
  });

  it('normaliza prazo nulo para string vazia, que é o que o input de data aceita', () => {
    const linhas = paraLinhas([acao({ id: 'a1', prazo: null })], []);
    expect(linhas[0].prazo).toBe('');
  });

  it('preserva o vínculo com a iniciativa', () => {
    const linhas = paraLinhas([acao({ id: 'a1', iniciativa_id: 'i9' })], []);
    expect(linhas[0].iniciativa_id).toBe('i9');
  });
});

describe('linhasDeLegado', () => {
  const base = { acoes: '', acoes_itens: undefined, responsavel: '', status: '' };

  it('converte o plano estruturado antigo, tudo marcado como novo', () => {
    const linhas = linhasDeLegado({
      ...base,
      acoes_itens: [
        { id: 'x', descricao: 'Mapear causas', responsavel: 'JOEL', prazo: '2026-04-01', status: 'Em andamento' },
      ],
    });
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      nova: true, descricao: 'Mapear causas', dono: 'JOEL',
      prazo: '2026-04-01', status: 'em_andamento',
    });
  });

  it('converte o texto livre de registros antigos numa linha só', () => {
    const linhas = linhasDeLegado({
      ...base, acoes: 'Revisar parâmetros', responsavel: 'KAUAN', status: 'CONCLUÍDO',
    });
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ descricao: 'Revisar parâmetros', status: 'concluida' });
  });

  it('devolve lista vazia quando não há plano nenhum', () => {
    expect(linhasDeLegado(base)).toEqual([]);
  });
});

describe('diffPlano', () => {
  it('não vê mudança quando nada foi tocado', () => {
    const base = [linha({ id: 'a1', descricao: 'Revisar' })];
    const d = diffPlano(base, base);
    expect(d).toEqual({ criar: [], atualizar: [], remover: [] });
  });

  it('detecta criação, atualização e remoção na mesma passada', () => {
    const base = [
      linha({ id: 'a1', descricao: 'Fica igual' }),
      linha({ id: 'a2', descricao: 'Vai mudar' }),
      linha({ id: 'a3', descricao: 'Vai sair' }),
    ];
    const atual = [
      base[0],
      { ...base[1], descricao: 'Mudou' },
      linha({ id: 'novo', nova: true, descricao: 'Entrou agora' }),
    ];
    const d = diffPlano(base, atual);
    expect(d.criar.map(l => l.descricao)).toEqual(['Entrou agora']);
    expect(d.atualizar.map(l => l.id)).toEqual(['a2']);
    expect(d.remover.map(l => l.id)).toEqual(['a3']);
  });

  it('descarta linha nova em branco em vez de criar lixo', () => {
    const d = diffPlano([], [linhaVazia(), linha({ id: 'n', nova: true, descricao: '   ' })]);
    expect(d.criar).toEqual([]);
  });

  it('vê mudança de dono, prazo e status, não só de descrição', () => {
    const base = [linha({ id: 'a1', descricao: 'X', dono: 'A', prazo: '2026-01-01', status: 'aberta' })];
    expect(diffPlano(base, [{ ...base[0], dono: 'B' }]).atualizar).toHaveLength(1);
    expect(diffPlano(base, [{ ...base[0], prazo: '2026-02-01' }]).atualizar).toHaveLength(1);
    expect(diffPlano(base, [{ ...base[0], status: 'concluida' }]).atualizar).toHaveLength(1);
  });
});

describe('resumoDoPlano', () => {
  it('junta as descrições com o separador que a tabela já lia', () => {
    const linhas = [linha({ id: '1', descricao: 'Um' }), linha({ id: '2', descricao: 'Dois' })];
    expect(resumoDoPlano(linhas)).toBe('Um · Dois');
  });

  it('deixa a cancelada de fora — plano abandonado não conta como plano', () => {
    const linhas = [
      linha({ id: '1', descricao: 'Viva' }),
      linha({ id: '2', descricao: 'Abandonada', status: 'cancelada' }),
    ];
    expect(resumoDoPlano(linhas)).toBe('Viva');
  });

  it('ignora descrição em branco', () => {
    expect(resumoDoPlano([linha({ id: '1', descricao: '  ' })])).toBe('');
  });
});

describe('linhaAtrasada', () => {
  const hoje = new Date(2026, 5, 15); // 15/06/2026, hora local

  it('acusa prazo vencido em ação viva', () => {
    expect(linhaAtrasada(linha({ id: '1', prazo: '2026-06-14' }), hoje)).toBe(true);
  });

  it('vencer hoje não é atraso', () => {
    expect(linhaAtrasada(linha({ id: '1', prazo: '2026-06-15' }), hoje)).toBe(false);
  });

  it('concluída e cancelada não atrasam', () => {
    expect(linhaAtrasada(linha({ id: '1', prazo: '2026-01-01', status: 'concluida' }), hoje)).toBe(false);
    expect(linhaAtrasada(linha({ id: '1', prazo: '2026-01-01', status: 'cancelada' }), hoje)).toBe(false);
  });

  it('sem prazo não atrasa', () => {
    expect(linhaAtrasada(linha({ id: '1', prazo: '' }), hoje)).toBe(false);
  });
});

/** Api falsa que registra o que foi chamado e pode ser instruída a falhar. */
function fakeApi(falhas: Partial<Record<keyof ApiPlano, boolean>> = {}) {
  const chamadas = { criarPessoa: [] as string[], criarAcao: [] as Record<string, unknown>[], atualizarAcao: [] as [string, Record<string, unknown>][], removerAcao: [] as string[] };
  let seq = 0;
  const api: ApiPlano = {
    criarPessoa: async nome => {
      if (falhas.criarPessoa) throw new Error('falhou');
      chamadas.criarPessoa.push(nome);
      return pessoa(`p-nova-${++seq}`, nome);
    },
    criarAcao: async dados => {
      if (falhas.criarAcao) throw new Error('falhou');
      chamadas.criarAcao.push(dados);
      return acao({ id: `a-nova-${++seq}`, version: 1 });
    },
    atualizarAcao: async (id, patch) => {
      if (falhas.atualizarAcao) throw new Error('falhou');
      chamadas.atualizarAcao.push([id, patch]);
      return acao({ id, version: 2 });
    },
    removerAcao: async id => {
      if (falhas.removerAcao) throw new Error('falhou');
      chamadas.removerAcao.push(id);
    },
  };
  return { api, chamadas };
}

describe('salvarPlano', () => {
  it('cria, atualiza e remove conforme o diff, e devolve o resumo do que ficou', async () => {
    const { api, chamadas } = fakeApi();
    const base = [
      linha({ id: 'a1', descricao: 'Fica' }),
      linha({ id: 'a2', descricao: 'Muda' }),
      linha({ id: 'a3', descricao: 'Sai' }),
    ];
    const atual = [
      base[0],
      { ...base[1], descricao: 'Mudou' },
      linha({ id: 'tmp', nova: true, descricao: 'Nova' }),
    ];

    const r = await salvarPlano({ riscoId: 'r1', base, atual, pessoas: [], api });

    expect(r).toMatchObject({ criadas: 1, atualizadas: 1, removidas: 1, erros: [] });
    expect(chamadas.removerAcao).toEqual(['a3']);
    expect(r.resumo).toBe('Fica · Mudou · Nova');
    // A ordem da tela é preservada, e a linha nova ganhou o id do banco.
    expect(r.linhas.map(l => l.descricao)).toEqual(['Fica', 'Mudou', 'Nova']);
    expect(r.linhas[2].id).toMatch(/^a-nova-/);
    expect(r.linhas[2].nova).toBe(false);
  });

  it('liga o dono a uma pessoa existente, mesmo com acento e caixa diferentes', async () => {
    const { api, chamadas } = fakeApi();
    const atual = [linha({ id: 'n', nova: true, descricao: 'X', dono: 'joao fernando' })];

    const r = await salvarPlano({
      riscoId: 'r1', base: [], atual, pessoas: [pessoa('p1', 'JOÃO FERNANDO')], api,
    });

    expect(chamadas.criarPessoa).toEqual([]);
    expect(r.pessoasCriadas).toEqual([]);
    expect(chamadas.criarAcao[0].dono_id).toBe('p1');
  });

  it('cadastra o dono novo uma vez só, mesmo aparecendo em duas linhas', async () => {
    const { api, chamadas } = fakeApi();
    const atual = [
      linha({ id: 'n1', nova: true, descricao: 'A', dono: 'MARIA' }),
      linha({ id: 'n2', nova: true, descricao: 'B', dono: 'maria' }),
    ];

    const r = await salvarPlano({ riscoId: 'r1', base: [], atual, pessoas: [], api });

    expect(chamadas.criarPessoa).toEqual(['MARIA']);
    expect(r.pessoasCriadas).toEqual(['MARIA']);
    expect(chamadas.criarAcao[0].dono_id).toBe(chamadas.criarAcao[1].dono_id);
  });

  it('grava a ação sem dono quando o cadastro da pessoa falha, em vez de perder a linha', async () => {
    const { api, chamadas } = fakeApi({ criarPessoa: true });
    const atual = [linha({ id: 'n', nova: true, descricao: 'X', dono: 'MARIA' })];

    const r = await salvarPlano({ riscoId: 'r1', base: [], atual, pessoas: [], api });

    expect(r.criadas).toBe(1);
    expect(chamadas.criarAcao[0].dono_id).toBeNull();
    expect(r.erros).toHaveLength(1);
  });

  it('o resumo reflete o banco, não a tela, quando uma criação falha', async () => {
    const { api } = fakeApi({ criarAcao: true });
    const base = [linha({ id: 'a1', descricao: 'Existe' })];
    const atual = [base[0], linha({ id: 'n', nova: true, descricao: 'Não vai entrar' })];

    const r = await salvarPlano({ riscoId: 'r1', base, atual, pessoas: [], api });

    expect(r.criadas).toBe(0);
    expect(r.resumo).toBe('Existe');
    expect(r.erros).toHaveLength(1);
  });

  it('mantém o valor do banco quando a atualização falha', async () => {
    const { api } = fakeApi({ atualizarAcao: true });
    const base = [linha({ id: 'a1', descricao: 'Original' })];
    const atual = [{ ...base[0], descricao: 'Tentativa' }];

    const r = await salvarPlano({ riscoId: 'r1', base, atual, pessoas: [], api });

    expect(r.atualizadas).toBe(0);
    expect(r.resumo).toBe('Original');
  });

  it('linha que falhou ao ser removida continua no resumo', async () => {
    const { api } = fakeApi({ removerAcao: true });
    const base = [linha({ id: 'a1', descricao: 'Teimosa' })];

    const r = await salvarPlano({ riscoId: 'r1', base, atual: [], pessoas: [], api });

    expect(r.removidas).toBe(0);
    expect(r.resumo).toBe('Teimosa');
    expect(r.erros).toHaveLength(1);
  });

  it('a ação criada nasce classificada, para não voltar para a fila da triagem', async () => {
    const { api, chamadas } = fakeApi();
    const atual = [linha({ id: 'n', nova: true, descricao: 'X' })];

    await salvarPlano({ riscoId: 'r1', base: [], atual, pessoas: [], api });

    expect(chamadas.criarAcao[0]).toMatchObject({ triagem: 'acao', risco_id: 'r1', iniciativa_id: null });
  });

  it('não chama a api quando nada mudou', async () => {
    const { api, chamadas } = fakeApi();
    const base = [linha({ id: 'a1', descricao: 'Igual' })];

    const r = await salvarPlano({ riscoId: 'r1', base, atual: base, pessoas: [], api });

    expect(chamadas).toEqual({ criarPessoa: [], criarAcao: [], atualizarAcao: [], removerAcao: [] });
    expect(r.resumo).toBe('Igual');
  });
});
