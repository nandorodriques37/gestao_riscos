import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { segmentosDaUrl } from './_portfolioRoute.js';

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

it('mantém somente api/index.ts como função publicável', () => {
  const entries = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? entries(join(dir, e.name)) : !e.name.startsWith('_') && !e.name.startsWith('.') && !e.name.endsWith('.d.ts') ? [join(dir, e.name)] : []);
  expect(entries('api')).toEqual(['api/index.ts']);
});
