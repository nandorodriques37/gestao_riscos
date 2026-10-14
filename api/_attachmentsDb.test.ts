import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { ensureTasksSchema, createTask, listTasks, deleteTaskById, type Sql } from './_tasksDb.js';
import {
  createAttachment, listAttachments, getAttachment, deleteAttachment,
  base64Bytes, contentDisposition, validarImagem, nomeComExtensao, assinaturaConfere,
  MAX_ATTACHMENT_BYTES, MSG_ASSINATURA_ERRADA,
} from './_attachmentsDb.js';

// Mesma abordagem de `_tasksDb.test.ts`: Postgres de verdade (pglite), para que
// a chave estrangeira com `on delete cascade` e o vínculo tarefa↔anexo sejam
// exercitados como em produção, não simulados.
let pg: PGlite;
let sql: Sql;

/** PNG 1x1 transparente — menor imagem válida possível. */
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** O começo de um arquivo de cada formato, com corpo de enchimento — o servidor só lê a assinatura. */
const b64 = (...partes: Array<number[] | string>) =>
  Buffer.concat(partes.map(p => (typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p)))).toString('base64');
const CORPO = new Array(40).fill(0);
const JPEG = b64([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], 'JFIF', CORPO);
const GIF = b64('GIF89a', [0x01, 0x00, 0x01, 0x00], CORPO);
const WEBP = b64('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 ', CORPO);
/** Caixa `ftyp` de 28 bytes: marca principal `avif`, compatíveis `avif mif1 miaf`. */
const AVIF = b64([0, 0, 0, 0x1c], 'ftypavif', [0, 0, 0, 0], 'avifmif1miaf', CORPO);
/** HEIF genérico com `avis` só entre as compatíveis (sequência AVIF). */
const AVIS = b64([0, 0, 0, 0x18], 'ftypmif1', [0, 0, 0, 0], 'mif1avis', CORPO);
/** Uma planilha (zip) rotulada de imagem. */
const ZIP = b64('PK', [0x03, 0x04], CORPO);

beforeAll(async () => {
  pg = new PGlite();
  sql = async (text, params = []) => {
    const result = await pg.query(text, params as unknown[]);
    return result.rows as Record<string, unknown>[];
  };
  await ensureTasksSchema(sql, { semear: true });
});

afterAll(async () => {
  await pg.close();
});

describe('base64Bytes', () => {
  it('devolve o tamanho do binário, não o do base64', () => {
    expect(base64Bytes('')).toBe(0);
    expect(base64Bytes('QUJD')).toBe(3);        // "ABC"
    expect(base64Bytes('QUJDRA==')).toBe(4);    // "ABCD"
    expect(base64Bytes('QUJDREU=')).toBe(5);    // "ABCDE"
  });
});

describe('contentDisposition', () => {
  it('mantém o nome real em filename* e usa um fallback ASCII', () => {
    const header = contentDisposition('relatório "final".png');
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain(encodeURIComponent('relatório "final".png'));
    // O fallback não pode conter aspas — quebrariam o cabeçalho.
    const fallback = header.match(/filename="([^"]*)"/)?.[1] ?? '';
    expect(fallback).not.toContain('"');
    expect(fallback).toBe('relat_rio _final_.png');
  });
});

