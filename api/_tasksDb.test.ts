import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { ensureTasksSchema, createTask, updateTaskById, type Sql } from './_tasksDb';

// Testa a camada de acesso a dados das Tarefas contra um Postgres real
// (pglite, em memória) — mesma engine usada em produção (Neon), garantindo
// que a checagem de concorrência otimista (coluna `version`) funcione de
// verdade, não apenas contra um mock. Independente de `_db.test.ts` (riscos).
let pg: PGlite;
let sql: Sql;

beforeAll(async () => {
  pg = new PGlite();
  sql = async (text, params = []) => {
    const result = await pg.query(text, params as unknown[]);
    return result.rows as Record<string, unknown>[];
  };
  await ensureTasksSchema(sql);
});

afterAll(async () => {
  await pg.close();
});

describe('ensureTasksSchema — seed inicial', () => {
  it('popula a tabela com as tarefas da planilha na primeira execução', async () => {
    const rows = await sql('select count(*)::int as count from tasks');
    expect(Number(rows[0].count)).toBeGreaterThan(0);
  });
});

describe('updateTaskById — concorrência otimista', () => {
  it('cria uma tarefa com version = 1', async () => {
    const created = await createTask(sql, { tipo: 'Estudo', tarefa: 'teste' });
    expect(created.version).toBe(1);
  });

  it('sem expectedVersion, atualiza incondicionalmente e incrementa a versão', async () => {
    const created = await createTask(sql, { tarefa: 'A' });
    const result = await updateTaskById(sql, created.id, { tarefa: 'B' });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.task.tarefa).toBe('B');
      expect(result.task.version).toBe(2);
    }
  });

  it('com expectedVersion correto, atualiza normalmente', async () => {
    const created = await createTask(sql, { tarefa: 'A' });
    const result = await updateTaskById(sql, created.id, { tarefa: 'B' }, created.version);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.task.version).toBe(2);
  });

  it('com expectedVersion desatualizado, retorna conflict com a tarefa atual', async () => {
    const created = await createTask(sql, { obs: 'original' });
    // simula outro usuário gravando primeiro (version 1 -> 2)
    await updateTaskById(sql, created.id, { obs: 'de outro usuário' });
    // este cliente ainda acha que está na version 1 (desatualizado)
    const result = await updateTaskById(sql, created.id, { obs: 'minha edição' }, created.version);
    expect(result.status).toBe('conflict');
    if (result.status === 'conflict') {
      expect(result.task.obs).toBe('de outro usuário');
      expect(result.task.version).toBe(2);
    }
  });

  it('em conflito, a gravação perdedora não é aplicada no banco', async () => {
    const created = await createTask(sql, { obs: 'original' });
    await updateTaskById(sql, created.id, { obs: 'primeiro' });
    await updateTaskById(sql, created.id, { obs: 'não deveria aparecer' }, created.version);
    const rows = await sql('select * from tasks where id = $1', [created.id]);
    expect(rows[0].obs).toBe('primeiro');
  });

  it('retorna not_found para um id inexistente', async () => {
    const result = await updateTaskById(sql, '00000000-0000-0000-0000-000000000000', { tarefa: 'X' });
    expect(result.status).toBe('not_found');
  });
});
