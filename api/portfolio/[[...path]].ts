import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neonSql, ensureSchema } from '../_db.js';
import {
  ENTIDADES, ehEntidade, ensurePortfolioSchema, listPortfolio, backup,
  validarEntidade,
} from '../_portfolioDb.js';
import { migrarAcoes } from '../_migracaoAcoes.js';
import { promoverTriagem } from '../_promocaoTriagem.js';

// Rota única de todo o portfólio. Cinco entidades × 2 rotas dariam 10 funções
// serverless a mais — o projeto já tem 8 e o limite do plano Hobby é 12. Um
// catch-all resolve tudo com uma.
//
//   GET    /api/portfolio                  → pacote das 5 listas
//   GET    /api/portfolio/backup           → dump completo (?anexos=1 inclui bytes)
//   GET    /api/portfolio/:entidade        → uma lista
//   POST   /api/portfolio/:entidade        → cria
//   PATCH  /api/portfolio/:entidade/:id    → atualiza (409 em conflito de versão)
//   DELETE /api/portfolio/:entidade/:id    → exclui

function parseBody(req: VercelRequest): Record<string, unknown> {
  const raw = req.body;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw || '{}') as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (raw as Record<string, unknown>) || {};
}

/** Violação de chave estrangeira vira mensagem, não 500. */
function mensagemFK(err: unknown): string | null {
  const code = (err as { code?: string })?.code;
  if (code !== '23503') return null;
  const detalhe = String((err as { detail?: string })?.detail ?? '');
  if (detalhe.includes('iniciativas')) {
    return 'Este objetivo ainda tem iniciativas ligadas. Mova ou exclua as iniciativas antes.';
  }
  return 'Registro referenciado por outro — remova o vínculo antes de excluir.';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const partes = ([] as string[]).concat(req.query.path ?? []).filter(Boolean);
    const method = (req.method || 'GET').toUpperCase();

    const sql = neonSql();
    // A ordem importa: `acoes_risco.risco_id` referencia `risk_records`.
    await ensureSchema(sql);
    await ensurePortfolioSchema(sql);

    // GET /api/portfolio
    if (partes.length === 0) {
      if (method !== 'GET') {
        res.setHeader('Allow', 'GET');
        res.status(405).json({ error: 'Método não permitido' });
        return;
      }
      res.status(200).json(await listPortfolio(sql));
      return;
    }

    // GET /api/portfolio/backup
    if (partes.length === 1 && partes[0] === 'backup') {
      if (method !== 'GET') {
        res.setHeader('Allow', 'GET');
        res.status(405).json({ error: 'Método não permitido' });
        return;
      }
      const incluirAnexos = String(req.query.anexos ?? '') === '1';
      res.status(200).json(await backup(sql, incluirAnexos));
      return;
    }

    // POST /api/portfolio/migrar-acoes — idempotente, só insere.
    if (partes.length === 1 && partes[0] === 'migrar-acoes') {
      if (method !== 'POST') {
        res.setHeader('Allow', 'POST');
        res.status(405).json({ error: 'Método não permitido' });
        return;
      }
      res.status(200).json(await migrarAcoes(sql));
      return;
    }

    // POST /api/portfolio/promover-triagem — aplica a triagem confirmada.
    if (partes.length === 1 && partes[0] === 'promover-triagem') {
      if (method !== 'POST') {
        res.setHeader('Allow', 'POST');
        res.status(405).json({ error: 'Método não permitido' });
        return;
      }
      res.status(200).json(await promoverTriagem(sql));
      return;
    }

    const nome = partes[0];
    if (!ehEntidade(nome)) {
      res.status(404).json({ error: `Entidade "${nome}" não existe.` });
      return;
    }
    const tabela = ENTIDADES[nome];

    // /api/portfolio/:entidade
    if (partes.length === 1) {
      if (method === 'GET') {
        res.status(200).json(await tabela.list(sql));
        return;
      }
      if (method === 'POST') {
        const body = parseBody(req);
        const erro = await validarEntidade(sql, nome, body, null);
        if (erro) {
          res.status(400).json({ error: erro });
          return;
        }
        res.status(201).json(await tabela.create(sql, body));
        return;
      }
      res.setHeader('Allow', 'GET, POST');
      res.status(405).json({ error: 'Método não permitido' });
      return;
    }

    // /api/portfolio/:entidade/:id
    if (partes.length === 2) {
      const id = decodeURIComponent(partes[1]);

      if (method === 'PATCH') {
        const { expectedVersion, ...patch } = parseBody(req) as { expectedVersion?: number };
        const atual = await tabela.byId(sql, id);
        if (!atual) {
          res.status(404).json({ error: 'Registro não encontrado' });
          return;
        }
        const erro = await validarEntidade(sql, nome, patch, atual);
        if (erro) {
          res.status(400).json({ error: erro });
          return;
        }
        const result = await tabela.update(sql, id, patch, expectedVersion);
        if (result.status === 'not_found') {
          res.status(404).json({ error: 'Registro não encontrado' });
          return;
        }
        res.status(result.status === 'conflict' ? 409 : 200).json(result.item);
        return;
      }

      if (method === 'DELETE') {
        const ok = await tabela.remove(sql, id);
        if (!ok) {
          res.status(404).json({ error: 'Registro não encontrado' });
          return;
        }
        res.status(200).json({ ok: true });
        return;
      }

      res.setHeader('Allow', 'PATCH, DELETE');
      res.status(405).json({ error: 'Método não permitido' });
      return;
    }

    res.status(404).json({ error: 'Rota não encontrada' });
  } catch (err) {
    const fk = mensagemFK(err);
    if (fk) {
      res.status(409).json({ error: fk });
      return;
    }
    console.error('[api/portfolio]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro interno' });
  }
}
