import type { Task } from '../types';
import { computeGUT, prioridadeLabel } from './taskCalculations';

/**
 * Ponte entre a prioridade — que é **calculada** (GUT = G × U × T) — e o Kanban,
 * onde a coluna é uma posição que o usuário arrasta. Mover um card entre colunas
 * exige escrever de volta em G/U/T, e não existe trinca única para uma faixa: as
 * funções aqui escolhem o **menor ajuste** que leva a tarefa à faixa alvo.
 *
 * As faixas em si continuam morando em `prioridadeLabel` — este módulo enumera as
 * notas possíveis e pergunta a ela em que faixa cada trinca cai, para que os
 * limiares tenham uma só fonte de verdade.
 */

export type PriorityBand = 'Crítica' | 'Alta' | 'Média' | 'Baixa';

/** Ordem das colunas do quadro: mais urgente à esquerda. */
export const PRIORITY_BANDS: readonly PriorityBand[] = ['Crítica', 'Alta', 'Média', 'Baixa'];

/** Coluna das tarefas com G, U ou T em branco — não é uma faixa, é ausência de nota. */
export const SEM_NOTA = 'Sem nota';

/** Notas válidas de Gravidade, Urgência e Tendência. */
const NOTAS = [1, 2, 3, 4, 5] as const;

/** Nota assumida no lugar de um campo vazio ao medir distância: o centro da escala. */
const NOTA_NEUTRA = 3;

type Trinca = { g: number; u: number; t: number };
type GutFields = Pick<Task, 'g' | 'u' | 't'>;

export interface GutChange {
  campo: 'G' | 'U' | 'T';
  /** null quando a nota estava em branco. */
  de: number | null;
  para: number;
}

export interface GutAdjustment {
  patch: Trinca;
  changes: GutChange[];
}

/** As 125 trincas de {1..5}³, agrupadas pela faixa em que caem. Calculado uma vez. */
const TRINCAS_POR_FAIXA: Record<PriorityBand, Trinca[]> = (() => {
  const mapa: Record<PriorityBand, Trinca[]> = { 'Crítica': [], 'Alta': [], 'Média': [], 'Baixa': [] };
  NOTAS.forEach(g => NOTAS.forEach(u => NOTAS.forEach(t => {
    const faixa = prioridadeLabel(computeGUT({ g, u, t }));
    if (faixa) mapa[faixa].push({ g, u, t });
  })));
  return mapa;
})();

/** Trincas que produzem a faixa — exposto para os testes fixarem o alcance de cada uma. */
export function trincasDaFaixa(band: PriorityBand): readonly Trinca[] {
  return TRINCAS_POR_FAIXA[band];
}

/** Faixa atual da tarefa, ou null quando falta alguma nota. */
export function bandOf(task: GutFields): PriorityBand | null {
  return prioridadeLabel(computeGUT(task));
}

/**
 * Menor ajuste de G/U/T que leva a tarefa para `band`; null se ela já está lá.
 *
 * Critério de desempate, nesta ordem: distância Manhattan, número de campos
 * mexidos, |Δg|, |Δt|, |Δu|. O efeito prático é preferir mexer na **Urgência** —
 * o eixo que mais muda no dia a dia — e deixar a **Gravidade** por último.
 */
export function adjustGutToBand(task: GutFields, band: PriorityBand): GutAdjustment | null {
  if (bandOf(task) === band) return null;

  // Campo vazio entra na conta como nota neutra: sem isso, uma tarefa sem
  // avaliação puxaria o ajuste para os extremos da escala.
  const atual: Trinca = {
    g: task.g ?? NOTA_NEUTRA,
    u: task.u ?? NOTA_NEUTRA,
    t: task.t ?? NOTA_NEUTRA,
  };

  const candidatas = TRINCAS_POR_FAIXA[band];
  let melhor = candidatas[0];
  let melhorPeso = peso(candidatas[0], atual);
  for (let i = 1; i < candidatas.length; i++) {
    const p = peso(candidatas[i], atual);
    if (menor(p, melhorPeso)) {
      melhor = candidatas[i];
      melhorPeso = p;
    }
  }

  const changes: GutChange[] = [];
  // Reporta contra os valores originais, não contra a nota neutra: uma tarefa sem
  // avaliação mostra "G — → 4", e não "G 3 → 4".
  if (task.g !== melhor.g) changes.push({ campo: 'G', de: task.g, para: melhor.g });
  if (task.u !== melhor.u) changes.push({ campo: 'U', de: task.u, para: melhor.u });
  if (task.t !== melhor.t) changes.push({ campo: 'T', de: task.t, para: melhor.t });

  return { patch: melhor, changes };
}

/** Vetor de desempate de uma candidata, do critério mais forte para o mais fraco. */
function peso(c: Trinca, atual: Trinca): number[] {
  const dg = Math.abs(c.g - atual.g);
  const du = Math.abs(c.u - atual.u);
  const dt = Math.abs(c.t - atual.t);
  const mexidos = (dg > 0 ? 1 : 0) + (du > 0 ? 1 : 0) + (dt > 0 ? 1 : 0);
  return [dg + du + dt, mexidos, dg, dt, du];
}

function menor(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

/** "U 2 → 4" · "G — → 4 · U — → 5" — resumo do ajuste para o aviso de desfazer. */
export function describeChanges(changes: readonly GutChange[]): string {
  return changes.map(c => `${c.campo} ${c.de ?? '—'} → ${c.para}`).join(' · ');
}
