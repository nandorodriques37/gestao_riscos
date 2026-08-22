// A trilha guarda nome de coluna e valor cru — é o que serve para consultar.
// Aqui isso vira frase em português, que é o que serve para ler.
import type { LinhaAuditoria } from './auditoriaApi';
import {
  ROTULO_SITUACAO, ROTULO_STATUS_INICIATIVA, ROTULO_STATUS_MARCO,
  ROTULO_STATUS_ACAO, ROTULO_STATUS_OBJETIVO, formatarData, formatarMoedaCheia,
  plural,
} from './portfolioLabels';

export const ROTULO_CAMPO: Record<string, string> = {
  situacao: 'situação',
  data_situacao: 'data da situação',
  resposta: 'resposta',
  probab: 'probabilidade',
  impact: 'impacto',
  exposicao_rs: 'exposição',
  status: 'status',
  baseline: 'baseline',
  meta: 'meta',
  prazo: 'prazo',
  dono_id: 'dono',
  objetivo_id: 'objetivo',
  iniciativa_id: 'iniciativa',
  // "impacto em R$" viraria "impacto em R$ como R$ 90.000,00" — o valor já
  // carrega a moeda desde que EM_REAIS passou a formatá-lo.
  impacto_rs: 'impacto financeiro',
  esforco_dias: 'esforço',
  fim_plano_atual: 'fim planejado',
  data_plano_atual: 'data planejada',
  data_real: 'entrega',
  motivo_replanejamento: 'motivo do replanejamento',
  nome: 'nome',
  ativo: 'ativo',
  dias_projeto_mes: 'capacidade',
  valor: 'valor',
  data: 'data',
};

export const ROTULO_TABELA: Record<string, string> = {
  risk_records: 'risco',
  objetivos: 'objetivo',
  medicoes: 'medição',
  iniciativas: 'iniciativa',
  marcos: 'marco',
  acoes_risco: 'ação',
  pessoas: 'pessoa',
};

/** Campos em reais. Aqui vai o valor cheio: o resumido ("R$ 1,2 mi") não serve
 *  numa trilha, onde a diferença entre dois números é justamente o assunto. */
const EM_REAIS = new Set(['exposicao_rs', 'impacto_rs']);

/** Enum guardado vira o rótulo que a tela usa; o resto passa direto. */
function valorLegivel(campo: string, tabela: string, valor: string | null): string {
  if (valor == null) return '—';
  if (EM_REAIS.has(campo)) {
    const n = Number(valor);
    if (Number.isFinite(n)) return formatarMoedaCheia(n);
  }
  if (campo === 'dias_projeto_mes') {
    const n = Number(valor);
    if (Number.isFinite(n)) return `${plural(n, 'dia', 'dias')}/mês`;
  }
  if (campo === 'esforco_dias') {
    const n = Number(valor);
    if (Number.isFinite(n)) return plural(n, 'dia', 'dias');
  }
  if (campo === 'situacao') return ROTULO_SITUACAO[valor as keyof typeof ROTULO_SITUACAO] ?? valor;
  if (campo === 'status') {
    const mapa = tabela === 'iniciativas' ? ROTULO_STATUS_INICIATIVA
      : tabela === 'marcos' ? ROTULO_STATUS_MARCO
        : tabela === 'acoes_risco' ? ROTULO_STATUS_ACAO
          : tabela === 'objetivos' ? ROTULO_STATUS_OBJETIVO : null;
    if (mapa) return (mapa as Record<string, string>)[valor] ?? valor;
  }
  // Chave estrangeira crua não diz nada a ninguém, e resolver o nome exigiria
  // carregar o portfólio inteiro aqui — dizer que mudou já é a informação.
  if (campo.endsWith('_id')) return valor ? 'outro' : '—';
  if (/^\d{4}-\d{2}-\d{2}/.test(valor)) return formatarData(valor);
  return valor;
}

/** Uma frase por evento. */
export function descreverEvento(l: LinhaAuditoria): string {
  const tabela = ROTULO_TABELA[l.tabela] ?? l.tabela;
  if (l.acao === 'criou') return `Criou ${tabela}`;
  if (l.acao === 'excluiu') return `Excluiu ${tabela}`;

  const campo = l.campo ? (ROTULO_CAMPO[l.campo] ?? l.campo) : 'campo';
  const de = valorLegivel(l.campo ?? '', l.tabela, l.de);
  const para = valorLegivel(l.campo ?? '', l.tabela, l.para);

  if (l.de == null) return `Definiu ${campo} como ${para}`;
  if (l.para == null) return `Limpou ${campo} (era ${de})`;
  return `Mudou ${campo} de ${de} para ${para}`;
}
