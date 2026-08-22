// Trilha de auditoria: quem mudou o quê, quando, e de que valor para qual.
//
// Existe porque o app inteiro se apoia numa frase — "mitigado é decisão do
// gestor" — e até aqui não havia como saber QUAL gestor decidiu. Num registro
// que vai a comitê, essa é a primeira pergunta quando o número não bate.
//
// Duas escolhas moldam o resto do arquivo:
//
// 1. Só campos que carregam decisão. Auditar tudo transformaria a trilha num
//    despejo de digitação — cada pausa do debounce viraria uma linha — e a
//    resposta útil se perderia no meio. A lista está em CAMPOS_AUDITADOS.
//
// 2. Falha de auditoria NUNCA derruba a gravação. Perder uma linha de histórico
//    é ruim; perder a edição de um risco porque o histórico falhou é pior.
import type { Sql } from './_db.js';

/**
 * Campos cuja mudança vira linha de histórico, por tabela.
 *
 * O critério é "alguém pode ser cobrado por isto depois": estado, prazo,
 * responsável, dinheiro e vínculo. Ficam de fora descrição livre, observação e
 * qualquer coisa que só um humano lê.
 */
export const CAMPOS_AUDITADOS: Record<string, readonly string[]> = {
  risk_records: ['situacao', 'data_situacao', 'resposta', 'probab', 'impact', 'exposicao_rs'],
  objetivos: ['status', 'baseline', 'meta', 'prazo', 'dono_id'],
  iniciativas: ['status', 'objetivo_id', 'dono_id', 'impacto_rs', 'esforco_dias', 'fim_plano_atual'],
  marcos: ['status', 'data_plano_atual', 'data_real', 'motivo_replanejamento'],
  acoes_risco: ['status', 'iniciativa_id', 'dono_id', 'prazo'],
  pessoas: ['nome', 'ativo', 'dias_projeto_mes'],
  medicoes: ['valor', 'data'],
};

export type AcaoAuditada = 'criou' | 'alterou' | 'excluiu';

export interface LinhaAuditoria {
  id: string;
  tabela: string;
  registro_id: string;
  acao: AcaoAuditada;
  /** Nulo em criação e exclusão — elas são sobre o registro, não sobre um campo. */
  campo: string | null;
  de: string | null;
  para: string | null;
  /** Como o registro era chamado no momento do evento. Sobrevive à exclusão. */
  rotulo: string;
  autor: string;
  em: string;
}

/** Quem aparece quando ninguém se identificou. */
export const AUTOR_DESCONHECIDO = 'não identificado';

export async function ensureAuditoriaSchema(sql: Sql): Promise<void> {
  await sql(`
    create table if not exists auditoria (
      id           uuid primary key default gen_random_uuid(),
      tabela       text not null,
      registro_id  uuid not null,
      acao         text not null,
      campo        text,
      de           text,
      para         text,
      rotulo       text not null default '',
      autor        text not null default '',
      em           timestamptz not null default now()
    )
  `);
  // A consulta mais comum é "histórico deste registro", e a segunda é "o que
  // mudou por último". Sem estes dois índices as duas viram varredura completa
  // assim que a trilha passar de alguns milhares de linhas.
  await sql('create index if not exists auditoria_registro_idx on auditoria (registro_id, em desc)');
  await sql('create index if not exists auditoria_em_idx on auditoria (em desc)');
}

/**
 * Nome de quem está gravando.
 *
 * Hoje é AUTODECLARADO: vem de um cabeçalho que o próprio navegador preenche
 * com o nome que a pessoa digitou. Não prova nada — serve para um time pequeno
 * saber quem mexeu, não para auditoria formal.
 *
 * É de propósito o único ponto que lê identidade: quando existir autenticação
 * de verdade, troca-se o corpo desta função e a trilha inteira passa a valer.
 */
export function autorDaRequisicao(headers: Record<string, unknown>): string {
  const bruto = headers['x-autor'];
  const texto = Array.isArray(bruto) ? bruto[0] : bruto;
  if (typeof texto !== 'string') return AUTOR_DESCONHECIDO;
  // O cabeçalho viaja codificado: nome com acento não passa em latin-1.
  let nome = texto;
  try {
    nome = decodeURIComponent(texto);
  } catch {
    // valor não codificado — usa como veio
  }
  const limpo = nome.trim().slice(0, 80);
  return limpo || AUTOR_DESCONHECIDO;
}

/**
 * Qualquer entidade do app serve de entrada aqui. O tipo é frouxo de propósito:
 * as interfaces (`Iniciativa`, `AcaoRisco`…) não têm índice de string, e exigir
 * `Record<string, unknown>` obrigaria cada chamador a um cast duplo.
 */
type Registro = object;

/** Leitura de campo por nome, sem espalhar cast pelo arquivo. */
function ler(registro: Registro, campo: string): unknown {
  return (registro as Record<string, unknown>)[campo];
}

