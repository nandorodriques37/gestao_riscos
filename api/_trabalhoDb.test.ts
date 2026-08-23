import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createRecord, type Sql } from './_db.js';
import { ensureTudo } from './_schema.js';
import { acoesRisco } from './_portfolioDb.js';
import { listTasks, createTask, updateTaskById, deleteTaskById } from './_tasksDb.js';
import type { StoredTask } from '../src/types.js';
import { statusParaAcao, statusParaQuadro, unificarTrabalho } from './_trabalhoDb.js';

let pg: PGlite;
let sql: Sql;

beforeAll(async () => {
  pg = new PGlite();
  sql = async (text, params = []) => {
    const result = await pg.query(text, params as unknown[]);
    return result.rows as Record<string, unknown>[];
  };
  await ensureTudo(sql, { semear: true });
});

afterAll(async () => {
  await pg.close();
});

async function zerar() {
  await sql('delete from tasks');
  await sql('delete from acoes_risco');
  await sql('delete from risk_records');
}

describe('status — dois vocabulários, uma coluna', () => {
  it('traduz nos dois sentidos', () => {
    expect(statusParaQuadro('aberta')).toBe('A fazer');
    expect(statusParaQuadro('em_andamento')).toBe('Em andamento');
    expect(statusParaQuadro('concluida')).toBe('Concluída');
    expect(statusParaAcao('A fazer')).toBe('aberta');
    expect(statusParaAcao('Concluída')).toBe('concluida');
  });

  it('cancelada existe dos dois lados — a ação já tinha, o quadro passa a ter', () => {
    expect(statusParaQuadro('cancelada')).toBe('Cancelada');
    expect(statusParaAcao('Cancelada')).toBe('cancelada');
  });

  it('valor desconhecido atravessa intacto, nos dois sentidos', () => {
    // O quadro sempre teve status de texto livre. Um mapa que devolve vazio no
    // que não reconhece apagaria o dado de quem digitou fora da lista.
    expect(statusParaQuadro('Aguardando terceiro')).toBe('Aguardando terceiro');
    expect(statusParaAcao('Aguardando terceiro')).toBe('Aguardando terceiro');
    expect(statusParaQuadro('')).toBe('');
    expect(statusParaAcao('')).toBe('');
  });
});

