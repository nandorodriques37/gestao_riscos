/** Status de uma ação do plano de ação de um risco. */
export type AcaoStatus = 'A fazer' | 'Em andamento' | 'Concluída';
export const ACAO_STATUSES: readonly AcaoStatus[] = ['A fazer', 'Em andamento', 'Concluída'];

/** Uma linha do plano de ação: o que fazer, quem faz e até quando. */
export interface AcaoItem {
  id: string;
  descricao: string;
  responsavel: string;
  /** 'YYYY-MM-DD' (formato nativo do <input type="date">) ou '' quando sem prazo. */
  prazo: string;
  status: AcaoStatus;
}

export interface RiskRecord {
  area: string;
  rotina: string;
  categoria: string;
  risco: string;
  resposta: string;
  probab: number | null;
  impact: number | null;
  /** Resumo textual do plano de ação — derivado de `acoes_itens`, lido por tabela, gráficos e CSV. */
  acoes: string;
  /**
   * Plano de ação estruturado. Opcional porque registros antigos (e as sementes)
   * só têm o texto livre em `acoes`; `parseAcoes` cobre esse caso na leitura.
   * Nome em snake_case para bater com o da coluna no Postgres.
   */
  acoes_itens?: AcaoItem[];
  resultado: string;
  esforco: number | null;
  impacto2: number | null;
  gravidade: number | null;
  recurso: string;
  responsavel: string;
  status: string;
  obs: string;
  /** Probabilidade × impacto financeiro, em reais. */
  exposicao_rs?: number | null;
  causa_raiz?: string;
  /** Ciclo de vida do risco. `''` nos registros anteriores ao campo. */
  situacao?: SituacaoRisco;
  /** Data de entrada na `situacao` atual, 'YYYY-MM-DD'. Conta os mitigados do ano. */
  data_situacao?: string | null;
}

/**
 * Ciclo de vida do risco. `mitigado`, `obsoleto` e `descartado` são finais e
 * deliberadamente distintos: o número que vai ao comitê precisa separar
 * "tratei a ameaça" de "a ameaça deixou de existir sozinha" e de "não era
 * risco". Um `fechado` genérico juntaria os três e perderia o sentido.
 */
export type SituacaoRisco = '' | 'hipotese' | 'validado' | 'mitigado' | 'obsoleto' | 'descartado';
export const SITUACOES_RISCO: readonly SituacaoRisco[] = [
  'hipotese', 'validado', 'mitigado', 'obsoleto', 'descartado',
];

/** Registro como vem do backend — igual a RiskRecord, mas com id e versão do banco. */
export interface StoredRiskRecord extends RiskRecord {
  id: string;
  /** Incrementada a cada gravação; usada para detectar edição concorrente. */
  version: number;
}

/**
 * Destinos do menu, na ordem da jornada: objetivo → iniciativa → risco →
 * trabalho. `graficos` saiu daqui — os gráficos viraram um MODO de leitura do
 * registro de risco, não uma seção à parte: eram análise do mesmo dado da aba
 * ao lado, e como aba interrompiam a jornada entre risco e tarefa.
 */
export type Tab =
  | 'painel' | 'objetivos' | 'iniciativas' | 'priorizacao'
  | 'registro'
  | 'tarefas' | 'pessoas' | 'triagem';

/**
 * As três leituras do registro de risco. Não é destino de menu: é a mesma
 * seção vista pelo cadastro (tabela), pelo tratamento (rastro) ou pela
 * distribuição (análise).
 */
export type ModoRisco = 'tabela' | 'rastro' | 'analise';
export const MODOS_RISCO: readonly ModoRisco[] = ['tabela', 'rastro', 'analise'];

export type StatusFilterValue = 'Todos' | 'Não iniciado' | 'Em andamento' | 'Concluído';

/** Status "reais" da aba Registro (sem "Todos"), usados na seleção múltipla do filtro. */
export type RegistroStatus = 'Não iniciado' | 'Em andamento' | 'Concluído';
export const REGISTRO_STATUSES: readonly RegistroStatus[] = ['Não iniciado', 'Em andamento', 'Concluído'];

