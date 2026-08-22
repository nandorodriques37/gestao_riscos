import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { makeTable, toDateISO } from './_table.js';
import type { Sql } from './_db.js';

// Testa a fábrica contra um Postgres real (pglite, em memória) — a mesma
// engine de produção (Neon). O que interessa aqui é o que um mock não provaria:
// DDL idempotente, versão otimista de verdade e, principalmente, a conversão
// das colunas `date`, onde cada driver entrega o valor de um jeito.
let pg: PGlite;
let sql: Sql;

interface Bicho {
  id: string;
  nome: string;
  peso: number | null;
  nascimento: string | null;
  ativo: boolean;
  dono_id: string | null;
  version: number;
  updated_at: string;
}

const donos = makeTable<{ id: string; nome: string; version: number; updated_at: string }>({
  nome: 't_donos',
  campos: [{ nome: 'nome', tipo: 'text' }],
});

const bichos = makeTable<Bicho>({
  nome: 't_bichos',
  ordenavel: true,
  indices: ['dono_id'],
  campos: [
    { nome: 'nome', tipo: 'text' },
    { nome: 'peso', tipo: 'numeric' },
    { nome: 'nascimento', tipo: 'date' },
    { nome: 'ativo', tipo: 'bool', padrao: true },
    { nome: 'dono_id', tipo: 'uuid', ref: { tabela: 't_donos', onDelete: 'set null' } },
  ],
});

beforeAll(async () => {
  pg = new PGlite();
  sql = async (text, params = []) => {
    const result = await pg.query(text, params as unknown[]);
    return result.rows as Record<string, unknown>[];
  };
  await donos.ensure(sql);
  await bichos.ensure(sql);
});

afterAll(async () => {
  await pg.close();
});

describe('toDateISO', () => {
  it('devolve null para vazio e nulo', () => {
    expect(toDateISO(null)).toBeNull();
    expect(toDateISO(undefined)).toBeNull();
    expect(toDateISO('')).toBeNull();
  });

  it('corta o horário de uma string ISO completa', () => {
    expect(toDateISO('2026-03-31T00:00:00.000Z')).toBe('2026-03-31');
  });

  it('lê o dia pelo lado UTC quando o Date está à meia-noite UTC', () => {
    // Como o pglite entrega. Ler com getFullYear() num fuso a oeste devolveria
    // o dia anterior.
    expect(toDateISO(new Date('2026-03-31T00:00:00.000Z'))).toBe('2026-03-31');
  });

  it('lê o dia pelo lado local quando o Date está à meia-noite local', () => {
    // Como o node-postgres entrega. Aqui é toISOString() que erraria.
    const local = new Date(2026, 2, 31, 0, 0, 0);
    expect(toDateISO(local)).toBe('2026-03-31');
  });

  it('ignora Date inválido', () => {
    expect(toDateISO(new Date('nada'))).toBeNull();
  });
});

describe('makeTable — DDL', () => {
  it('ensure roda duas vezes sem erro', async () => {
    await bichos.ensure(sql);
    await bichos.ensure(sql);
    const rows = await sql(
      "select column_name from information_schema.columns where table_name = 't_bichos'",
    );
    const cols = rows.map(r => String(r.column_name));
    expect(cols).toEqual(expect.arrayContaining([
      'id', 'position', 'nome', 'peso', 'nascimento', 'ativo', 'dono_id',
      'created_at', 'updated_at', 'version',
    ]));
  });

  it('acrescenta coluna nova a uma tabela já existente', async () => {
    const v2 = makeTable({
      nome: 't_bichos',
      ordenavel: true,
      campos: [
        { nome: 'nome', tipo: 'text' },
        { nome: 'apelido', tipo: 'text' },
      ],
    });
    await v2.ensure(sql);
    const rows = await sql(
      "select column_name from information_schema.columns where table_name = 't_bichos' and column_name = 'apelido'",
    );
    expect(rows).toHaveLength(1);
  });
});