describe('projeção — a mitigação lida e escrita sobre `tasks`', () => {
  beforeEach(zerar);

  it('grava e devolve todos os campos da ação, sem perder nenhum no caminho', async () => {
    const risco = await createRecord(sql, { risco: 'Ruptura' });
    const criada = await acoesRisco.create(sql, {
      risco_id: risco.id,
      descricao: 'Revisar política de estoque',
      prazo: '2026-09-30',
      indicador_sucesso: 'Cobertura acima de 30 dias',
      status: 'em_andamento',
      triagem: 'acao',
    });

    expect(criada).toMatchObject({
      risco_id: risco.id,
      descricao: 'Revisar política de estoque',
      prazo: '2026-09-30',
      indicador_sucesso: 'Cobertura acima de 30 dias',
      status: 'em_andamento',
      triagem: 'acao',
      iniciativa_id: null,
      dono_id: null,
    });

    const lida = await acoesRisco.byId(sql, criada.id);
    expect(lida).toEqual(criada);
    expect(await acoesRisco.list(sql)).toEqual([criada]);
  });

  it('a descrição da ação é o título da tarefa — mesma linha, dois nomes', async () => {
    const risco = await createRecord(sql, { risco: 'R' });
    const acao = await acoesRisco.create(sql, { risco_id: risco.id, descricao: 'Mapear processo' });
    const linha = await sql('select tarefa, status from tasks where id = $1', [acao.id]);
    expect(linha[0].tarefa).toBe('Mapear processo');
  });

  it('o status vai para a coluna no vocabulário do quadro', async () => {
    const risco = await createRecord(sql, { risco: 'R' });
    const acao = await acoesRisco.create(sql, {
      risco_id: risco.id, descricao: 'X', status: 'concluida',
    });
    const linha = await sql('select status from tasks where id = $1', [acao.id]);
    expect(linha[0].status).toBe('Concluída');
    expect((await acoesRisco.byId(sql, acao.id))?.status).toBe('concluida');
  });

  it('não enxerga tarefa livre — tarefa do quadro não é mitigação', async () => {
    await createTask(sql, { tarefa: 'Comprar café', status: 'A fazer' });
    expect(await acoesRisco.list(sql)).toEqual([]);
  });

  it('atualiza campo a campo e devolve a linha nova', async () => {
    const risco = await createRecord(sql, { risco: 'R' });
    const acao = await acoesRisco.create(sql, { risco_id: risco.id, descricao: 'Antes' });
    const r = await acoesRisco.update(sql, acao.id, { descricao: 'Depois', status: 'concluida' });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.item.descricao).toBe('Depois');
    expect(r.item.status).toBe('concluida');
    expect(r.item.version).toBe(acao.version + 1);
  });

  it('respeita a concorrência otimista', async () => {
    const risco = await createRecord(sql, { risco: 'R' });
    const acao = await acoesRisco.create(sql, { risco_id: risco.id, descricao: 'A' });
    const ok = await acoesRisco.update(sql, acao.id, { descricao: 'B' }, acao.version);
    expect(ok.status).toBe('ok');
    // A versão que o segundo editor tinha em mãos já não é a do banco.
    const conflito = await acoesRisco.update(sql, acao.id, { descricao: 'C' }, acao.version);
    expect(conflito.status).toBe('conflict');
    expect(await acoesRisco.byId(sql, acao.id)).toMatchObject({ descricao: 'B' });
  });

  it('descarta campo fora da allowlist', async () => {
    const risco = await createRecord(sql, { risco: 'R' });
    const acao = await acoesRisco.create(sql, { risco_id: risco.id, descricao: 'A' });
    // `g` é da tarefa, não da mitigação: não pode entrar por aqui.
    const r = await acoesRisco.update(sql, acao.id, { g: 5, descricao: 'B' });
    expect(r.status).toBe('ok');
    const linha = await sql('select g from tasks where id = $1', [acao.id]);
    expect(linha[0].g).toBeNull();
  });

  it('remover apaga a linha, e só se ela for mitigação', async () => {
    const risco = await createRecord(sql, { risco: 'R' });
    const acao = await acoesRisco.create(sql, { risco_id: risco.id, descricao: 'A' });
    const livre = await createTask(sql, { tarefa: 'Livre' });
    expect(await acoesRisco.remove(sql, acao.id)).toBe(true);
    expect(await acoesRisco.remove(sql, livre.id)).toBe(false);
    expect(await sql('select id from tasks where id = $1', [livre.id])).toHaveLength(1);
  });
});

describe('quadro — uma lista só', () => {
  beforeEach(zerar);

  it('mostra tarefa livre e mitigação juntas, com o vínculo em cada linha', async () => {
    const risco = await createRecord(sql, { risco: 'R' });
    await acoesRisco.create(sql, {
      risco_id: risco.id, descricao: 'Mitigação', prazo: '2026-10-31', status: 'em_andamento',
    });
    await createTask(sql, { tarefa: 'Tarefa livre' });

    const linhas = await listTasks(sql);
    expect(linhas.map(t => t.tarefa).sort()).toEqual(['Mitigação', 'Tarefa livre']);

    const mitigacao = linhas.find(t => t.tarefa === 'Mitigação')!;
    expect(mitigacao.risco_id).toBe(risco.id);
    expect(mitigacao.prazo).toBe('2026-10-31');
    // O quadro lê no vocabulário dele, não no da ação.
    expect(mitigacao.status).toBe('Em andamento');

    expect(linhas.find(t => t.tarefa === 'Tarefa livre')!.risco_id).toBeNull();
  });

  it('o quadro escreve prazo, mas não desvincula: `risco_id` fica fora da allowlist', async () => {
    const risco = await createRecord(sql, { risco: 'R' });
    const acao = await acoesRisco.create(sql, { risco_id: risco.id, descricao: 'Mitigação' });

    await updateTaskById(sql, acao.id, {
      prazo: '2026-11-30',
      // Vem junto num PATCH que mande o objeto inteiro — e tem de ser ignorado.
      risco_id: null,
    } as Partial<StoredTask>);

    const depois = (await listTasks(sql)).find(t => t.id === acao.id)!;
    expect(depois.prazo).toBe('2026-11-30');
    expect(depois.risco_id).toBe(risco.id);
  });
});

