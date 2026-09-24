// Montagem da aba Objetivos: junta, por objetivo, o que as funções puras de
// `portfolioMetrics` já calculam. Nada aqui é régua nova — progresso, impacto
// e ameaça saem de lá; este arquivo só evita que a linha, o detalhe, a faixa
// de KPI e o rodapé chamem a mesma função cada um por conta própria e
// divirjam no dia em que um deles esquecer um argumento.
import type {
  AcaoRisco, Iniciativa, Medicao, Objetivo, Pessoa, StatusObjetivo, StoredRiskRecord,
} from '../../types';
import type { BadgeKind } from '../../lib/calculations';
import {
  ameacasDoObjetivo, ameacasSomadas, impactoDoObjetivo, iniciativaAtiva, progressoObjetivo, saudeObjetivos,
  type AmeacasDoObjetivo, type ContagemAmeacas, type ImpactoDoObjetivo, type ProgressoObjetivo,
} from '../../lib/portfolioMetrics';
import { formatarData, formatarNumero } from '../../lib/portfolioLabels';
import { OBJETIVO_BALDE } from '../../lib/portfolioUi';

export interface LinhaObjetivo {
  objetivo: Objetivo;
  /** A descrição, com recuo — botão sem texto não dá nem para clicar. */
  nome: string;
  /** Balde temporário da migração: caixa de entrada, não direção. */
  balde: boolean;
  /** Ativo sem iniciativa ativa: é intenção, não plano. */
  orfao: boolean;
  /** Nome do dono; null = ninguém responde. */
  dono: string | null;
  progresso: ProgressoObjetivo;
  /** Sem baseline ou meta não há caminho — diferente de "ninguém mediu". */
  semMeta: boolean;
  /** Pronto para declarar atingido: a série cobriu o caminho e ainda está ativo. */
  pronto: boolean;
  /** ' %', ' dias'… — com o espaço, pronto para colar no número. */
  sufixo: string;
  impacto: ImpactoDoObjetivo;
  ameacas: AmeacasDoObjetivo<StoredRiskRecord>;
  /** Concluídas, na mesma régua do `entregue`. */
  entregues: Iniciativa[];
  /** Ativas (`iniciativaAtiva`), na mesma régua do `emJogo`. */
  emCurso: Iniciativa[];
  /** Não priorizadas, canceladas e sem status: fora das duas contas. */
  foraDaConta: Iniciativa[];
  /** Concluídas sem `impacto_rs`: o entregue mente por baixo. */
  entreguesSemValor: number;
  /** Ativas sem `impacto_rs`: o em jogo mente por baixo. */
  emCursoSemValor: number;
}

export function ehBalde(o: Pick<Objetivo, 'descricao'>): boolean {
  return o.descricao === OBJETIVO_BALDE;
}

interface Entrada {
  objetivos: Objetivo[];
  iniciativas: Iniciativa[];
  medicoes: Medicao[];
  acoes: AcaoRisco[];
  riscos: StoredRiskRecord[];
  pessoas: Pessoa[];
}

/** Uma linha por objetivo, indexada por id. */
export function montarLinhas(e: Entrada): Map<string, LinhaObjetivo> {
  const nomePessoa = new Map(e.pessoas.map(p => [p.id, p.nome]));
  const porObjetivo = new Map<string, Iniciativa[]>();
  for (const i of e.iniciativas) {
    if (!i.objetivo_id) continue;
    const lista = porObjetivo.get(i.objetivo_id) ?? [];
    lista.push(i);
    porObjetivo.set(i.objetivo_id, lista);
  }

  const linhas = new Map<string, LinhaObjetivo>();
  for (const o of e.objetivos) {
    const daqui = porObjetivo.get(o.id) ?? [];
    const entregues = daqui.filter(i => i.status === 'concluida');
    const emCurso = daqui.filter(iniciativaAtiva);
    const foraDaConta = daqui.filter(i => i.status !== 'concluida' && !iniciativaAtiva(i));
    const balde = ehBalde(o);
    const progresso = progressoObjetivo(o, e.medicoes);
    linhas.set(o.id, {
      objetivo: o,
      nome: o.descricao || 'Objetivo sem descrição',
      balde,
      orfao: !balde && o.status === 'ativo' && emCurso.length === 0,
      dono: o.dono_id ? nomePessoa.get(o.dono_id) ?? 'Dono removido' : null,
      progresso,
      semMeta: o.baseline == null || o.meta == null || o.baseline === o.meta,
      pronto: progresso.pct === 1 && o.status === 'ativo',
      sufixo: o.unidade ? ` ${o.unidade}` : '',
      impacto: impactoDoObjetivo(o.id, e.iniciativas),
      ameacas: ameacasDoObjetivo(o.id, e.iniciativas, e.acoes, e.riscos),
      entregues,
      emCurso,
      foraDaConta,
      entreguesSemValor: entregues.filter(i => i.impacto_rs == null).length,
      emCursoSemValor: emCurso.filter(i => i.impacto_rs == null).length,
    });
  }
  return linhas;
}

