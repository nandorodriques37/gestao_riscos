// Camada de acesso a dados compartilhada pela API serverless (Vercel Functions,
// via Neon) e pelo middleware de desenvolvimento (pglite). Toda a lógica SQL
// fica aqui, parametrizada por um executor `Sql` para ser testável e portável.
import { neon } from '@neondatabase/serverless';
import initialRecords from '../src/data/initialRecords.json';
import type { RiskRecord } from '../src/types';

// Dados-semente importados como JSON (empacotados de forma confiável pelo
// bundler das funções serverless do Vercel).
const INITIAL_RECORDS = initialRecords as RiskRecord[];

/** Executor SQL mínimo: recebe texto parametrizado ($1, $2, …) e retorna as linhas. */
export type Sql = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export interface StoredRiskRecord extends RiskRecord {
  id: string;
}

/** Campos editáveis do registro (na ordem das colunas da tabela). */
export const RECORD_FIELDS = [
  'area', 'rotina', 'categoria', 'risco', 'resposta',
  'probab', 'impact', 'acoes', 'resultado',
  'esforco', 'impacto2', 'gravidade',
  'recurso', 'responsavel', 'status', 'obs',
] as const;

type RecordField = (typeof RECORD_FIELDS)[number];

const NUMERIC_FIELDS = new Set<RecordField>(['probab', 'impact', 'esforco', 'impacto2', 'gravidade']);
const FIELD_SET = new Set<string>(RECORD_FIELDS);

/** Cria o executor de produção conectado ao Neon (Postgres). */
export function neonSql(): Sql {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL não configurada — conecte um banco Neon no Vercel.');
  const sql = neon(url);
  return (text, params = []) => sql.query(text, params) as Promise<Record<string, unknown>[]>;
}

function toNumberOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  return typeof v === 'number' ? v : Number(v);
}

function rowToRecord(row: Record<string, unknown>): StoredRiskRecord {
  return {
    id: String(row.id),
    area: (row.area as string) ?? '',
    rotina: (row.rotina as string) ?? '',
    categoria: (row.categoria as string) ?? '',
    risco: (row.risco as string) ?? '',
    resposta: (row.resposta as string) ?? '',
    probab: toNumberOrNull(row.probab),
    impact: toNumberOrNull(row.impact),
    acoes: (row.acoes as string) ?? '',
    resultado: (row.resultado as string) ?? '',
    esforco: toNumberOrNull(row.esforco),
    impacto2: toNumberOrNull(row.impacto2),
    gravidade: toNumberOrNull(row.gravidade),
    recurso: (row.recurso as string) ?? '',
    responsavel: (row.responsavel as string) ?? '',
    status: (row.status as string) ?? '',
    obs: (row.obs as string) ?? '',
  };
}

function fieldValue(rec: Partial<RiskRecord>, field: RecordField): unknown {
  const v = rec[field];
  if (NUMERIC_FIELDS.has(field)) return v == null || v === '' ? null : v;
  return v ?? '';
}

export async function ensureSchema(sql: Sql): Promise<void> {
  await sql(`
    create table if not exists risk_records (
      id          uuid primary key default gen_random_uuid(),
      position    integer not null default 0,
      area        text not null default '',
      rotina      text not null default '',
      categoria   text not null default '',
      risco       text not null default '',
      resposta    text not null default '',
      probab      numeric,
      impact      numeric,
      acoes       text not null default '',
      resultado   text not null default '',
      esforco     numeric,
      impacto2    numeric,
      gravidade   numeric,
      recurso     text not null default '',
      responsavel text not null default '',
      status      text not null default '',
      obs         text not null default '',
      created_at  timestamptz not null default now(),
      updated_at  timestamptz not null default now()
    )
  `);
  const rows = await sql('select count(*)::int as count from risk_records');
  const count = Number(rows[0]?.count ?? 0);
  if (count === 0) {
    console.log(`[db] tabela vazia — populando com ${INITIAL_RECORDS.length} registros iniciais`);
    await seed(sql);
  }
}

/** Quantidade de registros-semente disponíveis no bundle (diagnóstico). */
export function seedSize(): number {
  return INITIAL_RECORDS.length;
}

export async function countRecords(sql: Sql): Promise<number> {
  const rows = await sql('select count(*)::int as count from risk_records');
  return Number(rows[0]?.count ?? 0);
}

/** Insere os registros iniciais preservando a ordem original. */
async function seed(sql: Sql): Promise<void> {
  if (INITIAL_RECORDS.length === 0) return;
  const cols = ['position', ...RECORD_FIELDS];
  const params: unknown[] = [];
  const valueRows = INITIAL_RECORDS.map((rec, i) => {
    const rowParams = [i, ...RECORD_FIELDS.map(f => fieldValue(rec, f))];
    const placeholders = rowParams.map(p => `$${params.push(p)}`);
    return `(${placeholders.join(', ')})`;
  });
  const text = `insert into risk_records (${cols.join(', ')}) values ${valueRows.join(', ')}`;
  await sql(text, params);
}

export async function listRecords(sql: Sql): Promise<StoredRiskRecord[]> {
  const rows = await sql('select * from risk_records order by position asc, created_at asc');
  return rows.map(rowToRecord);
}

export async function createRecord(sql: Sql, data: Partial<RiskRecord>): Promise<StoredRiskRecord> {
  const cols = [...RECORD_FIELDS];
  const params = RECORD_FIELDS.map(f => fieldValue(data, f));
  const ph = params.map((_, i) => `$${i + 1}`);
  const text = `
    insert into risk_records (position, ${cols.join(', ')})
    values ((select coalesce(max(position), -1) + 1 from risk_records), ${ph.join(', ')})
    returning *`;
  const rows = await sql(text, params);
  return rowToRecord(rows[0]);
}

export async function updateRecordById(sql: Sql, id: string, patch: Partial<RiskRecord>): Promise<StoredRiskRecord | null> {
  const entries = Object.entries(patch).filter(([k]) => FIELD_SET.has(k));
  if (entries.length === 0) {
    const rows = await sql('select * from risk_records where id = $1', [id]);
    return rows[0] ? rowToRecord(rows[0]) : null;
  }
  const params: unknown[] = [];
  const sets = entries.map(([k, v]) => {
    params.push(fieldValue({ [k]: v } as Partial<RiskRecord>, k as RecordField));
    return `${k} = $${params.length}`;
  });
  sets.push('updated_at = now()');
  params.push(id);
  const text = `update risk_records set ${sets.join(', ')} where id = $${params.length} returning *`;
  const rows = await sql(text, params);
  return rows[0] ? rowToRecord(rows[0]) : null;
}

export async function deleteRecordById(sql: Sql, id: string): Promise<boolean> {
  const rows = await sql('delete from risk_records where id = $1 returning id', [id]);
  return rows.length > 0;
}

/** Restaura os dados originais: limpa a tabela e reinsere os registros iniciais. */
export async function restoreRecords(sql: Sql): Promise<StoredRiskRecord[]> {
  await sql('delete from risk_records');
  await seed(sql);
  return listRecords(sql);
}
