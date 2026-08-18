import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neonSql, ensureTasksSchema } from '../../../_tasksDb.js';
import { getAttachment, deleteAttachment, contentDisposition, CACHE_CONTROL_IMUTAVEL } from '../../../_attachmentsDb.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const taskId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
    const anexoId = Array.isArray(req.query.anexoId) ? req.query.anexoId[0] : req.query.anexoId;
    if (!taskId || !anexoId) {
      res.status(400).json({ error: 'id ausente' });
      return;
    }

    const sql = neonSql();
    await ensureTasksSchema(sql);

    if (req.method === 'GET') {
      const anexo = await getAttachment(sql, taskId, anexoId);
      if (!anexo) {
        res.status(404).json({ error: 'Anexo não encontrado' });
        return;
      }
      // O id do anexo nunca aponta para outro conteúdo (upload novo gera id
      // novo), então o navegador pode guardar a imagem para sempre.
      const bytes = Buffer.from(anexo.dados, 'base64');
      res.setHeader('Content-Type', anexo.mime);
      res.setHeader('Content-Length', String(bytes.length));
      res.setHeader('Cache-Control', CACHE_CONTROL_IMUTAVEL);
      res.setHeader('Content-Disposition', contentDisposition(anexo.nome));
      res.status(200).send(bytes);
      return;
    }

    if (req.method === 'DELETE') {
      const ok = await deleteAttachment(sql, taskId, anexoId);
      if (!ok) {
        res.status(404).json({ error: 'Anexo não encontrado' });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader('Allow', 'GET, DELETE');
    res.status(405).json({ error: 'Método não permitido' });
  } catch (err) {
    console.error('[api/tasks/[id]/anexos/[anexoId]]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro interno' });
  }
}
