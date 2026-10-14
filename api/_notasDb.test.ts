import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { Sql } from './_db.js';
import { ensureTudo } from './_schema.js';
import { MAX_ATTACHMENT_BYTES, base64Bytes } from './_attachmentsDb.js';
import {
  notas, criarImagemNota, lerImagemNota, validarNota, varrerImagensOrfas, MAX_TITULO_NOTA,
} from './_notasDb.js';
import { ENTIDADES, listPortfolio, validarEntidade } from './_portfolioDb.js';
import { notaImagemUrl } from '../src/lib/notaImagens.js';
import type { Nota, NotaImagem } from '../src/types.js';

// Postgres de verdade (pglite) e a sequência inteira do esquema, para o cascade
// e a varredura rodarem como em produção.
let pg: PGlite;
let sql: Sql;

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

beforeAll(async () => {
  pg = new PGlite();
  sql = async (text, params = []) => (await pg.query(text, params as unknown[])).rows as Record<string, unknown>[];
  await ensureTudo(sql, { semear: false });
});
afterAll(async () => { await pg.close(); });

const doc = (...content: unknown[]) => JSON.stringify({ type: 'doc', content });
const paragrafo = (texto: string) => ({ type: 'paragraph', content: [{ type: 'text', text: texto }] });
const imagem = (notaId: string, id: string) => ({ type: 'image', attrs: { src: notaImagemUrl(notaId, id), alt: 'print.png' } });

async function novaNota(titulo = 'Triagem'): Promise<Nota> {
  return notas.create(sql, { titulo, conteudo: doc(paragrafo('Meus')), autor: 'Teste', editado_por: 'Teste' });
}

async function subir(notaId: string): Promise<NotaImagem> {
  const r = await criarImagemNota(sql, notaId, { nome: 'print.png', mime: 'image/png', dados: PNG }, 'Teste');
  if (r.status !== 'ok') throw new Error('upload falhou: ' + r.status);
  return r.imagem;
}

/** Faz a imagem parecer antiga o bastante para a varredura. */
async function envelhecer(id: string, horas = 25) {
  await sql(`update nota_imagens set created_at = now() - make_interval(hours => $2) where id = $1`, [id, horas]);
}

describe('notas — a entidade', () => {
  it('é servida pela rota do portfólio mas fica fora do pacote', async () => {
    expect(ENTIDADES.notas).toBe(notas);
    const criada = await novaNota();
    expect(criada).toMatchObject({ titulo: 'Triagem', fixada: false, autor: 'Teste', version: 1 });
    expect(Object.keys(await listPortfolio(sql))).not.toContain('notas');
    expect((await notas.list(sql)).some(n => n.id === criada.id)).toBe(true);
  });

  it('atualiza com versão e devolve conflito com a linha do servidor', async () => {
    const n = await novaNota();
    const ok = await notas.update(sql, n.id, { fixada: true }, n.version);
    expect(ok.status).toBe('ok');
    const velho = await notas.update(sql, n.id, { titulo: 'Outro' }, n.version);
    expect(velho).toMatchObject({ status: 'conflict', item: { fixada: true, version: 2 } });
  });
});

