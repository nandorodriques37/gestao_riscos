// Constantes e mapas que só a interface do portfólio usa. Ficam fora de
// `portfolioMetrics.ts` de propósito: aquele arquivo é de funções puras de
// domínio, e não deve conhecer nome de balde de migração nem cor de badge.
import type { BadgeKind } from './calculations';
import type { ChaveLacuna, EstadoTratamento } from './portfolioMetrics';
import type { Tab } from '../types';

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

/* ------------------------------------------------------------------ */
/* Lacunas da cadeia                                                   */
/* ------------------------------------------------------------------ */

/**
 * Rótulo, explicação e destino de cada elo rompido da cadeia
 * objetivo → iniciativa → risco → trabalho.
 *
 * Fica aqui, e não em `portfolioMetrics.ts`, pelo mesmo motivo que
 * `ROTULO_TRATAMENTO`: aquele arquivo é de domínio puro e não deve conhecer
 * nome de aba nem texto de tela.
 */
export interface RotuloLacuna {
  /** O que está faltando, em uma linha. */
  titulo: string;
  /** Por que isso importa. Lacuna sem consequência vira ruído. */
  ajuda: string;
  /** Aba que resolve. */
  destino: Tab;
  /** Texto do botão que leva até lá. */
  acao: string;
  /** Camada da cadeia, para agrupar a lista na ordem da jornada. */
  camada: 'objetivo' | 'iniciativa' | 'risco' | 'trabalho';
  /**
   * O QUE os ids da lacuna são. Não é o mesmo que `camada`: o elo rompido
   * "iniciativa sem objetivo" pertence à camada do objetivo, mas os ids são de
   * iniciativa. Sem esta distinção, clicar num exemplo abriria a coisa errada.
   */
  entidade: 'objetivo' | 'iniciativa' | 'risco' | 'trabalho';
}

export const LACUNAS: Record<ChaveLacuna, RotuloLacuna> = {
  objetivo_sem_iniciativa: {
    titulo: 'Objetivo ativo sem iniciativa ativa',
    ajuda: 'Ninguém está trabalhando neles. É intenção, não plano.',
    destino: 'objetivos', acao: 'Ver objetivos', camada: 'objetivo', entidade: 'objetivo',
  },
  iniciativa_sem_objetivo: {
    titulo: 'Iniciativa sem objetivo',
    ajuda: 'Não deveriam existir — a regra recusa na gravação. Provavelmente o objetivo delas foi excluído.',
    destino: 'iniciativas', acao: 'Reatribuir', camada: 'objetivo', entidade: 'iniciativa',
  },
  iniciativa_sem_marco: {
    titulo: 'Iniciativa ativa sem marco',
    ajuda: 'Sem entregável verificável, não há como saber se anda nem medir atraso.',
    destino: 'iniciativas', acao: 'Cadastrar marcos', camada: 'iniciativa', entidade: 'iniciativa',
  },
  iniciativa_parada: {
    titulo: 'Iniciativa parada',
    ajuda: 'Em execução, sem marco movimentado há mais de 30 dias. Ninguém cancela — só para de mexer.',
    destino: 'iniciativas', acao: 'Ver iniciativas', camada: 'iniciativa', entidade: 'iniciativa',
  },
  risco_sem_tratamento: {
    titulo: 'Risco aberto sem tratamento',
    ajuda: 'Nenhuma ação viva vinculada, e a resposta não foi aceitar.',
    destino: 'registro', acao: 'Abrir o rastro', camada: 'risco', entidade: 'risco',
  },
  risco_sem_objetivo: {
    titulo: 'Risco que não sustenta objetivo nenhum',
    ajuda: 'É tratado, mas por mitigação autônoma — não dá para dizer que resultado de negócio ele protege. '
      + 'Promover a mitigação a iniciativa, ou vinculá-la a uma, fecha o elo.',
    destino: 'registro', acao: 'Abrir o rastro', camada: 'risco', entidade: 'risco',
  },
  trabalho_sem_dono: {
    titulo: 'Tarefa ou ação aberta sem dono',
    ajuda: 'Ninguém responde por ela. Prazo sem dono não cobra nada.',
    destino: 'tarefas', acao: 'Ver tarefas', camada: 'trabalho', entidade: 'trabalho',
  },
  trabalho_atrasado: {
    titulo: 'Tarefa ou ação atrasada',
    ajuda: 'Prazo vencido e trabalho ainda aberto. Rotina não entra — controle contínuo nunca atrasa.',
    destino: 'tarefas', acao: 'Ver tarefas', camada: 'trabalho', entidade: 'trabalho',
  },
};
