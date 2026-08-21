import { describe, it, expect } from 'vitest';
import type { AcaoRisco, Iniciativa, Marco, Objetivo, Pessoa, RiskRecord } from '../types';
import {
  diasEntre, mesesNoIntervalo, periodoDe, hojeISO,
  impactoComprometido, marcosNoPrazo, slipMedio, wipPorDono, cargaPorPessoa,
  zumbis, coberturaObjetivos, mixPorVetor, portfolioPorOrigem, fonteVsVetor,
  estadoTratamento, tratamentoDosRiscos, prontosParaFechar, riscosMitigados,
  riscosAbertos, exposicaoResidual, riscosPorIniciativa, iniciativasPorRisco,
  LIMITE_WIP, DIAS_PARA_ZUMBI,
} from './portfolioMetrics';

/* ---------- fábricas mínimas ---------- */

let seq = 0;
const id = () => `id-${++seq}`;

function pessoa(p: Partial<Pessoa> = {}): Pessoa {
  return {
    id: id(), nome: 'Alguém', papel: '', area: '', dias_projeto_mes: null, ativo: true,
    version: 1, updated_at: '2026-01-01T00:00:00.000Z', ...p,
  };
}

function objetivo(o: Partial<Objetivo> = {}): Objetivo {
  return {
    id: id(), horizonte: '3-12m', descricao: 'Objetivo', indicador: '', unidade: '',
    baseline: null, meta: null, prazo: null, dono_id: null, status: 'ativo',
    version: 1, updated_at: '2026-01-01T00:00:00.000Z', ...o,
  };
}

function iniciativa(i: Partial<Iniciativa> = {}): Iniciativa {
  return {
    id: id(), objetivo_id: null, nome: 'Iniciativa', descricao: '',
    vetor: 'evitar_perda', fonte: 'risco', dono_id: null, recurso: '',
    esforco: null, impacto2: null, gravidade: null,
    esforco_dias: null, impacto_rs: null, confianca_impacto: '',
    inicio: null, fim_plano_original: null, fim_plano_atual: null, fim_real: null,
    status: 'em_execucao', resultado: '', obs: '',
    version: 1, updated_at: '2026-01-01T00:00:00.000Z', ...i,
  };
}

function marco(m: Partial<Marco> = {}): Marco {
  return {
    id: id(), iniciativa_id: null, nome: 'Marco', criterio_aceite: '',
    data_plano_original: null, data_plano_atual: null, data_real: null,
    status: 'previsto', motivo_replanejamento: '',
    version: 1, updated_at: '2026-01-01T00:00:00.000Z', ...m,
  };
}

function acao(a: Partial<AcaoRisco> = {}): AcaoRisco {
  return {
    id: id(), risco_id: null, iniciativa_id: null, descricao: 'Ação',
    dono_id: null, prazo: null, indicador_sucesso: '', status: 'aberta', triagem: '',
    version: 1, updated_at: '2026-01-01T00:00:00.000Z', ...a,
  };
}

type RiscoComId = RiskRecord & { id: string };
function risco(r: Partial<RiscoComId> = {}): RiscoComId {
  return {
    id: id(), area: '', rotina: '', categoria: '', risco: 'Um risco', resposta: 'Mitigar',
    probab: null, impact: null, acoes: '', resultado: '', esforco: null, impacto2: null,
    gravidade: null, recurso: '', responsavel: '', status: '', obs: '',
    exposicao_rs: null, causa_raiz: '', situacao: '', data_situacao: null, ...r,
  };
}

const HOJE = new Date('2026-06-15T12:00:00Z');

/* ---------- datas ---------- */

