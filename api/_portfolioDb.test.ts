import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema, createRecord, type Sql } from './_db.js';
import {
  ensurePortfolioSchema, listPortfolio, backup, contarAcoesRisco,
  pessoas, objetivos, medicoes, iniciativas, marcos, acoesRisco,
  validarIniciativa, validarMarco, validarMedicao, validarEntidade, ehEntidade,
} from './_portfolioDb.js';
import { ensureTasksSchema } from './_tasksDb.js';

let pg: PGlite;
let sql: Sql;

beforeAll(async () => {
  pg = new PGlite();
  sql = async (text, params = []) => {
    const result = await pg.query(text, params as unknown[]);
    return result.rows as Record<string, unknown>[];
  };
  // Mesma ordem da produção: `acoes_risco.risco_id` referencia `risk_records`.
  await ensureSchema(sql);
  await ensureTasksSchema(sql);
  await ensurePortfolioSchema(sql);
});

afterAll(async () => {
  await pg.close();
});

/** Objetivo descartável, para as iniciativas que precisam de um pai válido. */
async function novoObjetivo(descricao = 'Objetivo de teste') {
  return objetivos.create(sql, { descricao, horizonte: '3-12m', status: 'ativo' });
}

describe('schema', () => {
  it('ensurePortfolioSchema é idempotente', async () => {
    await ensurePortfolioSchema(sql);
    await ensurePortfolioSchema(sql);
    const rows = await sql(
      `select table_name from information_schema.tables
       where table_name in ('pessoas','objetivos','iniciativas','marcos','acoes_risco')`,
    );
    expect(rows).toHaveLength(5);
  });

  it('reconhece só as entidades expostas na rota', () => {
    expect(ehEntidade('iniciativas')).toBe(true);
    expect(ehEntidade('acoes-risco')).toBe(true);
    expect(ehEntidade('risk_records')).toBe(false);
    expect(ehEntidade('constructor')).toBe(false);
  });

  it('listPortfolio devolve todas as listas do pacote', async () => {
    const pacote = await listPortfolio(sql);
    expect(Object.keys(pacote).sort()).toEqual(
      ['acoes_risco', 'iniciativas', 'marcos', 'medicoes', 'objetivos', 'pessoas'],
    );
  });
});

describe('regra 1 — iniciativa exige objetivo', () => {
  it('recusa criação sem objetivo_id', async () => {
    const erro = await validarIniciativa(sql, { nome: 'Solta' }, null);
    expect(erro).toMatch(/ligada a um objetivo/);
  });

  it('recusa objetivo_id vazio', async () => {
    const erro = await validarIniciativa(sql, { objetivo_id: '' }, null);
    expect(erro).toMatch(/ligada a um objetivo/);
  });

  it('aceita com objetivo_id preenchido', async () => {
    const obj = await novoObjetivo();
    const erro = await validarIniciativa(sql, { objetivo_id: obj.id, nome: 'OK' }, null);
    expect(erro).toBeNull();
  });

  it('recusa um patch que apagaria o objetivo de uma iniciativa existente', async () => {
    const obj = await novoObjetivo();
    const ini = await iniciativas.create(sql, { objetivo_id: obj.id, nome: 'Com pai', status: 'backlog' });
    const erro = await validarIniciativa(sql, { objetivo_id: null }, ini);
    expect(erro).toMatch(/ligada a um objetivo/);
  });

  it('objetivo com iniciativa não pode ser apagado (restrict)', async () => {
    const obj = await novoObjetivo('Não me apague');
    await iniciativas.create(sql, { objetivo_id: obj.id, nome: 'Filha', status: 'backlog' });
    await expect(objetivos.remove(sql, obj.id)).rejects.toThrow();
  });
});

