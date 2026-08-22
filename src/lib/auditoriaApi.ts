// Leitura da trilha de auditoria. Só GET — a gravação acontece no servidor, a
// partir das próprias rotas de escrita; não há como o navegador inventar uma
// linha de histórico.

export type AcaoAuditada = 'criou' | 'alterou' | 'excluiu';

export interface LinhaAuditoria {
  id: string;
  tabela: string;
  registro_id: string;
  acao: AcaoAuditada;
  campo: string | null;
  de: string | null;
  para: string | null;
  rotulo: string;
  autor: string;
  em: string;
}

export interface FiltroAuditoria {
  registroId?: string;
  tabela?: string;
  limite?: number;
}

export async function buscarAuditoria(f: FiltroAuditoria = {}): Promise<LinhaAuditoria[]> {
  const q = new URLSearchParams();
  if (f.registroId) q.set('registro_id', f.registroId);
  if (f.tabela) q.set('tabela', f.tabela);
  if (f.limite) q.set('limite', String(f.limite));

  const res = await fetch(`/api/portfolio/auditoria?${q}`);
  if (!res.ok) throw new Error(`Falha ao carregar o histórico (${res.status})`);
  return res.json() as Promise<LinhaAuditoria[]>;
}