describe('unificarTrabalho — a cópia única', () => {
  beforeEach(async () => {
    await zerar();
    await sql('delete from migracoes');
  });

  /** Insere direto na tabela congelada, que é a origem da cópia. */
  async function acaoCongelada(riscoId: string, descricao: string, status = 'em_andamento') {
    const rows = await sql(
      `insert into acoes_risco (risco_id, descricao, status, triagem, indicador_sucesso, prazo)
       values ($1, $2, $3, 'acao', 'Indicador', '2026-12-31') returning id`,
      [riscoId, descricao, status],
    );
    return String(rows[0].id);
  }

  it('copia preservando o id — é o que mantém a trilha de auditoria válida', async () => {
    const risco = await createRecord(sql, { risco: 'R' });
    const id = await acaoCongelada(risco.id, 'Veio do congelado');

    const r = await unificarTrabalho(sql);
    expect(r).toEqual({ jaExecutada: false, copiadas: 1 });

    const lida = await acoesRisco.byId(sql, id);
    expect(lida).toMatchObject({
      id,
      descricao: 'Veio do congelado',
      status: 'em_andamento',
      triagem: 'acao',
      indicador_sucesso: 'Indicador',
      prazo: '2026-12-31',
      risco_id: risco.id,
    });
  });

  it('roda uma vez só — a segunda chamada não copia nada', async () => {
    const risco = await createRecord(sql, { risco: 'R' });
    await acaoCongelada(risco.id, 'Uma');
    await unificarTrabalho(sql);
    expect(await unificarTrabalho(sql)).toEqual({ jaExecutada: true, copiadas: 0 });
    expect(await acoesRisco.list(sql)).toHaveLength(1);
  });

  it('não ressuscita mitigação excluída depois da cópia', async () => {
    const risco = await createRecord(sql, { risco: 'R' });
    const id = await acaoCongelada(risco.id, 'Excluída de propósito');
    await unificarTrabalho(sql);

    await acoesRisco.remove(sql, id);
    await unificarTrabalho(sql);

    // Sem a marca, a linha voltaria do congelado a cada requisição — e o
    // gestor veria reaparecer o que acabou de apagar.
    expect(await acoesRisco.byId(sql, id)).toBeNull();
  });

  it('traduz o status na cópia', async () => {
    const risco = await createRecord(sql, { risco: 'R' });
    const cancelada = await acaoCongelada(risco.id, 'Cancelada', 'cancelada');
    await unificarTrabalho(sql);
    const linha = await sql('select status from tasks where id = $1', [cancelada]);
    expect(linha[0].status).toBe('Cancelada');
    expect((await acoesRisco.byId(sql, cancelada))?.status).toBe('cancelada');
  });

  it('a mitigação copiada entra no fim da fila do quadro, sem colidir de posição', async () => {
    const risco = await createRecord(sql, { risco: 'R' });
    await createTask(sql, { tarefa: 'Já estava no quadro' });
    await acaoCongelada(risco.id, 'Primeira');
    await acaoCongelada(risco.id, 'Segunda');
    await unificarTrabalho(sql);

    const posicoes = await sql('select position from tasks order by position asc');
    expect(posicoes.map(p => Number(p.position))).toEqual([0, 1, 2]);
  });
});