/** Texto curto que identifica o registro na lista de histórico. */
function rotuloDe(tabela: string, registro: Registro | null): string {
  if (!registro) return '';
  const candidatos = tabela === 'risk_records'
    ? ['risco']
    : tabela === 'objetivos' ? ['descricao']
      : tabela === 'medicoes' ? ['data']
        : ['nome', 'descricao'];
  for (const c of candidatos) {
    const v = ler(registro, c);
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 120);
  }
  return '';
}

/** Valor como texto, para caber numa coluna só sem perder o sentido. */
function comoTexto(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  return String(v).slice(0, 200);
}

/** Duas leituras do mesmo campo são iguais? Compara pelo texto que será gravado. */
function mudou(antes: unknown, depois: unknown): boolean {
  return comoTexto(antes) !== comoTexto(depois);
}

async function inserir(sql: Sql, linhas: Omit<LinhaAuditoria, 'id' | 'em'>[]): Promise<void> {
  for (const l of linhas) {
    await sql(
      `insert into auditoria (tabela, registro_id, acao, campo, de, para, rotulo, autor)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [l.tabela, l.registro_id, l.acao, l.campo, l.de, l.para, l.rotulo, l.autor],
    );
  }
}

/**
 * Envolve a gravação para que nenhuma falha de auditoria derrube a operação que
 * a originou. O erro vai para o log do servidor, não para a tela do usuário.
 */
async function seguro(rotulo: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    console.error(`[auditoria] falha ao registrar ${rotulo}`, err);
  }
}

export async function registrarCriacao(
  sql: Sql, tabela: string, registro: Registro, autor: string,
): Promise<void> {
  const id = ler(registro, 'id');
  if (typeof id !== 'string') return;
  await seguro(`criação em ${tabela}`, () => inserir(sql, [{
    tabela, registro_id: id, acao: 'criou', campo: null, de: null, para: null,
    rotulo: rotuloDe(tabela, registro), autor,
  }]));
}

export async function registrarExclusao(
  sql: Sql, tabela: string, registro: Registro, autor: string,
): Promise<void> {
  const id = ler(registro, 'id');
  if (typeof id !== 'string') return;
  await seguro(`exclusão em ${tabela}`, () => inserir(sql, [{
    tabela, registro_id: id, acao: 'excluiu', campo: null, de: null, para: null,
    rotulo: rotuloDe(tabela, registro), autor,
  }]));
}

/**
 * Uma linha por campo auditado que de fato mudou. Um PATCH que só mexe em
 * observação não gera nada — e é assim que a trilha continua legível.
 */
export async function registrarAlteracao(
  sql: Sql,
  tabela: string,
  antes: Registro,
  patch: Record<string, unknown>,
  autor: string,
): Promise<void> {
  const id = ler(antes, 'id');
  if (typeof id !== 'string') return;
  const auditados = CAMPOS_AUDITADOS[tabela];
  if (!auditados) return;

  const linhas = auditados
    .filter(campo => campo in patch && mudou(ler(antes, campo), patch[campo]))
    .map(campo => ({
      tabela,
      registro_id: id,
      acao: 'alterou' as const,
      campo,
      de: comoTexto(ler(antes, campo)),
      para: comoTexto(patch[campo]),
      rotulo: rotuloDe(tabela, antes),
      autor,
    }));

  if (linhas.length === 0) return;
  await seguro(`alteração em ${tabela}`, () => inserir(sql, linhas));
}

export interface FiltroAuditoria {
  tabela?: string;
  registroId?: string;
  limite?: number;
}

/** Histórico, do mais recente para o mais antigo. */
export async function listarAuditoria(sql: Sql, f: FiltroAuditoria = {}): Promise<LinhaAuditoria[]> {
  const condicoes: string[] = [];
  const params: unknown[] = [];
  if (f.registroId) {
    params.push(f.registroId);
    condicoes.push(`registro_id = $${params.length}`);
  }
  if (f.tabela) {
    params.push(f.tabela);
    condicoes.push(`tabela = $${params.length}`);
  }
  // Teto sempre presente: sem ele, um `GET` sem filtro puxaria a trilha inteira.
  const limite = Math.min(Math.max(f.limite ?? 50, 1), 500);
  params.push(limite);

  const onde = condicoes.length > 0 ? `where ${condicoes.join(' and ')}` : '';
  const rows = await sql(
    `select * from auditoria ${onde} order by em desc limit $${params.length}`,
    params,
  );
  return rows.map(r => ({
    id: String(r.id),
    tabela: String(r.tabela),
    registro_id: String(r.registro_id),
    acao: String(r.acao) as AcaoAuditada,
    campo: r.campo == null ? null : String(r.campo),
    de: r.de == null ? null : String(r.de),
    para: r.para == null ? null : String(r.para),
    rotulo: String(r.rotulo ?? ''),
    autor: String(r.autor ?? ''),
    em: r.em instanceof Date ? r.em.toISOString() : String(r.em),
  }));
}
