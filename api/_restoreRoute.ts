import type { Sql } from './_db.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neonSql, ensureSchema, restoreRecords } from './_db.js';
import { ensurePortfolioSchema, contarAcoesRisco } from './_portfolioDb.js';
import { ensureTasksSchema } from './_tasksDb.js';

export default async function handler(req: VercelRequest, res: VercelResponse, database?: Sql) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.status(405).json({ error: 'Método não permitido' });
      return;
    }
    const sql = database ?? neonSql();
    await ensureSchema(sql);
    // Precisa existir antes da contagem abaixo — num banco novo a tabela ainda
    // não foi criada e o `select` estouraria.
    await ensurePortfolioSchema(sql);
    // O guarda conta as mitigações onde elas vivem hoje: em `tasks`.
    await ensureTasksSchema(sql);

    // `restoreRecords` faz `delete from risk_records`, e `acoes_risco.risco_id`
    // é `on delete cascade`: restaurar levaria junto todo o plano de mitigação
    // extraído na migração. Exige confirmação explícita.
    const acoes = await contarAcoesRisco(sql);
    if (acoes > 0 && String(req.query.force ?? '') !== '1') {
      res.status(409).json({
        error: `A matriz vai ser substituída, e as ${acoes} mitigações ligadas a ela `
          + 'perdem o vínculo — viram tarefas soltas no quadro, sem apontar para risco nenhum. '
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
