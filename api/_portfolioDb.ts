// Camada de dados do portfólio: objetivo → iniciativa → marco, mais as ações
// que ligam risco a iniciativa. Todas descritas sobre `_table.ts`, com
// as regras de integridade que o banco sozinho não expressa.
//
// A tabela de riscos (`risk_records`) continua em `_db.ts` — `acoes_risco`
// apenas a referencia.
import type { Sql } from './_db.js';
import { makeTable, type Tabela } from './_table.js';
import type {
  Pessoa, Objetivo, Medicao, Iniciativa, Marco, AcaoRisco, PortfolioBundle,
} from '../src/types.js';

export const pessoas: Tabela<Pessoa> = makeTable<Pessoa>({
  nome: 'pessoas',
  campos: [
    { nome: 'nome', tipo: 'text' },
    { nome: 'papel', tipo: 'text' },
    { nome: 'area', tipo: 'text' },
    { nome: 'dias_projeto_mes', tipo: 'numeric' },
    { nome: 'ativo', tipo: 'bool', padrao: true },
  ],
});

export const objetivos: Tabela<Objetivo> = makeTable<Objetivo>({
  nome: 'objetivos',
  ordenavel: true,
  campos: [
    { nome: 'horizonte', tipo: 'text' },
    { nome: 'descricao', tipo: 'text' },
    { nome: 'indicador', tipo: 'text' },
    { nome: 'unidade', tipo: 'text' },
    { nome: 'baseline', tipo: 'numeric' },
    { nome: 'meta', tipo: 'numeric' },
    { nome: 'prazo', tipo: 'date' },
    { nome: 'dono_id', tipo: 'uuid', ref: { tabela: 'pessoas', onDelete: 'set null' } },
    { nome: 'status', tipo: 'text' },
  ],
});

/**
 * Leitura do indicador de um objetivo numa data. Linha por leitura, para a
 * série existir — um campo `valor_atual` no objetivo seria sobrescrito a cada
 * medição e apagaria a tendência, que é o que interessa.
 */
export const medicoes: Tabela<Medicao> = makeTable<Medicao>({
  nome: 'medicoes',
  ordenavel: true,
  campos: [
    { nome: 'objetivo_id', tipo: 'uuid', ref: { tabela: 'objetivos', onDelete: 'cascade' } },
    { nome: 'data', tipo: 'date' },
    { nome: 'valor', tipo: 'numeric' },
    { nome: 'obs', tipo: 'text' },
  ],
});

export const iniciativas: Tabela<Iniciativa> = makeTable<Iniciativa>({
  nome: 'iniciativas',
  ordenavel: true,
  indices: ['objetivo_id', 'dono_id'],
  campos: [
    // `restrict`: apagar um objetivo que ainda tem iniciativa deve falhar com
    // mensagem, não levar o portfólio junto em cascata.
    { nome: 'objetivo_id', tipo: 'uuid', ref: { tabela: 'objetivos', onDelete: 'restrict' } },
    { nome: 'nome', tipo: 'text' },
    { nome: 'descricao', tipo: 'text' },
    { nome: 'vetor', tipo: 'text' },
    { nome: 'fonte', tipo: 'text' },
    { nome: 'dono_id', tipo: 'uuid', ref: { tabela: 'pessoas', onDelete: 'set null' } },
    { nome: 'recurso', tipo: 'text' },
    { nome: 'esforco', tipo: 'numeric' },
    { nome: 'impacto2', tipo: 'numeric' },
    { nome: 'gravidade', tipo: 'numeric' },
    { nome: 'esforco_dias', tipo: 'numeric' },
    { nome: 'impacto_rs', tipo: 'numeric' },
    { nome: 'confianca_impacto', tipo: 'text' },
    { nome: 'inicio', tipo: 'date' },
    { nome: 'fim_plano_original', tipo: 'date' },
    { nome: 'fim_plano_atual', tipo: 'date' },
    { nome: 'fim_real', tipo: 'date' },
    { nome: 'status', tipo: 'text' },
    { nome: 'resultado', tipo: 'text' },
    { nome: 'obs', tipo: 'text' },
  ],
});

export const marcos: Tabela<Marco> = makeTable<Marco>({
  nome: 'marcos',
  ordenavel: true,
  indices: ['iniciativa_id'],
  campos: [
    { nome: 'iniciativa_id', tipo: 'uuid', ref: { tabela: 'iniciativas', onDelete: 'cascade' } },
    { nome: 'nome', tipo: 'text' },
    { nome: 'criterio_aceite', tipo: 'text' },
    { nome: 'data_plano_original', tipo: 'date' },
    { nome: 'data_plano_atual', tipo: 'date' },
    { nome: 'data_real', tipo: 'date' },
    { nome: 'status', tipo: 'text' },
    { nome: 'motivo_replanejamento', tipo: 'text' },
  ],
});

