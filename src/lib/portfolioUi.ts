// Constantes e mapas que só a interface do portfólio usa. Ficam fora de
// `portfolioMetrics.ts` de propósito: aquele arquivo é de funções puras de
// domínio, e não deve conhecer nome de balde de migração nem cor de badge.
import type { BadgeKind } from './calculations';
import type { EstadoTratamento } from './portfolioMetrics';

/**
 * Nome do objetivo temporário criado pela migração para acolher as iniciativas
 * promovidas. Precisa bater com `OBJETIVO_A_CLASSIFICAR` em
 * `api/_promocaoTriagem.ts` — o front não importa do `api/`, então o valor
 * aparece nos dois lados e é comparado por descrição.
 *
 * A tela o trata como balde, não como objetivo real: ele aparece tracejado e
 * fica fora da conta de "objetivo sem iniciativa". A métrica pura continua
 * contando-o, porque para ela ele é um objetivo como outro qualquer — corrigir
 * isso lá dentro seria enfiar uma string mágica numa função de domínio.
 */
export const OBJETIVO_BALDE = 'A CLASSIFICAR';

export const ROTULO_TRATAMENTO: Record<EstadoTratamento, string> = {
  sem_tratamento: 'Sem tratamento',
  aceito: 'Aceito',
  em_tratamento: 'Em tratamento',
  tratamento_concluido: 'Tratamento entregue',
};

/**
 * Cor do estado de tratamento. Ordinal de propósito — "sem tratamento" é pior
 * que "em tratamento" —, e sempre acompanhada do rótulo.
 */
export const BADGE_TRATAMENTO: Record<EstadoTratamento, BadgeKind> = {
  sem_tratamento: 'red',
  aceito: 'slate',
  em_tratamento: 'amber',
  tratamento_concluido: 'green',
};

/** Explica de onde o estado saiu — é derivado, e derivação não explicada vira desconfiança. */
export const AJUDA_TRATAMENTO: Record<EstadoTratamento, string> = {
  sem_tratamento: 'Nenhuma ação viva vinculada a este risco.',
  aceito: 'A resposta escolhida foi aceitar — não se cobra ação.',
  em_tratamento: 'Há ação em aberto, ou iniciativa vinculada que ainda não concluiu.',
  tratamento_concluido: 'Toda ação viva concluiu — e, quando está dentro de uma iniciativa, a iniciativa também.',
};
