import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createRecord, listRecords, type Sql } from './_db.js';
import { ensureTudo } from './_schema.js';
import { acoesRisco, objetivos, iniciativas, listPortfolio } from './_portfolioDb.js';
import { salvarRiscoCompleto, criarIniciativaDaAcao, type SalvarRiscoPedido, type CriarIniciativaPedido } from './_operacoes.js';
import { linhaVazia, paraLinhas } from '../src/lib/planoDeAcao.js';
import type { StoredTask, TaskAttachment, Iniciativa, PortfolioBundle } from '../src/types.js';
import router from './_router.js';

let pg: PGlite;
let sql: Sql;
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

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

async function request<T = Record<string, unknown>>(method: string, url: string, body?: unknown) {
  const parsed = new URL(url, 'http://local');
  const headers: Record<string, unknown> = {};
  let status = 200;
  let data: T;
  const req = { method, url, body, query: Object.fromEntries(parsed.searchParams), headers: { 'x-autor': 'Teste' } } as unknown as VercelRequest;
  const res = {
    status(code: number) { status = code; return this; },
    setHeader(key: string, value: unknown) { headers[key] = value; return this; },
    json(value: T) { data = value; return this; },
    send(value: T) { data = value; return this; },
  } as unknown as VercelResponse;
  await router(req, res, sql);
  return { status, data: data!, headers };
}

async function fixture() {
  const risk = await createRecord(sql, { risco: 'Falha no processo', obs: 'Original' });
  const objective = await objetivos.create(sql, { descricao: 'Aumentar confiabilidade', status: 'ativo' });
  const initiative = await iniciativas.create(sql, { objetivo_id: objective.id, nome: 'Revisar controles', status: 'backlog', fonte: 'risco' });
  const action = await acoesRisco.create(sql, { risco_id: risk.id, descricao: 'Revisar rotina', status: 'aberta', triagem: 'acao' });
  const base = paraLinhas([action], []);
  const pedido: SalvarRiscoPedido = { chave: randomUUID(), riscoId: risk.id, expectedVersion: risk.version, patch: { obs: 'Revisado' }, base, atual: base };
  return { risk, objective, initiative, action, pedido };
}

