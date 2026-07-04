import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neonSql, ensureSchema, restoreRecords } from './_db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'Método não permitido' });
      return;
    }
    const sql = neonSql();
    await ensureSchema(sql);
    const records = await restoreRecords(sql);
    res.status(200).json(records);
  } catch (err) {
    console.error('[api/restore]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro interno' });
  }
}
