// Cliente HTTP do portfólio. Uma rota só (`/api/portfolio`) atende as cinco
// entidades, então este módulo é bem mais fino que `api.ts` e `tasksApi.ts`.
import type { PortfolioBundle } from '../types';

const BASE = '/api/portfolio';

/** Nome da entidade na URL. `acoes_risco` vira `acoes-risco`. */
export type EntidadeUrl = 'pessoas' | 'objetivos' | 'iniciativas' | 'marcos' | 'acoes-risco';

/** Outra pessoa gravou entre a leitura e a escrita (concorrência otimista). */
export class PortfolioConflictError extends Error {
  atual: unknown;
  constructor(atual: unknown) {
    super('Este registro foi alterado por outra pessoa enquanto você editava.');
    this.name = 'PortfolioConflictError';
    this.atual = atual;
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      // corpo não-JSON — mantém a mensagem padrão
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export async function fetchPortfolio(): Promise<PortfolioBundle> {
  return parse(await fetch(BASE));
}

export async function createEntidadeApi<T>(entidade: EntidadeUrl, data: Record<string, unknown>): Promise<T> {
  return parse(await fetch(`${BASE}/${entidade}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }));
}

export async function patchEntidadeApi<T>(
  entidade: EntidadeUrl, id: string, patch: Record<string, unknown>, expectedVersion?: number,
): Promise<T> {
  const res = await fetch(`${BASE}/${entidade}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...patch, expectedVersion }),
  });
  if (res.status === 409) throw new PortfolioConflictError(await res.json());
  return parse(res);
}

export async function deleteEntidadeApi(entidade: EntidadeUrl, id: string): Promise<void> {
  await parse(await fetch(`${BASE}/${entidade}/${encodeURIComponent(id)}`, { method: 'DELETE' }));
}

export interface ResultadoMigracao {
  riscosVarridos: number;
  riscosComPlano: number;
  acoesCriadas: number;
  acoesJaExistiam: number;
  pessoasCriadas: number;
  nomesCriados: string[];
}

/** Extrai os planos de ação dos riscos. Idempotente — só insere. */
export async function migrarAcoesApi(): Promise<ResultadoMigracao> {
  return parse(await fetch(`${BASE}/migrar-acoes`, { method: 'POST' }));
}

export interface ResultadoPromocao {
  objetivoId: string;
  objetivoCriado: boolean;
  iniciativasCriadas: number;
  jaPromovidas: number;
  semRiscoDeOrigem: number;
  comStatusHerdadoEmObs: number;
  nomes: string[];
}

/** Promove a iniciativa as ações marcadas na triagem. Idempotente. */
export async function promoverTriagemApi(): Promise<ResultadoPromocao> {
  return parse(await fetch(`${BASE}/promover-triagem`, { method: 'POST' }));
}
