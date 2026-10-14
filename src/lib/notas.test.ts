import { describe, expect, it } from 'vitest';
import type { Nota } from '../types';
import {
  docDeTexto, editadasNaSemana, ehMinha, filtrarNotas, inicioDaSemana, linhasDaNota, ordenarNotas,
  quandoEditada, textoDaNota, tituloDaAba, trechoDaNota, SUBTITULO_ANOTACOES,
} from './notas';

// Documento no formato do TipTap, só com o que as regras leem.
const t = (text: string, marks?: unknown[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const p = (...c: unknown[]) => ({ type: 'paragraph', ...(c.length ? { content: c } : {}) });
const h = (level: number, text: string) => ({ type: 'heading', attrs: { level }, content: [t(text)] });
const li = (text: string) => ({ type: 'listItem', content: [p(t(text))] });
const ol = (...itens: string[]) => ({ type: 'orderedList', attrs: { start: 1 }, content: itens.map(li) });
const img = (src: string) => ({ type: 'image', attrs: { src, alt: 'print.png' } });
const doc = (...c: unknown[]) => JSON.stringify({ type: 'doc', content: c });

const SRC = '/api/notas/11111111-1111-4111-8111-111111111111/imagens/22222222-2222-4222-8222-222222222222';

const TRIAGEM = doc(
  h(2, 'Meus'),
  ol('Revisar com a Ana o painel de vendas;', 'Ligar para os fornecedores atrasados;'),
  img(SRC),
  h(2, 'Rafael Costa'),
  ol('Relatório do depósito - Atrasado a 28 dias'),
);

let seq = 0;
function nota(campos: Partial<Nota> = {}): Nota {
  seq++;
  return {
    id: `n${seq}`, version: 1, updated_at: '2026-10-14T12:00:00.000Z',
    titulo: '', conteudo: '', fixada: false, autor: '', editado_por: '',
    ...campos,
  };
}

describe('textoDaNota', () => {
  it('uma linha por bloco de texto, na ordem do documento, sem a imagem', () => {
    expect(textoDaNota(TRIAGEM)).toBe([
      'Meus',
      'Revisar com a Ana o painel de vendas;',
      'Ligar para os fornecedores atrasados;',
      'Rafael Costa',
      'Relatório do depósito - Atrasado a 28 dias',
    ].join('\n'));
  });

  it('junta os pedaços de uma linha com marcas e quebra na quebra manual', () => {
    const conteudo = doc(p(t('Revisar '), t('com a Ana', [{ type: 'highlight' }]), { type: 'hardBreak' }, t('depois')));
    expect(textoDaNota(conteudo)).toBe('Revisar com a Ana\ndepois');
  });

  it('lê tarefa, citação e bloco de código; descarta linha em branco e divisor', () => {
    const conteudo = doc(
      { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p(t('Material da reunião'))] }] },
      p(),
      { type: 'blockquote', content: [p(t('Incluir a Ana'))] },
      { type: 'horizontalRule' },
      { type: 'codeBlock', content: [t('a\nb')] },
    );
    expect(textoDaNota(conteudo)).toBe('Material da reunião\nIncluir a Ana\na\nb');
  });

  it('página vazia ou ilegível não tem texto', () => {
    expect(textoDaNota('')).toBe('');
    expect(textoDaNota('não é json')).toBe('');
    expect(textoDaNota(JSON.stringify({ type: 'paragraph' }))).toBe('');
    expect(textoDaNota(doc())).toBe('');
  });

  it('docDeTexto é o caminho inverso: um parágrafo por linha', () => {
    expect(textoDaNota(docDeTexto('Meus\n\nRafael Costa'))).toBe('Meus\nRafael Costa');
    expect(JSON.parse(docDeTexto(''))).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });

  it('conta as linhas para a confirmação de exclusão', () => {
    expect(linhasDaNota(TRIAGEM)).toBe(5);
    expect(linhasDaNota('')).toBe(0);
  });
});

describe('textoDaNota em documento aninhado', () => {
  it('não estoura a pilha e mantém a ordem das linhas', () => {
    // Montado como texto: o próprio JSON.stringify de um objeto tão fundo
    // estoura a pilha — que é justamente o caso de um documento vindo da API.
    let no = '{"type":"paragraph","content":[{"type":"text","text":"fundo"}]}';
    for (let i = 0; i < 25_000; i++) no = '{"type":"blockquote","content":[' + no + ']}';
    const p = (t: string) => '{"type":"paragraph","content":[{"type":"text","text":"' + t + '"}]}';
    const conteudo = '{"type":"doc","content":[' + p('antes') + ',' + no + ',' + p('depois') + ']}';
    expect(textoDaNota(conteudo)).toBe('antes\nfundo\ndepois');
  });
});

