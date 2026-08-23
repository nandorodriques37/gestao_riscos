// Métricas do portfólio — funções puras, uma por pergunta que o Painel precisa
// responder. Nada aqui toca rede, relógio global ou estado: tudo que depende de
// "hoje" recebe a data por parâmetro, para o teste não depender do calendário.
//
// Datas viajam como 'YYYY-MM-DD' e são comparadas em UTC. Comparar por objeto
// `Date` local traria horário de verão para dentro de contagem de dias.
import type {
  AcaoRisco, FonteIniciativa, Iniciativa, Marco, Medicao, Objetivo, Pessoa,
  RiskRecord, StatusIniciativa, VetorIniciativa,
} from '../types';

/* ------------------------------------------------------------------ */
/* Conjuntos de status                                                 */
/* ------------------------------------------------------------------ */

/**
 * Portfólio comprometido: já saiu de ideia e ainda não terminou. `backlog` não
 * conta porque ninguém se comprometeu; `pausada` conta porque o impacto segue
 * prometido, mesmo parado.
 */
export const STATUS_ATIVOS: readonly StatusIniciativa[] = ['aprovada', 'em_execucao', 'pausada'];

/** WIP é só o que está sendo tocado agora — pausada não ocupa ninguém. */
export const STATUS_EM_EXECUCAO: StatusIniciativa = 'em_execucao';

/** Acima disto, o dono está sobrecarregado. Alerta, nunca bloqueio. */
export const LIMITE_WIP = 2;

/** Sem marco movimentado por mais tempo que isto, a iniciativa é zumbi. */
export const DIAS_PARA_ZUMBI = 30;

/** Acima desta fatia de `evitar_perda`, o portfólio só defende. */
export const LIMITE_DEFENSIVO = 0.7;

/** Situações finais do risco: saiu do radar, de um jeito ou de outro. */
const SITUACOES_FINAIS = new Set(['mitigado', 'obsoleto', 'descartado']);

export function iniciativaAtiva(i: Iniciativa): boolean {
  return STATUS_ATIVOS.includes(i.status);
}

/* ------------------------------------------------------------------ */
/* Datas                                                               */
/* ------------------------------------------------------------------ */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'YYYY-MM-DD' de hoje, no fuso local — é como o usuário enxerga a data. */
export function hojeISO(hoje: Date = new Date()): string {
  return `${hoje.getFullYear()}-${pad2(hoje.getMonth() + 1)}-${pad2(hoje.getDate())}`;
}