describe('regra 2 — aprovada ou além exige marco', () => {
  it('recusa mudar para aprovada sem nenhum marco', async () => {
    const obj = await novoObjetivo();
    const ini = await iniciativas.create(sql, { objetivo_id: obj.id, nome: 'Sem marco', status: 'backlog' });
    const erro = await validarIniciativa(sql, { status: 'aprovada' }, ini);
    expect(erro).toMatch(/pelo menos um marco/);
  });

  it('aceita depois que existe um marco', async () => {
    const obj = await novoObjetivo();
    const ini = await iniciativas.create(sql, { objetivo_id: obj.id, nome: 'Com marco', status: 'backlog' });
    await marcos.create(sql, { iniciativa_id: ini.id, nome: 'Primeiro entregável', status: 'previsto' });
    const erro = await validarIniciativa(sql, { status: 'aprovada' }, ini);
    expect(erro).toBeNull();
  });

  it('backlog não exige marco', async () => {
    const obj = await novoObjetivo();
    const ini = await iniciativas.create(sql, { objetivo_id: obj.id, nome: 'Ideia', status: 'backlog' });
    expect(await validarIniciativa(sql, { status: 'backlog' }, ini)).toBeNull();
  });

  it('cancelada não exige marco — travar isso deixaria lixo vivo no portfólio', async () => {
    const obj = await novoObjetivo();
    const ini = await iniciativas.create(sql, { objetivo_id: obj.id, nome: 'Abortada', status: 'backlog' });
    expect(await validarIniciativa(sql, { status: 'cancelada' }, ini)).toBeNull();
  });

  it('em_execucao, pausada e concluida também exigem', async () => {
    const obj = await novoObjetivo();
    const ini = await iniciativas.create(sql, { objetivo_id: obj.id, nome: 'Nua', status: 'backlog' });
    for (const status of ['em_execucao', 'pausada', 'concluida']) {
      expect(await validarIniciativa(sql, { status }, ini)).toMatch(/pelo menos um marco/);
    }
  });

  it('apagar a iniciativa leva os marcos junto (cascade)', async () => {
    const obj = await novoObjetivo();
    const ini = await iniciativas.create(sql, { objetivo_id: obj.id, nome: 'Some', status: 'backlog' });
    const marco = await marcos.create(sql, { iniciativa_id: ini.id, nome: 'Vai junto' });
    await iniciativas.remove(sql, ini.id);
    expect(await marcos.byId(sql, marco.id)).toBeNull();
  });
});

describe('regra 3 — data planejada original é imutável', () => {
  it('recusa alterar depois de gravada', async () => {
    const marco = { data_plano_original: '2026-03-31' } as never;
    const erro = validarMarco({ data_plano_original: '2026-05-31' }, marco);
    expect(erro).toMatch(/não pode ser alterada/);
  });

  it('recusa também apagá-la', async () => {
    const marco = { data_plano_original: '2026-03-31' } as never;
    expect(validarMarco({ data_plano_original: null }, marco)).toMatch(/não pode ser alterada/);
  });

  it('aceita reenviar o mesmo valor — patch idempotente não é alteração', () => {
    const marco = { data_plano_original: '2026-03-31' } as never;
    expect(validarMarco({ data_plano_original: '2026-03-31' }, marco)).toBeNull();
  });

  it('aceita preencher pela primeira vez', () => {
    const marco = { data_plano_original: null } as never;
    expect(validarMarco({ data_plano_original: '2026-03-31' }, marco)).toBeNull();
  });

  it('na criação nada é imutável ainda', () => {
    expect(validarMarco({ data_plano_original: '2026-03-31' }, null)).toBeNull();
  });
});

describe('regra 4 — replanejar exige motivo', () => {
  const emAndamento = {
    data_plano_atual: '2026-03-31',
    motivo_replanejamento: '',
  } as never;

  it('recusa mover a data sem motivo', () => {
    const erro = validarMarco({ data_plano_atual: '2026-05-31' }, emAndamento);
    expect(erro).toMatch(/motivo do replanejamento/);
  });

  it('aceita quando o motivo vem no mesmo patch', () => {
    const erro = validarMarco(
      { data_plano_atual: '2026-05-31', motivo_replanejamento: 'Dependência da base histórica atrasou' },
      emAndamento,
    );
    expect(erro).toBeNull();
  });

  it('aceita quando o motivo já estava gravado', () => {
    const comMotivo = { data_plano_atual: '2026-03-31', motivo_replanejamento: 'já explicado' } as never;
    expect(validarMarco({ data_plano_atual: '2026-05-31' }, comMotivo)).toBeNull();
  });

  it('motivo só com espaços não conta', () => {
    const erro = validarMarco(
      { data_plano_atual: '2026-05-31', motivo_replanejamento: '   ' },
      emAndamento,
    );
    expect(erro).toMatch(/motivo do replanejamento/);
  });

  it('preencher pela primeira vez não é replanejamento', () => {
    const semData = { data_plano_atual: null, motivo_replanejamento: '' } as never;
    expect(validarMarco({ data_plano_atual: '2026-03-31' }, semData)).toBeNull();
  });

  it('reenviar a mesma data não exige motivo', () => {
    expect(validarMarco({ data_plano_atual: '2026-03-31' }, emAndamento)).toBeNull();
  });
});

