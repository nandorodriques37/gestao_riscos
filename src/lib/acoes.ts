// Plano de ação estruturado de um registro de risco: leitura tolerante do que
// vem do banco (inclusive registros antigos, que só têm o texto livre `acoes`),
// resumo textual para as telas que ainda consomem `acoes` como string e cálculo
// de atraso do prazo.
import type { AcaoItem, AcaoStatus, RiskRecord } from '../types';
import { ACAO_STATUSES } from '../types';
import { normStatus } from './calculations';

const STATUS_SET = new Set<string>(ACAO_STATUSES);

/** Separador do resumo textual gravado em `acoes`. */
const RESUMO_SEP = ' · ';

/** Id novo para uma linha de ação (chave de lista; `crypto` existe no browser e no Node ≥ 19). */
function novoId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `acao-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

/** Linha em branco, pronta para ser preenchida pelo usuário. */
export function novaAcao(): AcaoItem {
  return { id: novoId(), descricao: '', responsavel: '', prazo: '', status: 'A fazer' };
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

/**
 * Resumo textual do plano, gravado em `acoes` a cada mudança da lista — é o que
 * a coluna "Ações" da tabela, a Priorização, os gráficos, o CSV e o KPI de
 * completude continuam lendo.
 */
export function resumirAcoes(itens: AcaoItem[]): string {
  return itens.map(i => i.descricao.trim()).filter(Boolean).join(RESUMO_SEP);
}

/** Data local de hoje em 'YYYY-MM-DD', para comparar com o valor do input de data. */
function hojeISO(hoje: Date): string {
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const dia = String(hoje.getDate()).padStart(2, '0');
  return `${hoje.getFullYear()}-${mes}-${dia}`;
}

/** Ação com prazo vencido e ainda não concluída. Vencer hoje não é atraso. */
export function acaoAtrasada(item: AcaoItem, hoje: Date = new Date()): boolean {
  if (!item.prazo) return false;
  if (item.status === 'Concluída') return false;
  return item.prazo < hojeISO(hoje);
}
