// Rótulos e formatadores do portfólio. Um lugar só: os mesmos enums aparecem
// no Painel, na lista, no detalhe e no Rastro, e três traduções divergentes do
// mesmo `em_execucao` seriam três bugs de leitura.
import type {
  BadgeKind,
} from './calculations';
import type {
  ConfiancaImpacto, FonteIniciativa, HorizonteObjetivo, SituacaoRisco,
  StatusAcaoRisco, StatusIniciativa, StatusMarco, StatusObjetivo, VetorIniciativa,
} from '../types';

/* ------------------------------------------------------------------ */
/* Rótulos                                                             */
/* ------------------------------------------------------------------ */

export const ROTULO_FONTE: Record<FonteIniciativa, string> = {
  '': 'Sem origem',
  risco: 'Risco mapeado',
  gap_kpi: 'Gap de KPI',
  maturidade: 'Maturidade',
  externo: 'Demanda externa',
};

export const ROTULO_VETOR: Record<VetorIniciativa, string> = {
  '': 'Sem vetor',
  evitar_perda: 'Evitar perda',
  criar_ganho: 'Criar ganho',
  criar_decisao: 'Criar decisão',
};

export const ROTULO_STATUS_INICIATIVA: Record<StatusIniciativa, string> = {
  '': 'Sem status',
  backlog: 'Backlog',
  aprovada: 'Aprovada',
  em_execucao: 'Em execução',
  pausada: 'Pausada',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export const ROTULO_STATUS_MARCO: Record<StatusMarco, string> = {
  '': 'Previsto',
  previsto: 'Previsto',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

export const ROTULO_STATUS_OBJETIVO: Record<StatusObjetivo, string> = {
  '': 'Sem status',
  ativo: 'Ativo',
  atingido: 'Atingido',
  abandonado: 'Abandonado',
};

export const ROTULO_STATUS_ACAO: Record<StatusAcaoRisco, string> = {
  '': 'A fazer',
  aberta: 'A fazer',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export const ROTULO_HORIZONTE: Record<HorizonteObjetivo, string> = {
  '': 'Sem horizonte',
  '0-3m': '0 a 3 meses',
  '3-12m': '3 a 12 meses',
  '1-2a': '1 a 2 anos',
  '2-4a': '2 a 4 anos',
  '4a+': 'Mais de 4 anos',
};

export const ROTULO_CONFIANCA: Record<ConfiancaImpacto, string> = {
  '': 'Não informada',
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

export const ROTULO_SITUACAO: Record<SituacaoRisco, string> = {
  '': 'Sem situação',
  hipotese: 'Hipótese',
  validado: 'Validado',
  mitigado: 'Mitigado',
  obsoleto: 'Obsoleto',
  descartado: 'Descartado',
};

/**
 * Explicação das três situações finais. Elas foram separadas de propósito e a
 * diferença não é óbvia no rótulo — o texto vai junto do seletor.
 */
export const AJUDA_SITUACAO: Record<SituacaoRisco, string> = {
  '': '',
  hipotese: 'Ainda não confirmado que a ameaça é real.',
  validado: 'Confirmado como ameaça real, em acompanhamento.',
  mitigado: 'Tratei a ameaça — o mérito é do trabalho feito.',
  obsoleto: 'A ameaça deixou de existir sozinha, sem tratamento.',
  descartado: 'Analisado e concluído que não era risco.',
};

/* ------------------------------------------------------------------ */
/* Cores categóricas                                                   */
/* ------------------------------------------------------------------ */

/** Status de iniciativa: cor categórica, e sempre acompanhada do rótulo. */
export const BADGE_STATUS_INICIATIVA: Record<StatusIniciativa, BadgeKind> = {
  '': 'slate',
  backlog: 'slate',
  aprovada: 'blue',
  em_execucao: 'amber',
  pausada: 'orange',
  concluida: 'green',
  cancelada: 'slate',
};

export const BADGE_STATUS_ACAO: Record<StatusAcaoRisco, BadgeKind> = {
  '': 'slate',
  aberta: 'slate',
  em_andamento: 'amber',
  concluida: 'green',
  cancelada: 'slate',
};

export const BADGE_SITUACAO: Record<SituacaoRisco, BadgeKind> = {
  '': 'slate',
  hipotese: 'purple',
  validado: 'blue',
  mitigado: 'green',
  obsoleto: 'slate',
  descartado: 'slate',
};

/* ------------------------------------------------------------------ */
/* Formatadores                                                        */
/* ------------------------------------------------------------------ */

const MOEDA = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
});

const MILHAR = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/**
 * R$ em escala legível. Um portfólio de supply mede em centenas de milhares:
 * `R$ 1.240.000` ocupa a largura de um tile inteiro e ninguém lê o último
 * dígito. Abaixo de mil, o valor sai por extenso — arredondar R$ 400 para
 * "R$ 0,4 mil" seria pior.
 */
export function formatarMoeda(v: number | null | undefined): string {
  if (v == null) return '—';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace('.', ',')} mi`;
  if (abs >= 10_000) return `R$ ${MILHAR.format(Math.round(v / 1000))} mil`;
  return MOEDA.format(v);
}

/** Valor cheio, para tooltip e leitor de tela — o resumido some com o dígito. */
export function formatarMoedaCheia(v: number | null | undefined): string {
  return v == null ? '—' : MOEDA.format(v);
}

export function formatarNumero(v: number | null | undefined, casas = 0): string {
  if (v == null) return '—';
  return v.toFixed(casas).replace('.', ',');
}

/** 'YYYY-MM-DD' → 'DD/MM/AA'. Vazio vira travessão, não string vazia. */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return d ? `${d}/${m}/${a.slice(2)}` : iso;
}

/** 'YYYY-MM-DD' → 'DD/MM/AAAA', para quando a linha tem espaço. */
export function formatarDataLonga(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return d ? `${d}/${m}/${a}` : iso;
}

export function formatarPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${Math.round(v * 100)}%`;
}

/**
 * Nome do risco com recuo. O registro aceita linha em branco — sem isto, um
 * risco sem texto vira um botão vazio, que não dá nem para clicar direito.
 */
export function nomeRisco(risco: { risco: string }): string {
  return risco.risco.trim() || 'Risco sem descrição';
}

/** Plural simples: as contagens do Painel viram frase, não "1 riscos". */
export function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}
