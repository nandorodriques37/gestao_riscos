// Fábrica de tabelas do portfólio. Descreve-se uma tabela por seus campos
// tipados e daqui saem DDL, CRUD e conversão de linha — a mesma semântica já
// provada em `_db.ts` (allowlist de campos, `position`, `version`, concorrência
// otimista), sem repetir o código cinco vezes.
//
// `_db.ts` e `_tasksDb.ts` NÃO foram migrados para cá de propósito: funcionam,
// têm teste e guardam os dados reais. Esta fábrica serve as entidades novas.
import type { Sql } from './_db.js';

export type Tipo = 'text' | 'numeric' | 'date' | 'bool' | 'uuid';

export interface Campo {
  nome: string;
  tipo: Tipo;
  /** Chave estrangeira. Só faz sentido em campo `uuid`. */
  ref?: { tabela: string; onDelete: 'cascade' | 'set null' | 'restrict' };
  /** Default de coluna `bool`. Ignorado nos demais tipos. */
  padrao?: boolean;
}

export interface TabelaSpec {
  nome: string;
  campos: readonly Campo[];
  /** Cria a coluna `position` e mantém a ordem de inserção na listagem. */
  ordenavel?: boolean;
  /** Colunas que ganham índice — as usadas como filtro de junção. */
  indices?: readonly string[];
}

/** Resultado de uma atualização com checagem de concorrência otimista. */
export type UpdateOutcome<T> =
  | { status: 'ok'; item: T }
  | { status: 'conflict'; item: T }
  | { status: 'not_found' };

export interface Tabela<T> {
  readonly nome: string;
  readonly campos: readonly Campo[];
  /** Allowlist de campos graváveis — o que não está aqui é descartado do patch. */
  readonly campoSet: ReadonlySet<string>;
  ensure(sql: Sql): Promise<void>;
  list(sql: Sql): Promise<T[]>;
  byId(sql: Sql, id: string): Promise<T | null>;
  create(sql: Sql, data: Record<string, unknown>): Promise<T>;
  update(sql: Sql, id: string, patch: Record<string, unknown>, expectedVersion?: number): Promise<UpdateOutcome<T>>;
  remove(sql: Sql, id: string): Promise<boolean>;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toNumberOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isNaN(n) ? null : n;
}

/**
 * Normaliza uma coluna `date` para 'YYYY-MM-DD' — o formato que o
 * `<input type="date">` exige e que `AcaoItem.prazo` já usa.
 *
 * Coluna `date` não tem hora, mas cada driver monta o `Date` num ponto
 * diferente: pglite entrega meia-noite UTC, node-postgres entrega meia-noite
 * local. Ler pelo lado em que a hora é zero devolve o mesmo dia nos dois casos,
 * em qualquer fuso — sem isso o dia escorrega para o anterior a oeste de
 * Greenwich (ou para o seguinte a leste).
 */
