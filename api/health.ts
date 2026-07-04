import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neonSql, ensureSchema, countRecords, seedSize } from './_db';

// Diagnóstico: confirma conexão com o banco, garante o schema/seed e reporta
// a contagem de registros e o tamanho do seed embarcado no bundle.
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const size = seedSize();
  try {
    const sql = neonSql();
    await ensureSchema(sql);
    const count = await countRecords(sql);
    res.status(200).json({
      ok: true,
      dbConnected: true,
      seedSize: size,
      recordCount: count,
    });
  } catch (err) {
    res.status(200).json({
      ok: false,
      dbConnected: false,
      seedSize: size,
      error: err instanceof Error ? err.message : 'Erro desconhecido',
    });
  }
}
