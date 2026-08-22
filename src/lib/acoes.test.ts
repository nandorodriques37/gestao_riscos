import { describe, it, expect } from 'vitest';
import { parseAcoes } from './acoes';
import type { AcaoItem } from '../types';

const base = { acoes: '', acoes_itens: undefined as AcaoItem[] | undefined, responsavel: '', status: '' };

function item(patch: Partial<AcaoItem> = {}): AcaoItem {
  return { id: 'x', descricao: '', responsavel: '', prazo: '', status: 'A fazer' as const, ...patch };
}

describe('parseAcoes', () => {
  it('devolve a lista estruturada quando ela existe', () => {
    const itens = [item({ descricao: 'Revisar rotina' }), item({ descricao: 'Treinar equipe' })];
    const out = parseAcoes({ ...base, acoes: 'texto antigo ignorado', acoes_itens: itens });
    expect(out).toHaveLength(2);
    expect(out.map(i => i.descricao)).toEqual(['Revisar rotina', 'Treinar equipe']);
  });

  it('normaliza itens vindos do banco com campos faltando ou status inválido', () => {
    const brutos = [{ descricao: 'Sem id nem status' }] as unknown as AcaoItem[];
    const [out] = parseAcoes({ ...base, acoes_itens: brutos });
    expect(out.id).toBeTruthy();
    expect(out.status).toBe('A fazer');
    expect(out.responsavel).toBe('');
    expect(out.prazo).toBe('');
  });

  it('converte o texto livre antigo em uma única linha, herdando responsável e status', () => {
    const out = parseAcoes({
      ...base, acoes: 'Criar checklist de conferência', responsavel: 'JOEL', status: 'EM ANDAMENTO',
    });
    expect(out).toHaveLength(1);
    expect(out[0].descricao).toBe('Criar checklist de conferência');
    expect(out[0].responsavel).toBe('JOEL');
    expect(out[0].status).toBe('Em andamento');
    expect(out[0].prazo).toBe('');
  });

  it('mapeia "CONCLUÍDO" do registro para "Concluída" na ação', () => {
    const [out] = parseAcoes({ ...base, acoes: 'Feito', status: 'CONCLUÍDO' });
    expect(out.status).toBe('Concluída');
  });

  it('devolve lista vazia quando não há nem lista nem texto', () => {
    expect(parseAcoes({ ...base, acoes: '   ' })).toEqual([]);
  });

  it('não usa o texto livre quando a lista estruturada está vazia mas presente', () => {
    // Lista esvaziada de propósito pelo usuário: o resumo `acoes` também some.
    expect(parseAcoes({ ...base, acoes: '', acoes_itens: [] })).toEqual([]);
  });
});
