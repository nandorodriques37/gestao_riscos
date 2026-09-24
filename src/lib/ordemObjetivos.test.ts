import { describe, it, expect } from 'vitest';
import {
  CRITERIOS_OBJETIVOS, ordenarObjetivos, moverUm, moverPara, aplicarOrdemVisivel,
  type CriterioObjetivos,
} from './ordemObjetivos';

/* ---------- fábrica mínima ---------- */

interface Item {
  id: string;
  prazo: string | null;
  impacto: number;
  progresso: number | null;
}

const item = (id: string, i: Partial<Item> = {}): Item => ({
  id, prazo: null, impacto: 0, progresso: null, ...i,
});

const metrica = (o: Item) => ({ impacto: o.impacto, progresso: o.progresso });
const ids = (lista: { id: string }[]) => lista.map(o => o.id);

describe('CRITERIOS_OBJETIVOS', () => {
  it('os quatro critérios, Manual primeiro', () => {
    expect(CRITERIOS_OBJETIVOS.map(c => c.id)).toEqual(['manual', 'impacto', 'progresso', 'prazo']);
    expect(CRITERIOS_OBJETIVOS.map(c => c.rotulo)).toEqual(['Manual', 'Impacto', 'Progresso', 'Prazo']);
  });
});

describe('ordenarObjetivos', () => {
  const lista = [
    item('a', { impacto: 100, progresso: 0.2, prazo: '2026-12-31' }),
    item('b', { impacto: 500, progresso: null, prazo: null }),
    item('c', { impacto: 300, progresso: 0.9, prazo: '2026-03-01' }),
    item('d', { impacto: 0, progresso: 0.5, prazo: '2026-06-30' }),
  ];

  it('manual devolve uma cópia na mesma ordem', () => {
    const r = ordenarObjetivos(lista, 'manual', metrica);
    expect(ids(r)).toEqual(['a', 'b', 'c', 'd']);
    expect(r).not.toBe(lista);
  });

  it('impacto: do maior para o menor', () => {
    expect(ids(ordenarObjetivos(lista, 'impacto', metrica))).toEqual(['b', 'c', 'a', 'd']);
  });

  it('progresso: do mais andado ao menos, sem número por último', () => {
    expect(ids(ordenarObjetivos(lista, 'progresso', metrica))).toEqual(['c', 'd', 'a', 'b']);
  });

  it('prazo: o mais próximo primeiro, sem prazo por último', () => {
    expect(ids(ordenarObjetivos(lista, 'prazo', metrica))).toEqual(['c', 'd', 'a', 'b']);
  });

  it('prazo em branco conta como ausente', () => {
    const r = ordenarObjetivos([item('x', { prazo: '' }), item('y', { prazo: '2027-01-01' })], 'prazo', metrica);
    expect(ids(r)).toEqual(['y', 'x']);
  });

  it('é estável: no empate vale a ordem manual, em todo critério', () => {
    const empate = [
      item('p', { impacto: 10, progresso: null, prazo: null }),
      item('q', { impacto: 10, progresso: null, prazo: null }),
      item('r', { impacto: 10, progresso: 0.5, prazo: '2026-01-01' }),
      item('s', { impacto: 10, progresso: 0.5, prazo: '2026-01-01' }),
    ];
    const criterios: CriterioObjetivos[] = ['impacto', 'progresso', 'prazo'];
    expect(ids(ordenarObjetivos(empate, 'impacto', metrica))).toEqual(['p', 'q', 'r', 's']);
    for (const c of criterios.slice(1)) {
      expect(ids(ordenarObjetivos(empate, c, metrica))).toEqual(['r', 's', 'p', 'q']);
    }
  });

  it('nunca muta a entrada', () => {
    const copia = lista.map(o => ({ ...o }));
    const ordemAntes = ids(lista);
    for (const c of CRITERIOS_OBJETIVOS) ordenarObjetivos(lista, c.id, metrica);
    expect(ids(lista)).toEqual(ordemAntes);
    expect(lista).toEqual(copia);
  });

  it('chama a métrica uma vez por item, e só quando o critério a usa', () => {
    let chamadas = 0;
    const contando = (o: Item) => { chamadas++; return metrica(o); };
    ordenarObjetivos(lista, 'impacto', contando);
    expect(chamadas).toBe(lista.length);
    chamadas = 0;
    ordenarObjetivos(lista, 'prazo', contando);
    ordenarObjetivos(lista, 'manual', contando);
    expect(chamadas).toBe(0);
  });
});

