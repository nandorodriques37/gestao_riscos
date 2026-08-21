import { describe, it, expect } from 'vitest';
import { sugerirDestino, normalizar, CORTE_ESFORCO } from './triagem';

describe('normalizar', () => {
  it('tira acento e caixa — o registro tem acentuação irregular', () => {
    expect(normalizar('REVISÃO Quinzenal')).toBe('revisao quinzenal');
    expect(normalizar('Ações de prevenção')).toBe('acoes de prevencao');
  });
});

describe('sugerirDestino', () => {
  const base = { descricao: 'Fazer alguma coisa', esforco: null, recurso: '' };

  it('usa o mesmo corte de esforço da matriz de quadrantes', () => {
    expect(CORTE_ESFORCO).toBe(2.5);
  });

  describe('recorrência vence tudo', () => {
    it('revisão cara e terceirizada continua sendo rotina', () => {
      const s = sugerirDestino({
        descricao: 'MED - Revisões quinzenais para os termolábeis',
        esforco: 5,
        recurso: 'TERCEIRIZADO',
      });
      expect(s.destino).toBe('rotina');
      expect(s.confiante).toBe(true);
    });

    it('pega marcador com acento e caixa diferentes', () => {
      for (const d of ['Acompanhar o fill rate', 'MONITORAMENTO diário', 'Revisão mensal do EO']) {
        expect(sugerirDestino({ ...base, descricao: d }).destino).toBe('rotina');
      }
    });

    it('devolve a palavra inteira que casou, não o radical', () => {
      const s = sugerirDestino({ ...base, descricao: 'MED - Revisões quinzenais dos termolábeis' });
      expect(s.motivo).toContain('revisoes');
      expect(s.motivo).not.toContain('"revis"');
    });
  });

  // O marcador é casado no início da palavra, não como substring solta. No
  // vocabulário deste app isso não é detalhe: "previsão" termina em "revisão".
  describe('não confunde palavra que contém o marcador', () => {
    it('previsão não é revisão — o caso que quebrava de verdade', () => {
      const s = sugerirDestino({
        ...base,
        descricao: 'Criar motor de previsão de vendas paleativa (Temporária)',
      });
      expect(s.destino).toBe('iniciativa');
    });

    it('previsão de vendas sem verbo de construção também não é rotina', () => {
      const s = sugerirDestino({
        ...base,
        descricao: 'Ausência de Previsão de Vendas para desdobramento orçamentário',
      });
      expect(s.destino).toBe('acao');
    });

    it('intermediário não é diário', () => {
      expect(sugerirDestino({ ...base, descricao: 'Análise intermediária do processo' }).destino)
        .toBe('acao');
    });
  });

  describe('terceiro é dependência externa; o próprio time não', () => {
    it('TERCEIRIZADO vira iniciativa mesmo com esforço baixo', () => {
      const s = sugerirDestino({ descricao: 'Ajustar algo', esforco: 1, recurso: 'TERCEIRIZADO' });
      expect(s.destino).toBe('iniciativa');
      expect(s.motivo).toContain('terceiro');
    });

    it('recurso do próprio time NÃO promove sozinho — quem decide é o esforço', () => {
      // 41 das 50 ações reais têm recurso preenchido; tratar isso como
      // dependência externa jogava 34 delas para iniciativa.
      const s = sugerirDestino({
        descricao: 'Criar POWER BI de CICLO DE ESTOQUE',
        esforco: 1,
        recurso: 'PAGUE MENOS - DADOS',
      });
      expect(s.destino).toBe('acao');
    });

    it('mesmo recurso interno com esforço alto vira iniciativa, pelo esforço', () => {
      const s = sugerirDestino({
        descricao: 'Reformulação do POWER BI de rupturas',
        esforco: 4,
        recurso: 'PAGUE MENOS - DADOS',
      });
      expect(s.destino).toBe('iniciativa');
      expect(s.motivo).toContain('corte');
    });
  });

  describe('esforço medido decide, e é dado, não palpite', () => {
    it('acima de 2,5 vira iniciativa', () => {
      expect(sugerirDestino({ ...base, esforco: 3 }).destino).toBe('iniciativa');
      expect(sugerirDestino({ ...base, esforco: 2.6 }).destino).toBe('iniciativa');
    });

    it('2,5 exato fica como ação — o corte é "acima de"', () => {
      const s = sugerirDestino({ ...base, esforco: 2.5 });
      expect(s.destino).toBe('acao');
      expect(s.confiante).toBe(true);
    });

    it('esforço baixo fica como ação', () => {
      expect(sugerirDestino({ ...base, esforco: 1 }).destino).toBe('acao');
      expect(sugerirDestino({ ...base, esforco: 0 }).destino).toBe('acao');
    });

    it('esforço vence o verbo de construção', () => {
      const s = sugerirDestino({ descricao: 'Criar ferramenta nova', esforco: 1, recurso: '' });
      expect(s.destino).toBe('acao');
    });
  });

  describe('texto só entra quando não há esforço medido', () => {
    it('verbo de construção sugere iniciativa, admitindo incerteza', () => {
      const s = sugerirDestino({ ...base, descricao: 'Desenvolver POWER BI de rupturas' });
      expect(s.destino).toBe('iniciativa');
      expect(s.confiante).toBe(false);
      expect(s.motivo).toContain('Confirme o porte');
    });

    it('sem sinal nenhum, sugere ação e admite que não sabe', () => {
      const s = sugerirDestino({ ...base, descricao: 'Alinhar com o comercial' });
      expect(s.destino).toBe('acao');
      expect(s.confiante).toBe(false);
      expect(s.motivo).toContain('reclassifique');
    });
  });

  it('formata o esforço com vírgula, como o resto da UI', () => {
    expect(sugerirDestino({ ...base, esforco: 3.5 }).motivo).toContain('3,5');
    expect(sugerirDestino({ ...base, esforco: 1.5 }).motivo).toContain('1,5');
    expect(sugerirDestino({ ...base, esforco: 4 }).motivo).toContain('2,5');
  });

  it('sempre devolve um motivo não vazio', () => {
    const casos = [
      { descricao: 'Revisão', esforco: null, recurso: '' },
      { descricao: 'X', esforco: 4, recurso: '' },
      { descricao: 'X', esforco: null, recurso: 'TERCEIRIZADO' },
      { descricao: 'Criar X', esforco: null, recurso: '' },
      { descricao: 'X', esforco: 0.5, recurso: '' },
      { descricao: 'X', esforco: null, recurso: '' },
    ];
    casos.forEach(c => expect(sugerirDestino(c).motivo.length).toBeGreaterThan(10));
  });
});
