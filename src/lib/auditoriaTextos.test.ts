import { describe, it, expect } from 'vitest';
import { descreverEvento } from './auditoriaTextos';
import type { LinhaAuditoria } from './auditoriaApi';

function linha(p: Partial<LinhaAuditoria>): LinhaAuditoria {
  return {
    id: 'a', tabela: 'risk_records', registro_id: 'r1', acao: 'alterou',
    campo: null, de: null, para: null, rotulo: '', autor: 'Fulano',
    em: '2026-08-22T14:00:00.000Z',
    ...p,
  };
}

const nbsp = (s: string) => s.replace(/ /g, ' ');

describe('descreverEvento', () => {
  it('nomeia a entidade em criação e exclusão', () => {
    expect(descreverEvento(linha({ acao: 'criou', tabela: 'iniciativas' })))
      .toBe('Criou iniciativa');
    expect(descreverEvento(linha({ acao: 'excluiu', tabela: 'marcos' })))
      .toBe('Excluiu marco');
  });

  it('distingue definir, limpar e mudar', () => {
    expect(descreverEvento(linha({ campo: 'probab', de: null, para: '4' })))
      .toBe('Definiu probabilidade como 4');
    expect(descreverEvento(linha({ campo: 'probab', de: '4', para: null })))
      .toBe('Limpou probabilidade (era 4)');
    expect(descreverEvento(linha({ campo: 'probab', de: '2', para: '4' })))
      .toBe('Mudou probabilidade de 2 para 4');
  });

  it('traduz o enum de situação para o rótulo da tela', () => {
    expect(descreverEvento(linha({ campo: 'situacao', de: 'hipotese', para: 'mitigado' })))
      .toBe('Mudou situação de Hipótese para Mitigado');
  });

  it('resolve status pelo dicionário da tabela de origem', () => {
    expect(descreverEvento(linha({ tabela: 'marcos', campo: 'status', de: 'previsto', para: 'entregue' })))
      .toBe('Mudou status de Previsto para Entregue');
    expect(descreverEvento(linha({ tabela: 'acoes_risco', campo: 'status', de: 'aberta', para: 'concluida' })))
      .toBe('Mudou status de A fazer para Concluída');
  });

  it('mostra dinheiro cheio, não o resumo de painel', () => {
    // "R$ 1,2 mi → R$ 250 mil" esconderia justamente o que a trilha registra.
    // `nbsp` porque o Intl separa símbolo e número com espaço não-quebrável.
    expect(nbsp(descreverEvento(linha({ campo: 'exposicao_rs', de: '1200000', para: '250000' }))))
      .toBe('Mudou exposição de R$ 1.200.000 para R$ 250.000');
    expect(nbsp(descreverEvento(linha({ tabela: 'iniciativas', campo: 'impacto_rs', de: null, para: '90000' }))))
      .toBe('Definiu impacto financeiro como R$ 90.000');
  });

  it('põe unidade na capacidade da pessoa e no esforço da iniciativa', () => {
    expect(descreverEvento(linha({ tabela: 'pessoas', campo: 'dias_projeto_mes', de: '5', para: '1' })))
      .toBe('Mudou capacidade de 5 dias/mês para 1 dia/mês');
    // Sem unidade, "de 30 para 22" não diz se são dias, pontos ou reais.
    expect(descreverEvento(linha({ tabela: 'iniciativas', campo: 'esforco_dias', de: '30', para: '22' })))
      .toBe('Mudou esforço de 30 dias para 22 dias');
  });

  it('formata data em pt-BR', () => {
    expect(descreverEvento(linha({ tabela: 'marcos', campo: 'data_plano_atual', de: '2026-01-31', para: '2026-03-15' })))
      .toBe('Mudou data planejada de 31/01/26 para 15/03/26');
  });

  it('não finge saber o nome por trás de uma chave estrangeira', () => {
    // Resolver o nome exigiria o portfólio inteiro aqui; dizer que mudou basta.
    expect(descreverEvento(linha({ tabela: 'iniciativas', campo: 'dono_id', de: null, para: 'uuid-qualquer' })))
      .toBe('Definiu dono como outro');
  });

  it('booleano já chega como sim/não do servidor e passa direto', () => {
    expect(descreverEvento(linha({ tabela: 'pessoas', campo: 'ativo', de: 'sim', para: 'não' })))
      .toBe('Mudou ativo de sim para não');
  });

  it('cai no nome cru da coluna quando não há rótulo', () => {
    expect(descreverEvento(linha({ campo: 'campo_novo', de: 'a', para: 'b' })))
      .toBe('Mudou campo_novo de a para b');
  });
});
