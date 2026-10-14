// Anexos de imagem das tarefas. Tabela própria — e não uma coluna em `tasks` —
// porque os bytes não podem viajar no GET /api/tasks: a aba faz polling a cada
// 15s e baixaria todas as imagens em cada ciclo. A listagem carrega só o
// metadado; os bytes saem pela rota do anexo, servidos com cache imutável.
import type { Sql } from './_db.js';
import type { TaskAttachment } from '../src/types.js';

export type { TaskAttachment };

/** Formatos aceitos — só imagem, e só os que todo navegador atual renderiza. */
export const ALLOWED_IMAGE_MIMES: readonly string[] = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif',
];

/**
 * Teto por imagem, em bytes do binário. Fica abaixo do limite de corpo da
 * função serverless (4,5 MB) já descontada a inflação de ~33% do base64 no
 * transporte. O cliente reduz a imagem antes de enviar; isto é a rede de
 * segurança do servidor.
 */
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * O id do anexo nunca aponta para outro conteúdo — um upload novo gera id novo
 * —, então o navegador pode guardar a imagem indefinidamente.
 */
export const CACHE_CONTROL_IMUTAVEL = 'public, max-age=31536000, immutable';

/** Teto do nome guardado, com a extensão. */
const MAX_NOME = 200;

/** Extensões de cada formato aceito; a primeira é a que o nome ganha quando a dele não bate. */
const EXTENSOES_DO_MIME: Record<string, readonly string[]> = {
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
  'image/avif': ['avif'],
};

/**
 * O nome com a extensão do formato. É o nome que o `Content-Disposition`
 * devolve e que o navegador usa ao Baixar — e ele prevalece sobre o atributo
 * `download`. "Planilha Q3.xlsm" enviado como GIF é guardado "Planilha Q3.gif":
 * a rota de imagem nunca entrega um arquivo de outro tipo com nome de outro
 * tipo. Mesma troca do `comExtensaoDe` do cliente (`src/lib/imageAttachments.ts`,
 * que a API não importa: ele usa canvas e `FileReader`).
 */
export function nomeComExtensao(nome: string, mime: string): string {
  const limpo = nome.trim() || 'imagem';
  const extensoes = EXTENSOES_DO_MIME[mime.toLowerCase()];
  if (!extensoes) return limpo.slice(0, MAX_NOME);
  const atual = /\.([^.]*)$/.exec(limpo);
  const ext = atual && extensoes.includes(atual[1].toLowerCase()) ? atual[1] : extensoes[0];
  const base = (atual ? limpo.slice(0, atual.index) : limpo).trim() || 'imagem';
  return `${base.slice(0, MAX_NOME - ext.length - 1)}.${ext}`;
}

/**
 * Cabeçalho de exibição da imagem. `filename*` (RFC 5987) carrega o nome real
 * em UTF-8 percent-encoded; o `filename` simples é o fallback ASCII, sem aspas
 * nem quebras de linha, que quebrariam o cabeçalho. Com o `mime`, o nome sai
 * com a extensão do formato também para linhas gravadas antes dessa regra.
 */