export const acoesRisco: Tabela<AcaoRisco> = makeTable<AcaoRisco>({
  nome: 'acoes_risco',
  ordenavel: true,
  indices: ['risco_id', 'iniciativa_id'],
  campos: [
    { nome: 'risco_id', tipo: 'uuid', ref: { tabela: 'risk_records', onDelete: 'cascade' } },
    // Nulo = mitigação pequena e autônoma. Preenchido = executada dentro de uma
    // iniciativa. `set null` porque apagar a iniciativa não apaga a mitigação:
    // ela volta a ser autônoma e continua cobrando o risco.
    { nome: 'iniciativa_id', tipo: 'uuid', ref: { tabela: 'iniciativas', onDelete: 'set null' } },
    { nome: 'descricao', tipo: 'text' },
    { nome: 'dono_id', tipo: 'uuid', ref: { tabela: 'pessoas', onDelete: 'set null' } },
    { nome: 'prazo', tipo: 'date' },
    { nome: 'indicador_sucesso', tipo: 'text' },
    { nome: 'status', tipo: 'text' },
    // Bookkeeping da migração, não campo de domínio: sem esta marca uma ação
    // que o gestor decidiu manter fica igual a uma que ele ainda não olhou, e
    // a fila de triagem nunca esvazia.
    { nome: 'triagem', tipo: 'text' },
  ],
});

/** Entidades expostas na rota, pelo nome que aparece na URL. */
export const ENTIDADES = {
  pessoas,
  objetivos,
  medicoes,
  iniciativas,
  marcos,
  'acoes-risco': acoesRisco,
} as const;

export type NomeEntidade = keyof typeof ENTIDADES;

export function ehEntidade(nome: string): nome is NomeEntidade {
  return Object.prototype.hasOwnProperty.call(ENTIDADES, nome);
}

/**
 * Cria as tabelas do portfólio em ordem de dependência. `risk_records` já
 * precisa existir — `acoes_risco.risco_id` a referencia — então `ensureSchema`
 * de `_db.ts` roda antes desta.
 */
export async function ensurePortfolioSchema(sql: Sql): Promise<void> {
  await pessoas.ensure(sql);
  await objetivos.ensure(sql);
  await medicoes.ensure(sql);
  await iniciativas.ensure(sql);
  await marcos.ensure(sql);
  await acoesRisco.ensure(sql);
}

/** Todas as listas de uma vez — o front faz um polling só sobre este pacote. */
export async function listPortfolio(sql: Sql): Promise<PortfolioBundle> {
  const [p, o, med, i, m, a] = await Promise.all([
    pessoas.list(sql),
    objetivos.list(sql),
    medicoes.list(sql),
    iniciativas.list(sql),
    marcos.list(sql),
    acoesRisco.list(sql),
  ]);
  return { pessoas: p, objetivos: o, medicoes: med, iniciativas: i, marcos: m, acoes_risco: a };
}

/* ------------------------------------------------------------------------ */
/* Regras de integridade                                                     */
/* ------------------------------------------------------------------------ */

/**
 * Status a partir dos quais a iniciativa precisa ter ao menos um marco.
 * `backlog` ainda é ideia; `cancelada` precisa poder ser marcada mesmo numa
 * iniciativa que nunca ganhou marco — travar isso deixaria lixo vivo no
 * portfólio.
 */
const STATUS_EXIGE_MARCO = new Set(['aprovada', 'em_execucao', 'pausada', 'concluida']);

function vazio(v: unknown): boolean {
  return v == null || (typeof v === 'string' && v.trim() === '');
}

/** Valor após o patch: o que veio no patch, ou o que já estava. */
function efetivo(patch: Record<string, unknown>, atual: Record<string, unknown> | null, campo: string): unknown {
  return campo in patch ? patch[campo] : atual?.[campo];
}

async function contarMarcos(sql: Sql, iniciativaId: string): Promise<number> {
  const rows = await sql('select count(*)::int as count from marcos where iniciativa_id = $1', [iniciativaId]);
  return Number(rows[0]?.count ?? 0);
}

/**
 * Regras 1 e 2 do prompt. Devolve a mensagem de erro, ou `null` quando passa.
 * `atual` é nulo na criação.
 */
export async function validarIniciativa(
  sql: Sql, patch: Record<string, unknown>, atual: Iniciativa | null,
): Promise<string | null> {
  const registro = atual as unknown as Record<string, unknown> | null;

  // 1 — iniciativa sem objetivo não pode ser salva.
  if (vazio(efetivo(patch, registro, 'objetivo_id'))) {
    return 'Iniciativa precisa estar ligada a um objetivo.';
  }

  // 2 — aprovada ou além exige ao menos um marco.
  const status = String(efetivo(patch, registro, 'status') ?? '');
  if (STATUS_EXIGE_MARCO.has(status)) {
    const total = atual ? await contarMarcos(sql, atual.id) : 0;
    if (total === 0) {
      return `Iniciativa em "${status}" precisa de pelo menos um marco. Cadastre o primeiro marco antes de mudar o status.`;
    }
  }
  return null;
}

