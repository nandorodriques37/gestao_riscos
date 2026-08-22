import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neonSql, ensureSchema } from '../_db.js';
import { ensurePortfolioSchema, listPortfolio } from '../_portfolioDb.js';
import { ensureAuditoriaSchema } from '../_auditoria.js';

// GET /api/portfolio — o pacote das seis listas, que é a primeira coisa que o
// app carrega.
//
// Existe como arquivo separado porque o catch-all vizinho (`[[...path]].ts`)
// NÃO casa o caminho base na Vercel: `/api/portfolio/backup` chega nele,
// `/api/portfolio` devolve 404. Em desenvolvimento isso não aparecia — o
// plugin do Vite roteia por prefixo e entrega o caminho base ao mesmo handler.
//
// O catch-all continua tratando `partes.length === 0` para o caso de dev; aqui
// é só a mesma resposta, pelo caminho que a Vercel enxerga. São 10 funções
// serverless no total, dentro do limite de 12 do plano Hobby.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if ((req.method || 'GET').toUpperCase() !== 'GET') {
      res.setHeader('Allow', 'GET');
      res.status(405).json({ error: 'Método não permitido' });
      return;
    }

    const sql = neonSql();
    // A ordem importa: `acoes_risco.risco_id` referencia `risk_records`.
    await ensureSchema(sql);
    await ensureAuditoriaSchema(sql);
    await ensurePortfolioSchema(sql);

    res.status(200).json(await listPortfolio(sql));
  } catch (err) {
    console.error('GET /api/portfolio falhou:', err);
    res.status(500).json({ error: 'Erro ao carregar o portfólio' });
  }
}
