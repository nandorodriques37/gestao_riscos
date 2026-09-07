import type { Plugin } from 'vite';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { PGlite } from '@electric-sql/pglite';
import { ensureTudo } from './api/_schema.js';
import type { Sql } from './api/_db.js';
import router from './api/_router.js';
export function devApiPlugin(): Plugin {
  return {
    name: 'dev-api',
    async configureServer(server) {
      const pg = new PGlite('.pglite-dev');
      const sql: Sql = async (query, params = []) => (await pg.query(query, params as unknown[])).rows as Record<string, unknown>[];
      sql.transaction = run => pg.transaction(async tx => {
        const scoped: Sql = async (query, params = []) => (await tx.query(query, params as unknown[])).rows as Record<string, unknown>[];
        return run(scoped);
      });
      await ensureTudo(sql, { semear: true });
      server.httpServer?.once('close', () => { void pg.close(); });
      server.middlewares.use(async (req, res, next) => {
        if (!/^\/api(?:\/|\?|$)/.test(req.url ?? '')) { next(); return; }
        try {
          const url = new URL(req.url || '/', 'http://local');
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += buffer.length;
            if (size > 4_500_000) { res.statusCode = 413; res.end('Requisição grande demais'); return; }
            chunks.push(buffer);
          }
          const body = Buffer.concat(chunks).toString();
          const request = Object.assign(req, { query: Object.fromEntries(url.searchParams), body: body ? JSON.parse(body) : {} }) as unknown as VercelRequest;
          const response = Object.assign(res, {
            status(code: number) { res.statusCode = code; return response; },
            json(value: unknown) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); return response; },
            send(value: unknown) { res.end(value); return response; },
          }) as unknown as VercelResponse;
          await router(request, response, sql);
        } catch (err) { res.statusCode = err instanceof SyntaxError ? 400 : 500; res.end(JSON.stringify({ error: 'Falha na API local' })); }
      });
    },
  };
}
