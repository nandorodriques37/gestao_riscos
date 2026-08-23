import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createRecord, type Sql } from './_db.js';
import { ensureTudo } from './_schema.js';
import { pessoas, objetivos, iniciativas, acoesRisco } from './_portfolioDb.js';
import { createTask, listTasks } from './_tasksDb.js';
import {
  mesclarPessoas, mesclarDuplicadas, converterResponsaveis, unificarDonos,
} from './_donos.js';

let pg: PGlite;
let sql: Sql;

beforeAll(async () => {
  pg = new PGlite();
  sql = async (text, params = []) => {
    const result = await pg.query(text, params as unknown[]);
    return result.rows as Record<string, unknown>[];
  };
  await ensureTudo(sql, { semear: true });
});

afterAll(async () => {
  await pg.close();
});

beforeEach(async () => {
  await sql('delete from tasks');
  await sql('delete from marcos');
  await sql('delete from iniciativas');
  await sql('delete from objetivos');
  await sql('delete from pessoas');
  await sql('delete from risk_records');
  await sql('delete from migracoes');
});

describe('mesclarPessoas — junta duas fichas sem perder o que elas carregavam', () => {
  it('repõe o dono em objetivo, iniciativa e tarefa antes de excluir a ficha', async () => {
    const fica = await pessoas.create(sql, { nome: 'João Fernando', ativo: true });
    const sai = await pessoas.create(sql, { nome: 'JOÃO FERNANDO', ativo: true });

    const obj = await objetivos.create(sql, { descricao: 'Obj', dono_id: sai.id });
    const ini = await iniciativas.create(sql, {
      objetivo_id: obj.id, nome: 'Ini', status: 'backlog', dono_id: sai.id,
    });
    const risco = await createRecord(sql, { risco: 'R' });
    const acao = await acoesRisco.create(sql, {
      risco_id: risco.id, descricao: 'Mitigação', dono_id: sai.id,
    });
    const livre = await createTask(sql, { tarefa: 'Tarefa livre', dono_id: sai.id });

    const r = await mesclarPessoas(sql, fica.id, sai.id);
    expect(r.movidas).toBe(4);

    expect((await objetivos.byId(sql, obj.id))?.dono_id).toBe(fica.id);
    expect((await iniciativas.byId(sql, ini.id))?.dono_id).toBe(fica.id);
    expect((await acoesRisco.byId(sql, acao.id))?.dono_id).toBe(fica.id);
    // A tarefa livre é a que a versão antiga, feita na tela, não enxergava.
    const linhas = await listTasks(sql);
    expect(linhas.find(t => t.id === livre.id)?.dono_id).toBe(fica.id);

    expect(await pessoas.byId(sql, sai.id)).toBeNull();
  });

  it('herda os campos que faltavam no destino — mesclar não perde capacidade', async () => {
    const fica = await pessoas.create(sql, { nome: 'Kauan', ativo: true });
    const sai = await pessoas.create(sql, {
      nome: 'KAUAN', ativo: true, papel: 'Analista', area: 'Supply', dias_projeto_mes: 8,
    });

    await mesclarPessoas(sql, fica.id, sai.id);

    const depois = await pessoas.byId(sql, fica.id);
    expect(depois).toMatchObject({ papel: 'Analista', area: 'Supply', dias_projeto_mes: 8 });
  });

  it('não sobrescreve o que o destino já tinha', async () => {
    const fica = await pessoas.create(sql, { nome: 'Lis', ativo: true, dias_projeto_mes: 10 });
    const sai = await pessoas.create(sql, { nome: 'LIS', ativo: true, dias_projeto_mes: 2 });
    await mesclarPessoas(sql, fica.id, sai.id);
    expect((await pessoas.byId(sql, fica.id))?.dias_projeto_mes).toBe(10);
  });

  it('mesclar uma ficha nela mesma não faz nada', async () => {
    const p = await pessoas.create(sql, { nome: 'Joel', ativo: true });
    expect(await mesclarPessoas(sql, p.id, p.id)).toEqual({ movidas: 0 });
    expect(await pessoas.byId(sql, p.id)).not.toBeNull();
  });
});