describe('trechoDaNota', () => {
  it('pula a linha que repete o título e emenda as seguintes', () => {
    const n = nota({ titulo: 'meus', conteudo: TRIAGEM });
    expect(trechoDaNota(n, 200)).toBe(
      'Revisar com a Ana o painel de vendas · Ligar para os fornecedores atrasados · Rafael Costa · Relatório do depósito - Atrasado a 28 dias',
    );
  });

  it('começa na primeira linha quando o título é outro', () => {
    expect(trechoDaNota(nota({ titulo: 'Triagem', conteudo: TRIAGEM }), 200).startsWith('Meus · Revisar com a Ana')).toBe(true);
  });

  it('corta na palavra inteira, com reticências, sem passar do máximo', () => {
    const trecho = trechoDaNota(nota({ titulo: 'Triagem', conteudo: TRIAGEM }), 40);
    expect(trecho).toBe('Meus · Revisar com a Ana o painel de…');
    expect(trecho.length).toBeLessThanOrEqual(40);
  });

  it('página sem texto, ou só com o título, não tem trecho', () => {
    expect(trechoDaNota(nota({ titulo: 'Vazia' }))).toBe('');
    expect(trechoDaNota(nota({ titulo: 'Só título', conteudo: doc(h(1, 'Só título')) }))).toBe('');
  });
});

describe('ordenarNotas', () => {
  it('fixadas primeiro, depois a editada por último; empate mantém a ordem', () => {
    const velhaFixada = nota({ titulo: 'a', fixada: true, updated_at: '2026-10-01T10:00:00.000Z' });
    const nova = nota({ titulo: 'b', updated_at: '2026-10-14T10:00:00.000Z' });
    const empate1 = nota({ titulo: 'c', updated_at: '2026-10-10T10:00:00.000Z' });
    const empate2 = nota({ titulo: 'd', updated_at: '2026-10-10T10:00:00.000Z' });
    const novaFixada = nota({ titulo: 'e', fixada: true, updated_at: '2026-10-12T10:00:00.000Z' });
    const entrada = [empate1, velhaFixada, nova, empate2, novaFixada];
    expect(ordenarNotas(entrada).map(n => n.titulo)).toEqual(['e', 'a', 'b', 'c', 'd']);
    expect(entrada.map(n => n.titulo)).toEqual(['c', 'a', 'b', 'd', 'e']);
  });
});

describe('filtrarNotas', () => {
  const triagem = nota({ titulo: 'Triagem', conteudo: TRIAGEM, autor: 'DERYLSON' });
  const plantao = nota({ titulo: 'Escala de verão', conteudo: doc(p(t('Prós e contras'))), autor: 'Rafael Costa', editado_por: 'Derylson' });
  const promo = nota({ titulo: 'Ações de campanha', conteudo: doc(p(t('Modelo com a Ana'))), autor: 'Camila Nunes', editado_por: 'Camila Nunes' });
  const todas = [triagem, plantao, promo];

  it('busca no título e no texto, sem acento e sem caixa', () => {
    expect(filtrarNotas(todas, { busca: 'VERAO', recorte: 'todas', autor: '' })).toEqual([plantao]);
    expect(filtrarNotas(todas, { busca: 'relatorio', recorte: 'todas', autor: '' })).toEqual([triagem]);
    expect(filtrarNotas(todas, { busca: 'acoes', recorte: 'todas', autor: '' })).toEqual([promo]);
    expect(filtrarNotas(todas, { busca: '  ', recorte: 'todas', autor: '' })).toEqual(todas);
    expect(filtrarNotas(todas, { busca: 'plantão domingo', recorte: 'todas', autor: '' })).toEqual([]);
  });

  it('"Minhas" = escrevi ou editei por último, casando o nome sem caixa nem acento', () => {
    expect(filtrarNotas(todas, { busca: '', recorte: 'minhas', autor: 'derylson' })).toEqual([triagem, plantao]);
    expect(filtrarNotas(todas, { busca: 'prós', recorte: 'minhas', autor: 'Derylson' })).toEqual([plantao]);
    expect(ehMinha(promo, 'camila  nunes')).toBe(true);
  });

  it('sem nome no chip, nenhuma página é minha — nem a de autor em branco', () => {
    const anonima = nota({ titulo: 'Sem autor' });
    expect(filtrarNotas([...todas, anonima], { busca: '', recorte: 'minhas', autor: '' })).toEqual([]);
    expect(ehMinha(anonima, '   ')).toBe(false);
  });
});

