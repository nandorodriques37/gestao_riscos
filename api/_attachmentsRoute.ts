import type { Sql } from './_db.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neonSql, ensureTasksSchema } from './_tasksDb.js';
import { listAttachments, createAttachment } from './_attachmentsDb.js';

export default async function handler(req: VercelRequest, res: VercelResponse, database?: Sql) {
  try {
    const taskId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
    if (!taskId) {
      res.status(400).json({ error: 'id da tarefa ausente' });
      return;
    }

    const sql = database ?? neonSql();
    await ensureTasksSchema(sql);

    if (req.method === 'GET') {
      res.status(200).json(await listAttachments(sql, taskId));
      return;
    }

    if (req.method === 'POST') {
      const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
      const result = await createAttachment(sql, taskId, body);
      if (result.status === 'not_found') {
        res.status(404).json({ error: 'Tarefa não encontrada' });
        return;
      }
      if (result.status === 'invalid') {
        res.status(400).json({ error: result.message });
        return;
      }
      res.status(201).json(result.anexo);
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[api/tasks/[id]/anexos]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro interno' });
  }
}
