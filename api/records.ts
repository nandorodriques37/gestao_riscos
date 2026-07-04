import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neonSql, ensureSchema, listRecords, createRecord } from './_db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const sql = neonSql();
    await ensureSchema(sql);

    if (req.method === 'GET') {
      const records = await listRecords(sql);
      res.status(200).json(records);
      return;
    }

    if (req.method === 'POST') {
      const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
      const created = await createRecord(sql, body);
      res.status(201).json(created);
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[api/records]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro interno' });
  }
}
