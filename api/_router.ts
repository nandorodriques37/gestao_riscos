import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Sql } from './_db.js';
import portfolio from './_portfolioRoute.js';
import records from './_recordsRoute.js';
import record from './_recordRoute.js';
import tasks from './_tasksRoute.js';
import task from './_taskRoute.js';
import attachments from './_attachmentsRoute.js';
import attachment from './_attachmentRoute.js';
import health from './_healthRoute.js';
import restore from './_restoreRoute.js';

export function caminhoPublico(req: Pick<VercelRequest, 'url' | 'query'>): string {
  const original = new URL(req.url || '/', 'http://localhost').pathname;
  if (!['/api', '/api/', '/api/index'].includes(original)) return original;
  const route = req.query.__route;
  return typeof route === 'string' ? '/api/' + route.replace(/^\/+/, '') : original;
}
export default async function router(req: VercelRequest, res: VercelResponse, sql?: Sql) {
  try {
    const path = caminhoPublico(req).replace(/\/$/, '');
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    req.method = (req.method ?? 'GET').toUpperCase();
    req.url = path;
    if (parts[0] !== 'api') { res.status(404).json({ error: 'Rota não encontrada' }); return; }
    if (parts[1] === 'portfolio' && parts.length <= 4) return await portfolio(req, res, sql);
    if (parts[1] === 'records' && parts.length === 2) return await records(req, res, sql);
    if (parts[1] === 'records' && parts.length === 3) { req.query.id = parts[2]; return await record(req, res, sql); }
    if (parts[1] === 'tasks') {
      if (parts.length === 2) return await tasks(req, res, sql);
      req.query.id = parts[2];
      if (parts.length === 3) return await task(req, res, sql);
      if (parts[3] === 'anexos' && parts.length === 4) return await attachments(req, res, sql);
      if (parts[3] === 'anexos' && parts.length === 5) { req.query.anexoId = parts[4]; return await attachment(req, res, sql); }
    }
    if (parts[1] === 'health' && parts.length === 2) {
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); res.status(405).json({ error: 'Método não permitido' }); return; }
      return await health(req, res, sql);
    }
    if (parts[1] === 'restore' && parts.length === 2) return await restore(req, res, sql);
    res.status(404).json({ error: 'Rota não encontrada' });
  } catch (err) {
    const invalid = err instanceof URIError || err instanceof SyntaxError;
    res.status(invalid ? 400 : 500).json({ error: invalid ? 'Requisição inválida' : 'Não foi possível atender a requisição.' });
  }
}
