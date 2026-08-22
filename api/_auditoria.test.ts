import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { Sql } from './_db.js';
import {
  ensureAuditoriaSchema, registrarCriacao, registrarAlteracao, registrarExclusao,
  listarAuditoria, autorDaRequisicao, AUTOR_DESCONHECIDO,
} from './_auditoria.js';

let pg: PGlite;
let sql: Sql;

beforeAll(async () => {
  pg = new PGlite();
  sql = async (text, params = []) => {
    const r = await pg.query(text, params as unknown[]);
    return r.rows as Record<string, unknown>[];
  };
  await ensureAuditoriaSchema(sql);
});

afterAll(async () => { await pg.close(); });

const ID = '11111111-1111-1111-1111-111111111111';
const OUTRO = '22222222-2222-2222-2222-222222222222';

async function limpar() {
  await sql('delete from auditoria');
}

describe('autorDaRequisicao', () => {
  it('lê o nome do cabeçalho', () => {
    expect(autorDaRequisicao({ 'x-autor': 'Fernando' })).toBe('Fernando');
  });

  it('decodifica acento — o cabeçalho não aceita latin-1 cru', () => {
    expect(autorDaRequisicao({ 'x-autor': encodeURIComponent('João Fernando') }))
      .toBe('João Fernando');
  });

  it('sem cabeçalho, ninguém é responsabilizado por engano', () => {
    expect(autorDaRequisicao({})).toBe(AUTOR_DESCONHECIDO);
    expect(autorDaRequisicao({ 'x-autor': '   ' })).toBe(AUTOR_DESCONHECIDO);
  });

  it('não deixa um cabeçalho gigante entupir a coluna', () => {
    expect(autorDaRequisicao({ 'x-autor': 'x'.repeat(500) })).toHaveLength(80);
  });

  it('aguenta um valor mal codificado sem estourar', () => {
    expect(autorDaRequisicao({ 'x-autor': '%E0%A4%A' })).toBe('%E0%A4%A');
  });
});

describe('registro de alterações', () => {
  it('grava uma linha por campo auditado que mudou', async () => {
    await limpar();
    const antes = { id: ID, risco: 'Ruptura de gôndola', situacao: 'validado', probab: 4, obs: 'x' };
    await registrarAlteracao(sql, 'risk_records', antes, {
      situacao: 'mitigado', probab: 2,
    }, 'Fernando');

    const linhas = await listarAuditoria(sql, { registroId: ID });
    expect(linhas).toHaveLength(2);
    const porCampo = new Map(linhas.map(l => [l.campo, l]));
    expect(porCampo.get('situacao')).toMatchObject({
      acao: 'alterou', de: 'validado', para: 'mitigado', autor: 'Fernando',
      rotulo: 'Ruptura de gôndola',
    });
    expect(porCampo.get('probab')).toMatchObject({ de: '4', para: '2' });
  });

  it('campo fora da lista não vira histórico — a trilha não é despejo de digitação', async () => {
    await limpar();
    await registrarAlteracao(sql, 'risk_records',
      { id: ID, obs: 'antes', causa_raiz: 'antes' },
      { obs: 'depois', causa_raiz: 'depois' }, 'Fernando');
    expect(await listarAuditoria(sql, { registroId: ID })).toEqual([]);
  });

  it('campo auditado que não mudou não vira linha', async () => {
    await limpar();
    await registrarAlteracao(sql, 'risk_records',
      { id: ID, situacao: 'validado' }, { situacao: 'validado' }, 'Fernando');
    expect(await listarAuditoria(sql, { registroId: ID })).toEqual([]);
  });

  it('campo ausente do patch não vira linha, mesmo sendo auditado', async () => {
    await limpar();
    await registrarAlteracao(sql, 'risk_records',
      { id: ID, situacao: 'validado', probab: 4 }, { probab: 5 }, 'Fernando');
    const linhas = await listarAuditoria(sql, { registroId: ID });
    expect(linhas.map(l => l.campo)).toEqual(['probab']);
  });

  it('vazio e nulo são o mesmo valor — trocar um pelo outro não é mudança', async () => {
    await limpar();
    await registrarAlteracao(sql, 'risk_records',
      { id: ID, situacao: '' }, { situacao: null }, 'Fernando');
    expect(await listarAuditoria(sql, { registroId: ID })).toEqual([]);
  });

  it('preencher um campo antes vazio é mudança', async () => {
    await limpar();
    await registrarAlteracao(sql, 'risk_records',
      { id: ID, situacao: '' }, { situacao: 'mitigado' }, 'Fernando');
    const [linha] = await listarAuditoria(sql, { registroId: ID });
    expect(linha).toMatchObject({ de: null, para: 'mitigado' });
  });

  it('tabela sem lista de auditoria é ignorada em silêncio', async () => {
    await limpar();
    await registrarAlteracao(sql, 'tabela_qualquer', { id: ID, x: 1 }, { x: 2 }, 'Fernando');
    expect(await listarAuditoria(sql, {})).toEqual([]);
  });

  it('booleano vira sim/não, não true/false', async () => {
    await limpar();
    await registrarAlteracao(sql, 'pessoas',
      { id: ID, nome: 'Ana', ativo: true }, { ativo: false }, 'Fernando');
    const [linha] = await listarAuditoria(sql, { registroId: ID });
    expect(linha).toMatchObject({ de: 'sim', para: 'não' });
  });

  it('data vira YYYY-MM-DD, não um ISO com fuso', async () => {
    await limpar();
    await registrarAlteracao(sql, 'marcos',
      { id: ID, nome: 'M1', data_real: null },
      { data_real: new Date('2026-06-15T00:00:00Z') }, 'Fernando');
    const [linha] = await listarAuditoria(sql, { registroId: ID });
    expect(linha.para).toBe('2026-06-15');
  });
});

