import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neonSql, ensureSchema, restoreRecords } from './_db.js';
import { ensurePortfolioSchema, contarAcoesRisco } from './_portfolioDb.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'Método não permitido' });
      return;
    }
    const sql = neonSql();
    await ensureSchema(sql);
    // Precisa existir antes da contagem abaixo — num banco novo a tabela ainda
    // não foi criada e o `select` estouraria.
    await ensurePortfolioSchema(sql);

    // `restoreRecords` faz `delete from risk_records`, e `acoes_risco.risco_id`
    // é `on delete cascade`: restaurar levaria junto todo o plano de mitigação
    // extraído na migração. Exige confirmação explícita.
    const acoes = await contarAcoesRisco(sql);
    if (acoes > 0 && String(req.query.force ?? '') !== '1') {
      res.status(409).json({
        error: `Restaurar apaga os ${acoes} registros de ações de risco junto com a matriz. `
          + 'Baixe o backup em /api/portfolio/backup e repita com ?force=1 para confirmar.',
        acoesRisco: acoes,
      });
      return;
    }

    const records = await restoreRecords(sql);
    res.status(200).json(records);
  } catch (err) {
    console.error('[api/restore]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro interno' });
  }
}
