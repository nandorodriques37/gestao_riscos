import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neonSql, ensureSchema, updateRecordById, deleteRecordById } from '../_db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
    if (!id) {
      res.status(400).json({ error: 'id ausente' });
      return;
    }

    const sql = neonSql();
    await ensureSchema(sql);

    if (req.method === 'PATCH') {
      const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
      const updated = await updateRecordById(sql, id, body);
      if (!updated) {
        res.status(404).json({ error: 'Registro não encontrado' });
        return;
      }
      res.status(200).json(updated);
      return;
    }

    if (req.method === 'DELETE') {
      const ok = await deleteRecordById(sql, id);
      if (!ok) {
        res.status(404).json({ error: 'Registro não encontrado' });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader('Allow', 'PATCH, DELETE');
    res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[api/records/[id]]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro interno' });
  }
}
