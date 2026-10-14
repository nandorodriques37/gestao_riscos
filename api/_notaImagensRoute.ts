import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neonSql, type Sql } from './_db.js';
import { CACHE_CONTROL_IMUTAVEL, contentDisposition } from './_attachmentsDb.js';
import { autorDaRequisicao } from './_auditoria.js';
import { criarImagemNota, ensureNotasSchema, lerImagemNota } from './_notasDb.js';

// Imagens das páginas da aba Anotações.
//
//   POST /api/notas/:notaId/imagens            → sobe { nome, mime, dados(base64) }, devolve o metadado
//   GET  /api/notas/:notaId/imagens/:imagemId  → os bytes, com cache imutável
//
// Não há DELETE: a tela nunca apaga bytes. Quem apaga é o cascade da página e
// a varredura de imagens sem citação (`varrerImagensOrfas`).
//
// Garante só o próprio esquema, e só no POST: a rota do portfólio roda a
// sequência inteira a cada pedido, e uma página com dez imagens multiplicaria
// isso por dez. O GET dispensa porque só existe URL de imagem depois de um POST.

function um(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

function corpo(req: VercelRequest): Record<string, unknown> | null {
  const raw = req.body;
  if (typeof raw !== 'string') return (raw as Record<string, unknown>) ?? {};
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse, database?: Sql) {
  try {
    const notaId = um(req.query.id);
    const imagemId = um(req.query.imagemId);
    const sql = database ?? neonSql();
    const method = (req.method || 'GET').toUpperCase();

    if (!imagemId) {
      if (method !== 'POST') {
        res.setHeader('Allow', 'POST');
        res.status(405).json({ error: 'Método não permitido' });
        return;
      }
      const body = corpo(req);
      if (!body) {
        res.status(400).json({ error: 'Requisição inválida' });
        return;
      }
      await ensureNotasSchema(sql);
      const autor = autorDaRequisicao(req.headers as Record<string, unknown>);
      const result = await criarImagemNota(sql, notaId, body, autor);
      if (result.status === 'not_found') {
        res.status(404).json({ error: 'Página não encontrada' });
        return;
      }
      if (result.status === 'invalid') {
        res.status(400).json({ error: result.message });
        return;
      }
      res.status(201).json(result.imagem);
      return;
    }

    if (method !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ error: 'Método não permitido' });
      return;
    }
    const imagem = await lerImagemNota(sql, notaId, imagemId);
    if (!imagem) {
      res.status(404).json({ error: 'Imagem não encontrada' });
      return;
    }
    const bytes = Buffer.from(imagem.dados, 'base64');
    res.setHeader('Content-Type', imagem.mime);
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', CACHE_CONTROL_IMUTAVEL);
    res.setHeader('Content-Disposition', contentDisposition(imagem.nome));
    // O MIME vem do que foi declarado no upload; sem isto o navegador poderia
    // farejar outro tipo nos bytes.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).send(bytes);
  } catch (err) {
    console.error('[api/notas/:id/imagens]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro interno' });
  }
}