export interface TotaisObjetivos {
  /** Linhas somadas — os visíveis, balde incluído. */
  n: number;
  entregue: number;
  emJogo: number;
  concluidas: number;
  ativas: number;
  entreguesSemValor: number;
  emCursoSemValor: number;
  /** Cada risco uma vez só, mesmo quando ameaça dois objetivos. */
  ameacas: ContagemAmeacas;
  /** Ativos que não são o balde: a base de "indicadores melhorando". */
  ativos: number;
  melhorando: number;
  /** Prontos para declarar atingido (`saudeObjetivos`). */
  prontos: number;
  /** Sem indicador + sem medição, entre os ativos. */
  semNumero: number;
  /**
   * Maior entregue + em jogo de uma linha: a régua COMPARTILHADA das barras
   * de impacto. Cada linha na própria escala faria R$ 40 mil e R$ 4 mi
   * encherem a mesma largura.
   */
  escala: number;
}

/** Os totais da faixa de KPI e do rodapé da lista — a mesma conta nos dois lugares. */
export function somarTotais(linhas: LinhaObjetivo[], medicoes: Medicao[]): TotaisObjetivos {
  const ativos = linhas.filter(l => !l.balde && l.objetivo.status === 'ativo');
  const saude = saudeObjetivos(ativos.map(l => l.objetivo), medicoes);
  const soma = (f: (l: LinhaObjetivo) => number) => linhas.reduce((s, l) => s + f(l), 0);
  return {
    n: linhas.length,
    entregue: soma(l => l.impacto.entregue),
    emJogo: soma(l => l.impacto.emJogo),
    concluidas: soma(l => l.impacto.concluidas),
    ativas: soma(l => l.impacto.ativas),
    entreguesSemValor: soma(l => l.entreguesSemValor),
    emCursoSemValor: soma(l => l.emCursoSemValor),
    ameacas: ameacasSomadas(linhas.map(l => l.ameacas)),
    ativos: ativos.length,
    melhorando: ativos.filter(l => l.progresso.tendencia === 'melhorou').length,
    prontos: saude.prontosParaAtingir.length,
    semNumero: saude.semIndicador + saude.semMedicao,
    escala: Math.max(0, ...linhas.map(l => l.impacto.entregue + l.impacto.emJogo)),
  };
}

/** Casas decimais seguem o próprio número: 8,4% mantém a casa, 145 dias não ganha uma. */
export function numeroIndicador(v: number | null): string {
  return formatarNumero(v, v != null && !Number.isInteger(v) ? 1 : 0);
}

/** A série em uma frase, para o `aria-label` do gráfico — o traço sozinho não fala. */
export function descreverSerie(serie: { data: string; valor: number }[], sufixo: string): string {
  if (serie.length === 0) return 'Nenhuma medição';
  const ultimo = serie[serie.length - 1];
  if (serie.length === 1) {
    return `Uma leitura: ${numeroIndicador(ultimo.valor)}${sufixo} em ${formatarData(ultimo.data)}`;
  }
  return `${serie.length} leituras, de ${numeroIndicador(serie[0].valor)}${sufixo} `
    + `em ${formatarData(serie[0].data)} a ${numeroIndicador(ultimo.valor)}${sufixo} `
    + `em ${formatarData(ultimo.data)}`;
}

export const ROTULO_TENDENCIA: Record<NonNullable<ProgressoObjetivo['tendencia']>, string> = {
  melhorou: 'melhorou', piorou: 'piorou', estavel: 'estável',
};

/** Seta + palavra, nunca só a cor. */
export const SETA_TENDENCIA: Record<NonNullable<ProgressoObjetivo['tendencia']>, string> = {
  melhorou: '▲', piorou: '▼', estavel: '=',
};

/** Badge do status do objetivo: verde só quando a meta caiu de fato. */
export const BADGE_STATUS_OBJETIVO: Record<StatusObjetivo, BadgeKind> = {
  ativo: 'neutro', atingido: 'ok', abandonado: 'neutro', '': 'neutro',
};
