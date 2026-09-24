import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Sql } from './_db.js';
import { ensureTudo } from './_schema.js';
import { objetivos } from './_portfolioDb.js';
import handler, { segmentosDaUrl } from './_portfolioRoute.js';
import type { Objetivo } from '../src/types.js';

// Este teste existe por causa de um bug de produção: a rota lia os segmentos
// de `req.query.path`, que a Vercel preenchia ou não dependendo de qual arquivo
// ela escolhia para servir. Quando não preencheu, `/api/portfolio/backup`
// devolveu o pacote de listas no lugar do backup — sem erro, sem log, resposta
// 200 com o conteúdo errado. Ler da URL é o que torna as duas rotas
// equivalentes.
describe('segmentosDaUrl', () => {
  it('devolve vazio no caminho base, com ou sem barra final', () => {
    expect(segmentosDaUrl('/api/portfolio')).toEqual([]);
    expect(segmentosDaUrl('/api/portfolio/')).toEqual([]);
  });

  it('separa os segmentos do sub-caminho', () => {
    expect(segmentosDaUrl('/api/portfolio/backup')).toEqual(['backup']);
    expect(segmentosDaUrl('/api/portfolio/iniciativas')).toEqual(['iniciativas']);
    expect(segmentosDaUrl('/api/portfolio/marcos/abc-123'))
      .toEqual(['marcos', 'abc-123']);
  });

  it('ignora a query string', () => {
    expect(segmentosDaUrl('/api/portfolio/backup?anexos=1')).toEqual(['backup']);
    expect(segmentosDaUrl('/api/portfolio?x=1')).toEqual([]);
  });

  it('aceita URL absoluta', () => {
    expect(segmentosDaUrl('https://exemplo.vercel.app/api/portfolio/pessoas'))
      .toEqual(['pessoas']);
  });

  it('decodifica o segmento', () => {
    expect(segmentosDaUrl('/api/portfolio/acoes_risco/a%20b'))
      .toEqual(['acoes_risco', 'a b']);
  });

  it('não estoura com url ausente', () => {
    expect(segmentosDaUrl(undefined)).toEqual([]);
    expect(segmentosDaUrl('')).toEqual([]);
  });
});

it('mantém somente api/index.ts como função publicável', () => {
  const entries = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? entries(join(dir, e.name)) : !e.name.startsWith('_') && !e.name.startsWith('.') && !e.name.endsWith('.d.ts') ? [join(dir, e.name)] : []);
  expect(entries('api').map(path => path.replaceAll('\\', '/'))).toEqual(['api/index.ts']);
});

// A reordenação é a única escrita do portfólio que NÃO avança `version`; o que
// importa aqui é o contrato HTTP — corpo `{ ordem }`, lista ordenada de volta,
// 405 com `Allow` e os erros de `ErroOperacao` virando status, não 500.
describe('POST /api/portfolio/reordenar-objetivos', () => {
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

  async function chamar<T = unknown>(method: string, body?: unknown) {
    const headers: Record<string, unknown> = {};
    let status = 200;
    let data: unknown;
    const req = { method, url: '/api/portfolio/reordenar-objetivos', body, query: {}, headers: {} } as unknown as VercelRequest;
    const res = {
      status(code: number) { status = code; return this; },
      setHeader(key: string, value: unknown) { headers[key] = value; return this; },
      json(value: unknown) { data = value; return this; },
    } as unknown as VercelResponse;
    await handler(req, res, sql);
    return { status, data: data as T, headers };
  }

  it('grava a ordem e devolve a lista nela, sem nova versão', async () => {
    const a = await objetivos.create(sql, { descricao: 'Rota A', status: 'ativo' });
    const b = await objetivos.create(sql, { descricao: 'Rota B', status: 'ativo' });
    const ids = (await objetivos.list(sql)).map(o => o.id).filter(id => id !== a.id && id !== b.id);
    const r = await chamar<Objetivo[]>('POST', { ordem: [b.id, ...ids, a.id] });
    expect(r.status).toBe(200);
    expect(r.data[0]).toMatchObject({ id: b.id, version: b.version, updated_at: b.updated_at });
    expect(r.data.at(-1)).toMatchObject({ id: a.id, version: a.version });
    // Corpo em texto (como chega pelo servidor local) vale igual.
    const texto = await chamar<Objetivo[]>('POST', JSON.stringify({ ordem: [a.id, ...ids, b.id] }));
    expect(texto.status).toBe(200);
    expect(texto.data.map(o => o.id)).toEqual([a.id, ...ids, b.id]);
  });

  it('responde 405 com Allow: POST a outro método', async () => {
    const r = await chamar('GET');
    expect(r.status).toBe(405);
    expect(r.headers.Allow).toBe('POST');
  });

  it('responde 400 a corpo sem lista ou com duplicata', async () => {
    const [o] = await objetivos.list(sql);
    expect((await chamar('POST', {})).status).toBe(400);
    expect((await chamar('POST', 'não é json')).status).toBe(400);
    const dup = await chamar<{ error: string }>('POST', { ordem: [o.id, o.id] });
    expect(dup.status).toBe(400);
    expect(dup.data.error).toBeTruthy();
  });

  it('responde 409 quando o conjunto não bate com o do servidor', async () => {
    const lista = await objetivos.list(sql);
    const falta = await chamar<{ error: string }>('POST', { ordem: lista.slice(1).map(o => o.id) });
    expect(falta.status).toBe(409);
    expect(falta.data.error).toMatch(/mudou enquanto você reordenava/);
    const sobra = await chamar('POST', { ordem: [...lista.map(o => o.id), '00000000-0000-4000-8000-000000000000'] });
    expect(sobra.status).toBe(409);
    expect((await objetivos.list(sql)).map(o => o.id)).toEqual(lista.map(o => o.id));
  });
});
