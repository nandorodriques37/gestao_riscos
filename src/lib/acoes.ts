// Leitura do plano de ação NO FORMATO ANTIGO, o que vive dentro do próprio
// registro de risco (`acoes_itens`, ou o texto livre de `acoes` nos registros
// mais velhos). É só leitura: desde que o plano passou a morar em
// `acoes_risco`, ninguém escreve mais aqui.
//
// Continua vivo porque é o que converte o legado — usado pela extração no
// servidor (`api/_migracaoAcoes.ts`) e pela conversão preguiçosa do editor
// (`planoDeAcao.linhasDeLegado`). O resumo e o cálculo de atraso mudaram de
// casa para `planoDeAcao.ts`, junto com o dono do dado.
// Extensão `.js` obrigatória: este arquivo é importado pela API, que roda como
// ESM no Node, onde import relativo sem extensão não resolve. O Vite resolve
// dos dois jeitos, então só a produção quebrava — e quebrou.
import type { AcaoItem, AcaoStatus, RiskRecord } from '../types.js';
import { ACAO_STATUSES } from '../types.js';
import { normStatus } from './calculations.js';

const STATUS_SET = new Set<string>(ACAO_STATUSES);

/** Id novo para uma linha de ação (chave de lista; `crypto` existe no browser e no Node ≥ 19). */
function novoId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `acao-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

/** Traduz o status do registro (Registro) para o status de uma ação. */
function statusDoRegistro(status: string): AcaoStatus {
  const norm = normStatus(status);
  if (norm === 'Concluído') return 'Concluída';
  if (norm === 'Em andamento') return 'Em andamento';
  return 'A fazer';
}

function normalizarItem(raw: unknown): AcaoItem {
  const o = (raw ?? {}) as Partial<Record<keyof AcaoItem, unknown>>;
  const status = typeof o.status === 'string' && STATUS_SET.has(o.status)
    ? (o.status as AcaoStatus)
    : 'A fazer';
  return {
    id: typeof o.id === 'string' && o.id ? o.id : novoId(),
    descricao: typeof o.descricao === 'string' ? o.descricao : '',
    responsavel: typeof o.responsavel === 'string' ? o.responsavel : '',
    prazo: typeof o.prazo === 'string' ? o.prazo : '',
    status,
  };
}

/**
 * Lista de ações de um registro. Se ainda não há plano estruturado mas existe o
 * texto livre antigo em `acoes`, ele vira a primeira (e única) linha — migração
 * preguiçosa, na leitura, sem script de banco.
 */
export function parseAcoes(record: Pick<RiskRecord, 'acoes' | 'acoes_itens' | 'responsavel' | 'status'>): AcaoItem[] {
  const brutos = record.acoes_itens;
  if (Array.isArray(brutos) && brutos.length > 0) return brutos.map(normalizarItem);
  const texto = (record.acoes ?? '').trim();
  if (!texto) return [];
  return [{
    id: novoId(),
    descricao: texto,
    responsavel: record.responsavel ?? '',
    prazo: '',
    status: statusDoRegistro(record.status ?? ''),
  }];
}
