// Páginas da aba Anotações e as imagens coladas nelas.
//
// A página é uma entidade comum da fábrica (`/api/portfolio/notas`, com versão
// e 409), mas fica FORA do pacote do portfólio: o texto é longo e o pacote vai
// no polling de 15s.
//
// As imagens têm tabela própria pelo mesmo motivo dos anexos de tarefa: os
// bytes não podem viajar no JSON da página nem no GET da lista. O documento
// guarda só o `src` relativo (`src/lib/notaImagens.ts`), e os bytes saem pela
// rota da imagem com cache imutável.
//
// Ninguém apaga imagem quando o bloco sai do documento: remover é edição comum,
// que o Ctrl+Z desfaz. Quem limpa é o cascade (página excluída) e a varredura
// abaixo, que só leva imagem sem citação há mais de um dia — contado de quando
// ela SAIU do documento (`orfa_desde`), não de quando subiu: medir pelo upload
// apagava na mesma gravação qualquer imagem colada anteontem.
import type { Sql } from './_db.js';
import { makeTable, type Tabela } from './_table.js';
import { validarImagem, type NewAttachment } from './_attachmentsDb.js';
import {
  MIMES_NOTA, HORAS_ATE_VARRER, ehUuid, imagemIdDoSrc, imagensDoDoc, imagensCitadas, lerDoc, profundidadeDoDoc,
} from '../src/lib/notaImagens.js';
import type { Nota, NotaImagem } from '../src/types.js';

/** Limite do título, igual ao do nome de anexo. */
export const MAX_TITULO_NOTA = 200;

/**
 * Teto do documento serializado. Uma página de texto longo fica na casa das
 * dezenas de KB; o teto existe para um colar de 4 MB de HTML não virar uma
 * linha que o polling de quem está com a página aberta arrasta inteira.
 */
export const MAX_CONTEUDO_NOTA = 1_000_000;

/**
 * Níveis de aninhamento aceitos. Lista dentro de lista no editor fica bem
 * abaixo; 25 mil citações aninhadas cabem em 850 KB e derrubavam a lista da
 * aba (e o editor) de todo mundo com estouro de pilha.
 */
export const MAX_PROFUNDIDADE_NOTA = 100;

const notasBase: Tabela<Nota> = makeTable<Nota>({
  nome: 'notas',
  campos: [
    { nome: 'titulo', tipo: 'text' },
    { nome: 'conteudo', tipo: 'text' },
    { nome: 'fixada', tipo: 'bool', padrao: false },
    { nome: 'autor', tipo: 'text' },
    { nome: 'editado_por', tipo: 'text' },
  ],
});

export async function ensureNotasSchema(sql: Sql): Promise<void> {
  await notasBase.ensure(sql);
  await sql(`
    create table if not exists nota_imagens (
      id         uuid primary key default gen_random_uuid(),
      nota_id    uuid not null references notas(id) on delete cascade,
      nome       text not null default '',
      mime       text not null default '',
      tamanho    integer not null default 0,
      dados      text not null,
      autor      text not null default '',
      created_at timestamptz not null default now(),
      orfa_desde timestamptz
    )
  `);
  await sql('alter table nota_imagens add column if not exists orfa_desde timestamptz');
  // Toda leitura e a varredura filtram por página.
  await sql('create index if not exists nota_imagens_nota_id_idx on nota_imagens (nota_id)');
}

/**
 * Acerta o relógio de cada imagem pela gravação que acabou de acontecer e
 * apaga as que estão fora do documento há mais de `HORAS_ATE_VARRER`.
 *
 * Citada → `orfa_desde` volta a nulo (o Ctrl+Z que a trouxe de volta zera o
 * prazo). Fora do documento → o relógio começa agora, se ainda não corria.
 * Só então sai o que passou do prazo — e só desta página.
 *
 * Melhor esforço: a página já foi gravada quando isto roda, e falhar aqui só
 * adia a limpeza para a próxima gravação. Documento ilegível ou vazio não mexe
 * em nada — um cliente com defeito mandando `''` não pode apagar as imagens de
 * ninguém nem disparar o relógio delas.
 */
export async function varrerImagensOrfas(sql: Sql, notaId: string, conteudo: unknown): Promise<number> {
  try {
    const doc = lerDoc(conteudo);
    if (!doc) return 0;
    const citadas = [...imagensCitadas(doc, notaId)];
    await sql(
      'update nota_imagens set orfa_desde = null where nota_id = $1 and id = any($2::uuid[]) and orfa_desde is not null',
      [notaId, citadas],
    );
    await sql(
      `update nota_imagens set orfa_desde = now()
       where nota_id = $1 and not (id = any($2::uuid[])) and orfa_desde is null`,
      [notaId, citadas],
    );
    const rows = await sql(
      `delete from nota_imagens
       where nota_id = $1 and not (id = any($2::uuid[]))
         and orfa_desde < now() - make_interval(hours => $3)
       returning id`,
      [notaId, citadas, HORAS_ATE_VARRER],
    );
    return rows.length;
  } catch (err) {
    console.error('[notas] varredura de imagens', err);
    return 0;
  }
}