describe('acoes_risco — o vínculo dos dois lados', () => {
  it('iniciativa_id nulo é o caso da mitigação autônoma', async () => {
    const risco = await createRecord(sql, { risco: 'Risco com ação pequena' });
    const acao = await acoesRisco.create(sql, {
      risco_id: risco.id, descricao: 'Ajustar a rotina', status: 'aberta',
    });
    expect(acao.iniciativa_id).toBeNull();
    expect(acao.risco_id).toBe(risco.id);
  });

  it('vincular a iniciativa NÃO muda a origem dela', async () => {
    const obj = await novoObjetivo();
    // Nasceu de um gap de KPI, não de risco.
    const ini = await iniciativas.create(sql, {
      objetivo_id: obj.id, nome: 'Painel de acurácia', fonte: 'gap_kpi', status: 'backlog',
    });
    const risco = await createRecord(sql, { risco: 'Risco coberto depois' });
    await acoesRisco.create(sql, {
      risco_id: risco.id, iniciativa_id: ini.id, descricao: 'Usar o painel novo',
    });
    const lida = await iniciativas.byId(sql, ini.id);
    expect(lida?.fonte).toBe('gap_kpi');
  });

  it('apagar a iniciativa devolve a ação ao estado autônomo, sem apagá-la', async () => {
    const obj = await novoObjetivo();
    const ini = await iniciativas.create(sql, { objetivo_id: obj.id, nome: 'Temporária', status: 'backlog' });
    const risco = await createRecord(sql, { risco: 'Continua de pé' });
    const acao = await acoesRisco.create(sql, {
      risco_id: risco.id, iniciativa_id: ini.id, descricao: 'Mitigação',
    });
    await iniciativas.remove(sql, ini.id);
    const lida = await acoesRisco.byId(sql, acao.id);
    expect(lida).not.toBeNull();
    expect(lida?.iniciativa_id).toBeNull();
  });

  it('apagar o risco leva as ações dele junto (cascade)', async () => {
    const risco = await createRecord(sql, { risco: 'Vai embora' });
    const acao = await acoesRisco.create(sql, { risco_id: risco.id, descricao: 'Some junto' });
    await sql('delete from risk_records where id = $1', [risco.id]);
    expect(await acoesRisco.byId(sql, acao.id)).toBeNull();
  });

  it('contarAcoesRisco enxerga o que existe — é o guarda do /api/restore', async () => {
    expect(await contarAcoesRisco(sql)).toBeGreaterThan(0);
  });
});

describe('risk_records — colunas novas', () => {
  it('registro novo nasce com os campos aditivos zerados', async () => {
    const r = await createRecord(sql, { risco: 'Novo' });
    expect(r.exposicao_rs).toBeNull();
    expect(r.causa_raiz).toBe('');
    expect(r.situacao).toBe('');
    expect(r.data_situacao).toBeNull();
  });

  it('grava e lê situação, exposição e a data em YYYY-MM-DD', async () => {
    const r = await createRecord(sql, {
      risco: 'Mitigado',
      exposicao_rs: 480000,
      causa_raiz: 'Sem série histórica',
      situacao: 'mitigado',
      data_situacao: '2026-05-14',
    });
    expect(r.exposicao_rs).toBe(480000);
    expect(r.causa_raiz).toBe('Sem série histórica');
    expect(r.situacao).toBe('mitigado');
    expect(r.data_situacao).toBe('2026-05-14');
  });
});