describe('semana e título da aba', () => {
  // Quarta-feira, 14/10/2026, hora local: a semana vai de 12/10 a 18/10.
  const hoje = new Date(2026, 9, 14, 15, 0);
  const em = (...d: [number, number, number, number?, number?]) =>
    nota({ updated_at: new Date(d[0], d[1], d[2], d[3] ?? 0, d[4] ?? 0).toISOString() });

  it('a semana começa na segunda, 00:00 local', () => {
    const inicio = inicioDaSemana(hoje);
    expect([inicio.getFullYear(), inicio.getMonth(), inicio.getDate(), inicio.getHours()]).toEqual([2026, 9, 12, 0]);
    const domingo = new Date(2026, 9, 18, 23, 0);
    expect(inicioDaSemana(domingo).getDate()).toBe(12);
  });

  it('conta de segunda a domingo, sem as pontas de fora', () => {
    const notas = [
      em(2026, 9, 11, 23, 59), // domingo anterior
      em(2026, 9, 12, 0, 0), // segunda, primeiro minuto
      em(2026, 9, 14, 9, 30),
      em(2026, 9, 18, 23, 59), // domingo
      em(2026, 9, 19, 0, 0), // segunda seguinte
    ];
    expect(editadasNaSemana(notas, hoje)).toBe(3);
  });

  it('afirma o achado com número, no singular e no plural', () => {
    const nesta = em(2026, 9, 13, 10);
    const antiga = em(2026, 9, 2, 10);
    expect(tituloDaAba([nesta, nesta, nesta, antiga, antiga, antiga, antiga], hoje).titulo).toBe('7 páginas, 3 editadas nesta semana');
    expect(tituloDaAba([nesta, antiga], hoje).titulo).toBe('2 páginas, 1 editada nesta semana');
    expect(tituloDaAba([antiga, antiga], hoje).titulo).toBe('2 páginas, nenhuma editada nesta semana');
    expect(tituloDaAba([nesta, nesta], hoje).titulo).toBe('2 páginas, todas editadas nesta semana');
    expect(tituloDaAba([nesta], hoje).titulo).toBe('1 página, editada nesta semana');
    expect(tituloDaAba([antiga], hoje).titulo).toBe('1 página, sem edição nesta semana');
    expect(tituloDaAba([nesta], hoje).subtitulo).toBe(SUBTITULO_ANOTACOES);
  });

  it('sem página nenhuma, o título é o nome da seção', () => {
    expect(tituloDaAba([], hoje)).toEqual({ titulo: 'Anotações', subtitulo: SUBTITULO_ANOTACOES });
  });
});

describe('quandoEditada', () => {
  const agora = new Date(2026, 9, 14, 15, 0);
  const iso = (...d: [number, number, number, number, number]) => new Date(...d).toISOString();

  it('minutos e horas no mesmo dia', () => {
    expect(quandoEditada(iso(2026, 9, 14, 14, 59), agora)).toBe('há 1 min');
    expect(quandoEditada(iso(2026, 9, 14, 14, 55), agora)).toBe('há 5 min');
    expect(quandoEditada(iso(2026, 9, 14, 13, 0), agora)).toBe('há 2 h');
    expect(quandoEditada(iso(2026, 9, 14, 0, 5), agora)).toBe('há 14 h');
  });

  it('menos de um minuto, ou no futuro, é "agora"', () => {
    expect(quandoEditada(new Date(agora.getTime() - 20_000).toISOString(), agora)).toBe('agora');
    expect(quandoEditada(new Date(agora.getTime() + 90_000).toISOString(), agora)).toBe('agora');
  });

  it('ontem pelo calendário, depois dias, depois a data', () => {
    expect(quandoEditada(iso(2026, 9, 13, 23, 0), agora)).toBe('ontem');
    expect(quandoEditada(iso(2026, 9, 11, 9, 0), agora)).toBe('há 3 dias');
    expect(quandoEditada(iso(2026, 9, 9, 9, 0), agora)).toBe('há 5 dias');
    expect(quandoEditada(iso(2026, 9, 8, 9, 0), agora)).toBe('08/10');
    expect(quandoEditada(iso(2025, 11, 30, 9, 0), agora)).toBe('30/12/25');
  });

  it('a virada da meia-noite vale pelos minutos enquanto não passa uma hora', () => {
    const madrugada = new Date(2026, 9, 14, 0, 10);
    expect(quandoEditada(iso(2026, 9, 13, 23, 50), madrugada)).toBe('há 20 min');
    expect(quandoEditada(iso(2026, 9, 13, 22, 0), madrugada)).toBe('ontem');
  });

  it('data ilegível não inventa tempo', () => {
    expect(quandoEditada('', agora)).toBe('');
    expect(quandoEditada('ontem', agora)).toBe('');
  });
});
