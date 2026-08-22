import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema, createRecord, listRecords, type Sql } from './_db.js';
import { ensureTasksSchema } from './_tasksDb.js';
import {
  ensurePortfolioSchema, pessoas, objetivos, iniciativas, acoesRisco, validarIniciativa,
} from './_portfolioDb.js';
import { migrarAcoes } from './_migracaoAcoes.js';
import { promoverTriagem, OBJETIVO_A_CLASSIFICAR } from './_promocaoTriagem.js';

let pg: PGlite;
let sql: Sql;

async function zerar() {
  await sql('delete from acoes_risco');
  await sql('delete from marcos');
  await sql('delete from iniciativas');
  await sql('delete from objetivos');
  await sql('delete from pessoas');
  await sql('delete from risk_records');
}

/** Cria um risco com plano, extrai e marca a ação como iniciativa. */
async function riscoMarcadoParaPromover(dados: Record<string, unknown>) {
  const registro = await createRecord(sql, dados);
  await migrarAcoes(sql);
  const acao = (await acoesRisco.list(sql)).find(a => a.risco_id === registro.id)!;
  await acoesRisco.update(sql, acao.id, { triagem: 'iniciativa' });
  return { registro, acao };
}

beforeAll(async () => {
  pg = new PGlite();
  sql = async (text, params = []) => {
    const result = await pg.query(text, params as unknown[]);
    return result.rows as Record<string, unknown>[];
  };
  await ensureSchema(sql, { semear: true });
  await ensureTasksSchema(sql, { semear: true });
  await ensurePortfolioSchema(sql);
});

afterAll(async () => {
  await pg.close();
});

describe('promoverTriagem — o balde A CLASSIFICAR', () => {
  it('cria o objetivo uma vez só', async () => {
    await zerar();
    await riscoMarcadoParaPromover({ risco: 'R1', acoes: 'Ação grande' });
    const um = await promoverTriagem(sql);
    expect(um.objetivoCriado).toBe(true);

    await riscoMarcadoParaPromover({ risco: 'R2', acoes: 'Outra ação grande' });
    const dois = await promoverTriagem(sql);
    expect(dois.objetivoCriado).toBe(false);
    expect(dois.objetivoId).toBe(um.objetivoId);

    const baldes = (await objetivos.list(sql))
      .filter(o => o.descricao.toUpperCase() === OBJETIVO_A_CLASSIFICAR);
    expect(baldes).toHaveLength(1);
  });

  it('não cria o objetivo quando não há nada para promover', async () => {
    await zerar();
    const r = await promoverTriagem(sql);
    expect(r.iniciativasCriadas).toBe(0);
    expect(await objetivos.list(sql)).toHaveLength(0);
  });
});

describe('promoverTriagem — herança do risco', () => {
  it('herda esforço, impacto, gravidade, recurso, resultado e dono', async () => {
    await zerar();
    await riscoMarcadoParaPromover({
      risco: 'Erros no cálculo do Estoque Objetivo',
      acoes: 'Reestruturar o algoritmo',
      resultado: 'Cálculo confiável em 100% dos SKUs',
      esforco: 5, impacto2: 5, gravidade: 5,
      recurso: 'TERCEIRIZADO',
      responsavel: 'DERYLSON',
    });
    await promoverTriagem(sql);

    const [ini] = await iniciativas.list(sql);
    expect(ini.nome).toBe('Reestruturar o algoritmo');
    expect(ini.descricao).toBe('Erros no cálculo do Estoque Objetivo');
    expect(ini.esforco).toBe(5);
    expect(ini.impacto2).toBe(5);
    expect(ini.gravidade).toBe(5);
    expect(ini.recurso).toBe('TERCEIRIZADO');
    expect(ini.resultado).toBe('Cálculo confiável em 100% dos SKUs');

    const derylson = (await pessoas.list(sql)).find(p => p.nome === 'DERYLSON');
    expect(ini.dono_id).toBe(derylson?.id);
  });

  it('marca fonte = risco e vetor = evitar_perda', async () => {
    await zerar();
    await riscoMarcadoParaPromover({ risco: 'R', acoes: 'A' });
    await promoverTriagem(sql);
    const [ini] = await iniciativas.list(sql);
    expect(ini.fonte).toBe('risco');
    expect(ini.vetor).toBe('evitar_perda');
  });

  it('deixa em branco o que o registro de risco não sabe', async () => {
    await zerar();
    await riscoMarcadoParaPromover({ risco: 'R', acoes: 'A' });
    await promoverTriagem(sql);
    const [ini] = await iniciativas.list(sql);
    expect(ini.impacto_rs).toBeNull();
    expect(ini.esforco_dias).toBeNull();
    expect(ini.inicio).toBeNull();
    expect(ini.fim_plano_original).toBeNull();
    expect(ini.confianca_impacto).toBe('');
  });

  it('a ação passa a apontar para a iniciativa', async () => {
    await zerar();
    const { acao } = await riscoMarcadoParaPromover({ risco: 'R', acoes: 'A' });
    await promoverTriagem(sql);
    const [ini] = await iniciativas.list(sql);
    const depois = await acoesRisco.byId(sql, acao.id);
    expect(depois?.iniciativa_id).toBe(ini.id);
  });
});