describe('moverUm', () => {
  const base = ['a', 'b', 'c'];

  it('sobe e desce uma posição', () => {
    expect(moverUm(base, 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moverUm(base, 'b', 1)).toEqual(['a', 'c', 'b']);
  });

  it('nos limites devolve uma cópia igual', () => {
    const topo = moverUm(base, 'a', -1);
    expect(topo).toEqual(base);
    expect(topo).not.toBe(base);
    expect(moverUm(base, 'c', 1)).toEqual(base);
  });

  it('id ausente devolve uma cópia igual', () => {
    expect(moverUm(base, 'z', 1)).toEqual(base);
  });

  it('não muta a entrada', () => {
    const entrada = [...base];
    moverUm(entrada, 'b', 1);
    expect(entrada).toEqual(base);
  });
});

describe('moverPara', () => {
  const base = ['a', 'b', 'c', 'd'];

  it('vindo de cima, cai logo abaixo do alvo', () => {
    expect(moverPara(base, 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
    expect(moverPara(base, 'b', 'd')).toEqual(['a', 'c', 'd', 'b']);
  });

  it('vindo de baixo, cai logo acima do alvo', () => {
    expect(moverPara(base, 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
    expect(moverPara(base, 'c', 'a')).toEqual(['c', 'a', 'b', 'd']);
  });

  it('vizinhos trocam de lugar nos dois sentidos', () => {
    expect(moverPara(base, 'b', 'c')).toEqual(['a', 'c', 'b', 'd']);
    expect(moverPara(base, 'c', 'b')).toEqual(['a', 'c', 'b', 'd']);
  });

  it('sobre si mesmo, ou com id/alvo ausente, devolve uma cópia igual', () => {
    expect(moverPara(base, 'b', 'b')).toEqual(base);
    expect(moverPara(base, 'z', 'b')).toEqual(base);
    expect(moverPara(base, 'b', 'z')).toEqual(base);
  });

  it('não muta a entrada', () => {
    const entrada = [...base];
    moverPara(entrada, 'a', 'd');
    expect(entrada).toEqual(base);
  });
});

describe('aplicarOrdemVisivel', () => {
  it('os ocultos ficam onde estavam; os visíveis ocupam os lugares deles na nova ordem', () => {
    // b e d estão ocultos (abandonados, fora do recorte); o balde é o último.
    const todos = ['a', 'b', 'c', 'd', 'e', 'balde'];
    expect(aplicarOrdemVisivel(todos, ['e', 'a', 'c'])).toEqual(['e', 'b', 'a', 'd', 'c', 'balde']);
  });

  it('sem mudança na ordem visível, a lista volta igual', () => {
    const todos = ['a', 'b', 'c'];
    expect(aplicarOrdemVisivel(todos, ['a', 'c'])).toEqual(todos);
  });

  it('ignora id desconhecido e repetição', () => {
    const todos = ['a', 'b', 'c'];
    expect(aplicarOrdemVisivel(todos, ['z', 'c', 'c', 'a'])).toEqual(['c', 'b', 'a']);
  });

  it('com todos visíveis, é a nova ordem inteira', () => {
    expect(aplicarOrdemVisivel(['a', 'b', 'c'], ['c', 'b', 'a'])).toEqual(['c', 'b', 'a']);
  });

  it('compõe com moverUm sobre a lista visível', () => {
    const todos = ['a', 'oculto', 'b', 'c'];
    const visiveis = ['a', 'b', 'c'];
    const nova = moverUm(visiveis, 'b', -1);
    expect(aplicarOrdemVisivel(todos, nova)).toEqual(['b', 'oculto', 'a', 'c']);
  });

  it('não muta a entrada', () => {
    const todos = ['a', 'b', 'c'];
    aplicarOrdemVisivel(todos, ['c', 'a']);
    expect(todos).toEqual(['a', 'b', 'c']);
  });
});