describe('validarImagem', () => {
  it('a mensagem de formato acompanha a lista aceita', () => {
    expect(validarImagem({ mime: 'image/bmp', dados: PNG_1X1 })).toEqual({ ok: false, message: 'Formato não suportado — envie PNG, JPEG, WebP, GIF ou AVIF.' });
    expect(validarImagem({ mime: 'image/avif', dados: PNG_1X1 }, ['image/png', 'image/jpeg'])).toEqual({ ok: false, message: 'Formato não suportado — envie PNG ou JPEG.' });
  });

  it('normaliza nome, mime e tamanho da imagem aceita', () => {
    expect(validarImagem({ nome: '  print.png ', mime: 'IMAGE/PNG', dados: ` ${PNG_1X1} ` })).toEqual({
      ok: true, imagem: { nome: 'print.png', mime: 'image/png', dados: PNG_1X1, tamanho: base64Bytes(PNG_1X1) },
    });
    const semNome = validarImagem({ mime: 'image/png', dados: PNG_1X1 });
    expect(semNome.ok && semNome.imagem.nome).toBe('imagem.png');
  });

  it('aceita cada formato cujos bytes batem com o MIME declarado', () => {
    const casos: Array<[string, string]> = [
      ['image/png', PNG_1X1], ['image/jpeg', JPEG], ['image/gif', GIF], ['image/webp', WEBP], ['image/avif', AVIF], ['image/avif', AVIS],
    ];
    for (const [mime, dados] of casos) {
      expect(assinaturaConfere(mime, dados), mime).toBe(true);
      expect(validarImagem({ nome: 'foto', mime, dados }).ok, mime).toBe(true);
    }
  });

  it('recusa o arquivo cujos bytes não são do formato declarado', () => {
    const trocados: Array<[string, string]> = [
      ['image/gif', ZIP], ['image/png', JPEG], ['image/jpeg', PNG_1X1], ['image/webp', GIF], ['image/avif', WEBP],
      ['image/webp', b64('RIFF', [0, 0, 0, 0], 'WAVEfmt ', CORPO)],
      ['image/avif', b64([0, 0, 0, 0x18], 'ftypheic', [0, 0, 0, 0], 'mif1heic', CORPO)],
    ];
    for (const [mime, dados] of trocados) {
      expect(validarImagem({ nome: 'Planilha Q3.xlsm', mime, dados }), mime).toEqual({ ok: false, message: MSG_ASSINATURA_ERRADA });
    }
  });

  it('o nome guardado leva a extensão do formato', () => {
    const gif = validarImagem({ nome: 'Planilha Q3.xlsm', mime: 'image/gif', dados: GIF });
    expect(gif.ok && gif.imagem.nome).toBe('Planilha Q3.gif');
    const jpeg = validarImagem({ nome: 'foto.JPEG', mime: 'image/jpeg', dados: JPEG });
    expect(jpeg.ok && jpeg.imagem.nome).toBe('foto.JPEG');
    expect(nomeComExtensao('print', 'image/webp')).toBe('print.webp');
    expect(nomeComExtensao('.png', 'image/png')).toBe('imagem.png');
    expect(nomeComExtensao('foto.jpg', 'image/jpeg')).toBe('foto.jpg');
    // O teto de 200 caracteres vale com a extensão, que nunca é cortada.
    const longo = nomeComExtensao('x'.repeat(300) + '.exe', 'image/png');
    expect(longo).toHaveLength(200);
    expect(longo.endsWith('.png')).toBe(true);
  });
});

describe('contentDisposition com o formato', () => {
  it('troca a extensão pela do MIME, também em linha gravada antes da regra', () => {
    const header = contentDisposition('Planilha Q3.xlsm', 'image/gif');
    expect(header).toContain('filename="Planilha Q3.gif"');
    expect(header).toContain(encodeURIComponent('Planilha Q3.gif'));
    expect(header).not.toContain('xlsm');
  });
});

describe('createAttachment — validação', () => {
  it('recusa formato que não é imagem suportada', async () => {
    const task = await createTask(sql, { tarefa: 'com anexo' });
    const result = await createAttachment(sql, task.id, { nome: 'a.pdf', mime: 'application/pdf', dados: PNG_1X1 });
    expect(result.status).toBe('invalid');
  });

  it('recusa o arquivo de outro tipo rotulado de imagem, sem gravar nada', async () => {
    const task = await createTask(sql, { tarefa: 'com anexo' });
    const result = await createAttachment(sql, task.id, { nome: 'Planilha Q3.xlsm', mime: 'image/gif', dados: ZIP });
    expect(result).toEqual({ status: 'invalid', message: MSG_ASSINATURA_ERRADA });
    expect(await listAttachments(sql, task.id)).toEqual([]);
  });

  it('recusa conteúdo ausente ou fora do formato base64', async () => {
    const task = await createTask(sql, { tarefa: 'com anexo' });
    expect((await createAttachment(sql, task.id, { nome: 'a.png', mime: 'image/png', dados: '' })).status).toBe('invalid');
    expect((await createAttachment(sql, task.id, { nome: 'a.png', mime: 'image/png', dados: 'não é base64!' })).status).toBe('invalid');
  });

  it('recusa imagem acima do teto de tamanho', async () => {
    const task = await createTask(sql, { tarefa: 'com anexo' });
    // 4 caracteres de base64 = 3 bytes; um a mais que o teto.
    const grande = 'A'.repeat(Math.ceil((MAX_ATTACHMENT_BYTES + 1) / 3) * 4);
    const result = await createAttachment(sql, task.id, { nome: 'a.png', mime: 'image/png', dados: grande });
    expect(result.status).toBe('invalid');
  });

  it('recusa anexo em tarefa inexistente', async () => {
    const result = await createAttachment(
      sql, '00000000-0000-0000-0000-000000000000',
      { nome: 'a.png', mime: 'image/png', dados: PNG_1X1 },
    );
    expect(result.status).toBe('not_found');
  });
});

