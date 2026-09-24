import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { Sql } from './_db.js';
import { ensureTudo } from './_schema.js';
import { objetivos } from './_portfolioDb.js';
import { reordenarObjetivos } from './_ordem.js';
import { ErroOperacao } from './_operacoes.js';
import { OBJETIVO_A_CLASSIFICAR } from './_promocaoTriagem.js';
import type { Objetivo } from '../src/types.js';

// Reordenar é mexer em `position`, e só nela. O que este arquivo protege é o
// que a tela promete: a ordem vale para todos, não derruba quem está com o
// modal aberto (nada de `version` nova) e não grava sobre uma lista que mudou.

let pg: PGlite;
let sql: Sql;

beforeAll(async () => {
  pg = new PGlite();
  sql = async (query, params = []) => (await pg.query(query, params as unknown[])).rows as Record<string, unknown>[];
  sql.transaction = run => pg.transaction(async tx => {
    const scoped: Sql = async (query, params = []) => (await tx.query(query, params as unknown[])).rows as Record<string, unknown>[];
    return run(scoped);
  });
  await ensureTudo(sql, { semear: false });
});
afterAll(async () => { await pg.close(); });

// Cada caso parte de uma lista conhecida: a checagem de conjunto olha a tabela
// inteira, então sobra de outro caso viraria 409 falso.
beforeEach(async () => {
  await sql('delete from iniciativas');
  await sql('delete from objetivos');
});

async function criar(...descricoes: string[]): Promise<Objetivo[]> {
  const criados: Objetivo[] = [];
  for (const descricao of descricoes) criados.push(await objetivos.create(sql, { descricao, status: 'ativo' }));
  return criados;
}

const descricoes = (lista: Objetivo[]) => lista.map(o => o.descricao);

async function falha(ordem: unknown): Promise<ErroOperacao> {
  try {
    await reordenarObjetivos(sql, ordem);
  } catch (err) {
    expect(err).toBeInstanceOf(ErroOperacao);
    return err as ErroOperacao;
  }
  throw new Error('reordenarObjetivos deveria ter recusado a ordem');
}

describe('reordenarObjetivos', () => {
  it('grava a permutação e list() passa a devolver nessa ordem', async () => {
    const [a, b, c] = await criar('A', 'B', 'C');
    const devolvida = await reordenarObjetivos(sql, [c.id, a.id, b.id]);
    expect(descricoes(devolvida)).toEqual(['C', 'A', 'B']);
    expect(descricoes(await objetivos.list(sql))).toEqual(['C', 'A', 'B']);
  });

  it('não avança version nem updated_at — posição não é conteúdo', async () => {
    const [a, b] = await criar('A', 'B');
    const editado = await objetivos.update(sql, a.id, { descricao: 'A revisado' }, a.version);
    expect(editado.status).toBe('ok');
    const antes = await objetivos.list(sql);
    await reordenarObjetivos(sql, [b.id, a.id]);
    const depois = await objetivos.list(sql);
    for (const o of antes) {
      const agora = depois.find(x => x.id === o.id)!;
      expect(agora.version).toBe(o.version);
      expect(agora.updated_at).toBe(o.updated_at);
    }
    // Quem abriu o modal antes da reordenação salva sem 409.
    const aVersao = antes.find(o => o.id === a.id)!.version;
    expect((await objetivos.update(sql, a.id, { descricao: 'A de novo' }, aVersao)).status).toBe('ok');
  });

  it('não grava auditoria', async () => {
    const [a, b] = await criar('A', 'B');
    const [{ n: antes }] = await sql('select count(*)::int as n from auditoria');
    await reordenarObjetivos(sql, [b.id, a.id]);
    expect(await sql('select count(*)::int as n from auditoria')).toEqual([{ n: antes }]);
  });

  it('recusa com 409 quando falta um objetivo, sem gravar nada', async () => {
    const [a, , c] = await criar('A', 'B', 'C');
    const err = await falha([c.id, a.id]);
    expect(err.status).toBe(409);
    expect(err.message).toMatch(/mudou enquanto você reordenava/);
    expect(descricoes(await objetivos.list(sql))).toEqual(['A', 'B', 'C']);
  });

  it('recusa com 409 quando sobra um objetivo (excluído no meio ou desconhecido)', async () => {
    const [a, b] = await criar('A', 'B');
    await objetivos.remove(sql, b.id);
    expect((await falha([b.id, a.id])).status).toBe(409);
    expect((await falha([a.id, 'nao-e-um-uuid'])).status).toBe(409);
    expect(descricoes(await objetivos.list(sql))).toEqual(['A']);
  });

  it('recusa com 400 duplicata, id vazio e o que não é lista', async () => {
    const [a, b] = await criar('A', 'B');
    expect((await falha([a.id, a.id, b.id])).status).toBe(400);
    expect((await falha([a.id, ''])).status).toBe(400);
    expect((await falha([a.id, 7])).status).toBe(400);
    expect((await falha(undefined)).status).toBe(400);
    expect((await falha({ 0: a.id, 1: b.id })).status).toBe(400);
    expect((await falha(`${a.id},${b.id}`)).status).toBe(400);
    expect(descricoes(await objetivos.list(sql))).toEqual(['A', 'B']);
  });

  it('aceita o balde da migração como qualquer outro — a regra de "sempre por último" é da tela', async () => {
    const [balde, a, b] = await criar(OBJETIVO_A_CLASSIFICAR, 'A', 'B');
    const devolvida = await reordenarObjetivos(sql, [b.id, a.id, balde.id]);
    expect(descricoes(devolvida)).toEqual(['B', 'A', OBJETIVO_A_CLASSIFICAR]);
  });

  it('o objetivo criado depois de uma reordenação entra no fim', async () => {
    const [a, b] = await criar('A', 'B');
    await reordenarObjetivos(sql, [b.id, a.id]);
    await criar('C');
    expect(descricoes(await objetivos.list(sql))).toEqual(['B', 'A', 'C']);
  });

  it('funciona sem suporte a transação no executor', async () => {
    const [a, b] = await criar('A', 'B');
    const semTransacao: Sql = (query, params) => sql(query, params);
    expect(descricoes(await reordenarObjetivos(semTransacao, [b.id, a.id]))).toEqual(['B', 'A']);
  });
});