describe('datas', () => {
  it('diasEntre conta em UTC, sem tropeçar em horário de verão', () => {
    expect(diasEntre('2026-01-01', '2026-01-31')).toBe(30);
    expect(diasEntre('2026-10-01', '2026-11-01')).toBe(31);
    expect(diasEntre('2026-03-31', '2026-01-31')).toBe(-59);
    expect(diasEntre(null, '2026-01-01')).toBeNull();
    expect(diasEntre('2026-01-01', null)).toBeNull();
  });

  it('periodoDe corta o mês', () => {
    expect(periodoDe('2026-06-15')).toBe('2026-06');
  });

  it('hojeISO usa o fuso local', () => {
    expect(hojeISO(new Date(2026, 5, 15))).toBe('2026-06-15');
  });

  it('mesesNoIntervalo cobre as pontas e atravessa o ano', () => {
    expect(mesesNoIntervalo('2026-01-15', '2026-03-02'))
      .toEqual(['2026-01', '2026-02', '2026-03']);
    expect(mesesNoIntervalo('2025-11-01', '2026-02-01'))
      .toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('sem fim, ou com fim antes do início, vale um mês', () => {
    expect(mesesNoIntervalo('2026-05-10', null)).toEqual(['2026-05']);
    expect(mesesNoIntervalo('2026-05-10', '2026-01-01')).toEqual(['2026-05']);
    expect(mesesNoIntervalo(null, '2026-05-01')).toEqual([]);
  });
});

/* ---------- impacto comprometido ---------- */

describe('impactoComprometido', () => {
  it('soma só as ativas, agrupando por objetivo', () => {
    const o1 = objetivo({ descricao: 'Ruptura' });
    const o2 = objetivo({ descricao: 'Capital parado' });
    const r = impactoComprometido([
      iniciativa({ objetivo_id: o1.id, impacto_rs: 100, status: 'em_execucao' }),
      iniciativa({ objetivo_id: o1.id, impacto_rs: 50, status: 'aprovada' }),
      iniciativa({ objetivo_id: o2.id, impacto_rs: 200, status: 'pausada' }),
      iniciativa({ objetivo_id: o2.id, impacto_rs: 999, status: 'backlog' }),
      iniciativa({ objetivo_id: o2.id, impacto_rs: 999, status: 'concluida' }),
      iniciativa({ objetivo_id: o2.id, impacto_rs: 999, status: 'cancelada' }),
    ], [o1, o2]);

    expect(r.total).toBe(350);
    expect(r.porObjetivo[0].objetivo?.descricao).toBe('Capital parado');
    expect(r.porObjetivo[0].impacto).toBe(200);
    expect(r.porObjetivo[1].iniciativas).toBe(2);
  });

  it('conta quantas ativas estão sem valor — o total mente por baixo', () => {
    const r = impactoComprometido([
      iniciativa({ impacto_rs: 100 }),
      iniciativa({ impacto_rs: null }),
      iniciativa({ impacto_rs: null }),
    ], []);
    expect(r.total).toBe(100);
    expect(r.semValor).toBe(2);
  });
});

/* ---------- marcos ---------- */

describe('marcosNoPrazo', () => {
  it('mede contra a data ORIGINAL — replanejar não conserta o passado', () => {
    const r = marcosNoPrazo([
      marco({ status: 'entregue', data_plano_original: '2026-03-31', data_plano_atual: '2026-05-31', data_real: '2026-05-30' }),
    ], HOJE);
    expect(r.noPrazo).toBe(0);
    expect(r.foraDoPrazo).toBe(1);
  });

  it('entregue na data conta como no prazo', () => {
    const r = marcosNoPrazo([
      marco({ status: 'entregue', data_plano_original: '2026-03-31', data_real: '2026-03-31' }),
    ], HOJE);
    expect(r.pct).toBe(1);
  });

  it('marco vencido e não entregue pesa contra', () => {
    const r = marcosNoPrazo([
      marco({ status: 'previsto', data_plano_original: '2026-01-31' }),
    ], HOJE);
    expect(r.foraDoPrazo).toBe(1);
    expect(r.total).toBe(1);
  });

  it('marco futuro ainda não conta — trabalho em voo não derruba o número', () => {
    const r = marcosNoPrazo([
      marco({ status: 'previsto', data_plano_original: '2026-12-31' }),
    ], HOJE);
    expect(r.total).toBe(0);
    expect(r.pct).toBeNull();
  });

  it('cancelado fica de fora: não é promessa quebrada', () => {
    const r = marcosNoPrazo([
      marco({ status: 'cancelado', data_plano_original: '2026-01-01' }),
    ], HOJE);
    expect(r.total).toBe(0);
  });

  it('ignora marco sem data original', () => {
    expect(marcosNoPrazo([marco({ status: 'entregue', data_real: '2026-01-01' })], HOJE).total).toBe(0);
  });

  it('entregue sem data de entrega não ganha o benefício da dúvida', () => {
    // Marcar "entregue" sem dizer quando não prova pontualidade. Se a data
    // original já passou, conta contra; se não passou, ainda não conta.
    expect(marcosNoPrazo([
      marco({ status: 'entregue', data_plano_original: '2026-01-31', data_real: null }),
    ], HOJE)).toMatchObject({ noPrazo: 0, foraDoPrazo: 1 });
    expect(marcosNoPrazo([
      marco({ status: 'entregue', data_plano_original: '2026-12-31', data_real: null }),
    ], HOJE).total).toBe(0);
  });

  it('mistura tudo e devolve a fração certa', () => {
    const r = marcosNoPrazo([
      marco({ status: 'entregue', data_plano_original: '2026-01-31', data_real: '2026-01-20' }),
      marco({ status: 'entregue', data_plano_original: '2026-02-28', data_real: '2026-01-20' }),
      marco({ status: 'entregue', data_plano_original: '2026-03-31', data_real: '2026-04-15' }),
      marco({ status: 'previsto', data_plano_original: '2026-05-31' }),
      marco({ status: 'previsto', data_plano_original: '2026-12-31' }),
    ], HOJE);
    expect(r.noPrazo).toBe(2);
    expect(r.foraDoPrazo).toBe(2);
    expect(r.pct).toBe(0.5);
  });
});

describe('slipMedio', () => {
  it('mede o quanto as datas andaram desde o plano original', () => {
    const r = slipMedio([
      marco({ data_plano_original: '2026-01-01', data_plano_atual: '2026-01-11' }),
      marco({ data_plano_original: '2026-01-01', data_plano_atual: '2026-01-21' }),
    ]);
    expect(r.diasMedio).toBe(15);
    expect(r.replanejados).toBe(2);
  });

  it('separa a média geral da média de quem escorregou', () => {
    const r = slipMedio([
      marco({ data_plano_original: '2026-01-01', data_plano_atual: '2026-01-01' }),
      marco({ data_plano_original: '2026-01-01', data_plano_atual: '2026-01-01' }),
      marco({ data_plano_original: '2026-01-01', data_plano_atual: '2026-01-21' }),
    ]);
    expect(r.avaliados).toBe(3);
    expect(r.diasMedio).toBeCloseTo(20 / 3);
    expect(r.replanejados).toBe(1);
    expect(r.diasMedioDosReplanejados).toBe(20);
  });

  it('sem marco avaliável, devolve null em vez de zero', () => {
    const r = slipMedio([marco({ data_plano_original: '2026-01-01' })]);
    expect(r.diasMedio).toBeNull();
    expect(r.avaliados).toBe(0);
  });

  it('ignora cancelado', () => {
    const r = slipMedio([
      marco({ status: 'cancelado', data_plano_original: '2026-01-01', data_plano_atual: '2026-06-01' }),
    ]);
    expect(r.avaliados).toBe(0);
  });
});

/* ---------- carga ---------- */

describe('wipPorDono', () => {
  it('conta só em execução e marca quem passou do limite', () => {
    const a = pessoa({ nome: 'DERYLSON' });
    const b = pessoa({ nome: 'KAUAN' });
    const r = wipPorDono([
      ...Array.from({ length: 3 }, () => iniciativa({ dono_id: a.id, status: 'em_execucao' })),
      iniciativa({ dono_id: b.id, status: 'em_execucao' }),
      iniciativa({ dono_id: b.id, status: 'pausada' }),
      iniciativa({ dono_id: b.id, status: 'aprovada' }),
    ], [a, b]);

    expect(r[0].nome).toBe('DERYLSON');
    expect(r[0].wip).toBe(3);
    expect(r[0].acimaDoLimite).toBe(true);
    expect(r[1].wip).toBe(1);
    expect(r[1].acimaDoLimite).toBe(false);
  });

  it('exatamente no limite não é alerta', () => {
    const p = pessoa();
    const r = wipPorDono(
      Array.from({ length: LIMITE_WIP }, () => iniciativa({ dono_id: p.id })),
      [p],
    );
    expect(r[0].acimaDoLimite).toBe(false);
  });

  it('iniciativa sem dono aparece como "Sem dono", não some', () => {
    const r = wipPorDono([iniciativa({ dono_id: null })], []);
    expect(r[0].nome).toBe('Sem dono');
    expect(r[0].pessoa).toBeNull();
  });
});

describe('cargaPorPessoa', () => {
  it('espalha o esforço pelos meses da janela e compara com a capacidade', () => {
    const p = pessoa({ nome: 'KAUAN', dias_projeto_mes: 14 });
    // 30 dias-pessoa em 3 meses = 10 por mês.
    const r = cargaPorPessoa([
      iniciativa({ dono_id: p.id, esforco_dias: 30, inicio: '2026-01-10', fim_plano_atual: '2026-03-20' }),
    ], [p], '2026-02');

    expect(r[0].diasNoPeriodo).toBe(10);
    expect(r[0].capacidade).toBe(14);
    expect(r[0].acimaDaCapacidade).toBe(false);
  });

  it('soma iniciativas concorrentes e acusa a sobrecarga', () => {
    const p = pessoa({ dias_projeto_mes: 14 });
    const r = cargaPorPessoa([
      iniciativa({ dono_id: p.id, esforco_dias: 20, inicio: '2026-02-01', fim_plano_atual: '2026-02-28' }),
      iniciativa({ dono_id: p.id, esforco_dias: 10, inicio: '2026-02-01', fim_plano_atual: '2026-02-28' }),
    ], [p], '2026-02');

    expect(r[0].diasNoPeriodo).toBe(30);
    expect(r[0].iniciativas).toBe(2);
    expect(r[0].acimaDaCapacidade).toBe(true);
  });

  it('período fora da janela não conta', () => {
    const p = pessoa({ dias_projeto_mes: 14 });
    const r = cargaPorPessoa([
      iniciativa({ dono_id: p.id, esforco_dias: 30, inicio: '2026-01-01', fim_plano_atual: '2026-03-01' }),
    ], [p], '2026-07');
    expect(r).toHaveLength(0);
  });

  it('sem esforço ou sem janela declarada, não chuta', () => {
    const p = pessoa({ dias_projeto_mes: 14 });
    expect(cargaPorPessoa([
      iniciativa({ dono_id: p.id, esforco_dias: null, inicio: '2026-02-01', fim_plano_atual: '2026-02-28' }),
    ], [p], '2026-02')).toHaveLength(0);
    expect(cargaPorPessoa([
      iniciativa({ dono_id: p.id, esforco_dias: 10, inicio: null }),
    ], [p], '2026-02')).toHaveLength(0);
  });

  it('sem capacidade declarada, calcula a carga mas não acusa nada', () => {
    const p = pessoa({ dias_projeto_mes: null });
    const r = cargaPorPessoa([
      iniciativa({ dono_id: p.id, esforco_dias: 99, inicio: '2026-02-01', fim_plano_atual: '2026-02-28' }),
    ], [p], '2026-02');
    expect(r[0].diasNoPeriodo).toBe(99);
    expect(r[0].acimaDaCapacidade).toBe(false);
  });

  it('usa fim_plano_original quando o atual ainda não existe', () => {
    const p = pessoa({ dias_projeto_mes: 14 });
    const r = cargaPorPessoa([
      iniciativa({ dono_id: p.id, esforco_dias: 20, inicio: '2026-02-01', fim_plano_original: '2026-03-31' }),
    ], [p], '2026-03');
    expect(r[0].diasNoPeriodo).toBe(10);
  });

  it('backlog não ocupa capacidade', () => {
    const p = pessoa({ dias_projeto_mes: 14 });
    const r = cargaPorPessoa([
      iniciativa({ dono_id: p.id, status: 'backlog', esforco_dias: 30, inicio: '2026-02-01', fim_plano_atual: '2026-02-28' }),
    ], [p], '2026-02');
    expect(r).toHaveLength(0);
  });
});

/* ---------- zumbis e cobertura ---------- */

describe('zumbis', () => {
  const parado = '2026-04-01T00:00:00.000Z';   // 75 dias antes de HOJE
  const recente = '2026-06-10T00:00:00.000Z';  // 5 dias antes

  it('acusa iniciativa em execução com marco parado há mais de 30 dias', () => {
    const i = iniciativa({ status: 'em_execucao', updated_at: recente });
    const r = zumbis([i], [marco({ iniciativa_id: i.id, updated_at: parado })], HOJE);
    expect(r).toHaveLength(1);
    expect(r[0].diasParado).toBe(75);
    expect(r[0].temMarco).toBe(true);
  });

  it('o marco mais recente é o que vale', () => {
    const i = iniciativa({ status: 'em_execucao' });
    const r = zumbis([i], [
      marco({ iniciativa_id: i.id, updated_at: parado }),
      marco({ iniciativa_id: i.id, updated_at: recente }),
    ], HOJE);
    expect(r).toHaveLength(0);
  });

  it('sem marco, o relógio corre pela própria iniciativa', () => {
    const i = iniciativa({ status: 'em_execucao', updated_at: parado });
    const r = zumbis([i], [], HOJE);
    expect(r[0].temMarco).toBe(false);
  });

  it('só olha para quem está em execução', () => {
    for (const status of ['backlog', 'aprovada', 'pausada', 'concluida', 'cancelada'] as const) {
      const i = iniciativa({ status, updated_at: parado });
      expect(zumbis([i], [], HOJE)).toHaveLength(0);
    }
  });

  it('exatamente no limite ainda não é zumbi', () => {
    const noLimite = new Date(HOJE.getTime() - DIAS_PARA_ZUMBI * 86_400_000).toISOString();
    const i = iniciativa({ status: 'em_execucao', updated_at: noLimite });
    expect(zumbis([i], [], HOJE)).toHaveLength(0);
  });

  it('ordena do mais parado para o menos', () => {
    const a = iniciativa({ status: 'em_execucao', updated_at: '2026-01-01T00:00:00.000Z' });
    const b = iniciativa({ status: 'em_execucao', updated_at: '2026-04-01T00:00:00.000Z' });
    const r = zumbis([b, a], [], HOJE);
    expect(r[0].iniciativa.id).toBe(a.id);
  });
});

describe('coberturaObjetivos', () => {
  it('acha o objetivo ativo sem nenhuma iniciativa ativa', () => {
    const coberto = objetivo({ descricao: 'Coberto' });
    const orfao = objetivo({ descricao: 'Órfão' });
    const r = coberturaObjetivos([coberto, orfao], [
      iniciativa({ objetivo_id: coberto.id, status: 'em_execucao' }),
    ]);
    expect(r.orfaos.map(o => o.descricao)).toEqual(['Órfão']);
    expect(r.comIniciativa).toBe(1);
    expect(r.totalAtivos).toBe(2);
  });

  it('iniciativa em backlog não cobre objetivo — é intenção, não plano', () => {
    const o = objetivo();
    const r = coberturaObjetivos([o], [iniciativa({ objetivo_id: o.id, status: 'backlog' })]);
    expect(r.orfaos).toHaveLength(1);
  });

  it('objetivo atingido ou abandonado sai da conta', () => {
    const r = coberturaObjetivos([
      objetivo({ status: 'atingido' }),
      objetivo({ status: 'abandonado' }),
    ], []);
    expect(r.totalAtivos).toBe(0);
    expect(r.orfaos).toHaveLength(0);
  });
});

/* ---------- mix e origem ---------- */

describe('mixPorVetor', () => {
  it('reparte o impacto e acusa portfólio só defensivo', () => {
    const r = mixPorVetor([
      iniciativa({ vetor: 'evitar_perda', impacto_rs: 800 }),
      iniciativa({ vetor: 'criar_ganho', impacto_rs: 150 }),
      iniciativa({ vetor: 'criar_decisao', impacto_rs: 50 }),
    ]);
    expect(r.total).toBe(1000);
    expect(r.defensivoPct).toBeCloseTo(0.8);
    expect(r.soDefensivo).toBe(true);
    expect(r.fatias[0].vetor).toBe('evitar_perda');
  });

  it('exatamente no limite ainda não dispara o alerta', () => {
    const r = mixPorVetor([
      iniciativa({ vetor: 'evitar_perda', impacto_rs: 70 }),
      iniciativa({ vetor: 'criar_ganho', impacto_rs: 30 }),
    ]);
    expect(r.defensivoPct).toBeCloseTo(0.7);
    expect(r.soDefensivo).toBe(false);
  });

  it('sem valor nenhum, não divide por zero', () => {
    const r = mixPorVetor([iniciativa({ vetor: 'criar_ganho', impacto_rs: null })]);
    expect(r.total).toBe(0);
    expect(r.fatias[0].pct).toBe(0);
    expect(r.soDefensivo).toBe(false);
  });
});

describe('portfolioPorOrigem', () => {
  it('agrega risco contra oportunidade', () => {
    const r = portfolioPorOrigem([
      iniciativa({ fonte: 'risco', impacto_rs: 100 }),
      iniciativa({ fonte: 'risco', impacto_rs: 200 }),
      iniciativa({ fonte: 'gap_kpi', impacto_rs: 50 }),
      iniciativa({ fonte: 'maturidade', impacto_rs: 25 }),
      iniciativa({ fonte: 'externo', impacto_rs: 25 }),
    ]);
    expect(r.deRisco).toEqual({ iniciativas: 2, impacto: 300 });
    expect(r.deOportunidade).toEqual({ iniciativas: 3, impacto: 100 });
    expect(r.fatias.find(f => f.fonte === 'gap_kpi')?.iniciativas).toBe(1);
  });

  it('conta o portfólio inteiro, não só o ativo — origem é histórico', () => {
    const r = portfolioPorOrigem([
      iniciativa({ fonte: 'risco', status: 'concluida', impacto_rs: 10 }),
      iniciativa({ fonte: 'risco', status: 'backlog', impacto_rs: 10 }),
    ]);
    expect(r.deRisco.iniciativas).toBe(2);
  });
});

describe('fonteVsVetor', () => {
  it('mostra que os dois eixos são independentes', () => {
    const r = fonteVsVetor([
      // Nasceu de gap de KPI e mesmo assim evita perda.
      iniciativa({ fonte: 'gap_kpi', vetor: 'evitar_perda' }),
      iniciativa({ fonte: 'gap_kpi', vetor: 'evitar_perda' }),
      iniciativa({ fonte: 'risco', vetor: 'criar_decisao' }),
    ]);
    const celula = r.find(c => c.fonte === 'gap_kpi' && c.vetor === 'evitar_perda');
    expect(celula?.iniciativas).toBe(2);
    expect(r.find(c => c.fonte === 'risco' && c.vetor === 'criar_decisao')?.iniciativas).toBe(1);
  });
});

/* ---------- cobertura risco ↔ iniciativa ---------- */

describe('estadoTratamento', () => {
  it('Aceitar curto-circuita: não se cobra ação de risco aceito', () => {
    expect(estadoTratamento({ resposta: 'Aceitar' }, [], [])).toBe('aceito');
    expect(estadoTratamento({ resposta: 'Aceitar' }, [acao({ status: 'aberta' })], []))
      .toBe('aceito');
  });

  it('sem ação nenhuma é sem tratamento', () => {
    expect(estadoTratamento({ resposta: 'Mitigar' }, [], [])).toBe('sem_tratamento');
  });

  it('ação autônoma concluída fecha o tratamento', () => {
    expect(estadoTratamento({ resposta: 'Mitigar' }, [acao({ status: 'concluida' })], []))
      .toBe('tratamento_concluido');
  });

  it('OLHA ATRAVÉS DA AÇÃO: com iniciativa, a ação marcada não basta', () => {
    const ini = iniciativa({ status: 'em_execucao' });
    const a = acao({ status: 'concluida', iniciativa_id: ini.id });
    expect(estadoTratamento({ resposta: 'Mitigar' }, [a], [ini])).toBe('em_tratamento');
  });

  it('com a iniciativa concluída, aí sim o tratamento fecha', () => {
    const ini = iniciativa({ status: 'concluida' });
    const a = acao({ status: 'aberta', iniciativa_id: ini.id });
    expect(estadoTratamento({ resposta: 'Mitigar' }, [a], [ini])).toBe('tratamento_concluido');
  });

  it('uma ação em aberto segura o risco inteiro', () => {
    const ini = iniciativa({ status: 'concluida' });
    expect(estadoTratamento({ resposta: 'Mitigar' }, [
      acao({ iniciativa_id: ini.id }),
      acao({ status: 'aberta' }),
    ], [ini])).toBe('em_tratamento');
  });

  it('cancelada não conta nem a favor nem contra', () => {
    expect(estadoTratamento({ resposta: 'Mitigar' }, [
      acao({ status: 'concluida' }),
      acao({ status: 'cancelada' }),
    ], [])).toBe('tratamento_concluido');
  });

  it('se todas foram canceladas, o risco volta a não ter tratamento', () => {
    expect(estadoTratamento({ resposta: 'Mitigar' }, [
      acao({ status: 'cancelada' }),
      acao({ status: 'cancelada' }),
    ], [])).toBe('sem_tratamento');
  });

  it('iniciativa apagada some do mapa e o tratamento não fecha sozinho', () => {
    const a = acao({ status: 'concluida', iniciativa_id: 'iniciativa-que-sumiu' });
    expect(estadoTratamento({ resposta: 'Mitigar' }, [a], [])).toBe('em_tratamento');
  });
});

describe('tratamentoDosRiscos e prontosParaFechar', () => {
  it('agrupa as ações por risco sem trocar as bolas', () => {
    const r1 = risco({ risco: 'Um' });
    const r2 = risco({ risco: 'Dois' });
    const t = tratamentoDosRiscos([r1, r2], [
      acao({ risco_id: r1.id, status: 'concluida' }),
      acao({ risco_id: r2.id, status: 'aberta' }),
    ], []);
    expect(t.find(x => x.risco.id === r1.id)?.estado).toBe('tratamento_concluido');
    expect(t.find(x => x.risco.id === r2.id)?.estado).toBe('em_tratamento');
  });

  it('pronto para fechar é tratamento concluído e situação ainda aberta', () => {
    const r = risco({ situacao: 'validado' });
    const p = prontosParaFechar([r], [acao({ risco_id: r.id, status: 'concluida' })], []);
    expect(p).toHaveLength(1);
  });

  it('quem já foi fechado não volta para a fila', () => {
    for (const situacao of ['mitigado', 'obsoleto', 'descartado'] as const) {
      const r = risco({ situacao });
      expect(prontosParaFechar([r], [acao({ risco_id: r.id, status: 'concluida' })], []))
        .toHaveLength(0);
    }
  });

  it('tratamento em andamento não entra na fila', () => {
    const r = risco();
    expect(prontosParaFechar([r], [acao({ risco_id: r.id, status: 'aberta' })], []))
      .toHaveLength(0);
  });
});

describe('riscosMitigados', () => {
  it('conta só os confirmados no ano pedido', () => {
    const rs = [
      risco({ situacao: 'mitigado', data_situacao: '2026-05-14' }),
      risco({ situacao: 'mitigado', data_situacao: '2025-12-31' }),
      risco({ situacao: 'mitigado', data_situacao: null }),
    ];
    expect(riscosMitigados(rs, 2026)).toHaveLength(1);
    expect(riscosMitigados(rs, 2025)).toHaveLength(1);
  });

  it('obsoleto não é mérito de ninguém — a ameaça sumiu sozinha', () => {
    const rs = [risco({ situacao: 'obsoleto', data_situacao: '2026-04-11' })];
    expect(riscosMitigados(rs, 2026)).toHaveLength(0);
  });
});

describe('exposicaoResidual', () => {
  it('soma só os riscos ainda em pé', () => {
    const r = exposicaoResidual([
      risco({ situacao: 'validado', exposicao_rs: 480_000 }),
      risco({ situacao: 'hipotese', exposicao_rs: 20_000 }),
      risco({ situacao: 'mitigado', exposicao_rs: 999_999 }),
      risco({ situacao: 'obsoleto', exposicao_rs: 999_999 }),
      risco({ situacao: 'descartado', exposicao_rs: 999_999 }),
    ]);
    expect(r.total).toBe(500_000);
    expect(r.riscos).toBe(2);
  });

  it('avisa quantos abertos estão sem valor', () => {
    const r = exposicaoResidual([
      risco({ exposicao_rs: 100 }),
      risco({ exposicao_rs: null }),
    ]);
    expect(r.total).toBe(100);
    expect(r.semValor).toBe(1);
  });

  it('riscosAbertos e exposicaoResidual concordam sobre quem está aberto', () => {
    const rs = [risco({ situacao: '' }), risco({ situacao: 'mitigado' })];
    expect(riscosAbertos(rs)).toHaveLength(1);
    expect(exposicaoResidual(rs).riscos).toBe(1);
  });
});

describe('os dois lados do vínculo', () => {
  it('riscosPorIniciativa devolve o que ela cobre hoje', () => {
    const ini = iniciativa();
    const r1 = risco({ risco: 'Coberto' });
    const r2 = risco({ risco: 'Não coberto' });
    const encontrados = riscosPorIniciativa(ini.id, [
      acao({ risco_id: r1.id, iniciativa_id: ini.id }),
      acao({ risco_id: r2.id, iniciativa_id: null }),
    ], [r1, r2]);
    expect(encontrados.map(r => r.risco)).toEqual(['Coberto']);
  });

  it('iniciativasPorRisco faz o caminho inverso, sem duplicar', () => {
    const i1 = iniciativa({ nome: 'A' });
    const i2 = iniciativa({ nome: 'B' });
    const r = risco();
    const achadas = iniciativasPorRisco(r.id, [
      acao({ risco_id: r.id, iniciativa_id: i1.id }),
      acao({ risco_id: r.id, iniciativa_id: i1.id }),
      acao({ risco_id: r.id, iniciativa_id: i2.id }),
      acao({ risco_id: r.id, iniciativa_id: null }),
    ], [i1, i2]);
    expect(achadas.map(i => i.nome)).toEqual(['A', 'B']);
  });

  it('uma iniciativa de gap_kpi cobrindo risco não vira fonte risco', () => {
    // O caso que motivou separar origem de cobertura.
    const ini = iniciativa({ fonte: 'gap_kpi' });
    const r = risco();
    const acoes = [acao({ risco_id: r.id, iniciativa_id: ini.id })];
    expect(riscosPorIniciativa(ini.id, acoes, [r])).toHaveLength(1);
    expect(portfolioPorOrigem([ini]).deOportunidade.iniciativas).toBe(1);
    expect(portfolioPorOrigem([ini]).deRisco.iniciativas).toBe(0);
  });
});