describe('makeTable — conversão de valores', () => {
  it('texto ausente vira string vazia, numérico e data viram null', async () => {
    const b = await bichos.create(sql, { nome: 'Rex' });
    expect(b.nome).toBe('Rex');
    expect(b.peso).toBeNull();
    expect(b.nascimento).toBeNull();
    expect(b.dono_id).toBeNull();
    expect(b.version).toBe(1);
  });

  it('bool sem valor cai no padrão da coluna', async () => {
    const b = await bichos.create(sql, { nome: 'Padrão' });
    expect(b.ativo).toBe(true);
    const desligado = await bichos.create(sql, { nome: 'Desligado', ativo: false });
    expect(desligado.ativo).toBe(false);
  });

  it('data faz round-trip como YYYY-MM-DD, sem escorregar de dia', async () => {
    const b = await bichos.create(sql, { nome: 'Datado', nascimento: '2026-03-31' });
    expect(b.nascimento).toBe('2026-03-31');
    const lido = await bichos.byId(sql, b.id);
    expect(lido?.nascimento).toBe('2026-03-31');
    const listado = (await bichos.list(sql)).find(x => x.id === b.id);
    expect(listado?.nascimento).toBe('2026-03-31');
  });

  it('string vazia em data e número vira null, não erro de cast', async () => {
    const b = await bichos.create(sql, { nome: 'Vazios', nascimento: '', peso: '' });
    expect(b.nascimento).toBeNull();
    expect(b.peso).toBeNull();
  });

  it('numérico chega como number, não string', async () => {
    const b = await bichos.create(sql, { nome: 'Pesado', peso: 12.5 });
    expect(b.peso).toBe(12.5);
    const lido = await bichos.byId(sql, b.id);
    expect(lido?.peso).toBe(12.5);
  });

  it('chave estrangeira grava e volta como id, e vazio vira null', async () => {
    const dono = await donos.create(sql, { nome: 'Ana' });
    const comDono = await bichos.create(sql, { nome: 'Com dono', dono_id: dono.id });
    expect(comDono.dono_id).toBe(dono.id);
    const semDono = await bichos.create(sql, { nome: 'Sem dono', dono_id: '' });
    expect(semDono.dono_id).toBeNull();
  });

  it('expõe updated_at, que a métrica de iniciativa parada consome', async () => {
    const b = await bichos.create(sql, { nome: 'Carimbado' });
    expect(b.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('makeTable — ordem e CRUD', () => {
  it('list devolve na ordem de inserção quando ordenável', async () => {
    const nomes = ['Ordem A', 'Ordem B', 'Ordem C'];
    for (const nome of nomes) await bichos.create(sql, { nome });
    const lista = (await bichos.list(sql)).map(b => b.nome).filter(n => n.startsWith('Ordem '));
    expect(lista).toEqual(nomes);
  });

  it('remove devolve false para id inexistente', async () => {
    const ok = await bichos.remove(sql, '00000000-0000-0000-0000-000000000000');
    expect(ok).toBe(false);
  });

  it('byId devolve null para id inexistente', async () => {
    expect(await bichos.byId(sql, '00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('descarta do patch o que não é campo da tabela', async () => {
    const b = await bichos.create(sql, { nome: 'Intruso' });
    const r = await bichos.update(sql, b.id, { nome: 'Trocado', hackeado: 'x', version: 99 });
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.item.nome).toBe('Trocado');
      expect(r.item.version).toBe(2);
    }
  });

  it('patch sem nenhum campo válido devolve o registro atual sem gravar', async () => {
    const b = await bichos.create(sql, { nome: 'Intocado' });
    const r = await bichos.update(sql, b.id, { soLixo: 1 });
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.item.version).toBe(1);
  });
});

describe('makeTable — concorrência otimista', () => {
  it('sem expectedVersion, atualiza e incrementa a versão', async () => {
    const b = await bichos.create(sql, { nome: 'A' });
    const r = await bichos.update(sql, b.id, { nome: 'B' });
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.item.version).toBe(2);
  });

  it('com expectedVersion correto, atualiza normalmente', async () => {
    const b = await bichos.create(sql, { nome: 'A' });
    const r = await bichos.update(sql, b.id, { nome: 'B' }, b.version);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.item.nome).toBe('B');
  });

  it('com expectedVersion desatualizado devolve conflict com o valor do servidor', async () => {
    const b = await bichos.create(sql, { nome: 'original' });
    await bichos.update(sql, b.id, { nome: 'de outro usuário' });
    const r = await bichos.update(sql, b.id, { nome: 'minha edição' }, b.version);
    expect(r.status).toBe('conflict');
    if (r.status === 'conflict') {
      expect(r.item.nome).toBe('de outro usuário');
      expect(r.item.version).toBe(2);
    }
  });

  it('a gravação perdedora não é aplicada no banco', async () => {
    const b = await bichos.create(sql, { nome: 'original' });
    await bichos.update(sql, b.id, { nome: 'primeiro' });
    await bichos.update(sql, b.id, { nome: 'não deveria aparecer' }, b.version);
    const lido = await bichos.byId(sql, b.id);
    expect(lido?.nome).toBe('primeiro');
  });

  it('devolve not_found para id inexistente', async () => {
    const r = await bichos.update(sql, '00000000-0000-0000-0000-000000000000', { nome: 'X' });
    expect(r.status).toBe('not_found');
  });
});

describe('makeTable — chave estrangeira', () => {
  it('on delete set null solta o filho em vez de apagá-lo', async () => {
    const dono = await donos.create(sql, { nome: 'Some' });
    const bicho = await bichos.create(sql, { nome: 'Órfão', dono_id: dono.id });
    await donos.remove(sql, dono.id);
    const lido = await bichos.byId(sql, bicho.id);
    expect(lido).not.toBeNull();
    expect(lido?.dono_id).toBeNull();
  });
});
