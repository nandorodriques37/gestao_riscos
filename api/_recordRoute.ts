import type { Sql } from './_db.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neonSql, ensureSchema, listRecords, updateRecordById, deleteRecordById } from './_db.js';
import {
  ensureAuditoriaSchema, autorDaRequisicao, registrarAlteracao, registrarExclusao,
} from './_auditoria.js';

export default async function handler(req: VercelRequest, res: VercelResponse, database?: Sql) {
  try {
    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
    if (!id) {
      res.status(400).json({ error: 'id ausente' });
      return;
    }

    const sql = database ?? neonSql();
    await ensureSchema(sql);
    await ensureAuditoriaSchema(sql);
    const autor = autorDaRequisicao(req.headers as Record<string, unknown>);

    if (req.method === 'PATCH') {
      const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
      const { expectedVersion, ...patch } = body;
      // Precisa do "antes" para o histórico dizer de que valor para qual.
      const antes = (await listRecords(sql)).find(r => r.id === id) ?? null;
      const result = await updateRecordById(sql, id, patch, expectedVersion);
      if (result.status === 'not_found') {
        res.status(404).json({ error: 'Registro não encontrado' });
        return;
      }
      if (result.status === 'conflict') {
        res.status(409).json(result.record);
        return;
      }
      if (antes) await registrarAlteracao(sql, 'risk_records', antes, patch, autor);
      res.status(200).json(result.record);
      return;
    }

    if (req.method === 'DELETE') {
      const antes = (await listRecords(sql)).find(r => r.id === id) ?? null;
      const ok = await deleteRecordById(sql, id);
      if (!ok) {
        res.status(404).json({ error: 'Registro não encontrado' });
        return;
      }
      if (antes) await registrarExclusao(sql, 'risk_records', antes, autor);
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
