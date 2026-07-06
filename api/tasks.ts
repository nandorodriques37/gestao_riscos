import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neonSql, ensureTasksSchema, listTasks, createTask } from './_tasksDb.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const sql = neonSql();
    await ensureTasksSchema(sql);

    if (req.method === 'GET') {
      const tasks = await listTasks(sql);
      res.status(200).json(tasks);
      return;
    }

    if (req.method === 'POST') {
      const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
      const created = await createTask(sql, body);
      res.status(201).json(created);
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[api/tasks]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro interno' });
  }
}
