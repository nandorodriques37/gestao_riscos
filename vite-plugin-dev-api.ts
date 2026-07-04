import type { Plugin, Connect } from 'vite';
import type { ServerResponse } from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import {
  ensureSchema, listRecords, createRecord, updateRecordById, deleteRecordById, restoreRecords,
  type Sql,
} from './api/_db';

// Backend de DESENVOLVIMENTO apenas: reimplementa as rotas /api usando um
// Postgres embarcado (pglite) para que `npm run dev` funcione sem o Neon.
// Em produção, o Vercel serve as funções serverless em `api/*` (Neon).
// Ativado só em `serve` (dev); não entra no bundle de produção.

let dbPromise: Promise<Sql> | null = null;

function getSql(): Promise<Sql> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const pg = new PGlite(process.env.PGLITE_DIR || '.pglite-dev');
      const sql: Sql = async (text, params = []) => {
        const result = await pg.query(text, params as unknown[]);
        return result.rows as Record<string, unknown>[];
      };
      await ensureSchema(sql);
      return sql;
    })();
  }
  return dbPromise;
}

function readJsonBody(req: Connect.IncomingMessage): Promise<unknown> {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export function devApiPlugin(): Plugin {
  return {
    name: 'dev-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/api/')) return next();

        try {
          const sql = await getSql();
          const path = url.split('?')[0];
          const method = (req.method || 'GET').toUpperCase();

          if (path === '/api/records') {
            if (method === 'GET') return send(res, 200, await listRecords(sql));
            if (method === 'POST') return send(res, 201, await createRecord(sql, (await readJsonBody(req)) as Record<string, unknown>));
            return send(res, 405, { error: 'Método não permitido' });
          }

          const idMatch = path.match(/^\/api\/records\/([^/]+)$/);
          if (idMatch) {
            const id = decodeURIComponent(idMatch[1]);
            if (method === 'PATCH') {
              const updated = await updateRecordById(sql, id, (await readJsonBody(req)) as Record<string, unknown>);
              return updated ? send(res, 200, updated) : send(res, 404, { error: 'Registro não encontrado' });
            }
            if (method === 'DELETE') {
              const ok = await deleteRecordById(sql, id);
              return ok ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Registro não encontrado' });
            }
            return send(res, 405, { error: 'Método não permitido' });
          }

          if (path === '/api/restore') {
            if (method === 'POST') return send(res, 200, await restoreRecords(sql));
            return send(res, 405, { error: 'Método não permitido' });
          }

          return send(res, 404, { error: 'Rota não encontrada' });
        } catch (err) {
          console.error('[dev-api]', err);
          return send(res, 500, { error: err instanceof Error ? err.message : 'Erro interno' });
        }
      });
    },
  };
}
