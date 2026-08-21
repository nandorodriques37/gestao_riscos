// Sugestão de destino para cada ação extraída na migração (Fase 2).
//
// É só sugestão: quem decide é o gestor, na tela de Triagem. Cada regra devolve
// o motivo junto, para a tela explicar por que sugeriu aquilo em vez de pedir
// confiança cega.
//
// Duas decisões de calibragem, tomadas depois de rodar contra os 62 registros
// reais:
//
// 1. O corte de esforço é 2,5 — o mesmo limite alto/baixo que a matriz de
//    quadrantes já usa neste app. Inventar outro número criaria duas noções de
//    "esforço grande" na mesma ferramenta.
// 2. `recurso` preenchido NÃO é sinal de dependência externa. 41 das 50 ações
//    têm recurso, e "PAGUE MENOS - SUPPLY" é o próprio time — usar isso como
//    critério jogava 34 de 50 para iniciativa e tornava a sugestão inútil.
//    Só "TERCEIRIZADO" significa depender de fora.
import type { DestinoTriagem } from '../types';

export type DestinoSugerido = Exclude<DestinoTriagem, ''>;

export interface Sugestao {
  destino: DestinoSugerido;
  motivo: string;
  /** Falso quando o sinal é fraco e vale a pena o gestor olhar com atenção. */
  confiante: boolean;
}

/** Limite alto/baixo de esforço — o mesmo da matriz de quadrantes. */
export const CORTE_ESFORCO = 2.5;

/** Sinais de trabalho contínuo: controle permanente, não projeto nem tarefa avulsa. */
const MARCADORES_ROTINA = [
  'revisao', 'revisoes', 'quinzenal', 'quinzenais', 'mensal', 'mensais',
  'semanal', 'semanais', 'diaria', 'diario', 'diariamente', 'periodic',
  'acompanhar', 'acompanhamento', 'monitorar', 'monitoramento',
  'recorrente', 'rotina', 'sempre que', 'toda semana', 'todo mes',
];

/**
 * Verbos de construção: "cria capacidade nova" é o critério do prompt para
 * promover a iniciativa. Só vale quando não há esforço preenchido — dado que o
 * gestor digitou vence texto adivinhado.
 */
const MARCADORES_CONSTRUCAO = [
  'criar', 'criacao', 'desenvolver', 'desenvolvimento', 'construir',
  'reformulacao', 'reformular', 'restruturacao', 'reestruturacao',
  'reestruturar', 'implantar', 'implementar', 'projeto', 'motor',
  'ferramenta', 'power bi', 'automatizar', 'migrar', 'migracao',
];

/** Sinal de que o trabalho depende de fornecedor, não do próprio time. */
const RECURSO_EXTERNO = 'terceiriz';

/** Minúsculas sem acento — os textos do registro têm acentuação irregular. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export interface EntradaTriagem {
  descricao: string;
  /** Escala 0–5 do registro de risco de origem. */
  esforco: number | null;
  /** Time ou fornecedor que executa. */
  recurso: string;
}

function comVirgula(n: number): string {
  return String(n).replace('.', ',');
}

/**
 * Ordem das regras importa, e ela é deliberada:
 *
 * - recorrência vence tudo, porque uma revisão quinzenal cara continua sendo
 *   rotina, não um projeto com começo e fim;
 * - depois vem o que o gestor mediu (esforço), porque é dado, não palpite;
 * - o texto só entra quando não há esforço preenchido.
 */
export function sugerirDestino(e: EntradaTriagem): Sugestao {
  const texto = normalizar(e.descricao);

  const rotina = MARCADORES_ROTINA.find(m => texto.includes(m));
  if (rotina) {
    return {
      destino: 'rotina',
      motivo: `O texto diz "${rotina}" — é controle contínuo, não esforço com fim.`,
      confiante: true,
    };
  }

  if (normalizar(e.recurso).includes(RECURSO_EXTERNO)) {
    return {
      destino: 'iniciativa',
      motivo: 'Executado por terceiro — trabalho de fornecedor precisa de marcos e data.',
      confiante: true,
    };
  }

  if (e.esforco != null) {
    return e.esforco > CORTE_ESFORCO
      ? {
        destino: 'iniciativa',
        motivo: `Esforço ${comVirgula(e.esforco)} de 5, acima do corte ${comVirgula(CORTE_ESFORCO)} da matriz — grande demais para caber numa ação.`,
        confiante: true,
      }
      : {
        destino: 'acao',
        motivo: `Esforço ${comVirgula(e.esforco)} de 5, dentro do corte ${comVirgula(CORTE_ESFORCO)} — cabe como mitigação autônoma.`,
        confiante: true,
      };
  }

  const construcao = MARCADORES_CONSTRUCAO.find(m => texto.includes(m));
  if (construcao) {
    return {
      destino: 'iniciativa',
      motivo: `Sem esforço medido, mas o texto diz "${construcao}" — parece criar capacidade nova. Confirme o porte.`,
      confiante: false,
    };
  }

  return {
    destino: 'acao',
    motivo: 'Sem esforço medido e sem sinal de porte no texto. Confira e reclassifique se discordar.',
    confiante: false,
  };
}

/** Rótulo do destino, para a tela e para o resumo da fila. */
export const ROTULO_DESTINO: Record<DestinoSugerido, string> = {
  acao: 'Fica como ação',
  iniciativa: 'Vira iniciativa',
  rotina: 'É rotina',
};