describe('gravações completas em transação', () => {
  it('salva risco, pessoa e ações juntos; repetir a mesma operação não duplica nada', async () => {
    const { risk, initiative, pedido } = await fixture();
    pedido.atual = [
      { ...pedido.base[0], descricao: 'Conferir controle', iniciativa_id: initiative.id },
      { ...linhaVazia(), descricao: 'Capacitar equipe', dono: 'Pessoa criada na gravação' },
    ];
    const first = await salvarRiscoCompleto(sql, pedido, 'Teste');
    const retry = await salvarRiscoCompleto(sql, pedido, 'Teste');
    expect(retry).toEqual(first);
    expect(first.record).toMatchObject({ obs: 'Revisado', version: 2 });
    expect(first.record.acoes).toContain('Capacitar equipe');
    const portfolio = await listPortfolio(sql);
    expect(portfolio.acoes_risco.filter(a => a.risco_id === risk.id)).toHaveLength(2);
    expect(portfolio.pessoas.filter(p => p.nome === 'Pessoa criada na gravação')).toHaveLength(1);
    expect(first.plano.linhas[0].iniciativa_id).toBe(initiative.id);
    expect((await request<StoredTask[]>('GET', '/api/tasks')).data.find(t => t.id === first.plano.linhas[0].id)?.iniciativa_id).toBe(initiative.id);
    await expect(salvarRiscoCompleto(sql, { ...pedido, patch: { obs: 'Outro conteúdo' } }, 'Teste')).rejects.toMatchObject({ status: 409 });
  });

  it('desfaz inclusive exclusões, novos responsáveis e histórico se a última ação falhar', async () => {
    const { risk, action, pedido } = await fixture();
    const beforeAudit = await sql('select count(*)::int as n from auditoria');
    pedido.atual = [
      { ...linhaVazia(), descricao: 'Primeira válida', dono: 'Pessoa não deve persistir' },
      { ...linhaVazia(), descricao: 'Última inválida', iniciativa_id: randomUUID() },
    ];
    await expect(salvarRiscoCompleto(sql, pedido, 'Teste')).rejects.toThrow('Nenhuma alteração foi salva');
    expect((await listRecords(sql)).find(r => r.id === risk.id)).toMatchObject({ obs: 'Original', version: 1 });
    expect((await listPortfolio(sql)).acoes_risco.filter(a => a.risco_id === risk.id)).toEqual([action]);
    expect((await listPortfolio(sql)).pessoas.some(p => p.nome === 'Pessoa não deve persistir')).toBe(false);
    expect(await sql('select count(*)::int as n from auditoria')).toEqual(beforeAudit);
    expect(await sql('select chave from operacoes_app where chave = $1', [pedido.chave])).toEqual([]);
  });

  it('recusa uma ação alterada por outra tela e preserva o risco e a edição mais recente', async () => {
    const { risk, action, pedido } = await fixture();
    await acoesRisco.update(sql, action.id, { descricao: 'Editado no quadro' }, action.version);
    pedido.atual = [{ ...pedido.base[0], descricao: 'Rascunho antigo' }];
    const result = await request('POST', '/api/portfolio/salvar-risco', pedido);
    expect(result.status).toBe(409);
    expect((await listRecords(sql)).find(r => r.id === risk.id)?.obs).toBe('Original');
    expect((await acoesRisco.byId(sql, action.id))?.descricao).toBe('Editado no quadro');
  });

  it('recusa risco desatualizado sem criar as ações do rascunho', async () => {
    const { risk, pedido } = await fixture();
    const other = await request('PATCH', '/api/records/' + risk.id, { obs: 'Outra edição', expectedVersion: risk.version });
    expect(other.status).toBe(200);
    pedido.atual = [...pedido.base, { ...linhaVazia(), descricao: 'Não deve nascer' }];
    expect((await request('POST', '/api/portfolio/salvar-risco', pedido)).status).toBe(409);
    expect((await listPortfolio(sql)).acoes_risco.filter(a => a.risco_id === risk.id)).toHaveLength(1);
  });

  it('cria e vincula iniciativa na mesma operação; falha não deixa iniciativa órfã', async () => {
    const { objective, action } = await fixture();
    const data: CriarIniciativaPedido = { chave: randomUUID(), acaoId: action.id, expectedVersion: action.version, dados: { nome: 'Iniciativa nova', objetivo_id: randomUUID() } };
    const before = (await listPortfolio(sql)).iniciativas.length;
    await expect(criarIniciativaDaAcao(sql, data, 'Teste')).rejects.toThrow();
    expect((await listPortfolio(sql)).iniciativas).toHaveLength(before);
    expect((await acoesRisco.byId(sql, action.id))?.iniciativa_id).toBeNull();
    data.dados.objetivo_id = objective.id;
    const first = await request<Iniciativa>('POST', '/api?__route=portfolio/criar-iniciativa', data);
    const retry = await request<Iniciativa>('POST', '/api/portfolio/criar-iniciativa', data);
    expect(first.status).toBe(200);
    expect(retry.data.id).toBe(first.data.id);
    expect((await acoesRisco.byId(sql, action.id))?.iniciativa_id).toBe(first.data.id);
    expect((await listPortfolio(sql)).iniciativas).toHaveLength(before + 1);
  });

  it('mantém um único vínculo nos dois sentidos e não conta ação cancelada como cobertura', async () => {
    const { risk, initiative, action } = await fixture();
    const linked = await request('PATCH', '/api/portfolio/acoes-risco/' + action.id, { iniciativa_id: initiative.id, expectedVersion: action.version });
    expect(linked.status).toBe(200);
    let p = (await request<PortfolioBundle>('GET', '/api/portfolio')).data;
    expect(p.acoes_risco.find(a => a.id === action.id)).toMatchObject({ risco_id: risk.id, iniciativa_id: initiative.id, status: 'aberta' });
    const task = (await request<StoredTask[]>('GET', '/api/tasks')).data.find(t => t.id === action.id)!;
    expect(task.iniciativa_id).toBe(initiative.id);
    expect((await request('PATCH', '/api/tasks/' + action.id, { status: 'Cancelada', expectedVersion: task.version })).status).toBe(200);
    p = (await request<PortfolioBundle>('GET', '/api/portfolio')).data;
    expect(p.acoes_risco.find(a => a.id === action.id)?.status).toBe('cancelada');
    const history = await request<unknown[]>('GET', '/api/portfolio/auditoria?tabela=acoes_risco&registro_id=' + action.id);
    expect(JSON.stringify(history.data)).toContain('cancelada');
    expect(p.acoes_risco.find(a => a.id === action.id)?.iniciativa_id).toBe(initiative.id);
    expect((await listRecords(sql)).find(r => r.id === risk.id)?.acoes).toBe('');
  });
});

