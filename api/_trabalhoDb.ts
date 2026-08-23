// Unificação de tarefa e mitigação numa tabela só.
//
// Uma tarefa do quadro e uma ação de risco sempre foram a mesma coisa —
// alguém faz algo até uma data — e diferiam só no que a coisa serve. Isso é
// uma FK opcional, não duas tabelas: `risco_id` preenchido = mitigação;
// nulo = tarefa livre. Enquanto foram duas, a mesma entrega era cadastrada
// nos dois lugares e contada duas vezes.
//
// A tabela sobrevivente é `tasks`, por dois motivos práticos:
//
//   - os anexos (`task_attachments`) referenciam `tasks(id)`. Mantendo-a, a
//     evidência de conclusão não se move — e migrar anexo é o que se evita.
//   - a UI do quadro (1.760 linhas, difícil de testar) fica onde está; quem se
//     move é a camada de leitura, que é pura e tem teste.
//
// `acoes_risco` CONGELA, como `acoes_itens` antes dela: ninguém mais escreve,
// as linhas ficam, e a cópia preserva o `id` de cada uma — o que mantém a
// trilha de auditoria válida, já que ela referencia o id da ação.
//
// O ponto de costura é `acoesRiscoSobreTasks`: implementa a MESMA interface
// `Tabela<AcaoRisco>` que a fábrica genérica produzia, então a rota do
// portfólio, a auditoria, o backup e as 24 telas e métricas que leem ação não
// mudam uma linha. Trocou-se o que está atrás da interface, não a interface.
import type { Sql } from './_db.js';
import { toDateISO, type Campo, type Tabela, type UpdateOutcome } from './_table.js';
import type { AcaoRisco, StatusAcaoRisco } from '../src/types.js';

/** Nome da tabela na trilha de auditoria. Continua `acoes_risco` de propósito:
 *  o histórico já gravado usa esse rótulo, e o registro é sobre a mitigação,
 *  não sobre onde ela é armazenada hoje. */
export const ROTULO_AUDITORIA = 'acoes_risco';

/** Marca de migração já executada. Sem isso a cópia ressuscitaria, a cada
 *  requisição, toda mitigação que alguém excluiu depois. */
const MARCA = 'trabalho_unificado_v1';

/* ------------------------------------------------------------------ */
/* Status: dois vocabulários, uma coluna                               */
/* ------------------------------------------------------------------ */