export function contentDisposition(nome: string, mime?: string): string {
  const real = mime ? nomeComExtensao(nome, mime) : nome;
  const ascii = real.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'imagem';
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(real)}`;
}

export const MSG_ASSINATURA_ERRADA = 'O arquivo não é a imagem que diz ser.';

/** Os bytes `de`…`ate` como texto (as assinaturas são ASCII). */
function textoDosBytes(bytes: Uint8Array, de: number, ate: number): string {
  return String.fromCharCode(...bytes.subarray(de, ate));
}

/** AVIF: caixa `ftyp` com a marca `avif` (imagem) ou `avis` (sequência), principal ou compatível. */
function ehAvif(b: Uint8Array): boolean {
  if (textoDosBytes(b, 4, 8) !== 'ftyp') return false;
  const tamanhoDaCaixa = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
  const fim = Math.min(Math.max(tamanhoDaCaixa, 12), b.length);
  for (let i = 8; i + 4 <= fim; i += 4) {
    if (i === 12) continue; // versão menor, não é marca
    const marca = textoDosBytes(b, i, i + 4);
    if (marca === 'avif' || marca === 'avis') return true;
  }
  return false;
}

/** Com que bytes o arquivo de cada formato começa. MIME fora da tabela não tem como ser conferido. */
const ASSINATURAS: Record<string, (b: Uint8Array) => boolean> = {
  'image/png': b => b[0] === 0x89 && textoDosBytes(b, 1, 4) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  'image/jpeg': b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/gif': b => /^GIF8[79]a$/.test(textoDosBytes(b, 0, 6)),
  'image/webp': b => textoDosBytes(b, 0, 4) === 'RIFF' && textoDosBytes(b, 8, 12) === 'WEBP',
  'image/avif': ehAvif,
};

/**
 * Os bytes batem com o MIME declarado? Decodifica só o começo do base64 (64
 * caracteres = 48 bytes): GIF e AVIF sobem sem passar pelo decodificador do
 * navegador, e sem esta conferência a rota de imagem guardaria (e serviria
 * para Baixar) qualquer arquivo rotulado de imagem.
 */
export function assinaturaConfere(mime: string, dados: string): boolean {
  const confere = ASSINATURAS[mime.toLowerCase()];
  return !!confere && confere(Buffer.from(dados.slice(0, 64), 'base64'));
}

/** Resultado de um upload — a recusa é dado de retorno, não exceção. */
export type CreateAttachmentOutcome =
  | { status: 'ok'; anexo: TaskAttachment }
  | { status: 'invalid'; message: string }
  | { status: 'not_found' };

/** Anexo com os bytes, usado só pela rota que serve a imagem. */
export interface StoredAttachmentData extends TaskAttachment {
  /** Conteúdo em base64, como gravado na coluna `dados`. */
  dados: string;
}

/** Tamanho do binário a partir do comprimento do base64 (sem decodificar). */
export function base64Bytes(dados: string): number {
  const len = dados.length;
  if (len === 0) return 0;
  const padding = dados.endsWith('==') ? 2 : dados.endsWith('=') ? 1 : 0;
  return Math.floor(len / 4) * 3 - padding;
}

function rowToAttachment(row: Record<string, unknown>): TaskAttachment {
  return {
    id: String(row.id),
    nome: (row.nome as string) ?? '',
    mime: (row.mime as string) ?? '',
    tamanho: Number(row.tamanho ?? 0),
  };
}

export async function ensureAttachmentsSchema(sql: Sql): Promise<void> {
  await sql(`
    create table if not exists task_attachments (
      id         uuid primary key default gen_random_uuid(),
      task_id    uuid not null references tasks(id) on delete cascade,
      position   integer not null default 0,
      nome       text not null default '',
      mime       text not null default '',
      tamanho    integer not null default 0,
      dados      text not null,
      created_at timestamptz not null default now()
    )
  `);
  // Toda leitura filtra por tarefa; sem o índice o join da listagem varre a
  // tabela inteira — que é a maior do banco, por guardar os bytes.
  await sql('create index if not exists task_attachments_task_id_idx on task_attachments (task_id)');
}

/** Metadados de uma tarefa, na ordem em que foram anexados. */
export async function listAttachments(sql: Sql, taskId: string): Promise<TaskAttachment[]> {
  const rows = await sql(
    `select id, nome, mime, tamanho from task_attachments
     where task_id = $1 order by position asc, created_at asc`,
    [taskId],
  );
  return rows.map(rowToAttachment);
}

/**
 * Metadados de todas as tarefas de uma vez, agrupados por `task_id`. Uma
 * consulta só para a listagem inteira — não uma por tarefa. A coluna `dados`
 * fica de fora de propósito: é ela que pesa.
 */
export async function attachmentsByTask(sql: Sql): Promise<Map<string, TaskAttachment[]>> {
  const rows = await sql(
    `select id, task_id, nome, mime, tamanho from task_attachments
     order by position asc, created_at asc`,
  );
  const byTask = new Map<string, TaskAttachment[]>();
  for (const row of rows) {
    const taskId = String(row.task_id);
    const list = byTask.get(taskId);
    if (list) list.push(rowToAttachment(row));
    else byTask.set(taskId, [rowToAttachment(row)]);
  }
  return byTask;
}

export interface NewAttachment {
  nome?: unknown;
  mime?: unknown;
  /** Conteúdo em base64 puro, sem o prefixo `data:`. */
  dados?: unknown;
}

/** Imagem que passou na validação, pronta para gravar. */
export interface ImagemValida {
  nome: string;
  mime: string;
  /** Base64 puro, já sem espaços nas pontas. */
  dados: string;
  /** Bytes do binário. */
  tamanho: number;
}

const ROTULO_MIME: Record<string, string> = {
  'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/webp': 'WebP', 'image/gif': 'GIF', 'image/avif': 'AVIF',
};

/** "PNG, JPEG ou WebP" a partir da lista aceita — a mensagem não mente quando a lista muda. */
function listaDeFormatos(mimes: readonly string[]): string {
  const nomes = mimes.map(m => ROTULO_MIME[m] ?? m);
  return nomes.length <= 1 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} ou ${nomes[nomes.length - 1]}`;
}