/**
 * O resumo em `risk_records.acoes` é derivado, e é o que a tabela do Registro,
 * a busca, os Gráficos, o CSV e o KPI de completude leem. Enquanto só o modal
 * do risco editava mitigação, derivar lá bastava; desde que o quadro passou a
 * renomear e excluir a mesma linha, duas telas escrevem e o resumo tem de sair
 * de quem grava, não de quem desenha.
 */
describe('resumo do plano — derivado a cada escrita', () => {
  beforeEach(zerar);

  async function resumo(riscoId: string): Promise<string> {
    const rows = await sql('select acoes from risk_records where id = $1', [riscoId]);
    return String(rows[0]?.acoes ?? '');
  }

  it('criar mitigação entra no resumo do risco', async () => {
    const risco = await createRecord(sql, { risco: 'R' });
    await acoesRisco.create(sql, { risco_id: risco.id, descricao: 'Primeira' });
    await acoesRisco.create(sql, { risco_id: risco.id, descricao: 'Segunda' });
    expect(await resumo(risco.id)).toBe('Primeira · Segunda');
  });

  it('renomear PELO QUADRO atualiza o resumo — era aqui que o registro mentia', async () => {
    const risco = await createRecord(sql, { risco: 'R' });
    const acao = await acoesRisco.create(sql, { risco_id: risco.id, descricao: 'Nome antigo' });

    await updateTaskById(sql, acao.id, { tarefa: 'Nome novo' });

    expect(await resumo(risco.id)).toBe('Nome novo');
  });

  it('excluir pelo quadro tira do resumo', async () => {
    const risco = await createRecord(sql, { risco: 'R' });
    const fica = await acoesRisco.create(sql, { risco_id: risco.id, descricao: 'Fica' });
    const sai = await acoesRisco.create(sql, { risco_id: risco.id, descricao: 'Sai' });

    await deleteTaskById(sql, sai.id);

    expect(await resumo(risco.id)).toBe('Fica');
    expect(await acoesRisco.byId(sql, fica.id)).not.toBeNull();
  });

  it('cancelada sai do resumo, sem sair do plano', async () => {
    const risco = await createRecord(sql, { risco: 'R' });
    await acoesRisco.create(sql, { risco_id: risco.id, descricao: 'Vale' });
    const morta = await acoesRisco.create(sql, { risco_id: risco.id, descricao: 'Cancelada' });

    await acoesRisco.update(sql, morta.id, { status: 'cancelada' });

    expect(await resumo(risco.id)).toBe('Vale');
    expect(await acoesRisco.byId(sql, morta.id)).not.toBeNull();
  });

  it('tarefa livre não mexe em resumo nenhum', async () => {
    const risco = await createRecord(sql, { risco: 'R' });
    await acoesRisco.create(sql, { risco_id: risco.id, descricao: 'Mitigação' });
    const livre = await createTask(sql, { tarefa: 'Comprar café' });

    await updateTaskById(sql, livre.id, { tarefa: 'Comprar chá' });
    await deleteTaskById(sql, livre.id);

    expect(await resumo(risco.id)).toBe('Mitigação');
  });

  it('não bumpa a versão do risco: o resumo não é edição de ninguém', async () => {
    // Bumpar faria conflitar a gravação de quem estivesse com o risco aberto,
    // por uma mudança que essa pessoa não fez.
    const risco = await createRecord(sql, { risco: 'R' });
    const antes = (await sql('select version from risk_records where id = $1', [risco.id]))[0].version;
    await acoesRisco.create(sql, { risco_id: risco.id, descricao: 'Nova' });
    const depois = (await sql('select version from risk_records where id = $1', [risco.id]))[0].version;
    expect(depois).toBe(antes);
  });
});
