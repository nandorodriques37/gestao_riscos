import type { Sql } from './_db.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neonSql, updateTaskById, deleteTaskById } from './_tasksDb.js';

import { ensureTudo } from './_schema.js';
import { acoesRisco } from './_portfolioDb.js';
import { autorDaRequisicao, registrarAlteracao, registrarExclusao } from './_auditoria.js';

export default async function handler(req: VercelRequest, res: VercelResponse, database?: Sql) {
  try {
    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
    if (!id) {
      res.status(400).json({ error: 'id ausente' });
      return;
    }

    const sql = database ?? neonSql();
    await ensureTudo(sql);
    const antes = await acoesRisco.byId(sql, id);
    const autor = autorDaRequisicao(req.headers as Record<string, unknown>);

    if (req.method === 'PATCH') {
      const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) || {};
      const { expectedVersion, ...patch } = body;
      const result = await updateTaskById(sql, id, patch, expectedVersion);
      if (result.status === 'not_found') {
        res.status(404).json({ error: 'Tarefa não encontrada' });
        return;
      }
      if (result.status === 'conflict') {
        res.status(409).json(result.task);
        return;
      }
      if (antes) {
        const depois = await acoesRisco.byId(sql, id);
        if (depois) await registrarAlteracao(sql, 'acoes_risco', antes, { ...depois }, autor);
      }
      res.status(200).json(result.task);
      return;
    }

    if (req.method === 'DELETE') {
      const ok = await deleteTaskById(sql, id);
      if (!ok) {
        res.status(404).json({ error: 'Tarefa não encontrada' });
        return;
      }
      if (antes) await registrarExclusao(sql, 'acoes_risco', antes, autor);
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader('Allow', 'PATCH, DELETE');
    res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[api/tasks/[id]]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro interno' });
  }
}