export type Quadrant = 'qw' | 'ga' | 'bp' | 'rv';

export type SortKey = 'probab' | 'impact' | 'score' | 'prioriz' | null;

export type SortDir = 'asc' | 'desc';

export type GraphFilter =
  | { type: 'categoria' | 'area' | 'rotina' | 'recurso' | 'status' | 'criticidade'; value: string }
  | { type: 'heat'; prob: number; imp: number }
  | null;

export type ColWidths = Record<string, number>;

/** Densidade das linhas da tabela de registro (persistida entre sessões). */
export type Density = 'comfortable' | 'compact';

/** Tarefa do dia a dia, priorizada pela Matriz GUT (Gravidade × Urgência × Tendência). */
export interface Task {
  tipo: string;
  tarefa: string;
  detalhes: string;
  g: number | null;
  u: number | null;
  t: number | null;
  status: string;
  responsavel: string;
  obs: string;
  /** 'YYYY-MM-DD'. Nulo = sem data combinada; rotina nunca tem. */
  prazo: string | null;
  /**
   * Quem responde, como pessoa de verdade (FK `pessoas`).
   *
   * `responsavel` continua na tabela, congelado, com o texto que estava escrito
   * ali antes da conversão — é histórico, não campo. Quem lê prefere o
   * `dono_id`, e é ele que a carga do Painel e a aba Pessoas enxergam.
   */
  dono_id: string | null;
}

/**
 * Metadado de uma imagem anexada a uma tarefa. Os bytes NÃO viajam aqui: a aba
 * Tarefas faz polling a cada 15s e arrastaria todas as imagens a cada ciclo.
 * Eles saem por rota própria (`/api/tasks/:id/anexos/:anexoId`), com cache
 * imutável — o id do anexo nunca aponta para outro conteúdo.
 */
export interface TaskAttachment {
  id: string;
  /** Nome do arquivo original, mostrado como legenda e no download. */
  nome: string;
  /** MIME de imagem validado no backend (png, jpeg, webp, gif ou avif). */
  mime: string;
  /** Tamanho do binário em bytes (não do base64 do transporte). */
  tamanho: number;
}

/** Tarefa como vem do backend — igual a Task, mas com id, versão, anexos e vínculo. */
export interface StoredTask extends Task {
  id: string;
  /** Incrementada a cada gravação; usada para detectar edição concorrente. */
  version: number;
  /**
   * Vínculo com o risco que esta entrega mitiga. Preenchido = é mitigação;
   * nulo = tarefa livre. É a única diferença entre as duas coisas.
   *
   * Fora de `Task` porque é SÓ LEITURA no quadro: quem cria e desfaz o vínculo
   * é o plano de ação dentro do risco. Deixar de fora da allowlist de escrita é
   * o que impede o quadro de desvincular uma mitigação sem querer.
   */
  risco_id: string | null;
  /** Preenchido quando a mitigação é executada dentro de uma iniciativa. */
  iniciativa_id: string | null;
  /** 'rotina' = controle contínuo: não tem prazo e nunca está atrasado. */
  triagem: string;
  indicador_sucesso: string;
  /**
   * Imagens anexadas (só o metadado). Fora de `Task` de propósito: anexo não é
   * campo editável do formulário — entra e sai por endpoint próprio, não pelo
   * PATCH com debounce.
   */
  anexos: TaskAttachment[];
}

export type TaskStatusFilterValue = 'Todos' | 'A fazer' | 'Em andamento' | 'Concluída' | 'Cancelada';

/** Status "reais" da aba Tarefas (sem "Todos"), usados na seleção múltipla do filtro. */
export type TaskStatus = 'A fazer' | 'Em andamento' | 'Concluída' | 'Cancelada';
// 'Cancelada' entrou com a unificação: a mitigação sempre teve esse estado, e
// tarefa também se cancela. Fica por último — é saída, não etapa.
export const TASK_STATUSES: readonly TaskStatus[] = ['A fazer', 'Em andamento', 'Concluída', 'Cancelada'];

export type TaskSortKey = 'gut' | 'prazo' | null;