/**
 * Regras 3 e 4 do prompt. Devolve a mensagem de erro, ou `null` quando passa.
 * `atual` é nulo na criação — no primeiro salvamento nada é imutável ainda.
 */
export function validarMarco(patch: Record<string, unknown>, atual: Marco | null): string | null {
  if (!atual) return null;

  // 3 — a data original é a régua do atraso; mexer nela apagaria o histórico.
  if ('data_plano_original' in patch && !vazio(atual.data_plano_original)) {
    const nova = patch.data_plano_original ?? null;
    if (String(nova ?? '') !== String(atual.data_plano_original ?? '')) {
      return 'A data planejada original não pode ser alterada depois de gravada — é contra ela que o atraso é medido.';
    }
  }

  // 4 — mover a data atual é replanejar, e replanejar exige justificativa.
  // Preencher pela primeira vez não é replanejamento.
  if ('data_plano_atual' in patch && !vazio(atual.data_plano_atual)) {
    const nova = String(patch.data_plano_atual ?? '');
    if (nova !== String(atual.data_plano_atual ?? '')) {
      const motivo = efetivo(patch, atual as unknown as Record<string, unknown>, 'motivo_replanejamento');
      if (vazio(motivo)) {
        return 'Replanejar a data exige preencher o motivo do replanejamento.';
      }
    }
  }
  return null;
}

/**
 * Medição só vale com objetivo, data e valor. Sem os três ela não entra em
 * nenhuma série — viraria uma linha invisível que ninguém consegue corrigir
 * depois, porque não aparece em gráfico nenhum.
 */
export function validarMedicao(
  patch: Record<string, unknown>, atual: Medicao | null,
): string | null {
  const registro = atual as unknown as Record<string, unknown> | null;
  if (vazio(efetivo(patch, registro, 'objetivo_id'))) {
    return 'Medição precisa estar ligada a um objetivo.';
  }
  if (vazio(efetivo(patch, registro, 'data'))) {
    return 'Medição precisa de uma data — sem ela não há série.';
  }
  if (vazio(efetivo(patch, registro, 'valor'))) {
    return 'Medição precisa de um valor.';
  }
  return null;
}

/**
 * Escolhe o validador da entidade. Ponto único de despacho de propósito: a rota
 * de produção e o plugin de dev montavam cada um a sua cadeia de `if`, e uma
 * regra nova entrava só em metade dos ambientes — foi exatamente o que
 * aconteceu quando `medicoes` nasceu.
 */
export async function validarEntidade(
  sql: Sql, nome: string, dados: Record<string, unknown>, atual: unknown,
): Promise<string | null> {
  if (nome === 'iniciativas') return validarIniciativa(sql, dados, atual as Iniciativa | null);
  if (nome === 'marcos') return validarMarco(dados, atual as Marco | null);
  if (nome === 'medicoes') return validarMedicao(dados, atual as Medicao | null);
  return null;
}

/* ------------------------------------------------------------------------ */
/* Backup                                                                    */
/* ------------------------------------------------------------------------ */

/** Quantas ações de risco existem — usado pelo guarda do /api/restore. */
export async function contarAcoesRisco(sql: Sql): Promise<number> {
  const rows = await sql('select count(*)::int as count from acoes_risco');
  return Number(rows[0]?.count ?? 0);
}

export interface Backup {
  gerado_em: string;
  risk_records: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  task_attachments: Record<string, unknown>[];
  pessoas: Pessoa[];
  objetivos: Objetivo[];
  iniciativas: Iniciativa[];
  marcos: Marco[];
  acoes_risco: AcaoRisco[];
}

/**
 * Dump completo, para guardar antes de qualquer migração. Os bytes dos anexos
 * ficam de fora por padrão: são base64 de até 3 MB cada e inchariam o arquivo
 * sem necessidade para o que este backup existe — provar que nenhum registro
 * de risco ou tarefa se perdeu.
 */
export async function backup(sql: Sql, incluirAnexos = false): Promise<Backup> {
  const colunasAnexo = incluirAnexos
    ? 'id, task_id, position, nome, mime, tamanho, dados, created_at'
    : 'id, task_id, position, nome, mime, tamanho, created_at';
  const [riscos, tarefas, anexos, portfolio] = await Promise.all([
    sql('select * from risk_records order by position asc, created_at asc'),
    sql('select * from tasks order by position asc, created_at asc'),
    sql(`select ${colunasAnexo} from task_attachments order by task_id, position`),
    listPortfolio(sql),
  ]);
  return {
    gerado_em: new Date().toISOString(),
    risk_records: riscos,
    tasks: tarefas,
    task_attachments: anexos,
    ...portfolio,
  };
}
