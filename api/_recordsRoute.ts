import type { Sql } from './_db.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neonSql, ensureSchema, listRecords, createRecord } from './_db.js';
import { ensureAuditoriaSchema, autorDaRequisicao, registrarCriacao } from './_auditoria.js';

export default async function handler(req: VercelRequest, res: VercelResponse, database?: Sql) {
  try {
    const sql = database ?? neonSql();
    await ensureSchema(sql);
    await ensureAuditoriaSchema(sql);

    if (req.method === 'GET') {
      const records = await listRecords(sql);
      res.status(200).json(records);
      return;
    }

    if (req.method === 'POST') {
      const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
      const created = await createRecord(sql, body);
      await registrarCriacao(
        sql, 'risk_records', created, autorDaRequisicao(req.headers as Record<string, unknown>),
      );
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