/* ==========================================================================
   Portfólio — objetivo → iniciativa → marco, mais riscos e suas ações.

   Todas as entidades carregam `id`, `version` (concorrência otimista) e
   `updated_at`. Campos de data viajam como 'YYYY-MM-DD', o formato do
   `<input type="date">`, igual a `AcaoItem.prazo`. Chave estrangeira ausente
   é `null`, nunca string vazia.
   ========================================================================== */

interface EntidadePortfolio {
  id: string;
  /** Incrementada a cada gravação; detecta edição concorrente. */
  version: number;
  /** ISO do último UPDATE. A métrica de iniciativas paradas depende dele. */
  updated_at: string;
}

/** Quem executa. Substitui o `responsavel` em texto livre nas entidades novas. */
export interface Pessoa extends EntidadePortfolio {
  nome: string;
  papel: string;
  area: string;
  /**
   * Teto de dias-pessoa de projeto por mês. É a correção da regra 7 do prompt,
   * que comparava `esforco_dias` (dias) com `horas_projeto` (horas) — aqui as
   * duas pontas ficam na mesma unidade, sem tabela mensal de capacidade.
   */
  dias_projeto_mes: number | null;
  ativo: boolean;
}

export type HorizonteObjetivo = '' | '0-3m' | '3-12m' | '1-2a' | '2-4a' | '4a+';
export const HORIZONTES: readonly HorizonteObjetivo[] = ['0-3m', '3-12m', '1-2a', '2-4a', '4a+'];

export type StatusObjetivo = '' | 'ativo' | 'atingido' | 'abandonado';
export const STATUS_OBJETIVO: readonly StatusObjetivo[] = ['ativo', 'atingido', 'abandonado'];

/** O porquê: resultado de negócio buscado num horizonte. Poucos, 3 a 6 ativos. */
export interface Objetivo extends EntidadePortfolio {
  horizonte: HorizonteObjetivo;
  descricao: string;
  /** Indicador principal, como texto — a tabela `indicadores` foi adiada. */
  indicador: string;
  /** '%', 'R$', 'dias'. */
  unidade: string;
  baseline: number | null;
  meta: number | null;
  prazo: string | null;
  dono_id: string | null;
  status: StatusObjetivo;
}

/** Por que a iniciativa nasceu. Um valor, histórico — não muda. */
export type FonteIniciativa = '' | 'risco' | 'gap_kpi' | 'maturidade' | 'externo';
export const FONTES_INICIATIVA: readonly FonteIniciativa[] = ['risco', 'gap_kpi', 'maturidade', 'externo'];

/** O que a iniciativa faz com o valor. Eixo independente de `fonte`. */
export type VetorIniciativa = '' | 'evitar_perda' | 'criar_ganho' | 'criar_decisao';
export const VETORES: readonly VetorIniciativa[] = ['evitar_perda', 'criar_ganho', 'criar_decisao'];

export type ConfiancaImpacto = '' | 'alta' | 'media' | 'baixa';
export const CONFIANCAS: readonly ConfiancaImpacto[] = ['alta', 'media', 'baixa'];

export type StatusIniciativa =
  | '' | 'backlog' | 'aprovada' | 'em_execucao' | 'pausada' | 'concluida' | 'cancelada';
export const STATUS_INICIATIVA: readonly StatusIniciativa[] = [
  'backlog', 'aprovada', 'em_execucao', 'pausada', 'concluida', 'cancelada',
];

/**
 * O quê: esforço estruturado, com início e fim, que move um objetivo.
 *
 * `esforco`, `impacto2` e `gravidade` vieram do registro de risco — sempre
 * descreveram a ação, não a ameaça. A fórmula de priorização e as faixas de cor
 * seguem idênticas, só mudou o dono da coluna.
 */
export interface Iniciativa extends EntidadePortfolio {
  /** Obrigatório: iniciativa sem objetivo não é salva. */
  objetivo_id: string | null;
  nome: string;
  descricao: string;
  vetor: VetorIniciativa;
  fonte: FonteIniciativa;
  dono_id: string | null;
  recurso: string;
  esforco: number | null;
  impacto2: number | null;
  gravidade: number | null;
  esforco_dias: number | null;
  impacto_rs: number | null;
  confianca_impacto: ConfiancaImpacto;
  inicio: string | null;
  /** Congela na aprovação. O slip se mede contra esta data. */
  fim_plano_original: string | null;
  fim_plano_atual: string | null;
  fim_real: string | null;
  status: StatusIniciativa;
  resultado: string;
  obs: string;
}

