// Fase 3: aplica a triagem confirmada pelo gestor.
//
// Cada ação marcada como `iniciativa` gera uma linha em `iniciativas`,
// herdando do risco de origem o que sempre descreveu o esforço e não a ameaça:
// esforço, impacto, gravidade, recurso, resultado esperado e responsável. A
// ação passa a apontar para ela.
//
// Ações marcadas `acao` ficam onde estão. Marcadas `rotina` são só sinalizadas
// — nada é criado na aba Tarefas.
//
// Idempotente: ação que já tem `iniciativa_id` é pulada.
import type { Sql } from './_db.js';
import { listRecords } from './_db.js';
import { pessoas, objetivos, iniciativas, acoesRisco } from './_portfolioDb.js';
import { normStatus } from '../src/lib/calculations.js';
import type { StoredRiskRecord } from '../src/types.js';

/** Balde de chegada da migração, até o gestor amarrar cada uma a um objetivo real. */
export const OBJETIVO_A_CLASSIFICAR = 'A CLASSIFICAR';

export interface ResultadoPromocao {
  objetivoId: string;
  objetivoCriado: boolean;
  iniciativasCriadas: number;
  /** Ações marcadas como iniciativa que já tinham sido promovidas antes. */
  jaPromovidas: number;
  /** Marcadas como iniciativa mas sem risco de origem legível — não dá para herdar. */
  semRiscoDeOrigem: number;
  /** Quantas nasceram carregando um status de execução no `obs`. */
  comStatusHerdadoEmObs: number;
  nomes: string[];
}

/** Objetivo `A CLASSIFICAR`, criado uma vez só. */
async function garantirObjetivo(sql: Sql): Promise<{ id: string; criado: boolean }> {
  const existente = (await objetivos.list(sql))
    .find(o => o.descricao.trim().toUpperCase() === OBJETIVO_A_CLASSIFICAR);
  if (existente) return { id: existente.id, criado: false };

  const novo = await objetivos.create(sql, {
    descricao: OBJETIVO_A_CLASSIFICAR,
    horizonte: '',
    indicador: '',
    unidade: '',
    status: 'ativo',
  });
  return { id: novo.id, criado: true };
}

export async function promoverTriagem(sql: Sql): Promise<ResultadoPromocao> {
  const acoes = await acoesRisco.list(sql);
  const aPromover = acoes.filter(a => a.triagem === 'iniciativa');
  const pendentes = aPromover.filter(a => !a.iniciativa_id);

  if (pendentes.length === 0) {
    const obj = (await objetivos.list(sql))
      .find(o => o.descricao.trim().toUpperCase() === OBJETIVO_A_CLASSIFICAR);
    return {
      objetivoId: obj?.id ?? '',
      objetivoCriado: false,
      iniciativasCriadas: 0,
      jaPromovidas: aPromover.length - pendentes.length,
      semRiscoDeOrigem: 0,
      comStatusHerdadoEmObs: 0,
      nomes: [],
    };
  }

  const { id: objetivoId, criado: objetivoCriado } = await garantirObjetivo(sql);

  const riscoPorId = new Map<string, StoredRiskRecord>(
    (await listRecords(sql)).map(r => [r.id, r]),
  );
  const idPorNome = new Map(
    (await pessoas.list(sql)).map(p => [p.nome.trim().toLowerCase(), p.id]),
  );

  let iniciativasCriadas = 0;
  let semRiscoDeOrigem = 0;
  let comStatusHerdadoEmObs = 0;
  const nomes: string[] = [];

  for (const acao of pendentes) {
    const risco = acao.risco_id ? riscoPorId.get(acao.risco_id) : undefined;
    if (!risco) {
      semRiscoDeOrigem++;
      continue;
    }

    // O status do risco vira observação, não status da iniciativa. A regra 2
    // exige marco para qualquer status a partir de `aprovada`, e uma iniciativa
    // recém-promovida ainda não tem nenhum — nascer "em execução" criaria dado
    // que viola a própria regra. É justamente a disciplina da reestruturação:
    // não se declara execução sem compromisso verificável.
    const statusOriginal = normStatus(risco.status);
    const herdaStatus = statusOriginal === 'Em andamento' || statusOriginal === 'Concluído';
    if (herdaStatus) comStatusHerdadoEmObs++;

    const obs = [
      risco.obs?.trim(),
      herdaStatus
        ? `No registro de risco esta ação estava como "${statusOriginal}". Cadastre os marcos e mova o status da iniciativa.`
        : '',
    ].filter(Boolean).join(' · ');

    const dono = acao.dono_id
      ?? (risco.responsavel ? idPorNome.get(risco.responsavel.trim().toLowerCase()) ?? null : null);

    const criada = await iniciativas.create(sql, {
      objetivo_id: objetivoId,
      nome: acao.descricao,
      descricao: risco.risco ?? '',
      // Veio de um risco: a origem é fato, não palpite.
      fonte: 'risco',
      // Iniciativa nascida de risco existe para evitar perda. É editável — e é
      // exatamente esse número que mostra o quanto o portfólio é defensivo.
      vetor: 'evitar_perda',
      dono_id: dono,
      recurso: risco.recurso ?? '',
      // Estes três sempre descreveram a ação, não a ameaça. Só mudam de dono.
      esforco: risco.esforco,
      impacto2: risco.impacto2,
      gravidade: risco.gravidade,
      esforco_dias: null,
      impacto_rs: null,
      confianca_impacto: '',
      inicio: null,
      fim_plano_original: null,
      fim_plano_atual: null,
      fim_real: null,
      status: 'backlog',
      resultado: risco.resultado ?? '',
      obs,
    });

    await acoesRisco.update(sql, acao.id, { iniciativa_id: criada.id });
    iniciativasCriadas++;
    nomes.push(acao.descricao);
  }

  return {
    objetivoId,
    objetivoCriado,
    iniciativasCriadas,
    jaPromovidas: aPromover.length - pendentes.length,
    semRiscoDeOrigem,
    comStatusHerdadoEmObs,
    nomes,
  };
}
