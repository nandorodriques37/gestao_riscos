import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema, createRecord, updateRecordById, listRecords, type Sql } from './_db.js';
import { ensureTasksSchema, createTask } from './_tasksDb.js';
import { ensurePortfolioSchema, pessoas, acoesRisco } from './_portfolioDb.js';
import { migrarAcoes } from './_migracaoAcoes.js';

// A migração é o único ponto da reestruturação que toca dado real do usuário.
// Ela só INSERE — o que estes testes precisam provar acima de tudo é que
// `risk_records` sai exatamente como entrou.
let pg: PGlite;
let sql: Sql;

async function zerar() {
  await sql('delete from acoes_risco');
  await sql('delete from pessoas');
  await sql('delete from risk_records');
  await sql('delete from tasks');
}

beforeAll(async () => {
  pg = new PGlite();
  sql = async (text, params = []) => {
    const result = await pg.query(text, params as unknown[]);
    return result.rows as Record<string, unknown>[];
  };
  await ensureSchema(sql, { semear: true });
  await ensureTasksSchema(sql, { semear: true });
  await ensurePortfolioSchema(sql);
});

afterAll(async () => {
  await pg.close();
});

describe('migrarAcoes — extração', () => {
  beforeAll(zerar);

  it('extrai o plano estruturado, uma linha por item', async () => {
    await zerar();
    await createRecord(sql, {
      risco: 'Ruptura crônica sem diagnóstico',
      responsavel: 'DERYLSON',
      acoes_itens: [
        { id: 'a1', descricao: 'Reformular o Power BI', responsavel: 'DERYLSON', prazo: '2026-03-31', status: 'Em andamento' },
        { id: 'a2', descricao: 'Levar ruptura à pauta semanal', responsavel: 'KAUAN', prazo: '', status: 'A fazer' },
      ],
    });

    const r = await migrarAcoes(sql);
    expect(r.acoesCriadas).toBe(2);
    expect(r.riscosComPlano).toBe(1);

    const acoes = await acoesRisco.list(sql);
    expect(acoes.map(a => a.descricao)).toEqual([
      'Reformular o Power BI',
      'Levar ruptura à pauta semanal',
    ]);
  });

  it('converte o texto livre antigo numa única ação', async () => {
    await zerar();
    await createRecord(sql, {
      risco: 'Registro antigo',
      acoes: 'Criar processo no fluig',
      responsavel: 'JOEL',
      status: 'EM ANDAMENTO',
    });

    const r = await migrarAcoes(sql);
    expect(r.acoesCriadas).toBe(1);

    const [acao] = await acoesRisco.list(sql);
    expect(acao.descricao).toBe('Criar processo no fluig');
    // parseAcoes herda o responsável e o status do registro nesse caminho.
    expect(acao.status).toBe('em_andamento');
  });

  it('traduz os três status do plano antigo', async () => {
    await zerar();
    await createRecord(sql, {
      risco: 'Com todos os status',
      acoes_itens: [
        { id: '1', descricao: 'Pendente', responsavel: '', prazo: '', status: 'A fazer' },
        { id: '2', descricao: 'Andando', responsavel: '', prazo: '', status: 'Em andamento' },
        { id: '3', descricao: 'Pronta', responsavel: '', prazo: '', status: 'Concluída' },
      ],
    });
    await migrarAcoes(sql);
    const porDescricao = new Map((await acoesRisco.list(sql)).map(a => [a.descricao, a.status]));
    expect(porDescricao.get('Pendente')).toBe('aberta');
    expect(porDescricao.get('Andando')).toBe('em_andamento');
    expect(porDescricao.get('Pronta')).toBe('concluida');
  });

  it('preserva o prazo em YYYY-MM-DD e aceita item sem prazo', async () => {
    await zerar();
    await createRecord(sql, {
      risco: 'Com prazo',
      acoes_itens: [
        { id: '1', descricao: 'Com data', responsavel: '', prazo: '2026-08-12', status: 'A fazer' },
        { id: '2', descricao: 'Sem data', responsavel: '', prazo: '', status: 'A fazer' },
      ],
    });
    await migrarAcoes(sql);
    const porDescricao = new Map((await acoesRisco.list(sql)).map(a => [a.descricao, a.prazo]));
    expect(porDescricao.get('Com data')).toBe('2026-08-12');
    expect(porDescricao.get('Sem data')).toBeNull();
  });

  it('ignora risco sem plano e item de descrição vazia', async () => {
    await zerar();
    await createRecord(sql, { risco: 'Sem plano nenhum' });
    await createRecord(sql, {
      risco: 'Com item em branco',
      acoes_itens: [
        { id: '1', descricao: '   ', responsavel: '', prazo: '', status: 'A fazer' },
        { id: '2', descricao: 'Essa vale', responsavel: '', prazo: '', status: 'A fazer' },
      ],
    });
    const r = await migrarAcoes(sql);
    expect(r.riscosVarridos).toBe(2);
    expect(r.riscosComPlano).toBe(1);
    expect(r.acoesCriadas).toBe(1);
  });

  it('toda ação nasce na fila: sem iniciativa e sem triagem', async () => {
    await zerar();
    await createRecord(sql, {
      risco: 'Qualquer',
      acoes_itens: [{ id: '1', descricao: 'Alguma coisa', responsavel: '', prazo: '', status: 'A fazer' }],
    });
    await migrarAcoes(sql);
    const [acao] = await acoesRisco.list(sql);
    expect(acao.iniciativa_id).toBeNull();
    expect(acao.triagem).toBe('');
  });
});