describe('createAttachment / listAttachments / getAttachment', () => {
  it('grava a imagem e devolve o metadado sem os bytes', async () => {
    const task = await createTask(sql, { tarefa: 'com anexo' });
    const result = await createAttachment(sql, task.id, { nome: 'print.png', mime: 'image/png', dados: PNG_1X1 });

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.anexo.nome).toBe('print.png');
    expect(result.anexo.mime).toBe('image/png');
    expect(result.anexo.tamanho).toBe(base64Bytes(PNG_1X1));
    expect('dados' in result.anexo).toBe(false);
  });

  it('lista os anexos na ordem em que foram enviados', async () => {
    const task = await createTask(sql, { tarefa: 'vários anexos' });
    for (const nome of ['a.png', 'b.png', 'c.png']) {
      await createAttachment(sql, task.id, { nome, mime: 'image/png', dados: PNG_1X1 });
    }
    expect((await listAttachments(sql, task.id)).map(a => a.nome)).toEqual(['a.png', 'b.png', 'c.png']);
  });

  it('getAttachment devolve os bytes, e só para a tarefa dona do anexo', async () => {
    const dono = await createTask(sql, { tarefa: 'dono' });
    const outra = await createTask(sql, { tarefa: 'outra' });
    const criado = await createAttachment(sql, dono.id, { nome: 'a.png', mime: 'image/png', dados: PNG_1X1 });
    if (criado.status !== 'ok') throw new Error('anexo não criado');

    const lido = await getAttachment(sql, dono.id, criado.anexo.id);
    expect(lido?.dados).toBe(PNG_1X1);
    expect(lido?.mime).toBe('image/png');
    // O id do anexo sozinho não dá acesso: a tarefa também precisa bater.
    expect(await getAttachment(sql, outra.id, criado.anexo.id)).toBeNull();
  });
});

describe('deleteAttachment', () => {
  it('remove o anexo e devolve false quando ele não existe mais', async () => {
    const task = await createTask(sql, { tarefa: 'para remover' });
    const criado = await createAttachment(sql, task.id, { nome: 'a.png', mime: 'image/png', dados: PNG_1X1 });
    if (criado.status !== 'ok') throw new Error('anexo não criado');

    expect(await deleteAttachment(sql, task.id, criado.anexo.id)).toBe(true);
    expect(await deleteAttachment(sql, task.id, criado.anexo.id)).toBe(false);
    expect(await listAttachments(sql, task.id)).toEqual([]);
  });
});

describe('integração com a tarefa', () => {
  it('listTasks traz o metadado dos anexos junto de cada tarefa', async () => {
    const task = await createTask(sql, { tarefa: 'listada com anexo' });
    await createAttachment(sql, task.id, { nome: 'a.png', mime: 'image/png', dados: PNG_1X1 });

    const listada = (await listTasks(sql)).find(t => t.id === task.id);
    expect(listada?.anexos.map(a => a.nome)).toEqual(['a.png']);
    // Tarefa sem anexo vem com lista vazia, nunca undefined.
    const semAnexo = await createTask(sql, { tarefa: 'sem anexo' });
    expect((await listTasks(sql)).find(t => t.id === semAnexo.id)?.anexos).toEqual([]);
  });

  it('excluir a tarefa leva os anexos junto', async () => {
    const task = await createTask(sql, { tarefa: 'será excluída' });
    await createAttachment(sql, task.id, { nome: 'a.png', mime: 'image/png', dados: PNG_1X1 });

    expect(await deleteTaskById(sql, task.id)).toBe(true);
    const restantes = await sql('select count(*)::int as count from task_attachments where task_id = $1', [task.id]);
    expect(Number(restantes[0].count)).toBe(0);
  });
});