export function toDateISO(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const meiaNoiteUTC = v.getUTCHours() === 0 && v.getUTCMinutes() === 0 && v.getUTCSeconds() === 0;
    return meiaNoiteUTC
      ? v.toISOString().slice(0, 10)
      : `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
  }
  return String(v).slice(0, 10);
}

/** Tipo SQL da coluna, incluindo default e chave estrangeira. */
function colunaSql(c: Campo): string {
  switch (c.tipo) {
    case 'text':
      return "text not null default ''";
    case 'numeric':
      return 'numeric';
    case 'date':
      return 'date';
    case 'bool':
      return `boolean not null default ${c.padrao === false ? 'false' : 'true'}`;
    case 'uuid':
      return c.ref ? `uuid references ${c.ref.tabela}(id) on delete ${c.ref.onDelete}` : 'uuid';
  }
}

/** Valor que vai para o parâmetro da SQL. */
function paraSql(c: Campo, v: unknown): unknown {
  switch (c.tipo) {
    case 'text':
      return v ?? '';
    case 'numeric':
      return toNumberOrNull(v);
    case 'date':
      return v == null || v === '' ? null : v;
    case 'bool':
      return v == null ? c.padrao !== false : Boolean(v);
    case 'uuid':
      return v == null || v === '' ? null : String(v);
  }
}

/** Valor que sai da linha do banco para o front. */
function doRow(c: Campo, v: unknown): unknown {
  switch (c.tipo) {
    case 'text':
      return (v as string) ?? '';
    case 'numeric':
      return toNumberOrNull(v);
    case 'date':
      return toDateISO(v);
    case 'bool':
      return Boolean(v);
    case 'uuid':
      return v == null ? null : String(v);
  }
}

/** Timestamp para ISO — `updated_at` alimenta a métrica de iniciativas paradas. */
function toISO(v: unknown): string {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString();
  return v == null ? '' : String(v);
}

export function makeTable<T>(spec: TabelaSpec): Tabela<T> {
  const { nome, campos, ordenavel = false, indices = [] } = spec;
  const campoSet = new Set(campos.map(c => c.nome));
  const porNome = new Map(campos.map(c => [c.nome, c]));
  const ordem = ordenavel ? 'order by position asc, created_at asc' : 'order by created_at asc';

  function rowTo(row: Record<string, unknown>): T {
    const out: Record<string, unknown> = { id: String(row.id) };
    campos.forEach(c => { out[c.nome] = doRow(c, row[c.nome]); });
    out.version = Number(row.version ?? 1);
    out.updated_at = toISO(row.updated_at);
    return out as T;
  }

  return {
    nome,
    campos,
    campoSet,

    async ensure(sql) {
      const colunas = campos.map(c => `${c.nome} ${colunaSql(c)}`);
      await sql(`
        create table if not exists ${nome} (
          id uuid primary key default gen_random_uuid(),
          ${ordenavel ? 'position integer not null default 0,' : ''}
          ${colunas.join(',\n          ')},
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          version integer not null default 1
        )
      `);
      // Migração aditiva para bancos criados antes de um campo novo. Sai de
      // graça da própria descrição — é o que `_db.ts` faz à mão hoje.
      for (const c of campos) {
        await sql(`alter table ${nome} add column if not exists ${c.nome} ${colunaSql(c)}`);
      }
      for (const col of indices) {
        await sql(`create index if not exists ${nome}_${col}_idx on ${nome} (${col})`);
      }
    },

    async list(sql) {
      const rows = await sql(`select * from ${nome} ${ordem}`);
      return rows.map(rowTo);
    },

    async byId(sql, id) {
      const rows = await sql(`select * from ${nome} where id = $1`, [id]);
      return rows[0] ? rowTo(rows[0]) : null;
    },

    async create(sql, data) {
      const params = campos.map(c => paraSql(c, data[c.nome]));
      const ph = params.map((_, i) => `$${i + 1}`);
      const cols = campos.map(c => c.nome);
      const posCol = ordenavel ? 'position, ' : '';
      const posVal = ordenavel ? `(select coalesce(max(position), -1) + 1 from ${nome}), ` : '';
      const rows = await sql(
        `insert into ${nome} (${posCol}${cols.join(', ')})
         values (${posVal}${ph.join(', ')})
         returning *`,
        params,
      );
      return rowTo(rows[0]);
    },

    async update(sql, id, patch, expectedVersion) {
      const entries = Object.entries(patch).filter(([k]) => campoSet.has(k));
      if (entries.length === 0) {
        const atual = await this.byId(sql, id);
        return atual ? { status: 'ok', item: atual } : { status: 'not_found' };
      }
      const params: unknown[] = [];
      const sets = entries.map(([k, v]) => {
        params.push(paraSql(porNome.get(k)!, v));
        return `${k} = $${params.length}`;
      });
      sets.push('updated_at = now()', 'version = version + 1');
      params.push(id);
      let text = `update ${nome} set ${sets.join(', ')} where id = $${params.length}`;
      if (expectedVersion != null) {
        params.push(expectedVersion);
        text += ` and version = $${params.length}`;
      }
      text += ' returning *';
      const rows = await sql(text, params);
      if (rows[0]) return { status: 'ok', item: rowTo(rows[0]) };

      // Nenhuma linha batida: separa "não existe" de "existe, versão mudou".
      const atual = await this.byId(sql, id);
      return atual ? { status: 'conflict', item: atual } : { status: 'not_found' };
    },

    async remove(sql, id) {
      const rows = await sql(`delete from ${nome} where id = $1 returning id`, [id]);
      return rows.length > 0;
    },
  };
}