// A coluna guarda o vocabulário do QUADRO, e não o da ação, porque as 68
// tarefas existentes já estão nele — reescrevê-las seria mexer justamente nos
// dados que todo o trabalho anterior fez questão de não tocar. Quem traduz é a
// projeção, nos dois sentidos.
//
// 'Cancelada' não existia no quadro e passa a existir: a ação tem esse estado,
// e tarefa também se cancela. Valor desconhecido atravessa intacto, nos dois
// sentidos — o mapa nunca destrói o que não reconhece.
const PARA_QUADRO: Record<string, string> = {
  aberta: 'A fazer',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

const PARA_ACAO: Record<string, StatusAcaoRisco> = {
  'A fazer': 'aberta',
  'Em andamento': 'em_andamento',
  'Concluída': 'concluida',
  'Concluida': 'concluida',
  'Cancelada': 'cancelada',
};

export function statusParaQuadro(status: string): string {
  return PARA_QUADRO[status] ?? status;
}

export function statusParaAcao(status: string): StatusAcaoRisco {
  return PARA_ACAO[status] ?? (status as StatusAcaoRisco);
}

/* ------------------------------------------------------------------ */
/* Esquema                                                             */
/* ------------------------------------------------------------------ */

/** Colunas de vínculo em `tasks`. Só colunas — nenhuma referência, para poder
 *  rodar antes de `pessoas`, `iniciativas` e `risk_records` existirem. */
export async function ensureColunasDeVinculo(sql: Sql): Promise<void> {
  const colunas: [string, string][] = [
    ['risco_id', 'uuid'],
    ['iniciativa_id', 'uuid'],
    ['dono_id', 'uuid'],
    ['prazo', 'date'],
    ['indicador_sucesso', "text not null default ''"],
    ['triagem', "text not null default ''"],
  ];
  for (const [nome, tipo] of colunas) {
    await sql(`alter table tasks add column if not exists ${nome} ${tipo}`);
  }
  await sql('create index if not exists tasks_risco_idx on tasks (risco_id)');
  await sql('create index if not exists tasks_iniciativa_idx on tasks (iniciativa_id)');
}

/**
 * As três chaves estrangeiras, adicionadas onde as tabelas referenciadas já
 * existem. Postgres não tem `add constraint if not exists`, daí o bloco.
 *
 * `risco_id` é `set null`, e não `cascade` como era em `acoes_risco`: excluir
 * um risco passa a DESVINCULAR a mitigação em vez de apagá-la. O trabalho pode
 * ter sido real, e hoje ele some sem volta — o "desfazer" da exclusão recria o
 * risco com id novo e as ações não voltam. Órfã visível no quadro é recuperável;
 * linha apagada não é.
 */
export async function ensureVinculosFK(sql: Sql): Promise<void> {
  const fks: [string, string, string, string][] = [
    ['tasks_risco_fk', 'risco_id', 'risk_records', 'set null'],
    ['tasks_iniciativa_fk', 'iniciativa_id', 'iniciativas', 'set null'],
    ['tasks_dono_fk', 'dono_id', 'pessoas', 'set null'],
  ];
  for (const [nome, coluna, alvo, onDelete] of fks) {
    // A checagem vem antes num `select` comum, e não num bloco `do $$`, porque
    // o driver da Neon é HTTP: uma instrução por requisição, protocolo
    // estendido. Cifrão duplo ali é aposta desnecessária quando duas
    // instruções triviais resolvem — e são as mesmas que o resto do esquema
    // já usa em produção.
    const existe = await sql(
      'select 1 from pg_constraint where conname = $1', [nome],
    );
    if (existe.length > 0) continue;
    await sql(`
      alter table tasks add constraint ${nome}
        foreign key (${coluna}) references ${alvo}(id) on delete ${onDelete}
    `);
  }
}

export interface ResultadoUnificacao {
  jaExecutada: boolean;
  copiadas: number;
}

/**
 * Copia as mitigações de `acoes_risco` para `tasks`, uma vez só, preservando o
 * `id` de cada uma. Preservar o id é o que mantém válida a trilha de auditoria
 * (que referencia o id da ação) e qualquer link já compartilhado.
 *
 * Roda sob marca em `migracoes`: sem ela, uma mitigação excluída no quadro
 * voltaria do congelado na requisição seguinte.
 */
export async function unificarTrabalho(sql: Sql): Promise<ResultadoUnificacao> {
  await sql(`
    create table if not exists migracoes (
      nome text primary key,
      em   timestamptz not null default now()
    )
  `);
  const marca = await sql('select 1 from migracoes where nome = $1', [MARCA]);
  if (marca.length > 0) return { jaExecutada: true, copiadas: 0 };

  const copiadas = await sql(`
    insert into tasks (
      id, position, tipo, tarefa, detalhes, g, u, t, status, responsavel, obs,
      risco_id, iniciativa_id, dono_id, prazo, indicador_sucesso, triagem,
      created_at, updated_at, version
    )
    select
      a.id,
      (select coalesce(max(position), -1) from tasks)
        + row_number() over (order by a.position asc, a.created_at asc),
      '', a.descricao, '', null, null, null,
      case a.status
        when 'aberta'       then 'A fazer'
        when 'em_andamento' then 'Em andamento'
        when 'concluida'    then 'Concluída'
        when 'cancelada'    then 'Cancelada'
        else a.status
      end,
      '', '',
      a.risco_id, a.iniciativa_id, a.dono_id, a.prazo, a.indicador_sucesso, a.triagem,
      a.created_at, a.updated_at, a.version
    from acoes_risco a
    where not exists (select 1 from tasks t where t.id = a.id)
    returning id
  `);

  await sql(
    'insert into migracoes (nome) values ($1) on conflict (nome) do nothing',
    [MARCA],
  );
  return { jaExecutada: false, copiadas: copiadas.length };
}

/* ------------------------------------------------------------------ */
/* Projeção: as mitigações de `tasks` na forma `AcaoRisco`             */
/* ------------------------------------------------------------------ */

/** Campos graváveis da mitigação, na forma que o resto do app conhece. */
const CAMPOS: readonly Campo[] = [
  { nome: 'risco_id', tipo: 'uuid' },
  { nome: 'iniciativa_id', tipo: 'uuid' },
  { nome: 'descricao', tipo: 'text' },
  { nome: 'dono_id', tipo: 'uuid' },
  { nome: 'prazo', tipo: 'date' },
  { nome: 'indicador_sucesso', tipo: 'text' },
  { nome: 'status', tipo: 'text' },
  { nome: 'triagem', tipo: 'text' },
];

/** Nome da coluna em `tasks` para cada campo da mitigação. A descrição da ação
 *  é o título da tarefa; o resto tem o mesmo nome dos dois lados. */
const COLUNA: Record<string, string> = { descricao: 'tarefa' };

const CAMPO_SET = new Set(CAMPOS.map(c => c.nome));

function paraSql(campo: string, v: unknown): unknown {
  if (campo === 'status') return statusParaQuadro(v == null ? '' : String(v));
  if (campo === 'prazo') return v == null || v === '' ? null : v;
  if (campo === 'risco_id' || campo === 'iniciativa_id' || campo === 'dono_id') {
    return v == null || v === '' ? null : String(v);
  }
  return v ?? '';
}

function paraAcao(row: Record<string, unknown>): AcaoRisco {
  return {
    id: String(row.id),
    risco_id: row.risco_id == null ? null : String(row.risco_id),
    iniciativa_id: row.iniciativa_id == null ? null : String(row.iniciativa_id),
    descricao: (row.tarefa as string) ?? '',
    dono_id: row.dono_id == null ? null : String(row.dono_id),
    prazo: toDateISO(row.prazo),
    indicador_sucesso: (row.indicador_sucesso as string) ?? '',
    status: statusParaAcao((row.status as string) ?? ''),
    triagem: ((row.triagem as string) ?? '') as AcaoRisco['triagem'],
    version: Number(row.version ?? 1),
    updated_at: row.updated_at instanceof Date
      ? row.updated_at.toISOString()
      : String(row.updated_at ?? ''),
  };
}

/**
 * `Tabela<AcaoRisco>` servida por `tasks`. Só enxerga linha vinculada a risco —
 * tarefa livre não é mitigação e não pode aparecer no plano de ação, no Rastro
 * nem na fila da Triagem.
 */
export const acoesRiscoSobreTasks: Tabela<AcaoRisco> = {
  nome: ROTULO_AUDITORIA,
  campos: CAMPOS,
  campoSet: CAMPO_SET,

  async ensure(sql) {
    await ensureColunasDeVinculo(sql);
  },

  async list(sql) {
    const rows = await sql(
      `select * from tasks where risco_id is not null
       order by position asc, created_at asc`,
    );
    return rows.map(paraAcao);
  },

  async byId(sql, id) {
    const rows = await sql(
      'select * from tasks where id = $1 and risco_id is not null', [id],
    );
    return rows[0] ? paraAcao(rows[0]) : null;
  },

  async create(sql, data) {
    const cols = CAMPOS.map(c => COLUNA[c.nome] ?? c.nome);
    const params = CAMPOS.map(c => paraSql(c.nome, data[c.nome]));
    const ph = params.map((_, i) => `$${i + 1}`);
    const rows = await sql(
      `insert into tasks (position, ${cols.join(', ')})
       values ((select coalesce(max(position), -1) + 1 from tasks), ${ph.join(', ')})
       returning *`,
      params,
    );
    return paraAcao(rows[0]);
  },

  async update(sql, id, patch, expectedVersion) {
    const entries = Object.entries(patch).filter(([k]) => CAMPO_SET.has(k));
    if (entries.length === 0) {
      const atual = await this.byId(sql, id);
      return atual ? { status: 'ok', item: atual } : { status: 'not_found' };
    }
    const params: unknown[] = [];
    const sets = entries.map(([k, v]) => {
      params.push(paraSql(k, v));
      return `${COLUNA[k] ?? k} = $${params.length}`;
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
    if (rows[0]) return { status: 'ok', item: paraAcao(rows[0]) };

    const atual = await this.byId(sql, id);
    return (atual ? { status: 'conflict', item: atual } : { status: 'not_found' }) as UpdateOutcome<AcaoRisco>;
  },

  async remove(sql, id) {
    const rows = await sql(
      'delete from tasks where id = $1 and risco_id is not null returning id', [id],
    );
    return rows.length > 0;
  },
};
