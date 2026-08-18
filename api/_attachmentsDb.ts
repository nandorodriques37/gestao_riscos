// Anexos de imagem das tarefas. Tabela própria — e não uma coluna em `tasks` —
// porque os bytes não podem viajar no GET /api/tasks: a aba faz polling a cada
// 15s e baixaria todas as imagens em cada ciclo. A listagem carrega só o
// metadado; os bytes saem pela rota do anexo, servidos com cache imutável.
import type { Sql } from './_db.js';
import type { TaskAttachment } from '../src/types';

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

/**
 * Cabeçalho de exibição da imagem. `filename*` (RFC 5987) carrega o nome real
 * em UTF-8 percent-encoded; o `filename` simples é o fallback ASCII, sem aspas
 * nem quebras de linha, que quebrariam o cabeçalho.
 */
export function contentDisposition(nome: string): string {
  const ascii = nome.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'imagem';
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
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

export async function createAttachment(
  sql: Sql, taskId: string, input: NewAttachment,
): Promise<CreateAttachmentOutcome> {
  const mime = typeof input.mime === 'string' ? input.mime.toLowerCase() : '';
  if (!ALLOWED_IMAGE_MIMES.includes(mime)) {
    return { status: 'invalid', message: 'Formato não suportado — envie PNG, JPEG, WebP, GIF ou AVIF.' };
  }

  const dados = typeof input.dados === 'string' ? input.dados.trim() : '';
  if (dados === '' || !BASE64_RE.test(dados)) {
    return { status: 'invalid', message: 'Conteúdo da imagem ausente ou inválido.' };
  }

  const tamanho = base64Bytes(dados);
  if (tamanho > MAX_ATTACHMENT_BYTES) {
    return { status: 'invalid', message: `Imagem acima do limite de ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB.` };
  }

  const existe = await sql('select id from tasks where id = $1', [taskId]);
  if (!existe[0]) return { status: 'not_found' };

  const nome = typeof input.nome === 'string' && input.nome.trim() !== '' ? input.nome.trim().slice(0, 200) : 'imagem';
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
