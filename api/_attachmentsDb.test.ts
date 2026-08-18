import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { ensureTasksSchema, createTask, listTasks, deleteTaskById, type Sql } from './_tasksDb';
import {
  createAttachment, listAttachments, getAttachment, deleteAttachment,
  base64Bytes, contentDisposition, MAX_ATTACHMENT_BYTES,
} from './_attachmentsDb';

// Mesma abordagem de `_tasksDb.test.ts`: Postgres de verdade (pglite), para que
// a chave estrangeira com `on delete cascade` e o vínculo tarefa↔anexo sejam
// exercitados como em produção, não simulados.
let pg: PGlite;
let sql: Sql;

/** PNG 1x1 transparente — menor imagem válida possível. */
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

beforeAll(async () => {
  pg = new PGlite();
  sql = async (text, params = []) => {
    const result = await pg.query(text, params as unknown[]);
    return result.rows as Record<string, unknown>[];
  };
  await ensureTasksSchema(sql);
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

describe('createAttachment — validação', () => {
  it('recusa formato que não é imagem suportada', async () => {
    const task = await createTask(sql, { tarefa: 'com anexo' });
    const result = await createAttachment(sql, task.id, { nome: 'a.pdf', mime: 'application/pdf', dados: PNG_1X1 });
    expect(result.status).toBe('invalid');
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