describe('pessoas', () => {
  it('ativo nasce verdadeiro e dias_projeto_mes aceita fração', async () => {
    const p = await pessoas.create(sql, { nome: 'DERYLSON', dias_projeto_mes: 14 });
    expect(p.ativo).toBe(true);
    expect(p.dias_projeto_mes).toBe(14);
  });

  it('apagar a pessoa solta o dono da iniciativa em vez de apagá-la', async () => {
    const obj = await novoObjetivo();
    const p = await pessoas.create(sql, { nome: 'Temporário' });
    const ini = await iniciativas.create(sql, {
      objetivo_id: obj.id, nome: 'Sobrevive', dono_id: p.id, status: 'backlog',
    });
    await pessoas.remove(sql, p.id);
    const lida = await iniciativas.byId(sql, ini.id);
    expect(lida).not.toBeNull();
    expect(lida?.dono_id).toBeNull();
  });
});

describe('backup', () => {
  it('traz riscos, tarefas e as tabelas do portfólio', async () => {
    const dump = await backup(sql);
    expect(dump.gerado_em).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(dump.risk_records.length).toBeGreaterThan(0);
    expect(dump.tasks.length).toBeGreaterThan(0);
    expect(Array.isArray(dump.pessoas)).toBe(true);
    expect(Array.isArray(dump.acoes_risco)).toBe(true);
  });

  it('omite os bytes dos anexos por padrão', async () => {
    const dump = await backup(sql);
    dump.task_attachments.forEach(a => expect(a).not.toHaveProperty('dados'));
  });
});

describe('medições do objetivo', () => {
  it('grava uma leitura ligada ao objetivo e a devolve no pacote', async () => {
    const obj = await objetivos.create(sql, { descricao: 'Reduzir ruptura', unidade: '%' });
    await medicoes.create(sql, { objetivo_id: obj.id, data: '2026-03-31', valor: 7.2 });

    const pacote = await listPortfolio(sql);
    const minhas = pacote.medicoes.filter(m => m.objetivo_id === obj.id);
    expect(minhas).toHaveLength(1);
    // Data volta como 'YYYY-MM-DD', não como Date — é o que o input espera.
    expect(minhas[0].data).toBe('2026-03-31');
    expect(minhas[0].valor).toBe(7.2);
  });

  it('some junto com o objetivo — medição órfã não significa nada', async () => {
    const obj = await objetivos.create(sql, { descricao: 'Objetivo efêmero' });
    await medicoes.create(sql, { objetivo_id: obj.id, data: '2026-01-31', valor: 1 });
    await objetivos.remove(sql, obj.id);

    const restantes = await medicoes.list(sql);
    expect(restantes.some(m => m.objetivo_id === obj.id)).toBe(false);
  });

  it('exige objetivo, data e valor', () => {
    expect(validarMedicao({ data: '2026-01-31', valor: 1 }, null))
      .toMatch(/ligada a um objetivo/);
    expect(validarMedicao({ objetivo_id: 'x', valor: 1 }, null))
      .toMatch(/data/);
    expect(validarMedicao({ objetivo_id: 'x', data: '2026-01-31' }, null))
      .toMatch(/valor/);
    expect(validarMedicao({ objetivo_id: 'x', data: '2026-01-31', valor: 0 }, null))
      .toBeNull();
  });

  it('valor zero é valor, não campo em branco', () => {
    expect(validarMedicao({ objetivo_id: 'x', data: '2026-01-31', valor: 0 }, null)).toBeNull();
  });
});

describe('despacho de validação', () => {
  it('escolhe o validador certo por entidade', async () => {
    // Um ponto só decide isto. A rota de produção e o plugin de dev montavam
    // cada um a sua cadeia de ifs, e `medicoes` entrou só em metade delas.
    expect(await validarEntidade(sql, 'medicoes', { data: '2026-01-01', valor: 1 }, null))
      .toMatch(/objetivo/);
    expect(await validarEntidade(sql, 'iniciativas', { nome: 'X' }, null))
      .toMatch(/objetivo/);
    expect(await validarEntidade(sql, 'marcos', { nome: 'X' }, null)).toBeNull();
  });

  it('entidade sem regra própria passa direto', async () => {
    expect(await validarEntidade(sql, 'pessoas', { nome: 'Alguém' }, null)).toBeNull();
  });
});