describe('validarNota', () => {
  const atual = { id: '3b8a5924-3580-40b6-b02d-c8fec9f80cb5' } as Nota;

  it('aceita página vazia e documento sem imagem', () => {
    expect(validarNota({ titulo: '', conteudo: '' }, null)).toBeNull();
    expect(validarNota({ conteudo: doc(paragrafo('a')) }, null)).toBeNull();
    expect(validarNota({ fixada: true }, atual)).toBeNull();
  });

  it('recusa título longo e conteúdo que não é documento', () => {
    expect(validarNota({ titulo: 'x'.repeat(MAX_TITULO_NOTA + 1) }, null)).toMatch(/Título/);
    expect(validarNota({ titulo: 42 }, null)).toMatch(/Título/);
    expect(validarNota({ conteudo: 'texto solto' }, null)).toMatch(/inválido/);
    expect(validarNota({ conteudo: '{"type":"paragraph"}' }, null)).toMatch(/inválido/);
    expect(validarNota({ conteudo: 7 }, null)).toMatch(/inválido/);
    expect(validarNota({ conteudo: doc(paragrafo('x'.repeat(1_000_001))) }, null)).toMatch(/limite/);
  });

  it('só aceita imagem desta página, e só depois de a página existir', () => {
    const daPagina = doc(imagem(atual.id, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'));
    expect(validarNota({ conteudo: daPagina }, atual)).toBeNull();
    expect(validarNota({ conteudo: daPagina }, null)).toMatch(/Crie a página/);
    const outra = doc(imagem('11111111-2222-4333-8444-555555555555', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'));
    expect(validarNota({ conteudo: outra }, atual)).toMatch(/não pertence/);
    const remota = doc({ type: 'image', attrs: { src: 'https://exemplo.com/a.png' } });
    expect(validarNota({ conteudo: remota }, atual)).toMatch(/não pertence/);
    const embutida = doc({ type: 'image', attrs: { src: 'data:image/png;base64,' + PNG } });
    expect(validarNota({ conteudo: embutida }, atual)).toMatch(/não pertence/);
  });

  it('é a regra que validarEntidade aplica a notas', async () => {
    expect(await validarEntidade(sql, 'notas', { conteudo: 'x' }, null)).toMatch(/inválido/);
  });
});

describe('imagens da página', () => {
  it('recusa formato fora da lista, base64 inválido, acima do teto e página inexistente', async () => {
    const n = await novaNota();
    const avif = await criarImagemNota(sql, n.id, { mime: 'image/avif', dados: PNG }, 'T');
    expect(avif).toMatchObject({ status: 'invalid' });
    expect(avif.status === 'invalid' && avif.message).toBe('Formato não suportado — envie PNG, JPEG, WebP ou GIF.');
    expect(await criarImagemNota(sql, n.id, { mime: 'image/svg+xml', dados: PNG }, 'T')).toMatchObject({ status: 'invalid' });
    expect(await criarImagemNota(sql, n.id, { mime: 'image/png', dados: 'não é base64' }, 'T')).toMatchObject({ status: 'invalid' });
    const grande = 'A'.repeat(Math.ceil((MAX_ATTACHMENT_BYTES + 3) / 3) * 4);
    expect(await criarImagemNota(sql, n.id, { mime: 'image/png', dados: grande }, 'T')).toMatchObject({ status: 'invalid' });
    expect(await criarImagemNota(sql, '11111111-2222-4333-8444-555555555555', { mime: 'image/png', dados: PNG }, 'T'))
      .toEqual({ status: 'not_found' });
    expect(await criarImagemNota(sql, 'não-é-uuid', { mime: 'image/png', dados: PNG }, 'T')).toEqual({ status: 'not_found' });
  });

  it('grava, devolve o metadado sem bytes e só lê pela página dona', async () => {
    const a = await novaNota('A');
    const b = await novaNota('B');
    const img = await subir(a.id);
    expect(img).toEqual({ id: img.id, nome: 'print.png', mime: 'image/png', tamanho: base64Bytes(PNG) });
    expect(img).not.toHaveProperty('dados');
    expect((await lerImagemNota(sql, a.id, img.id))?.dados).toBe(PNG);
    expect(await lerImagemNota(sql, b.id, img.id)).toBeNull();
    expect(await lerImagemNota(sql, a.id, 'x')).toBeNull();
  });

  it('excluir a página leva as imagens junto', async () => {
    const n = await novaNota();
    const img = await subir(n.id);
    expect(await notas.remove(sql, n.id)).toBe(true);
    expect(await sql('select id from nota_imagens where id = $1', [img.id])).toHaveLength(0);
  });
});

describe('varredura de imagens sem citação', () => {
  it('apaga só a órfã antiga; mantém a citada, a recente e as de outra página', async () => {
    const n = await novaNota();
    const outra = await novaNota('Outra');
    const citada = await subir(n.id);
    const orfaVelha = await subir(n.id);
    const orfaNova = await subir(n.id);
    const deOutra = await subir(outra.id);
    await envelhecer(citada.id);
    await envelhecer(orfaVelha.id);
    await envelhecer(deOutra.id);

    const apagadas = await varrerImagensOrfas(sql, n.id, doc(imagem(n.id, citada.id)));
    expect(apagadas).toBe(1);
    const restantes = (await sql('select id from nota_imagens where nota_id in ($1, $2)', [n.id, outra.id])).map(r => r.id);
    expect(restantes.sort()).toEqual([citada.id, orfaNova.id, deOutra.id].sort());
  });

  it('documento vazio ou ilegível não apaga nada', async () => {
    const n = await novaNota();
    const img = await subir(n.id);
    await envelhecer(img.id);
    expect(await varrerImagensOrfas(sql, n.id, '')).toBe(0);
    expect(await varrerImagensOrfas(sql, n.id, 'lixo')).toBe(0);
    expect(await lerImagemNota(sql, n.id, img.id)).not.toBeNull();
  });

  it('roda quando a gravação traz o documento, e só então', async () => {
    const n = await novaNota();
    const img = await subir(n.id);
    await envelhecer(img.id);
    const soFixar = await notas.update(sql, n.id, { fixada: true }, n.version);
    expect(soFixar.status).toBe('ok');
    expect(await lerImagemNota(sql, n.id, img.id)).not.toBeNull();
    const semImagem = await notas.update(sql, n.id, { conteudo: doc(paragrafo('sem imagem')) });
    expect(semImagem.status).toBe('ok');
    expect(await lerImagemNota(sql, n.id, img.id)).toBeNull();
  });

  it('conflito de versão não varre', async () => {
    const n = await novaNota();
    const img = await subir(n.id);
    await envelhecer(img.id);
    await notas.update(sql, n.id, { fixada: true }, n.version);
    const r = await notas.update(sql, n.id, { conteudo: doc(paragrafo('x')) }, n.version);
    expect(r.status).toBe('conflict');
    expect(await lerImagemNota(sql, n.id, img.id)).not.toBeNull();
  });
});
