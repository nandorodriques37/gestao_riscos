import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema, createRecord, updateRecordById, listRecords, type Sql } from './_db';

// Testa a camada de acesso a dados contra um Postgres real (pglite, em
// memória) — a mesma engine usada em produção (Neon), garantindo que a
// checagem de concorrência otimista (coluna `version`) funcione de verdade,
// não apenas contra um mock.
let pg: PGlite;
let sql: Sql;

beforeAll(async () => {
  pg = new PGlite();
  sql = async (text, params = []) => {
    const result = await pg.query(text, params as unknown[]);
    return result.rows as Record<string, unknown>[];
  };
  await ensureSchema(sql);
});

afterAll(async () => {
  await pg.close();
});

describe('updateRecordById — concorrência otimista', () => {
  it('cria um registro com version = 1', async () => {
    const created = await createRecord(sql, { area: 'TI', risco: 'teste' });
    expect(created.version).toBe(1);
  });

  it('sem expectedVersion, atualiza incondicionalmente e incrementa a versão', async () => {
    const created = await createRecord(sql, { area: 'A' });
    const result = await updateRecordById(sql, created.id, { area: 'B' });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.record.area).toBe('B');
      expect(result.record.version).toBe(2);
    }
  });

  it('com expectedVersion correto, atualiza normalmente', async () => {
    const created = await createRecord(sql, { area: 'A' });
    const result = await updateRecordById(sql, created.id, { area: 'B' }, created.version);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.record.version).toBe(2);
  });

  it('com expectedVersion desatualizado, retorna conflict com o registro atual', async () => {
    const created = await createRecord(sql, { obs: 'original' });
    // simula outro usuário gravando primeiro (version 1 -> 2)
    await updateRecordById(sql, created.id, { obs: 'de outro usuário' });
    // este cliente ainda acha que está na version 1 (desatualizado)
    const result = await updateRecordById(sql, created.id, { obs: 'minha edição' }, created.version);
    expect(result.status).toBe('conflict');
    if (result.status === 'conflict') {
      expect(result.record.obs).toBe('de outro usuário');
      expect(result.record.version).toBe(2);
    }
  });

  it('em conflito, a gravação perdedora não é aplicada no banco', async () => {
    const created = await createRecord(sql, { obs: 'original' });
    await updateRecordById(sql, created.id, { obs: 'primeiro' });
    await updateRecordById(sql, created.id, { obs: 'não deveria aparecer' }, created.version);
    const rows = await sql('select * from risk_records where id = $1', [created.id]);
    expect(rows[0].obs).toBe('primeiro');
  });

  it('retorna not_found para um id inexistente', async () => {
    const result = await updateRecordById(sql, '00000000-0000-0000-0000-000000000000', { area: 'X' });
    expect(result.status).toBe('not_found');
  });
});

describe('acoes_itens — plano de ação em jsonb', () => {
  const itens = [
    { id: 'a1', descricao: 'Revisar rotina', responsavel: 'JOEL', prazo: '2026-08-15', status: 'A fazer' as const },
    { id: 'a2', descricao: 'Treinar equipe', responsavel: '', prazo: '', status: 'Concluída' as const },
  ];

  it('registro criado sem plano vem com lista vazia', async () => {
    const created = await createRecord(sql, { area: 'Sem plano' });
    expect(created.acoes_itens).toEqual([]);
  });

  it('grava e lê a lista de volta como array desserializado', async () => {
    const created = await createRecord(sql, { area: 'Com plano', acoes_itens: itens });
    expect(created.acoes_itens).toEqual(itens);
    const listadas = (await listRecords(sql)).find(r => r.id === created.id);
    expect(listadas?.acoes_itens).toEqual(itens);
  });

  it('substitui a lista inteira no update e incrementa a versão', async () => {
    const created = await createRecord(sql, { acoes_itens: itens });
    const result = await updateRecordById(sql, created.id, {
      acoes_itens: [itens[0]],
      acoes: 'Revisar rotina',
    }, created.version);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.record.acoes_itens).toEqual([itens[0]]);
      expect(result.record.acoes).toBe('Revisar rotina');
      expect(result.record.version).toBe(2);
    }
  });

  it('aceita esvaziar a lista', async () => {
    const created = await createRecord(sql, { acoes_itens: itens });
    const result = await updateRecordById(sql, created.id, { acoes_itens: [] });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.record.acoes_itens).toEqual([]);
  });
});