/**
 * Formato, base64, teto e assinatura de uma imagem enviada; o nome sai com a
 * extensão do formato. Pura e compartilhada: anexo de tarefa e imagem de
 * página passam pela mesma régua, cada um com a sua lista de formatos.
 */
export function validarImagem(
  input: NewAttachment, mimes: readonly string[] = ALLOWED_IMAGE_MIMES,
): { ok: true; imagem: ImagemValida } | { ok: false; message: string } {
  const mime = typeof input.mime === 'string' ? input.mime.toLowerCase() : '';
  if (!mimes.includes(mime)) {
    return { ok: false, message: `Formato não suportado — envie ${listaDeFormatos(mimes)}.` };
  }

  const dados = typeof input.dados === 'string' ? input.dados.trim() : '';
  if (dados === '' || !BASE64_RE.test(dados)) {
    return { ok: false, message: 'Conteúdo da imagem ausente ou inválido.' };
  }

  const tamanho = base64Bytes(dados);
  if (tamanho > MAX_ATTACHMENT_BYTES) {
    return { ok: false, message: `Imagem acima do limite de ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB.` };
  }

  if (!assinaturaConfere(mime, dados)) return { ok: false, message: MSG_ASSINATURA_ERRADA };

  const nome = nomeComExtensao(typeof input.nome === 'string' ? input.nome : '', mime);
  return { ok: true, imagem: { nome, mime, dados, tamanho } };
}

export async function createAttachment(
  sql: Sql, taskId: string, input: NewAttachment,
): Promise<CreateAttachmentOutcome> {
  const validacao = validarImagem(input);
  if (!validacao.ok) return { status: 'invalid', message: validacao.message };
  const { nome, mime, dados, tamanho } = validacao.imagem;

  const existe = await sql('select id from tasks where id = $1', [taskId]);
  if (!existe[0]) return { status: 'not_found' };

  const rows = await sql(
    `insert into task_attachments (task_id, position, nome, mime, tamanho, dados)
     values ($1, (select coalesce(max(position), -1) + 1 from task_attachments where task_id = $1), $2, $3, $4, $5)
     returning id, nome, mime, tamanho`,
    [taskId, nome, mime, tamanho, dados],
  );
  return { status: 'ok', anexo: rowToAttachment(rows[0]) };
}

/** Anexo com os bytes. Filtra por tarefa também: o id sozinho não dá acesso. */
export async function getAttachment(sql: Sql, taskId: string, id: string): Promise<StoredAttachmentData | null> {
  const rows = await sql(
    'select id, nome, mime, tamanho, dados from task_attachments where task_id = $1 and id = $2',
    [taskId, id],
  );
  if (!rows[0]) return null;
  return { ...rowToAttachment(rows[0]), dados: (rows[0].dados as string) ?? '' };
}

export async function deleteAttachment(sql: Sql, taskId: string, id: string): Promise<boolean> {
  const rows = await sql(
    'delete from task_attachments where task_id = $1 and id = $2 returning id',
    [taskId, id],
  );
  return rows.length > 0;
}
