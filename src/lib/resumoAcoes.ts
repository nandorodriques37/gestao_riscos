/**
 * O resumo textual do plano de ação, gravado em `risk_records.acoes`.
 *
 * É campo DERIVADO: a verdade são as linhas de mitigação, e este texto é o que
 * a tabela do Registro, a busca, os Gráficos, o CSV e o KPI de completude leem.
 * Por isso a regra mora num módulo sem dependência: o servidor precisa dela
 * para regravar o resumo a cada escrita, e o editor do plano precisa da mesma
 * para não divergir. Duas implementações da mesma frase é como o campo começa
 * a mentir.
 */
export const RESUMO_SEP = ' · ';

/** Ação cancelada fica de fora: o resumo alimenta a coluna "Ações" e a busca,
 *  e anunciar o que foi cancelado faz o registro prometer o que não vai
 *  acontecer. */
export function resumoDeAcoes(itens: { descricao: string; status: string }[]): string {
  return itens
    .filter(i => i.status !== 'cancelada')
    .map(i => i.descricao.trim())
    .filter(Boolean)
    .join(RESUMO_SEP);
}
