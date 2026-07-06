import type { Plugin, Connect } from 'vite';
import type { ServerResponse } from 'node:http';
import { PGlite } from '@electric-sql/pglite';
import {
  ensureSchema, listRecords, createRecord, updateRecordById, deleteRecordById, restoreRecords,
  countRecords, seedSize, type Sql,
} from './api/_db';
import {
  ensureTasksSchema, listTasks, createTask, updateTaskById, deleteTaskById,
} from './api/_tasksDb';

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
      await ensureTasksSchema(sql);
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
        const path = url.split('?')[0];
        // Só interceptamos as rotas de API (sem extensão). Requisições de módulo
        // sob /api/ — ex.: /api/_seed.ts, importado pelo front — têm extensão de
        // arquivo e devem seguir para o Vite servir o módulo, não virar 404.
        if (!path.startsWith('/api/') || /\.[a-z0-9]+$/i.test(path)) return next();

        try {
          const sql = await getSql();
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
              const { expectedVersion, ...patch } = (await readJsonBody(req)) as Record<string, unknown> & { expectedVersion?: number };
              const result = await updateRecordById(sql, id, patch, expectedVersion);
              if (result.status === 'not_found') return send(res, 404, { error: 'Registro não encontrado' });
              return send(res, result.status === 'conflict' ? 409 : 200, result.record);
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

          if (path === '/api/tasks') {
            if (method === 'GET') return send(res, 200, await listTasks(sql));
            if (method === 'POST') return send(res, 201, await createTask(sql, (await readJsonBody(req)) as Record<string, unknown>));
            return send(res, 405, { error: 'Método não permitido' });
          }

          const taskIdMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
          if (taskIdMatch) {
            const id = decodeURIComponent(taskIdMatch[1]);
            if (method === 'PATCH') {
              const { expectedVersion, ...patch } = (await readJsonBody(req)) as Record<string, unknown> & { expectedVersion?: number };
              const result = await updateTaskById(sql, id, patch, expectedVersion);
              if (result.status === 'not_found') return send(res, 404, { error: 'Tarefa não encontrada' });
              return send(res, result.status === 'conflict' ? 409 : 200, result.task);
            }
            if (method === 'DELETE') {
              const ok = await deleteTaskById(sql, id);
              return ok ? send(res, 200, { ok: true }) : send(res, 404, { error: 'Tarefa não encontrada' });
            }
            return send(res, 405, { error: 'Método não permitido' });
          }

          if (path === '/api/health') {
            return send(res, 200, { ok: true, dbConnected: true, seedSize: seedSize(), recordCount: await countRecords(sql) });
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