/**
 * A entidade `notas` como a rota do portfólio a enxerga. Mesma interface da
 * fábrica — o que muda é o `update`, que varre as imagens depois de gravar o
 * documento — e o `ensure`, que cria as duas tabelas.
 */
export const notas: Tabela<Nota> = {
  nome: notasBase.nome,
  campos: notasBase.campos,
  campoSet: notasBase.campoSet,
  ensure: ensureNotasSchema,
  list: sql => notasBase.list(sql),
  byId: (sql, id) => notasBase.byId(sql, id),
  create: (sql, data) => notasBase.create(sql, data),
  remove: (sql, id) => notasBase.remove(sql, id),
  async update(sql, id, patch, expectedVersion) {
    const result = await notasBase.update(sql, id, patch, expectedVersion);
    if (result.status === 'ok' && 'conteudo' in patch) {
      // O id da linha, não o da URL: o Postgres aceita uuid sem hífens, e a
      // comparação com o `src` do documento é textual.
      await varrerImagensOrfas(sql, result.item.id, result.item.conteudo);
    }
    return result;
  },
};

/**
 * Regras de uma página, chamadas por `validarEntidade` nos dois ambientes.
 *
 * Não confere se a imagem citada ainda existe: um Ctrl+Z que traga de volta
 * uma imagem já varrida não pode travar o salvamento automático — o bloco
 * mostra "imagem indisponível" e a pessoa remove.
 */
export function validarNota(dados: Record<string, unknown>, atual: Nota | null): string | null {
  if ('titulo' in dados && dados.titulo != null) {
    if (typeof dados.titulo !== 'string') return 'Título inválido.';
    if (dados.titulo.length > MAX_TITULO_NOTA) return `Título acima de ${MAX_TITULO_NOTA} caracteres.`;
  }
  if (!('conteudo' in dados) || dados.conteudo == null || dados.conteudo === '') return null;
  if (typeof dados.conteudo !== 'string') return 'Conteúdo da página inválido.';
  if (dados.conteudo.length > MAX_CONTEUDO_NOTA) return 'A página passou do limite de tamanho. Divida o texto em duas páginas.';
  const doc = lerDoc(dados.conteudo);
  if (!doc) return 'Conteúdo da página inválido.';
  if (profundidadeDoDoc(doc) > MAX_PROFUNDIDADE_NOTA) return 'Conteúdo da página inválido: blocos aninhados demais.';
  const imagens = imagensDoDoc(doc);
  if (imagens.length === 0) return null;
  // Na criação ainda não há id: a imagem só sobe para uma página que existe.
  if (!atual) return 'Crie a página antes de inserir imagens.';
  if (imagens.some(img => imagemIdDoSrc(img.src, atual.id) === null)) return 'A imagem não pertence a esta página.';
  return null;
}

/* ------------------------------------------------------------------------ */
/* Imagens                                                                   */
/* ------------------------------------------------------------------------ */

export type CriarImagemResultado =
  | { status: 'ok'; imagem: NotaImagem }
  | { status: 'invalid'; message: string }
  | { status: 'not_found' };

function rowToImagem(row: Record<string, unknown>): NotaImagem {
  return {
    id: String(row.id),
    nome: (row.nome as string) ?? '',
    mime: (row.mime as string) ?? '',
    tamanho: Number(row.tamanho ?? 0),
  };
}

export async function criarImagemNota(
  sql: Sql, notaId: string, input: NewAttachment, autor: string,
): Promise<CriarImagemResultado> {
  const validacao = validarImagem(input, MIMES_NOTA);
  if (!validacao.ok) return { status: 'invalid', message: validacao.message };
  if (!ehUuid(notaId)) return { status: 'not_found' };
  const existe = await sql('select id from notas where id = $1', [notaId]);
  if (!existe[0]) return { status: 'not_found' };
  const { nome, mime, dados, tamanho } = validacao.imagem;
  const rows = await sql(
    `insert into nota_imagens (nota_id, nome, mime, tamanho, dados, autor)
     values ($1, $2, $3, $4, $5, $6)
     returning id, nome, mime, tamanho`,
    [notaId, nome, mime, tamanho, dados, autor],
  );
  return { status: 'ok', imagem: rowToImagem(rows[0]) };
}

/** Imagem com os bytes. Filtra pela página também: o id sozinho não dá acesso. */
export async function lerImagemNota(
  sql: Sql, notaId: string, id: string,
): Promise<(NotaImagem & { dados: string }) | null> {
  if (!ehUuid(notaId) || !ehUuid(id)) return null;
  const rows = await sql(
    'select id, nome, mime, tamanho, dados from nota_imagens where nota_id = $1 and id = $2',
    [notaId, id],
  );
  if (!rows[0]) return null;
  return { ...rowToImagem(rows[0]), dados: (rows[0].dados as string) ?? '' };
}