describe('mesclarDuplicadas — mesmo nome, grafias diferentes', () => {
  it('junta ignorando acento e caixa, e mantém a grafia legível', async () => {
    await pessoas.create(sql, { nome: 'DERYLSON', ativo: true });
    await pessoas.create(sql, { nome: 'Derylson', ativo: true });

    const r = await mesclarDuplicadas(sql);
    expect(r).toMatchObject({ gruposMesclados: 1, fichasRemovidas: 1 });

    const lista = await pessoas.list(sql);
    expect(lista).toHaveLength(1);
    // "Derylson" lê melhor que "DERYLSON" numa lista de gente.
    expect(lista[0].nome).toBe('Derylson');
  });

  it('a ficha curada ganha da bem escrita — o dado vale mais que a grafia', async () => {
    await pessoas.create(sql, { nome: 'Kauan', ativo: true });
    await pessoas.create(sql, { nome: 'KAUAN', ativo: true, dias_projeto_mes: 8 });

    await mesclarDuplicadas(sql);

    const lista = await pessoas.list(sql);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ nome: 'KAUAN', dias_projeto_mes: 8 });
  });

  it('nomes diferentes de verdade não se tocam', async () => {
    await pessoas.create(sql, { nome: 'Hugo Braga', ativo: true });
    await pessoas.create(sql, { nome: 'Hugo Diógenes', ativo: true });
    const r = await mesclarDuplicadas(sql);
    expect(r.gruposMesclados).toBe(0);
    expect(await pessoas.list(sql)).toHaveLength(2);
  });
});

describe('converterResponsaveis — o texto vira pessoa', () => {
  it('casa com a ficha existente ignorando acento e caixa', async () => {
    const p = await pessoas.create(sql, { nome: 'João Fernando', ativo: true });
    const t = await createTask(sql, { tarefa: 'Tarefa', responsavel: 'JOAO FERNANDO' });

    const r = await converterResponsaveis(sql);
    expect(r).toMatchObject({ vinculadas: 1, pessoasCriadas: 0 });

    const linha = (await listTasks(sql)).find(x => x.id === t.id)!;
    expect(linha.dono_id).toBe(p.id);
    // O texto fica como histórico do que estava escrito ali.
    expect(linha.responsavel).toBe('JOAO FERNANDO');
  });

  it('cadastra quem ainda não existe, uma vez só para várias tarefas', async () => {
    await createTask(sql, { tarefa: 'A', responsavel: 'Louse' });
    await createTask(sql, { tarefa: 'B', responsavel: 'LOUSE' });

    const r = await converterResponsaveis(sql);
    expect(r).toMatchObject({ vinculadas: 2, pessoasCriadas: 1 });
    expect(await pessoas.list(sql)).toHaveLength(1);
  });

  it('não mexe em linha que já tem dono — a decisão já foi tomada', async () => {
    const certo = await pessoas.create(sql, { nome: 'Certo', ativo: true });
    const t = await createTask(sql, { tarefa: 'T', responsavel: 'Errado', dono_id: certo.id });

    await converterResponsaveis(sql);

    const linha = (await listTasks(sql)).find(x => x.id === t.id)!;
    expect(linha.dono_id).toBe(certo.id);
    expect(await pessoas.list(sql)).toHaveLength(1);
  });
});

describe('unificarDonos — a migração inteira, uma vez só', () => {
  it('mescla antes de converter, senão o texto casaria com a ficha errada', async () => {
    await pessoas.create(sql, { nome: 'KAUAN', ativo: true });
    await pessoas.create(sql, { nome: 'Kauan', ativo: true });
    await createTask(sql, { tarefa: 'Tarefa', responsavel: 'kauan' });

    const r = await unificarDonos(sql);
    expect(r.jaExecutada).toBe(false);
    expect(r.duplicadas.gruposMesclados).toBe(1);
    expect(r.conversao.vinculadas).toBe(1);

    const lista = await pessoas.list(sql);
    expect(lista).toHaveLength(1);
    expect((await listTasks(sql))[0].dono_id).toBe(lista[0].id);
  });

  it('roda uma vez só: ficha separada de propósito não é mesclada de novo', async () => {
    await pessoas.create(sql, { nome: 'Ana', ativo: true });
    await pessoas.create(sql, { nome: 'ANA', ativo: true });
    await unificarDonos(sql);

    // O gestor decide que são duas pessoas mesmo e cadastra de novo.
    await pessoas.create(sql, { nome: 'ANA', ativo: true });
    const segunda = await unificarDonos(sql);

    expect(segunda.jaExecutada).toBe(true);
    expect(await pessoas.list(sql)).toHaveLength(2);
  });
});