describe('criação e exclusão', () => {
  it('criação guarda o rótulo do registro', async () => {
    await limpar();
    await registrarCriacao(sql, 'iniciativas', { id: ID, nome: 'Torre de controle' }, 'Fernando');
    const [linha] = await listarAuditoria(sql, { registroId: ID });
    expect(linha).toMatchObject({ acao: 'criou', campo: null, rotulo: 'Torre de controle' });
  });

  it('exclusão sobrevive ao registro — o rótulo fica gravado na trilha', async () => {
    await limpar();
    await registrarExclusao(sql, 'pessoas', { id: ID, nome: 'Alguém que saiu' }, 'Fernando');
    const [linha] = await listarAuditoria(sql, { registroId: ID });
    expect(linha).toMatchObject({ acao: 'excluiu', rotulo: 'Alguém que saiu' });
  });

  it('registro sem id não gera linha órfã', async () => {
    await limpar();
    await registrarCriacao(sql, 'iniciativas', { nome: 'Sem id' }, 'Fernando');
    expect(await listarAuditoria(sql, {})).toEqual([]);
  });
});

describe('leitura', () => {
  it('filtra por registro e por tabela', async () => {
    await limpar();
    await registrarCriacao(sql, 'iniciativas', { id: ID, nome: 'A' }, 'Fernando');
    await registrarCriacao(sql, 'objetivos', { id: OUTRO, descricao: 'B' }, 'Fernando');

    expect(await listarAuditoria(sql, { registroId: ID })).toHaveLength(1);
    expect(await listarAuditoria(sql, { tabela: 'objetivos' })).toHaveLength(1);
    expect(await listarAuditoria(sql, {})).toHaveLength(2);
  });

  it('devolve do mais recente para o mais antigo', async () => {
    await limpar();
    await registrarAlteracao(sql, 'risk_records',
      { id: ID, situacao: '' }, { situacao: 'hipotese' }, 'Ana');
    await new Promise(r => setTimeout(r, 5));
    await registrarAlteracao(sql, 'risk_records',
      { id: ID, situacao: 'hipotese' }, { situacao: 'validado' }, 'Bruno');

    const linhas = await listarAuditoria(sql, { registroId: ID });
    expect(linhas.map(l => l.para)).toEqual(['validado', 'hipotese']);
  });

  it('o limite é sempre aplicado, mesmo pedido absurdo', async () => {
    await limpar();
    for (let i = 0; i < 12; i++) {
      await registrarCriacao(sql, 'iniciativas', { id: ID, nome: `n${i}` }, 'Fernando');
    }
    expect(await listarAuditoria(sql, { limite: 5 })).toHaveLength(5);
    expect(await listarAuditoria(sql, { limite: 99999 })).toHaveLength(12);
    expect(await listarAuditoria(sql, { limite: 0 })).toHaveLength(1);
  });
});