/**
 * Onde o indicador de um objetivo estava numa data.
 *
 * Existe porque `baseline` e `meta` sozinhos não dizem se o objetivo está
 * andando: sem medição, marcar um objetivo como "atingido" é ato de fé. Uma
 * linha por leitura, e não um campo `valor_atual` no objetivo, porque a série
 * é o que mostra tendência — e sobrescrever o valor apaga justamente isso.
 */
export interface Medicao extends EntidadePortfolio {
  objetivo_id: string | null;
  /** 'YYYY-MM-DD'. Duas leituras no mesmo dia: a última grava. */
  data: string | null;
  valor: number | null;
  obs: string;
}

export type StatusMarco = '' | 'previsto' | 'entregue' | 'cancelado';
export const STATUS_MARCO: readonly StatusMarco[] = ['previsto', 'entregue', 'cancelado'];

/**
 * Quando: compromisso verificável dentro de uma iniciativa. Binário — entregue
 * ou não. Sem campo de "% concluído": percentual autodeclarado marca 80% e não
 * mede nada.
 */
export interface Marco extends EntidadePortfolio {
  iniciativa_id: string | null;
  /** Entregável, não atividade. */
  nome: string;
  criterio_aceite: string;
  /** Nunca muda depois de gravada — é a régua do atraso. */
  data_plano_original: string | null;
  data_plano_atual: string | null;
  data_real: string | null;
  status: StatusMarco;
  /** Obrigatório ao mover `data_plano_atual` de uma data já existente. */
  motivo_replanejamento: string;
  /**
   * Nota livre. NÃO se confunde com `criterio_aceite` (como se verifica a
   * entrega) nem com `motivo_replanejamento` (por que a data mudou, e que o
   * servidor exige): é o contexto que não cabe nos dois — dependência externa,
   * combinado de reunião, ressalva do dono.
   */
  obs: string;
}

export type StatusAcaoRisco = '' | 'aberta' | 'em_andamento' | 'concluida' | 'cancelada';
export const STATUS_ACAO_RISCO: readonly StatusAcaoRisco[] = [
  'aberta', 'em_andamento', 'concluida', 'cancelada',
];

/**
 * Destino confirmado na triagem da migração. Vazio = ainda na fila.
 *
 * Não é campo de domínio: é a marca de que uma pessoa já classificou esta
 * linha. Sem ela, uma ação que o gestor decidiu manter como ação fica
 * indistinguível de uma que ele ainda não olhou, e a fila nunca esvazia.
 */
export type DestinoTriagem = '' | 'acao' | 'iniciativa' | 'rotina';
export const DESTINOS_TRIAGEM: readonly DestinoTriagem[] = ['acao', 'iniciativa', 'rotina'];

/**
 * A mitigação. Sai de dentro do registro de risco e vira linha própria.
 *
 * `iniciativa_id` é o coração da mudança: nulo = mitigação pequena e autônoma,
 * que vive só aqui; preenchido = é executada dentro de uma iniciativa e segue
 * os marcos dela. O vínculo fica na AÇÃO, não no risco — um risco pode ter
 * cinco mitigações com destinos diferentes.
 */
export interface AcaoRisco extends EntidadePortfolio {
  risco_id: string | null;
  iniciativa_id: string | null;
  descricao: string;
  dono_id: string | null;
  prazo: string | null;
  indicador_sucesso: string;
  status: StatusAcaoRisco;
  /** Marca da triagem da migração. Vazio = ainda na fila. */
  triagem: DestinoTriagem;
}

/** Pacote devolvido por `GET /api/portfolio` — todas as entidades de uma vez. */
export interface PortfolioBundle {
  pessoas: Pessoa[];
  objetivos: Objetivo[];
  medicoes: Medicao[];
  iniciativas: Iniciativa[];
  marcos: Marco[];
  acoes_risco: AcaoRisco[];
}
