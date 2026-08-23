import type { Iniciativa, Pessoa, StoredRiskRecord, StoredTask } from '../types';
import { computeGUT, normTaskStatus, prioridadeLabel, computeTaskRanks } from './taskCalculations';
import { computeScore, scoreTier } from './calculations';

/** Faixa de criticidade do risco → faixa de prioridade do quadro. */
const FAIXA_POR_TIER: Record<string, 'Crítica' | 'Alta' | 'Média' | 'Baixa'> = {
  critico: 'Crítica',
  alto: 'Alta',
  medio: 'Média',
  baixo: 'Baixa',
};

/**
 * De onde a linha veio, quando ela é mitigação de risco.
 *
 * Existe porque o quadro passou a mostrar as duas coisas na mesma lista: o
 * cartão precisa dizer, sem abrir nada, que aquela entrega está segurando um
 * risco — e qual.
 */
export interface VinculoDaLinha {
  riscoId: string;
  /** Texto do risco. Vazio enquanto o registro não chegou, ou se ele sumiu. */
  risco: string;
  /**
   * O risco não existe mais — `risco_id` aponta para registro apagado.
   *
   * Não é o mesmo que `risco` vazio: o quadro pinta antes de os riscos
   * carregarem, e nessa janela toda linha vinculada pareceria órfã. Dizer
   * "risco excluído" para 50 linhas por meio segundo é mentira, não atraso.
   */
  orfa: boolean;
  /** Faixa de criticidade do risco, para o acento do chip. */
  tier: string;
  /** Nome da iniciativa que executa esta mitigação, quando há uma. */
  iniciativa: string | null;
  iniciativaId: string | null;
  /** Controle contínuo: não tem prazo e nunca está atrasado. */
  rotina: boolean;
}

export interface EnrichedTaskRow {
  idx: number;
  /** Tarefa como veio do banco — a tabela e o quadro também mostram os anexos. */
  task: StoredTask;
  gut: number | null;
  prioridade: 'Crítica' | 'Alta' | 'Média' | 'Baixa' | null;
  /**
   * A faixa não veio de G × U × T: foi herdada da criticidade do risco. Só
   * acontece em mitigação sem nota, que é o caso de toda linha vinda do plano
   * de ação — o GUT é o esquema do quadro, a criticidade é o do risco, e
   * forçar um sobre o outro apagaria a diferença. Sem isso as mitigações caem
   * todas em "Sem nota" e o quadro por prioridade fica inútil para metade das
   * linhas.
   */
  prioridadeHerdada: boolean;
  rank: number | null;
  normSt: string;
  /** Nulo = tarefa livre. */
  vinculo: VinculoDaLinha | null;
  /**
   * Quem responde. A tarefa livre guarda texto; a mitigação guarda `dono_id`,
   * porque veio do plano de ação, onde responsável é pessoa de verdade. A tela
   * mostra um só nome — de onde ele vem é problema desta função.
   */
  dono: string;
  /** Prazo vencido e trabalho ainda aberto. Rotina nunca atrasa. */
  atrasada: boolean;
}

/** Iniciais do responsável (até 2 palavras) para o avatar — usado na tabela e no card. */
export function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

/** O que a linha precisa saber sobre o resto do app para se descrever. */
export interface ContextoDoQuadro {
  riscos: StoredRiskRecord[];
  iniciativas: Iniciativa[];
  pessoas: Pessoa[];
  /** Injetável para o teste não depender do calendário. */
  hoje?: string;
}

const VAZIO: ContextoDoQuadro = { riscos: [], iniciativas: [], pessoas: [] };

/** Dias entre o prazo e hoje, para o rótulo dizer o tamanho do atraso. */
export function diasDeAtraso(prazo: string, hoje: string = hojeISO()): number {
  const ms = Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${prazo}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86400000));
}

function hojeISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function buildTaskRows(
  tasks: StoredTask[], ctx: ContextoDoQuadro = VAZIO,
): EnrichedTaskRow[] {
  const guts = tasks.map(t => computeGUT(t));
  const ranks = computeTaskRanks(guts.map(gut => ({ gut })));
  const riscoPorId = new Map(ctx.riscos.map(r => [r.id, r]));
  const iniciativaPorId = new Map(ctx.iniciativas.map(i => [i.id, i.nome]));
  const pessoaPorId = new Map(ctx.pessoas.map(p => [p.id, p.nome]));
  const hoje = ctx.hoje ?? hojeISO();

  return tasks.map((task, idx) => {
    const normSt = normTaskStatus(task.status);
    const risco = task.risco_id ? riscoPorId.get(task.risco_id) : undefined;
    const rotina = task.triagem === 'rotina';

    const vinculo: VinculoDaLinha | null = task.risco_id
      ? {
        riscoId: task.risco_id,
        risco: risco?.risco ?? '',
        // Linha vinculada só existe se houver risco: lista vazia é
        // carregamento, não exclusão.
        orfa: !risco && ctx.riscos.length > 0,
        tier: scoreTier(risco ? computeScore(risco) : null),
        iniciativa: task.iniciativa_id ? iniciativaPorId.get(task.iniciativa_id) ?? null : null,
        iniciativaId: task.iniciativa_id,
        rotina,
      }
      : null;

    const dono = task.responsavel
      || (task.dono_id ? pessoaPorId.get(task.dono_id) ?? '' : '');

    const propria = prioridadeLabel(guts[idx]);
    const herdada = propria == null && vinculo ? FAIXA_POR_TIER[vinculo.tier] ?? null : null;

    const aberta = normSt !== 'Concluída' && normSt !== 'Cancelada';
    return {
      idx,
      task,
      gut: guts[idx],
      prioridade: propria ?? herdada,
      prioridadeHerdada: propria == null && herdada != null,
      rank: ranks[idx],
      normSt,
      vinculo,
      dono,
      atrasada: !rotina && aberta && !!task.prazo && task.prazo < hoje,
    };
  });
}
