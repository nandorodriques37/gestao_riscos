import { describe, expect, it } from 'vitest';
import { BLOCOS_NOTA, blocoPorId, filtrarBlocos } from './blocosNota';

const ids = (consulta: string) => filtrarBlocos(consulta).map(b => b.id);

describe('BLOCOS_NOTA', () => {
  it('tem os dez blocos do canvas, na ordem do menu', () => {
    expect(BLOCOS_NOTA.map(b => b.nome)).toEqual([
      'Texto', 'Título 1', 'Título 2', 'Título 3', 'Lista numerada',
      'Lista com marcadores', 'Lista de tarefas', 'Citação', 'Divisor', 'Imagem',
    ]);
  });

  it('cada bloco mostra o atalho de markdown, ou uma dica quando não tem tecla', () => {
    expect(BLOCOS_NOTA.map(b => b.atalho ?? b.dica ?? null)).toEqual([
      null, '#', '##', '###', '1.', '-', '[]', '>', '---', 'colar ou enviar',
    ]);
  });

  it('ids únicos, e blocoPorId acha cada um', () => {
    expect(new Set(BLOCOS_NOTA.map(b => b.id)).size).toBe(BLOCOS_NOTA.length);
    for (const b of BLOCOS_NOTA) expect(blocoPorId(b.id)).toBe(b);
  });
});

describe('filtrarBlocos', () => {
  it('consulta vazia (ou só espaço) devolve todos, na ordem', () => {
    expect(ids('')).toEqual(BLOCOS_NOTA.map(b => b.id));
    expect(ids('  ')).toEqual(BLOCOS_NOTA.map(b => b.id));
  });

  it('casa o começo do nome, sem acento e sem caixa', () => {
    expect(ids('tit')).toEqual(['titulo1', 'titulo2', 'titulo3']);
    expect(ids('Títu')).toEqual(['titulo1', 'titulo2', 'titulo3']);
    expect(ids('TITULO')).toEqual(['titulo1', 'titulo2', 'titulo3']);
    expect(ids('cita')).toEqual(['citacao']);
    expect(ids('citação')).toEqual(['citacao']);
  });

  it('o nome exato vem antes de quem só começa igual', () => {
    expect(ids('titulo 2')).toEqual(['titulo2']);
    expect(ids('título 3')[0]).toBe('titulo3');
  });

  it('aceita apelidos, inclusive os do Notion em inglês', () => {
    expect(ids('h1')).toEqual(['titulo1']);
    expect(ids('H2')).toEqual(['titulo2']);
    expect(ids('titulo1')).toEqual(['titulo1']);
    expect(ids('todo')).toEqual(['tarefas']);
    expect(ids('checklist')).toEqual(['tarefas']);
    expect(ids('foto')).toEqual(['imagem']);
    expect(ids('img')).toEqual(['imagem']);
    expect(ids('hr')).toEqual(['divisor']);
    expect(ids('quote')).toEqual(['citacao']);
    expect(ids('paragrafo')).toEqual(['texto']);
    expect(ids('subtitulo')).toEqual(['titulo2']);
  });

  it('várias palavras: cada uma começa uma palavra do nome', () => {
    expect(ids('lista')).toEqual(['numerada', 'marcadores', 'tarefas']);
    expect(ids('lista t')).toEqual(['tarefas']);
    expect(ids('lista num')).toEqual(['numerada']);
    expect(ids('lis  marc')).toEqual(['marcadores']);
  });

  it('o atalho de markdown também acha o bloco', () => {
    expect(ids('#')).toEqual(['titulo1', 'titulo2', 'titulo3']);
    expect(ids('##')).toEqual(['titulo2', 'titulo3']);
    expect(ids('-')).toEqual(['marcadores', 'divisor']);
    expect(ids('---')).toEqual(['divisor']);
    expect(ids('[]')).toEqual(['tarefas']);
    expect(ids('>')).toEqual(['citacao']);
    expect(ids('1.')).toEqual(['numerada']);
  });

  it('pedaço do meio só casa com três letras ou mais', () => {
    expect(ids('merada')).toEqual(['numerada']);
    expect(ids('ad')).toEqual([]);
  });

  it('sem nada que case devolve lista vazia', () => {
    expect(ids('xyz')).toEqual([]);
    expect(ids('lista xyz')).toEqual([]);
  });

  it('não muta a lista de entrada e aceita outra lista', () => {
    const copia = [...BLOCOS_NOTA];
    filtrarBlocos('tit');
    expect(BLOCOS_NOTA).toEqual(copia);
    expect(filtrarBlocos('t', [blocoPorId('divisor'), blocoPorId('texto')]).map(b => b.id)).toEqual(['texto']);
  });
});
