import { describe, expect, it } from 'vitest';
import { invalida, type DataSource } from './dataSync';

describe('invalida', () => {
  const teia: DataSource[] = ['riscos', 'tarefas', 'portfolio'];

  it('riscos, tarefas e portfólio se invalidam entre si, nunca a si mesmos', () => {
    for (const origem of teia) {
      for (const alvo of teia) expect(invalida(origem, alvo)).toBe(origem !== alvo);
    }
  });

  it('as páginas ficam fora da teia, nos dois sentidos', () => {
    for (const outra of teia) {
      expect(invalida('notas', outra)).toBe(false);
      expect(invalida(outra, 'notas')).toBe(false);
    }
    expect(invalida('notas', 'notas')).toBe(false);
  });
});