describe('roteador que serve desenvolvimento e produção', () => {
  it('preserva métodos, erro 404/405 e valida URL malformada em qualquer profundidade', async () => {
    expect((await request('GET', '/api/health')).status).toBe(200);
    expect((await request('POST', '/api/health')).status).toBe(405);
    expect((await request('GET', '/api/portfolio/desconhecida')).status).toBe(404);
    expect((await request('GET', '/api/tasks/x/anexos/y/extra')).status).toBe(404);
    expect((await request('GET', '/api/tasks/%ZZ')).status).toBe(400);
    expect((await request('GET', '/api/restore')).headers.Allow).toBe('POST');
    const response = await request<StoredTask>('POST', '/api?__route=tasks', { tarefa: 'Criada via rewrite' });
    expect(response.status).toBe(201);
    expect((await request('GET', '/api/tasks/' + response.data.id)).status).toBe(405);
    expect((await request('DELETE', '/api/tasks/' + response.data.id)).status).toBe(200);
  });

  it('serve anexos binários, backup com bytes e exclusão pela URL profunda reescrita', async () => {
    const task = (await request<StoredTask>('POST', '/api/tasks', { tarefa: 'Anexos' })).data;
    const created = await request<TaskAttachment>('POST', '/api/tasks/' + task.id + '/anexos', { nome: 'imagem.png', mime: 'image/png', dados: PNG });
    expect(created.status).toBe(201);
    const url = '/api?__route=tasks/' + task.id + '/anexos/' + created.data.id;
    const image = await request<Buffer>('GET', url);
    expect(image.status).toBe(200);
    expect(image.data.toString('base64')).toBe(PNG);
    expect(image.headers['Content-Type']).toBe('image/png');
    expect(image.headers['Cache-Control']).toContain('immutable');
    const backup = await request('GET', '/api?__route=portfolio/backup&anexos=1');
    expect(backup.status).toBe(200);
    expect(JSON.stringify(backup.data)).toContain(PNG);
    expect((await request('DELETE', url)).status).toBe(200);
    expect((await request('GET', url)).status).toBe(404);
    expect((await request('POST', '/api/restore')).status).toBe(409);
  });

  it('reenvia criação comum com a mesma chave sem duplicar', async () => {
    const body = { __chave: randomUUID(), nome: 'Pessoa idempotente', ativo: true };
    const one = await request('POST', '/api/portfolio/pessoas', body);
    const two = await request('POST', '/api/portfolio/pessoas', body);
    expect(one.status).toBe(201);
    expect(two.data.id).toBe(one.data.id);
    expect((await request('DELETE', '/api/portfolio/pessoas/' + one.data.id)).status).toBe(200);
  });
});
