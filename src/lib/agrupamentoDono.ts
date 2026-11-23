import type { Pessoa } from '../types';
import type { EnrichedTaskRow } from './taskRows';
import { prioridadeLabel } from './taskCalculations';
import { chaveDoNome } from './nomes';

/**
 * Tarefas agrupadas por quem responde — a mesma pergunta na Lista e no Quadro.
 *
 * "Sem dono" é `dono_id` nulo, a régua de `saudeTrabalho`: o título da aba diz
 * "N sem dono" e o grupo tem de ter o mesmo N. Linha legada que só tem o texto
 * congelado em `responsavel` cai aqui de propósito — ninguém ainda assumiu a
 * ficha, e agrupá-la pelo texto criaria um segundo "Derylson" ao lado do real.
 */
export const SEM_DONO = '__sem_dono__';

export interface GrupoDono {
  /** `pessoas.id`, ou `SEM_DONO`. */
  id: string;
  nome: string;
  semDono: boolean;
  /** Pessoa inativa que ainda segura trabalho — a tela avisa. */
  inativa: boolean;
  /** Na ordem em que chegaram: quem ordena é a tabela, não o grupo. */
  linhas: EnrichedTaskRow[];
  /** Contagens sobre trabalho aberto (fora Concluída e Cancelada). */
  abertas: number;
  atrasadas: number;
  /** Faixa Crítica da nota GUT — a mesma conta do KPI "GUT crítico". */
  criticas: number;
  aFazer: number;
  emAndamento: number;
  concluidas: number;
}

function aberta(row: EnrichedTaskRow): boolean {
  return row.normSt !== 'Concluída' && row.normSt !== 'Cancelada';
}

/** A que grupo a linha pertence. */
export function grupoDaLinha(row: EnrichedTaskRow): string {
  return row.task.dono_id ?? SEM_DONO;
}

/**
 * Ordem: mais atrasadas primeiro, depois mais GUT crítico, depois nome. "Sem
 * dono" sempre por último — é um balde, não uma pessoa, e no topo esconderia
 * quem está devendo.
 */
function comparar(a: GrupoDono, b: GrupoDono): number {
  if (a.semDono !== b.semDono) return a.semDono ? 1 : -1;
  return b.atrasadas - a.atrasadas
    || b.criticas - a.criticas
    || a.nome.localeCompare(b.nome, 'pt-BR');
}

/** Um grupo por dono presente em `rows`. Grupo vazio não existe. */
export function agruparPorDono(rows: EnrichedTaskRow[], pessoas: Pessoa[]): GrupoDono[] {
  const pessoaPorId = new Map(pessoas.map(p => [p.id, p]));
  const grupos = new Map<string, GrupoDono>();

  for (const row of rows) {
    const id = grupoDaLinha(row);
    let g = grupos.get(id);
    if (!g) {
      const pessoa = id === SEM_DONO ? undefined : pessoaPorId.get(id);
      g = {
        id,
        nome: id === SEM_DONO ? 'Sem dono' : pessoa?.nome ?? (row.dono || 'Pessoa sem ficha'),
        semDono: id === SEM_DONO,
        inativa: pessoa != null && !pessoa.ativo,
        linhas: [],
        abertas: 0, atrasadas: 0, criticas: 0, aFazer: 0, emAndamento: 0, concluidas: 0,
      };
      grupos.set(id, g);
    }
    g.linhas.push(row);
    if (row.normSt === 'Concluída') g.concluidas++;
    if (!aberta(row)) continue;
    g.abertas++;
    if (row.normSt === 'Em andamento') g.emAndamento++;
    else g.aFazer++;
    if (row.atrasada) g.atrasadas++;
    if (prioridadeLabel(row.gut) === 'Crítica') g.criticas++;
  }

  return [...grupos.values()].sort(comparar);
}

/** Uma opção do filtro de pessoas. */
export interface OpcaoDono {
  id: string;
  nome: string;
  semDono: boolean;
  /** Trabalho aberto dessa pessoa em todo o quadro, antes de qualquer recorte. */
  abertas: number;
}

/**
 * Quem pode ser marcado no filtro: toda pessoa ativa, mais a inativa que ainda
 * tem tarefa, mais "Sem dono" quando há linha sem dono. Em ordem alfabética,
 * com "Sem dono" no fim — no filtro se procura pelo nome, não pela urgência.
 */
export function opcoesDeDono(rows: EnrichedTaskRow[], pessoas: Pessoa[]): OpcaoDono[] {
  const abertasPor = new Map<string, number>();
  const presentes = new Set<string>();
  for (const row of rows) {
    const id = grupoDaLinha(row);
    presentes.add(id);
    if (aberta(row)) abertasPor.set(id, (abertasPor.get(id) ?? 0) + 1);
  }

  const opcoes: OpcaoDono[] = pessoas
    .filter(p => p.ativo || presentes.has(p.id))
    .map(p => ({ id: p.id, nome: p.nome, semDono: false, abertas: abertasPor.get(p.id) ?? 0 }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  if (presentes.has(SEM_DONO)) {
    opcoes.push({ id: SEM_DONO, nome: 'Sem dono', semDono: true, abertas: abertasPor.get(SEM_DONO) ?? 0 });
  }
  return opcoes;
}

/**
 * Recorte do filtro de pessoas. Lista vazia = sem recorte (todas), a mesma
 * convenção do filtro de status — senão "Limpar" esvaziaria a tela.
 */
export function filtrarPorDono(rows: EnrichedTaskRow[], selecionados: readonly string[]): EnrichedTaskRow[] {
  if (selecionados.length === 0) return rows;
  const sel = new Set(selecionados);
  return rows.filter(row => sel.has(grupoDaLinha(row)));
}

/**
 * A ficha de quem está usando o app, para "Só as minhas". Casa o nome de autor
 * com a ficha ignorando acento e caixa (`chaveDoNome`), como o resto do app.
 * Nulo quando o autor não tem ficha — a tela então não oferece o atalho.
 */
export function pessoaDoAutor(autor: string, pessoas: Pessoa[]): Pessoa | null {
  const chave = chaveDoNome(autor);
  if (!chave) return null;
  return pessoas.find(p => chaveDoNome(p.nome) === chave) ?? null;
}
