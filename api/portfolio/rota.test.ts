import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { segmentosDaUrl } from '../_portfolioRoute.js';

// Este teste existe por causa de um bug de produção: a rota lia os segmentos
// de `req.query.path`, que a Vercel preenchia ou não dependendo de qual arquivo
// ela escolhia para servir. Quando não preencheu, `/api/portfolio/backup`
// devolveu o pacote de listas no lugar do backup — sem erro, sem log, resposta
// 200 com o conteúdo errado. Ler da URL é o que torna as duas rotas
// equivalentes.
describe('segmentosDaUrl', () => {
  it('devolve vazio no caminho base, com ou sem barra final', () => {
    expect(segmentosDaUrl('/api/portfolio')).toEqual([]);
    expect(segmentosDaUrl('/api/portfolio/')).toEqual([]);
  });

  it('separa os segmentos do sub-caminho', () => {
    expect(segmentosDaUrl('/api/portfolio/backup')).toEqual(['backup']);
    expect(segmentosDaUrl('/api/portfolio/iniciativas')).toEqual(['iniciativas']);
    expect(segmentosDaUrl('/api/portfolio/marcos/abc-123'))
      .toEqual(['marcos', 'abc-123']);
  });

  it('ignora a query string', () => {
    expect(segmentosDaUrl('/api/portfolio/backup?anexos=1')).toEqual(['backup']);
    expect(segmentosDaUrl('/api/portfolio?x=1')).toEqual([]);
  });

  it('aceita URL absoluta', () => {
    expect(segmentosDaUrl('https://exemplo.vercel.app/api/portfolio/pessoas'))
      .toEqual(['pessoas']);
  });

  it('decodifica o segmento', () => {
    expect(segmentosDaUrl('/api/portfolio/acoes_risco/a%20b'))
      .toEqual(['acoes_risco', 'a b']);
  });

  it('não estoura com url ausente', () => {
    expect(segmentosDaUrl(undefined)).toEqual([]);
    expect(segmentosDaUrl('')).toEqual([]);
  });
});

/**
 * O nome do arquivo de rota é contrato com a Vercel, e este projeto já se
 * queimou nele duas vezes. Catch-all — `[...path].ts` e a variante opcional
 * `[[...path]].ts`, do Next.js — NÃO é expandido nas funções avulsas deste
 * projeto: casava `/api/portfolio/x` e parava aí, então
 * `/api/portfolio/:entidade/:id` devolvia 404 na borda, sem invocar a função,
 * sem log, e com todo PATCH e DELETE do portfólio quebrado em produção
 * enquanto o `npm run dev` seguia verde — lá quem casa a rota é o regex do
 * vite-plugin-dev-api.
 *
 * O que funciona é pasta dinâmica: `api/portfolio/[entidade]/[id].ts`, do
 * mesmo formato de `api/tasks/[id]/anexos.ts`, que já rodava em produção.
 *
 * Nenhum teste de unidade alcança o roteador da Vercel. O que dá para travar é
 * o nome do arquivo.
 */
describe('convenção de nome das rotas', () => {
  function arquivosDeRota(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap(e => (
      e.isDirectory() ? arquivosDeRota(join(dir, e.name)) : [join(dir, e.name)]
    ));
  }

  it('não usa catch-all em nenhuma rota', () => {
    const comCatchAll = arquivosDeRota('api').filter(f => f.includes('[...'));
    expect(comCatchAll).toEqual([]);
  });

  it('mantém uma rota por profundidade de caminho do portfólio', () => {
    const rotas = arquivosDeRota('api/portfolio').filter(f => !f.endsWith('.test.ts'));
    expect(rotas.sort()).toEqual([
      'api/portfolio/[entidade]/[id].ts',
      'api/portfolio/[entidade].ts',
      'api/portfolio/index.ts',
    ].sort());
  });
});