describe('migrarAcoes — idempotência', () => {
  it('rodar duas vezes não duplica nada', async () => {
    await zerar();
    await createRecord(sql, {
      risco: 'Rodado duas vezes',
      acoes_itens: [
        { id: '1', descricao: 'Primeira', responsavel: '', prazo: '', status: 'A fazer' },
        { id: '2', descricao: 'Segunda', responsavel: '', prazo: '', status: 'A fazer' },
      ],
    });

    const um = await migrarAcoes(sql);
    const dois = await migrarAcoes(sql);

    expect(um.acoesCriadas).toBe(2);
    expect(dois.acoesCriadas).toBe(0);
    expect(dois.acoesJaExistiam).toBe(2);
    expect(await acoesRisco.list(sql)).toHaveLength(2);
  });

  it('pega ação acrescentada ao plano depois da primeira execução', async () => {
    await zerar();
    const reg = await createRecord(sql, {
      risco: 'Plano que cresceu',
      acoes_itens: [{ id: '1', descricao: 'Original', responsavel: '', prazo: '', status: 'A fazer' }],
    });
    await migrarAcoes(sql);

    await updateRecordById(sql, reg.id, {
      acoes_itens: [
        { id: '1', descricao: 'Original', responsavel: '', prazo: '', status: 'A fazer' },
        { id: '2', descricao: 'Acrescentada depois', responsavel: '', prazo: '', status: 'A fazer' },
      ],
    });

    const r = await migrarAcoes(sql);
    expect(r.acoesCriadas).toBe(1);
    expect(r.acoesJaExistiam).toBe(1);
    expect((await acoesRisco.list(sql)).map(a => a.descricao)).toEqual([
      'Original', 'Acrescentada depois',
    ]);
  });

  it('não confunde ações de mesma descrição em riscos diferentes', async () => {
    await zerar();
    for (const risco of ['Risco A', 'Risco B']) {
      await createRecord(sql, {
        risco,
        acoes_itens: [{ id: '1', descricao: 'Mapear o processo', responsavel: '', prazo: '', status: 'A fazer' }],
      });
    }
    const r = await migrarAcoes(sql);
    expect(r.acoesCriadas).toBe(2);
  });

  it('não recria uma ação que o gestor já classificou na triagem', async () => {
    await zerar();
    await createRecord(sql, {
      risco: 'Já triado',
      acoes_itens: [{ id: '1', descricao: 'Classificada', responsavel: '', prazo: '', status: 'A fazer' }],
    });
    await migrarAcoes(sql);
    const [acao] = await acoesRisco.list(sql);
    await acoesRisco.update(sql, acao.id, { triagem: 'acao' });

    await migrarAcoes(sql);
    const depois = await acoesRisco.list(sql);
    expect(depois).toHaveLength(1);
    expect(depois[0].triagem).toBe('acao');
  });
});

describe('migrarAcoes — pessoas', () => {
  it('semeia responsáveis de riscos, tarefas e itens do plano, sem duplicar', async () => {
    await zerar();
    await createRecord(sql, {
      risco: 'Com responsáveis',
      responsavel: 'DERYLSON',
      acoes_itens: [{ id: '1', descricao: 'X', responsavel: 'KAUAN', prazo: '', status: 'A fazer' }],
    });
    await createTask(sql, { tarefa: 'Uma tarefa', responsavel: 'JOEL' });

    const r = await migrarAcoes(sql);
    expect(r.nomesCriados.sort()).toEqual(['DERYLSON', 'JOEL', 'KAUAN']);

    const segunda = await migrarAcoes(sql);
    expect(segunda.pessoasCriadas).toBe(0);
    expect(await pessoas.list(sql)).toHaveLength(3);
  });

  it('liga o dono da ação à pessoa criada', async () => {
    await zerar();
    await createRecord(sql, {
      risco: 'Com dono',
      acoes_itens: [{ id: '1', descricao: 'Com dono', responsavel: 'KAUAN', prazo: '', status: 'A fazer' }],
    });
    await migrarAcoes(sql);

    const [acao] = await acoesRisco.list(sql);
    const kauan = (await pessoas.list(sql)).find(p => p.nome === 'KAUAN');
    expect(acao.dono_id).toBe(kauan?.id);
  });

  it('ação sem responsável fica sem dono, não inventa pessoa', async () => {
    await zerar();
    await createRecord(sql, {
      risco: 'Sem dono',
      acoes_itens: [{ id: '1', descricao: 'Órfã', responsavel: '', prazo: '', status: 'A fazer' }],
    });
    await migrarAcoes(sql);
    const [acao] = await acoesRisco.list(sql);
    expect(acao.dono_id).toBeNull();
    expect(await pessoas.list(sql)).toHaveLength(0);
  });

  it('não recadastra quem já existe, mesmo com caixa diferente', async () => {
    await zerar();
    await pessoas.create(sql, { nome: 'derylson' });
    await createRecord(sql, { risco: 'X', responsavel: 'DERYLSON', acoes: 'Fazer algo' });
    const r = await migrarAcoes(sql);
    expect(r.pessoasCriadas).toBe(0);
    expect(await pessoas.list(sql)).toHaveLength(1);
  });
});

describe('migrarAcoes — o registro de risco sai como entrou', () => {
  it('não altera risco, acoes, acoes_itens nem a versão', async () => {
    await zerar();
    await createRecord(sql, {
      risco: 'Intocado',
      acoes: 'Uma coisa · Outra coisa',
      acoes_itens: [
        { id: '1', descricao: 'Uma coisa', responsavel: 'DERYLSON', prazo: '2026-01-31', status: 'A fazer' },
        { id: '2', descricao: 'Outra coisa', responsavel: '', prazo: '', status: 'Concluída' },
      ],
      esforco: 3,
      responsavel: 'DERYLSON',
    });

    const antes = await listRecords(sql);
    await migrarAcoes(sql);
    const depois = await listRecords(sql);

    expect(depois).toEqual(antes);
  });
});
