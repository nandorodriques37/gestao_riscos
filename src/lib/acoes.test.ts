import { describe, it, expect } from 'vitest';
import { parseAcoes, resumirAcoes, acaoAtrasada, novaAcao } from './acoes';
import type { AcaoItem } from '../types';

const base = { acoes: '', acoes_itens: undefined as AcaoItem[] | undefined, responsavel: '', status: '' };

function item(patch: Partial<AcaoItem> = {}): AcaoItem {
  return { ...novaAcao(), ...patch };
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

describe('resumirAcoes', () => {
  it('junta as descrições com separador', () => {
    const itens = [item({ descricao: 'A' }), item({ descricao: 'B' })];
    expect(resumirAcoes(itens)).toBe('A · B');
  });

  it('ignora descrições vazias ou só com espaços', () => {
    const itens = [item({ descricao: 'A' }), item({ descricao: '  ' }), item({ descricao: '' })];
    expect(resumirAcoes(itens)).toBe('A');
  });

  it('devolve string vazia para lista vazia', () => {
    expect(resumirAcoes([])).toBe('');
  });
});

describe('acaoAtrasada', () => {
  const hoje = new Date(2026, 6, 29); // 29/07/2026, hora local

  it('é falso sem prazo', () => {
    expect(acaoAtrasada(item({ prazo: '' }), hoje)).toBe(false);
  });

  it('é falso no próprio dia do prazo', () => {
    expect(acaoAtrasada(item({ prazo: '2026-07-29' }), hoje)).toBe(false);
  });

  it('é verdadeiro com prazo vencido e ação em aberto', () => {
    expect(acaoAtrasada(item({ prazo: '2026-07-28' }), hoje)).toBe(true);
    expect(acaoAtrasada(item({ prazo: '2026-07-28', status: 'Em andamento' }), hoje)).toBe(true);
  });

  it('é falso quando a ação já foi concluída, mesmo com prazo vencido', () => {
    expect(acaoAtrasada(item({ prazo: '2020-01-01', status: 'Concluída' }), hoje)).toBe(false);
  });

  it('é falso com prazo futuro', () => {
    expect(acaoAtrasada(item({ prazo: '2026-07-30' }), hoje)).toBe(false);
  });
});