/** Milissegundos UTC de uma data 'YYYY-MM-DD'. */
function emUTC(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const DIA_MS = 86_400_000;

/** Dias de `de` até `ate`. Positivo quando `ate` é mais tarde. */
export function diasEntre(de: string | null, ate: string | null): number | null {
  if (!de || !ate) return null;
  const a = emUTC(de);
  const b = emUTC(ate);
  if (a == null || b == null) return null;
  return Math.round((b - a) / DIA_MS);
}

/** Período 'AAAA-MM' de uma data. */
export function periodoDe(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * Lista de períodos 'AAAA-MM' que a janela cobre, inclusive nas pontas.
 * Uma janela sem fim, ou invertida, vale um mês — o do início.
 */
export function mesesNoIntervalo(inicio: string | null, fim: string | null): string[] {
  if (!inicio) return [];
  const ini = periodoDe(inicio);
  if (!fim) return [ini];
  const f = periodoDe(fim);
  if (f < ini) return [ini];

  const meses: string[] = [];
  let ano = Number(ini.slice(0, 4));
  let mes = Number(ini.slice(5, 7));
  for (let i = 0; i < 600; i++) {
    const atual = `${ano}-${pad2(mes)}`;
    meses.push(atual);
    if (atual === f) break;
    mes++;
    if (mes > 12) { mes = 1; ano++; }
  }
  return meses;
}

/* ------------------------------------------------------------------ */
/* Impacto comprometido                                                */
/* ------------------------------------------------------------------ */

export interface ImpactoPorObjetivo {
  objetivo: Objetivo | null;
  iniciativas: number;
  impacto: number;
}

export interface ImpactoComprometido {
  total: number;
  porObjetivo: ImpactoPorObjetivo[];
  /** Iniciativas ativas sem valor de impacto preenchido — o total mente por baixo. */
  semValor: number;
}

/** Σ `impacto_rs` das iniciativas ativas, por objetivo. Traduz portfólio em R$. */
export function impactoComprometido(
  iniciativas: Iniciativa[], objetivos: Objetivo[],
): ImpactoComprometido {
  const ativas = iniciativas.filter(iniciativaAtiva);
  const porId = new Map(objetivos.map(o => [o.id, o]));
  const acc = new Map<string, { objetivo: Objetivo | null; iniciativas: number; impacto: number }>();
  let total = 0;
  let semValor = 0;

  for (const i of ativas) {
    if (i.impacto_rs == null) semValor++;
    const valor = i.impacto_rs ?? 0;
    total += valor;
    const chave = i.objetivo_id ?? '';
    const atual = acc.get(chave) ?? {
      objetivo: i.objetivo_id ? porId.get(i.objetivo_id) ?? null : null,
      iniciativas: 0,
      impacto: 0,
    };
    atual.iniciativas++;
    atual.impacto += valor;
    acc.set(chave, atual);
  }

  return {
    total,
    semValor,
    porObjetivo: [...acc.values()].sort((a, b) => b.impacto - a.impacto),
  };
}

/* ------------------------------------------------------------------ */
/* Marcos: prazo e slip                                                */
/* ------------------------------------------------------------------ */

export interface MarcosNoPrazo {
  noPrazo: number;
  /** Entregues depois da data original, ou vencidos e ainda não entregues. */
  foraDoPrazo: number;
  /** Denominador: já era para ter acontecido. */
  total: number;
  /** Fração 0–1, ou null quando nada venceu ainda. */
  pct: number | null;
}

/**
 * Disciplina de entrega, medida contra a data ORIGINAL — replanejar não
 * conserta o passado.
 *
 * O denominador é o que já venceu: marco entregue, ou marco cuja data original
 * já passou e continua em aberto. Contar só os entregues deixaria um marco seis
 * meses atrasado nunca pesar; contar tudo faria o número cair só porque há
 * trabalho em voo. Cancelado fica de fora: não é promessa quebrada.
 */
export function marcosNoPrazo(marcos: Marco[], hoje: Date = new Date()): MarcosNoPrazo {
  const limite = hojeISO(hoje);
  let noPrazo = 0;
  let foraDoPrazo = 0;

  for (const m of marcos) {
    if (m.status === 'cancelado') continue;
    const original = m.data_plano_original;
    if (!original) continue;

    if (m.status === 'entregue' && m.data_real) {
      if (m.data_real <= original) noPrazo++;
      else foraDoPrazo++;
      continue;
    }
    // Ainda não entregue: só conta se a data original já passou.
    if (original < limite) foraDoPrazo++;
  }

  const total = noPrazo + foraDoPrazo;
  return { noPrazo, foraDoPrazo, total, pct: total === 0 ? null : noPrazo / total };
}

export interface SlipMedio {
  /** Média de dias entre plano atual e plano original, sobre os avaliáveis. */
  diasMedio: number | null;
  /** Marcos com as duas datas preenchidas. */
  avaliados: number;
  /** Quantos de fato escorregaram (slip > 0). */
  replanejados: number;
  /** Média só entre os que escorregaram — o tamanho típico do erro. */
  diasMedioDosReplanejados: number | null;
}

/** Erro de dimensionamento: o quanto as datas andaram desde o plano original. */
export function slipMedio(marcos: Marco[]): SlipMedio {
  const slips: number[] = [];
  for (const m of marcos) {
    if (m.status === 'cancelado') continue;
    const d = diasEntre(m.data_plano_original, m.data_plano_atual);
    if (d != null) slips.push(d);
  }
  const positivos = slips.filter(d => d > 0);
  const media = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((s, x) => s + x, 0) / xs.length);

  return {
    diasMedio: media(slips),
    avaliados: slips.length,
    replanejados: positivos.length,
    diasMedioDosReplanejados: media(positivos),
  };
}

/* ------------------------------------------------------------------ */
/* Carga: WIP e dias-pessoa                                            */
/* ------------------------------------------------------------------ */

export interface WipDono {
  pessoa: Pessoa | null;
  /** Nome legível mesmo quando a iniciativa não tem dono cadastrado. */
  nome: string;
  wip: number;
  acimaDoLimite: boolean;
}

/** Iniciativas em execução por pessoa. Detecta sobrecarga. */
export function wipPorDono(iniciativas: Iniciativa[], pessoas: Pessoa[]): WipDono[] {
  const porId = new Map(pessoas.map(p => [p.id, p]));
  const acc = new Map<string, number>();

  for (const i of iniciativas) {
    if (i.status !== STATUS_EM_EXECUCAO) continue;
    acc.set(i.dono_id ?? '', (acc.get(i.dono_id ?? '') ?? 0) + 1);
  }

  return [...acc.entries()]
    .map(([id, wip]) => {
      const pessoa = id ? porId.get(id) ?? null : null;
      return {
        pessoa,
        nome: pessoa?.nome ?? 'Sem dono',
        wip,
        acimaDoLimite: wip > LIMITE_WIP,
      };
    })
    .sort((a, b) => b.wip - a.wip || a.nome.localeCompare(b.nome, 'pt-BR'));
}

export interface CargaPessoa {
  pessoa: Pessoa;
  /** Dias-pessoa que caem no período, somando as iniciativas ativas. */
  diasNoPeriodo: number;
  /** Teto declarado da pessoa, ou null quando não informado. */
  capacidade: number | null;
  /** Só é verdade quando há capacidade declarada para comparar. */
  acimaDaCapacidade: boolean;
  iniciativas: number;
}

/**
 * Correção da regra 7 do prompt, que comparava `esforco_dias` (dias, total da
 * iniciativa) com `horas_projeto` (horas, mensais) — grandezas diferentes.
 *
 * Aqui o esforço total é espalhado pelos meses da janela `inicio →
 * fim_plano_atual` e só a fatia do período pedido é somada, contra
 * `pessoas.dias_projeto_mes`. As duas pontas ficam em dias-pessoa por mês.
 *
 * Iniciativa sem janela ou sem esforço declarado não entra: chutar aqui daria
 * um alerta que ninguém consegue auditar.
 */
export function cargaPorPessoa(
  iniciativas: Iniciativa[], pessoas: Pessoa[], periodo: string,
): CargaPessoa[] {
  const acc = new Map<string, { dias: number; iniciativas: number }>();

  for (const i of iniciativas) {
    if (!iniciativaAtiva(i) || !i.dono_id || i.esforco_dias == null) continue;
    const meses = mesesNoIntervalo(i.inicio, i.fim_plano_atual ?? i.fim_plano_original);
    if (meses.length === 0 || !meses.includes(periodo)) continue;

    const atual = acc.get(i.dono_id) ?? { dias: 0, iniciativas: 0 };
    atual.dias += i.esforco_dias / meses.length;
    atual.iniciativas++;
    acc.set(i.dono_id, atual);
  }

  const porId = new Map(pessoas.map(p => [p.id, p]));
  return [...acc.entries()]
    .flatMap(([id, { dias, iniciativas: n }]) => {
      const pessoa = porId.get(id);
      if (!pessoa) return [];
      const capacidade = pessoa.dias_projeto_mes;
      return [{
        pessoa,
        diasNoPeriodo: Math.round(dias * 10) / 10,
        capacidade,
        acimaDaCapacidade: capacidade != null && capacidade > 0 && dias > capacidade,
        iniciativas: n,
      }];
    })
    .sort((a, b) => b.diasNoPeriodo - a.diasNoPeriodo);
}

/* ------------------------------------------------------------------ */
/* Zumbis e cobertura de objetivo                                      */
/* ------------------------------------------------------------------ */

export interface Zumbi {
  iniciativa: Iniciativa;
  diasParado: number;
  /** Falso quando a iniciativa nem marco tem — o relógio corre por ela mesma. */
  temMarco: boolean;
}

/**
 * Iniciativas em execução sem marco movimentado há mais de 30 dias. Detecta
 * abandono silencioso: ninguém cancela, só para de mexer.
 */
export function zumbis(
  iniciativas: Iniciativa[], marcos: Marco[], hoje: Date = new Date(),
): Zumbi[] {
  const ultimoPorIniciativa = new Map<string, string>();
  for (const m of marcos) {
    if (!m.iniciativa_id) continue;
    const atual = ultimoPorIniciativa.get(m.iniciativa_id);
    if (!atual || m.updated_at > atual) ultimoPorIniciativa.set(m.iniciativa_id, m.updated_at);
  }

  const agora = hoje.getTime();
  const out: Zumbi[] = [];

  for (const i of iniciativas) {
    if (i.status !== STATUS_EM_EXECUCAO) continue;
    const marcado = ultimoPorIniciativa.get(i.id);
    const referencia = marcado ?? i.updated_at;
    const ts = Date.parse(referencia);
    if (Number.isNaN(ts)) continue;
    const diasParado = Math.floor((agora - ts) / DIA_MS);
    if (diasParado > DIAS_PARA_ZUMBI) {
      out.push({ iniciativa: i, diasParado, temMarco: marcado != null });
    }
  }

  return out.sort((a, b) => b.diasParado - a.diasParado);
}

export interface CoberturaObjetivos {
  orfaos: Objetivo[];
  comIniciativa: number;
  totalAtivos: number;
}

/** Objetivo ativo sem nenhuma iniciativa ativa é intenção, não plano. */
export function coberturaObjetivos(
  objetivos: Objetivo[], iniciativas: Iniciativa[],
): CoberturaObjetivos {
  const comAtiva = new Set(
    iniciativas.filter(iniciativaAtiva).map(i => i.objetivo_id).filter(Boolean) as string[],
  );
  const ativos = objetivos.filter(o => o.status === 'ativo');
  const orfaos = ativos.filter(o => !comAtiva.has(o.id));
  return {
    orfaos,
    comIniciativa: ativos.length - orfaos.length,
    totalAtivos: ativos.length,
  };
}

/* ------------------------------------------------------------------ */
/* Mix por vetor e origem                                              */
/* ------------------------------------------------------------------ */

export interface FatiaVetor {
  vetor: VetorIniciativa;
  iniciativas: number;
  impacto: number;
  /** Fração 0–1 do impacto total. */
  pct: number;
}

export interface MixPorVetor {
  fatias: FatiaVetor[];
  total: number;
  /** Fração do impacto em `evitar_perda`. */
  defensivoPct: number;
  /** Verdadeiro quando o portfólio só defende. */
  soDefensivo: boolean;
}

/** O portfólio cria valor ou só evita perda? */
export function mixPorVetor(iniciativas: Iniciativa[]): MixPorVetor {
  const ativas = iniciativas.filter(iniciativaAtiva);
  const acc = new Map<VetorIniciativa, { iniciativas: number; impacto: number }>();
  let total = 0;

  for (const i of ativas) {
    const valor = i.impacto_rs ?? 0;
    total += valor;
    const atual = acc.get(i.vetor) ?? { iniciativas: 0, impacto: 0 };
    atual.iniciativas++;
    atual.impacto += valor;
    acc.set(i.vetor, atual);
  }

  const fatias: FatiaVetor[] = [...acc.entries()]
    .map(([vetor, v]) => ({ vetor, ...v, pct: total === 0 ? 0 : v.impacto / total }))
    .sort((a, b) => b.impacto - a.impacto);

  const defensivoPct = fatias.find(f => f.vetor === 'evitar_perda')?.pct ?? 0;
  return { fatias, total, defensivoPct, soDefensivo: defensivoPct > LIMITE_DEFENSIVO };
}

export interface FatiaOrigem {
  fonte: FonteIniciativa;
  iniciativas: number;
  impacto: number;
}

export interface PortfolioPorOrigem {
  fatias: FatiaOrigem[];
  /** Agregado: nasceu de risco. */
  deRisco: { iniciativas: number; impacto: number };
  /** Agregado: nasceu de gap de KPI, maturidade ou fonte externa. */
  deOportunidade: { iniciativas: number; impacto: number };
}

/**
 * Por que as iniciativas nasceram. É eixo INDEPENDENTE de `vetor`: uma
 * iniciativa de `gap_kpi` pode perfeitamente ser `evitar_perda`, então o mix
 * por vetor não responde esta pergunta.
 */
export function portfolioPorOrigem(iniciativas: Iniciativa[]): PortfolioPorOrigem {
  const acc = new Map<FonteIniciativa, { iniciativas: number; impacto: number }>();
  const deRisco = { iniciativas: 0, impacto: 0 };
  const deOportunidade = { iniciativas: 0, impacto: 0 };

  for (const i of iniciativas) {
    const valor = i.impacto_rs ?? 0;
    const atual = acc.get(i.fonte) ?? { iniciativas: 0, impacto: 0 };
    atual.iniciativas++;
    atual.impacto += valor;
    acc.set(i.fonte, atual);

    const alvo = i.fonte === 'risco' ? deRisco : deOportunidade;
    alvo.iniciativas++;
    alvo.impacto += valor;
  }

  return {
    fatias: [...acc.entries()]
      .map(([fonte, v]) => ({ fonte, ...v }))
      .sort((a, b) => b.iniciativas - a.iniciativas),
    deRisco,
    deOportunidade,
  };
}

export interface CelulaFonteVetor {
  fonte: FonteIniciativa;
  vetor: VetorIniciativa;
  iniciativas: number;
}

/** Matriz origem × vetor. Existe para mostrar que os dois eixos não se derivam. */
export function fonteVsVetor(iniciativas: Iniciativa[]): CelulaFonteVetor[] {
  const acc = new Map<string, CelulaFonteVetor>();
  for (const i of iniciativas) {
    const chave = `${i.fonte}|${i.vetor}`;
    const atual = acc.get(chave) ?? { fonte: i.fonte, vetor: i.vetor, iniciativas: 0 };
    atual.iniciativas++;
    acc.set(chave, atual);
  }
  return [...acc.values()].sort((a, b) => b.iniciativas - a.iniciativas);
}

/* ------------------------------------------------------------------ */
/* Cobertura risco ↔ iniciativa                                        */
/* ------------------------------------------------------------------ */

export type EstadoTratamento =
  | 'sem_tratamento'
  | 'aceito'
  | 'em_tratamento'
  | 'tratamento_concluido';

/** Risco com id — a lista do app sempre traz, mas o tipo base não exige. */
type RiscoComId = RiskRecord & { id: string };

/**
 * Estado do tratamento de um risco, derivado — e OLHANDO ATRAVÉS DA AÇÃO.
 *
 * É o ponto que o plano original não previa: quando `acoes_risco.iniciativa_id`
 * está preenchido, a ação estar marcada não basta. O risco só está tratado
 * quando a INICIATIVA concluiu, porque é ela que carrega os marcos.
 *
 * Ação cancelada não conta nem a favor nem contra: some da avaliação. Se todas
 * foram canceladas, o risco volta a não ter tratamento.
 */
export function estadoTratamento(
  risco: Pick<RiskRecord, 'resposta'>,
  acoesDoRisco: AcaoRisco[],
  iniciativas: Iniciativa[],
): EstadoTratamento {
  if (risco.resposta === 'Aceitar') return 'aceito';

  const vivas = acoesDoRisco.filter(a => a.status !== 'cancelada');
  if (vivas.length === 0) return 'sem_tratamento';

  const porId = new Map(iniciativas.map(i => [i.id, i]));
  const todasConcluidas = vivas.every(a => (
    a.iniciativa_id
      ? porId.get(a.iniciativa_id)?.status === 'concluida'
      : a.status === 'concluida'
  ));

  return todasConcluidas ? 'tratamento_concluido' : 'em_tratamento';
}

/** Agrupa as ações por risco uma vez só, para não varrer a lista por risco. */
export function acoesPorRisco(acoes: AcaoRisco[]): Map<string, AcaoRisco[]> {
  const mapa = new Map<string, AcaoRisco[]>();
  for (const a of acoes) {
    if (!a.risco_id) continue;
    const lista = mapa.get(a.risco_id) ?? [];
    lista.push(a);
    mapa.set(a.risco_id, lista);
  }
  return mapa;
}

export interface RiscoComTratamento {
  risco: RiscoComId;
  estado: EstadoTratamento;
  acoes: AcaoRisco[];
}

/** Estado do tratamento de todos os riscos, de uma passada só. */
export function tratamentoDosRiscos(
  riscos: RiscoComId[], acoes: AcaoRisco[], iniciativas: Iniciativa[],
): RiscoComTratamento[] {
  const porRisco = acoesPorRisco(acoes);
  return riscos.map(risco => {
    const doRisco = porRisco.get(risco.id) ?? [];
    return { risco, estado: estadoTratamento(risco, doRisco, iniciativas), acoes: doRisco };
  });
}

/**
 * Riscos cujo tratamento terminou mas que ninguém fechou ainda. É a fila de
 * trabalho do gestor: o sistema provou a entrega, falta a decisão de que a
 * ameaça de fato caiu.
 */
export function prontosParaFechar(
  riscos: RiscoComId[], acoes: AcaoRisco[], iniciativas: Iniciativa[],
): RiscoComTratamento[] {
  return tratamentoDosRiscos(riscos, acoes, iniciativas)
    .filter(t => t.estado === 'tratamento_concluido'
      && !SITUACOES_FINAIS.has(t.risco.situacao ?? ''));
}

/**
 * Riscos mitigados confirmados no ano — o número que vai ao comitê. Só conta
 * `mitigado`: `obsoleto` é ameaça que sumiu sozinha, não mérito de ninguém.
 */
export function riscosMitigados(riscos: RiscoComId[], ano: number): RiscoComId[] {
  const prefixo = `${ano}-`;
  return riscos.filter(r => r.situacao === 'mitigado' && (r.data_situacao ?? '').startsWith(prefixo));
}

/** Riscos ainda em pé: nem mitigados, nem obsoletos, nem descartados. */
export function riscosAbertos(riscos: RiscoComId[]): RiscoComId[] {
  return riscos.filter(r => !SITUACOES_FINAIS.has(r.situacao ?? ''));
}

export interface ExposicaoResidual {
  total: number;
  riscos: number;
  /** Abertos sem valor de exposição preenchido — o total mente por baixo. */
  semValor: number;
}

/** Σ da exposição dos riscos ainda abertos. Saúde do registro de risco. */
export function exposicaoResidual(riscos: RiscoComId[]): ExposicaoResidual {
  const abertos = riscosAbertos(riscos);
  let total = 0;
  let semValor = 0;
  for (const r of abertos) {
    if (r.exposicao_rs == null) semValor++;
    total += r.exposicao_rs ?? 0;
  }
  return { total, riscos: abertos.length, semValor };
}

/** Riscos que uma iniciativa cobre hoje — derivado das ações que apontam para ela. */
export function riscosPorIniciativa(
  iniciativaId: string, acoes: AcaoRisco[], riscos: RiscoComId[],
): RiscoComId[] {
  const ids = new Set(
    acoes.filter(a => a.iniciativa_id === iniciativaId && a.risco_id).map(a => a.risco_id as string),
  );
  return riscos.filter(r => ids.has(r.id));
}

export interface UsoDaPessoa {
  pessoa: Pessoa;
  objetivos: number;
  iniciativas: number;
  /**
   * Trabalho: mitigação de risco E tarefa livre, que são a mesma tabela desde
   * a unificação. Contar só as mitigações subnotificava o aviso de exclusão
   * justamente onde o estrago é silencioso — `tasks.dono_id` é `set null`,
   * então excluir a pessoa não falha, só tira o dono das tarefas dela.
   */
  trabalho: number;
  /** Soma dos três. Zero = ninguém depende dela; pode sair sem deixar buraco. */
  total: number;
}

/**
 * De quantas coisas cada pessoa é dona hoje.
 *
 * Serve a duas telas ao mesmo tempo: mostra a carga real de responsabilidade
 * (que não é a mesma coisa que dias de projeto) e diz o que se perde ao excluir
 * alguém — as três chaves são `set null`, então a exclusão não falha, ela
 * silenciosamente deixa itens sem dono.
 */
export function usoPorPessoa(
  pessoas: Pessoa[], objetivos: Objetivo[], iniciativas: Iniciativa[],
  trabalho: { dono_id: string | null }[],
): UsoDaPessoa[] {
  const conta = (id: string, lista: { dono_id: string | null }[]) =>
    lista.reduce((n, x) => n + (x.dono_id === id ? 1 : 0), 0);

  return pessoas.map(pessoa => {
    const o = conta(pessoa.id, objetivos);
    const i = conta(pessoa.id, iniciativas);
    const t = conta(pessoa.id, trabalho);
    return { pessoa, objetivos: o, iniciativas: i, trabalho: t, total: o + i + t };
  });
}

export interface ProgressoObjetivo {
  /** Última leitura do indicador, ou null quando ninguém mediu ainda. */
  atual: number | null;
  /** Data da última leitura. */
  data: string | null;
  /**
   * Fração do caminho entre baseline e meta já percorrida, de 0 a 1.
   * Null quando falta baseline, meta ou medição — ou quando os dois extremos
   * são iguais, caso em que não há caminho para medir.
   */
  pct: number | null;
  /** A leitura anterior, para dizer se o indicador melhorou ou piorou. */
  anterior: number | null;
  /**
   * `melhorou` | `piorou` | `estavel` comparando as duas últimas leituras na
   * direção da meta. Null com menos de duas medições.
   */
  tendencia: 'melhorou' | 'piorou' | 'estavel' | null;
  /** A série em ordem cronológica, para o sparkline. */
  serie: { data: string; valor: number }[];
}

/**
 * Onde o objetivo está, segundo o que foi medido.
 *
 * A direção da melhora vem dos próprios números: quando a meta é MENOR que o
 * baseline (ruptura caindo de 8% para 3%), descer é melhorar. Não existe campo
 * "quanto menor melhor" — ele seria mais um dado para alguém preencher errado.
 */
export function progressoObjetivo(
  objetivo: Pick<Objetivo, 'id' | 'baseline' | 'meta'>, medicoes: Medicao[],
): ProgressoObjetivo {
  const serie = medicoes
    .filter(m => m.objetivo_id === objetivo.id && m.data != null && m.valor != null)
    .map(m => ({ data: m.data as string, valor: m.valor as number }))
    .sort((a, b) => a.data.localeCompare(b.data));

  const ultima = serie.length > 0 ? serie[serie.length - 1] : null;
  const penultima = serie.length > 1 ? serie[serie.length - 2] : null;
  const atual = ultima?.valor ?? null;
  const anterior = penultima?.valor ?? null;

  const { baseline, meta } = objetivo;
  let pct: number | null = null;
  if (atual != null && baseline != null && meta != null && baseline !== meta) {
    const bruto = (atual - baseline) / (meta - baseline);
    // Passar da meta não vira 130% de progresso, e regredir não vira negativo:
    // a barra mede o caminho andado, e caminho andado não passa de ponta a ponta.
    pct = Math.max(0, Math.min(1, bruto));
  }

  let tendencia: ProgressoObjetivo['tendencia'] = null;
  if (atual != null && anterior != null) {
    if (atual === anterior) {
      tendencia = 'estavel';
    } else if (meta != null && baseline != null && meta < baseline) {
      tendencia = atual < anterior ? 'melhorou' : 'piorou';
    } else {
      tendencia = atual > anterior ? 'melhorou' : 'piorou';
    }
  }

  return { atual, data: ultima?.data ?? null, pct, anterior, tendencia, serie };
}
