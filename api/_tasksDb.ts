// Camada de acesso a dados da Gestão de Tarefas (Matriz GUT) — independente
// de `_db.ts` (riscos). Mesmo padrão: toda a lógica SQL fica aqui,
// parametrizada por um executor `Sql` para ser testável e portável.
import { INITIAL_TASKS } from './_tasksSeed.js';
import type { Task } from '../src/types';
import { neonSql, type Sql } from './_db.js';

export { neonSql };
export type { Sql };

export interface StoredTask extends Task {
  id: string;
  version: number;
}

/** Resultado de uma tentativa de atualização com checagem de concorrência otimista. */
export type TaskUpdateOutcome =
  | { status: 'ok'; task: StoredTask }
  | { status: 'conflict'; task: StoredTask }
  | { status: 'not_found' };

/** Campos editáveis da tarefa (na ordem das colunas da tabela). */
export const TASK_FIELDS = ['tipo', 'tarefa', 'detalhes', 'g', 'u', 't', 'status', 'responsavel', 'obs'] as const;

type TaskField = (typeof TASK_FIELDS)[number];

const NUMERIC_FIELDS = new Set<TaskField>(['g', 'u', 't']);
const FIELD_SET = new Set<string>(TASK_FIELDS);

function toNumberOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  return typeof v === 'number' ? v : Number(v);
}

function rowToTask(row: Record<string, unknown>): StoredTask {
  return {
    id: String(row.id),
    tipo: (row.tipo as string) ?? '',
    tarefa: (row.tarefa as string) ?? '',
    detalhes: (row.detalhes as string) ?? '',
    g: toNumberOrNull(row.g),
    u: toNumberOrNull(row.u),
    t: toNumberOrNull(row.t),
    status: (row.status as string) ?? '',
    responsavel: (row.responsavel as string) ?? '',
    obs: (row.obs as string) ?? '',
    version: Number(row.version ?? 1),
  };
}

function fieldValue(rec: Partial<Task>, field: TaskField): unknown {
  const v = rec[field];
  if (NUMERIC_FIELDS.has(field)) return v == null || v === '' ? null : v;
  return v ?? '';
}

export async function ensureTasksSchema(sql: Sql): Promise<void> {
  await sql(`
    create table if not exists tasks (
      id          uuid primary key default gen_random_uuid(),
      position    integer not null default 0,
      tipo        text not null default '',
      tarefa      text not null default '',
      detalhes    text not null default '',
      g           numeric,
      u           numeric,
      t           numeric,
      status      text not null default '',
      responsavel text not null default '',
      obs         text not null default '',
      created_at  timestamptz not null default now(),
      updated_at  timestamptz not null default now(),
      version     integer not null default 1
    )
  `);
  const rows = await sql('select count(*)::int as count from tasks');
  const count = Number(rows[0]?.count ?? 0);
  if (count === 0) {
    console.log(`[db] tabela tasks vazia — populando com ${INITIAL_TASKS.length} tarefas iniciais`);
    await seed(sql);
  }
}

/** Insere as tarefas iniciais preservando a ordem original. */
async function seed(sql: Sql): Promise<void> {
  if (INITIAL_TASKS.length === 0) return;
  const cols = ['position', ...TASK_FIELDS];
  const params: unknown[] = [];
  const valueRows = INITIAL_TASKS.map((rec, i) => {
    const rowParams = [i, ...TASK_FIELDS.map(f => fieldValue(rec, f))];
    const placeholders = rowParams.map(p => `$${params.push(p)}`);
    return `(${placeholders.join(', ')})`;
  });
  const text = `insert into tasks (${cols.join(', ')}) values ${valueRows.join(', ')}`;
  await sql(text, params);
}

export async function listTasks(sql: Sql): Promise<StoredTask[]> {
  const rows = await sql('select * from tasks order by position asc, created_at asc');
  return rows.map(rowToTask);
}

export async function createTask(sql: Sql, data: Partial<Task>): Promise<StoredTask> {
  const cols = [...TASK_FIELDS];
  const params = TASK_FIELDS.map(f => fieldValue(data, f));
  const ph = params.map((_, i) => `$${i + 1}`);
  const text = `
    insert into tasks (position, ${cols.join(', ')})
    values ((select coalesce(max(position), -1) + 1 from tasks), ${ph.join(', ')})
    returning *`;
  const rows = await sql(text, params);
  return rowToTask(rows[0]);
}

/**
 * Atualiza uma tarefa. Se `expectedVersion` for informado, a gravação só é
 * aplicada se a versão no banco ainda for essa (concorrência otimista) — evita
 * que a edição de um usuário sobrescreva silenciosamente a de outro no mesmo
 * campo. Sem `expectedVersion`, atualiza incondicionalmente (compatibilidade).
 */
export async function updateTaskById(
  sql: Sql, id: string, patch: Partial<Task>, expectedVersion?: number,
): Promise<TaskUpdateOutcome> {
  const entries = Object.entries(patch).filter(([k]) => FIELD_SET.has(k));
  if (entries.length === 0) {
    const rows = await sql('select * from tasks where id = $1', [id]);
    return rows[0] ? { status: 'ok', task: rowToTask(rows[0]) } : { status: 'not_found' };
  }
  const params: unknown[] = [];
  const sets = entries.map(([k, v]) => {
    params.push(fieldValue({ [k]: v } as Partial<Task>, k as TaskField));
    return `${k} = $${params.length}`;
  });
  sets.push('updated_at = now()', 'version = version + 1');
  params.push(id);
  let text = `update tasks set ${sets.join(', ')} where id = $${params.length}`;
  if (expectedVersion != null) {
    params.push(expectedVersion);
    text += ` and version = $${params.length}`;
  }
  text += ' returning *';
  const rows = await sql(text, params);
  if (rows[0]) return { status: 'ok', task: rowToTask(rows[0]) };

  // Nenhuma linha batida: distingue "não existe" de "existe, mas a versão mudou".
  const current = await sql('select * from tasks where id = $1', [id]);
  if (!current[0]) return { status: 'not_found' };
  return { status: 'conflict', task: rowToTask(current[0]) };
}

export async function deleteTaskById(sql: Sql, id: string): Promise<boolean> {
  const rows = await sql('delete from tasks where id = $1 returning id', [id]);
  return rows.length > 0;
}