describe('promoverTriagem — nasce em backlog, sempre', () => {
  it('não herda status de execução: sem marco não se declara execução', async () => {
    await zerar();
    await riscoMarcadoParaPromover({ risco: 'R', acoes: 'A', status: 'EM ANDAMENTO' });
    const r = await promoverTriagem(sql);

    const [ini] = await iniciativas.list(sql);
    expect(ini.status).toBe('backlog');
    expect(r.comStatusHerdadoEmObs).toBe(1);
    expect(ini.obs).toContain('Em andamento');
    expect(ini.obs).toContain('marcos');
  });

  it('o status que nasce passa na regra 2, que exigiria marco', async () => {
    await zerar();
    await riscoMarcadoParaPromover({ risco: 'R', acoes: 'A', status: 'CONCLUÍDO' });
    await promoverTriagem(sql);
    const [ini] = await iniciativas.list(sql);
    // Se nascesse "concluida" sem marco, o próprio app recusaria o registro.
    expect(await validarIniciativa(sql, {}, ini)).toBeNull();
  });

  it('risco sem status não polui o obs', async () => {
    await zerar();
    await riscoMarcadoParaPromover({ risco: 'R', acoes: 'A', obs: 'Nota original' });
    const r = await promoverTriagem(sql);
    expect(r.comStatusHerdadoEmObs).toBe(0);
    const [ini] = await iniciativas.list(sql);
    expect(ini.obs).toBe('Nota original');
  });
});

describe('promoverTriagem — só promove o que foi marcado', () => {
  it('ignora ação sem triagem, marcada como acao ou como rotina', async () => {
    await zerar();
    await createRecord(sql, {
      risco: 'Vários destinos',
      acoes_itens: [
        { id: '1', descricao: 'Fica ação', responsavel: '', prazo: '', status: 'A fazer' },
        { id: '2', descricao: 'É rotina', responsavel: '', prazo: '', status: 'A fazer' },
        { id: '3', descricao: 'Ainda na fila', responsavel: '', prazo: '', status: 'A fazer' },
        { id: '4', descricao: 'Vira iniciativa', responsavel: '', prazo: '', status: 'A fazer' },
      ],
    });
    await migrarAcoes(sql);
    const acoes = await acoesRisco.list(sql);
    const porNome = new Map(acoes.map(a => [a.descricao, a.id]));
    await acoesRisco.update(sql, porNome.get('Fica ação')!, { triagem: 'acao' });
    await acoesRisco.update(sql, porNome.get('É rotina')!, { triagem: 'rotina' });
    await acoesRisco.update(sql, porNome.get('Vira iniciativa')!, { triagem: 'iniciativa' });

    const r = await promoverTriagem(sql);
    expect(r.iniciativasCriadas).toBe(1);
    const lista = await iniciativas.list(sql);
    expect(lista).toHaveLength(1);
    expect(lista[0].nome).toBe('Vira iniciativa');
  });

  it('rotina não cria tarefa nenhuma', async () => {
    await zerar();
    const antes = (await sql('select count(*)::int as n from tasks'))[0].n;
    await createRecord(sql, {
      risco: 'R',
      acoes_itens: [{ id: '1', descricao: 'Revisão quinzenal', responsavel: '', prazo: '', status: 'A fazer' }],
    });
    await migrarAcoes(sql);
    const [acao] = await acoesRisco.list(sql);
    await acoesRisco.update(sql, acao.id, { triagem: 'rotina' });
    await promoverTriagem(sql);
    const depois = (await sql('select count(*)::int as n from tasks'))[0].n;
    expect(depois).toBe(antes);
  });
});

describe('promoverTriagem — idempotência e reversão', () => {
  it('rodar duas vezes não duplica', async () => {
    await zerar();
    await riscoMarcadoParaPromover({ risco: 'R', acoes: 'A' });
    const um = await promoverTriagem(sql);
    const dois = await promoverTriagem(sql);
    expect(um.iniciativasCriadas).toBe(1);
    expect(dois.iniciativasCriadas).toBe(0);
    expect(dois.jaPromovidas).toBe(1);
    expect(await iniciativas.list(sql)).toHaveLength(1);
  });

  it('excluir a iniciativa devolve a ação ao estado autônomo, sem perdê-la', async () => {
    await zerar();
    const { acao } = await riscoMarcadoParaPromover({ risco: 'R', acoes: 'A' });
    await promoverTriagem(sql);
    const [ini] = await iniciativas.list(sql);

    await iniciativas.remove(sql, ini.id);

    const depois = await acoesRisco.byId(sql, acao.id);
    expect(depois).not.toBeNull();
    expect(depois?.iniciativa_id).toBeNull();
    // E aí ela volta a ser candidata a promoção — a reversão é completa.
    const r = await promoverTriagem(sql);
    expect(r.iniciativasCriadas).toBe(1);
  });
});

describe('promoverTriagem — o registro de risco sai como entrou', () => {
  it('não altera nenhum campo do risco', async () => {
    await zerar();
    await riscoMarcadoParaPromover({
      risco: 'Intocado na promoção',
      acoes: 'Uma ação',
      esforco: 4, impacto2: 3, gravidade: 5,
      recurso: 'PAGUE MENOS - SUPPLY',
      responsavel: 'KAUAN',
      status: 'EM ANDAMENTO',
      resultado: 'Algum resultado',
    });

    const antes = await listRecords(sql);
    await promoverTriagem(sql);
    const depois = await listRecords(sql);

    expect(depois).toEqual(antes);
  });
});
