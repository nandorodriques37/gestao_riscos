import type { Iniciativa, Objetivo, Pessoa, RiskRecord } from '../../types';
import { computePrioriz } from '../../lib/calculations';

/**
 * O que a matriz de priorização precisa saber sobre um item — e nada além.
 *
 * Existe porque `esforco`, `impacto2` e `gravidade` mudaram de dono: sempre
 * descreveram a AÇÃO, não a ameaça, e agora vivem em `iniciativas`. A tela
 * passa a ler iniciativa, mas continua sabendo ler risco enquanto a migração
 * não termina — e nenhum dos dois formatos precisa saber do outro.
 */
export interface ItemPriorizavel {
  /** Texto da bolha e do ranking. */
  rotulo: string;
  /** Linha de apoio: área · rotina · categoria, ou objetivo · dono. */
  contexto: string;
  /** Agrupador do resumo por recurso. */
  recurso: string;
  /** Já normalizado para os rótulos do filtro de status. */
  status: string;
  esforco: number | null;
  impacto2: number | null;
  gravidade: number | null;
}

export interface ActionableItem {
  idx: number;
  item: ItemPriorizavel;
  prioriz: number;
  /** Preenchido quando o item é uma iniciativa — permite abrir o detalhe dela. */
  iniciativaId?: string;
}

/** Registros de risco com priorização calculável. Leitura de fallback. */
export function buildActionable(records: RiskRecord[]): ActionableItem[] {
  return records
    .map((record, idx) => ({
      idx,
      item: {
        rotulo: record.acoes || '(sem descrição)',
        contexto: [record.area, record.rotina, record.categoria].filter(Boolean).join(' · '),
        recurso: record.recurso,
        status: record.status,
        esforco: record.esforco,
        impacto2: record.impacto2,
        gravidade: record.gravidade,
      },
      prioriz: computePrioriz(record),
    }))
    .filter((x): x is ActionableItem => x.prioriz != null);
}

/**
 * Status da iniciativa traduzido para os três rótulos do filtro. `cancelada`
 * fica fora do ranking: priorizar o que já foi descartado só rouba linha.
 */
function statusDaIniciativa(status: Iniciativa['status']): string | null {
  if (status === 'cancelada') return null;
  if (status === 'concluida') return 'Concluído';
  if (status === 'em_execucao' || status === 'pausada') return 'Em andamento';
  return 'Não iniciado';
}

/** Iniciativas com priorização calculável — a leitura de hoje. */
export function buildActionableDeIniciativas(
  iniciativas: Iniciativa[], objetivos: Objetivo[], pessoas: Pessoa[],
): ActionableItem[] {
  const objetivoPorId = new Map(objetivos.map(o => [o.id, o.descricao]));
  const pessoaPorId = new Map(pessoas.map(p => [p.id, p.nome]));

  return iniciativas.flatMap<ActionableItem>((i, idx) => {
    const status = statusDaIniciativa(i.status);
    const prioriz = computePrioriz(i);
    if (status == null || prioriz == null) return [];
    return [{
      idx,
      iniciativaId: i.id,
      item: {
        rotulo: i.nome || '(sem nome)',
        contexto: [
          i.objetivo_id ? objetivoPorId.get(i.objetivo_id) : null,
          i.dono_id ? pessoaPorId.get(i.dono_id) : null,
        ].filter(Boolean).join(' · '),
        recurso: i.recurso,
        status,
        esforco: i.esforco,
        impacto2: i.impacto2,
        gravidade: i.gravidade,
      },
      prioriz,
    }];
  });
}
