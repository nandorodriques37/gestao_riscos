// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AnotacoesTab } from './AnotacoesTab';
import type { EditorNotaProps } from './EditorNota';
import type { NotaSaveStatus, UseNotas } from '../../hooks/useNotas';
import type { NotaPatch } from '../../lib/notasApi';
import type { Nota } from '../../types';
import { docDeTexto } from '../../lib/notas';

// O editor de verdade (TipTap) é de outra etapa e tem teste próprio. Aqui ele
// é uma caixa de texto que cumpre o contrato: lê o conteúdo ao montar e quando
// `recarregar` muda (a `key` remonta a caixa), e devolve o documento a cada
// mudança.
vi.mock('./EditorNota', async () => {
  const { createElement } = await import('react');
  const { docDeTexto: doc, textoDaNota } = await import('../../lib/notas');
  return {
    EditorNota: ({ nota, recarregar, onChange }: EditorNotaProps) => createElement('textarea', {
      key: recarregar,
      'aria-label': 'Conteúdo da página',
      'data-recarregar': recarregar,
      defaultValue: textoDaNota(nota.conteudo),
      onChange: (e: { target: { value: string } }) => onChange(doc(e.target.value)),
    }),
  };
});

// Quarta-feira, 14/10/2026, 10h (hora local): a semana vai de 12 a 18/10.
const AGORA = new Date(2026, 9, 14, 10, 0);
const minutosAntes = (min: number) => new Date(AGORA.getTime() - min * 60_000).toISOString();

beforeEach(() => {
  sessionStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AGORA);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

const UUID_N1 = '11111111-1111-4111-8111-111111111111';

function paginas(): Nota[] {
  return [
    {
      id: 'n2', version: 2, updated_at: minutosAntes(120), titulo: 'Reunião com DROs', fixada: false,
      // Escrita por outra pessoa, editada por último por mim (em caixa alta): é "minha".
      autor: 'Camila Nunes', editado_por: 'DERYLSON',
      conteudo: docDeTexto('Ruptura dos AME na DRO 5\nMaterial de apoio'),
    },
    {
      id: 'n1', version: 4, updated_at: minutosAntes(5), titulo: 'Triagem', fixada: true,
      autor: 'Derylson', editado_por: 'Derylson',
      conteudo: docDeTexto('Meus\nAlinhar com Plínio o dashboard de EO;\nTratar TOP fornecedores em ruptura no CD10;'),
    },
    {
      id: 'n3', version: 1, updated_at: new Date(2026, 9, 8, 16, 0).toISOString(), titulo: 'Excessos de fralda CD10', fixada: false,
      autor: 'Rafael Costa', editado_por: 'Rafael Costa',
      conteudo: docDeTexto('Drylock: virar veículos para outros CDs'),
    },
  ];
}

interface Opcoes {
  notas?: Nota[];
  loading?: boolean;
  autor?: string;
  selecionada?: string | null;
  saveNow?: (id: string, patch: NotaPatch, version?: number) => Promise<boolean>;
  /** Resposta dos guards de navegação (imagem subindo, por exemplo). */
  podeSair?: () => boolean;
}

/**
 * A aba sobre um `useNotas` falso com estado de verdade: `update` aplica na
 * lista na hora (como o hook), e o teste provoca o 409 e a versão de fora.
 */
function montar(opcoes: Opcoes = {}) {
  const log: string[] = [];
  const espias = {
    add: vi.fn(async (data: NotaPatch): Promise<Nota> => ({
      id: 'nova', version: 1, updated_at: AGORA.toISOString(),
      titulo: '', conteudo: '', fixada: false, autor: '', editado_por: '', ...data,
    })),
    update: vi.fn(),
    saveNow: vi.fn(opcoes.saveNow ?? (async () => true)),
    remove: vi.fn(async (id: string) => { log.push(`remover ${id}`); return true; }),
    flushPending: vi.fn(async () => true),
    clearError: vi.fn(),
    refresh: vi.fn(async () => {}),
    onSelecionar: vi.fn(),
    onPedirNome: vi.fn(),
  };
  const controle: {
    setLista?: Dispatch<SetStateAction<Nota[]>>;
    setStatus?: Dispatch<SetStateAction<Record<string, NotaSaveStatus>>>;
  } = {};

  function Harness() {
    const [lista, setLista] = useState<Nota[]>(opcoes.notas ?? paginas());
    const [status, setStatus] = useState<Record<string, NotaSaveStatus>>({});
    const [selecionada, setSelecionada] = useState<string | null>(opcoes.selecionada ?? null);
    controle.setLista = setLista;
    controle.setStatus = setStatus;
    const notas: UseNotas = {
      notas: lista, loading: opcoes.loading ?? false, error: null, saveStatus: status,
      hasPendingWrites: () => false,
      update: (id, patch) => {
        espias.update(id, patch);
        setLista(l => l.map(n => (n.id === id ? { ...n, ...patch } : n)));
        setStatus(s => ({ ...s, [id]: 'saving' }));
      },
      // Como o hook: 'saving' na hora; no 409, a linha do servidor (mais nova) e 'conflict'.
      saveNow: async (id, patch, version) => {
        setStatus(s => ({ ...s, [id]: 'saving' }));
        const ok = await espias.saveNow(id, patch, version);
        setLista(l => l.map(n => (n.id !== id ? n
          : ok ? { ...n, ...patch, version: (version ?? n.version) + 1 }
          : { ...n, version: n.version + 1, updated_at: AGORA.toISOString() })));
        setStatus(s => ({ ...s, [id]: ok ? 'saved' : 'conflict' }));
        return ok;
      },
      add: async data => {
        const nova = await espias.add(data);
        setLista(l => [...l, nova]);
        return nova;
      },
      remove: async id => {
        const ok = await espias.remove(id);
        if (ok) setLista(l => l.filter(n => n.id !== id));
        return ok;
      },
      refresh: espias.refresh,
      flushPending: espias.flushPending,
      clearError: espias.clearError,
    };
    const onSelecionar = async (id: string | null, op?: { substituir?: boolean }) => {
      espias.onSelecionar(id, op);
      if (opcoes.podeSair && !opcoes.podeSair()) return false;
      log.push(`abrir ${id}`);
      setSelecionada(id);
      return true;
    };
    return (
      <AnotacoesTab
        notas={notas}
        autor={opcoes.autor ?? 'Derylson'}
        onPedirNome={espias.onPedirNome}
        selecionada={selecionada}
        onSelecionar={onSelecionar}
      />
    );
  }

  render(<Harness />);
  return {
    espias,
    log,
    /** O autosave voltou 409: o hook aceita a versão do servidor e marca 'conflict' na mesma renderização. */
    conflito: (id: string, servidor: Partial<Nota>) => act(() => {
      controle.setLista!(l => l.map(n => (n.id === id ? { ...n, ...servidor } : n)));
      controle.setStatus!(s => ({ ...s, [id]: 'conflict' }));
    }),
    /** Releitura trouxe a versão de outra pessoa, sem nada pendente na tela. */
    deFora: (id: string, servidor: Partial<Nota>) => act(() => {
      controle.setLista!(l => l.map(n => (n.id === id ? { ...n, ...servidor } : n)));
    }),
  };
}

/** Títulos na lista, na ordem da tela. */
function titulosNaLista(): string[] {
  const lista = screen.getByRole('region', { name: 'Páginas' });
  return within(lista).queryAllByRole('link').map(a => a.querySelector('.notas-item-titulo')?.textContent ?? '');
}

const busca = () => screen.getByLabelText('Buscar nas páginas') as HTMLInputElement;
const editor = () => screen.getByLabelText('Conteúdo da página') as HTMLTextAreaElement;
const estado = () => screen.getByRole('status');

it('o título conta as páginas e as editadas na semana; a lista separa Fixadas de Recentes', async () => {
  const { espias } = montar();
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('3 páginas, 2 editadas nesta semana');
  const recorte = screen.getByRole('group', { name: 'Recorte das páginas' });
  expect(within(recorte).getByRole('button', { name: /^Todas/ }).textContent).toBe('Todas3');
  expect(within(recorte).getByRole('button', { name: /^Minhas/ }).textContent).toBe('Minhas2');

  expect(within(screen.getByRole('list', { name: 'Fixadas' })).getAllByRole('link')).toHaveLength(1);
  expect(within(screen.getByRole('list', { name: 'Recentes' })).getAllByRole('link')).toHaveLength(2);
  expect(titulosNaLista()).toEqual(['Triagem', 'Reunião com DROs', 'Excessos de fralda CD10']);
  // A meta diz quem editou por último e quando.
  const triagem = screen.getAllByRole('link')[0];
  expect(triagem.querySelector('.notas-item-meta')?.textContent).toBe('Derylson · há 5 min');
  expect(triagem.querySelector('.notas-item-trecho')?.textContent).toContain('Alinhar com Plínio');

  // Acima de 760px a primeira da ordem abre sozinha, sem empilhar histórico.
  await waitFor(() => expect(espias.onSelecionar).toHaveBeenCalledWith('n1', { substituir: true }));
  await waitFor(() => expect(triagem.getAttribute('aria-current')).toBe('true'));
  expect((screen.getByLabelText('Título da página') as HTMLInputElement).value).toBe('Triagem');
  expect(screen.getByText(/Escrita por/).textContent).toBe('Escrita por Derylson · editada há 5 min');
});

it('a busca casa título e texto sem acento e sem caixa, e o vazio diz o que foi buscado', () => {
  montar({ selecionada: 'n1' });
  fireEvent.change(busca(), { target: { value: 'reuniao' } });
  expect(titulosNaLista()).toEqual(['Reunião com DROs']);
  expect(screen.getByRole('button', { name: /^Todas/ }).textContent).toBe('Todas1');

  fireEvent.change(busca(), { target: { value: 'PLINIO' } });
  expect(titulosNaLista()).toEqual(['Triagem']);

  fireEvent.change(busca(), { target: { value: 'plantão domingo' } });
  expect(titulosNaLista()).toEqual([]);
  expect(screen.getByText('Nenhuma página com “plantão domingo”')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Limpar busca' }));
  expect(busca().value).toBe('');
  expect(titulosNaLista()).toHaveLength(3);
});

it('Minhas mostra as páginas que escrevi ou editei por último', () => {
  montar({ selecionada: 'n1' });
  const minhas = screen.getByRole('button', { name: /^Minhas/ });
  fireEvent.click(minhas);
  expect(minhas.getAttribute('aria-pressed')).toBe('true');
  expect(titulosNaLista()).toEqual(['Triagem', 'Reunião com DROs']);
});

it('Minhas sem nome no chip pede o nome em vez de mostrar lista vazia', () => {
  const { espias } = montar({ autor: '', selecionada: 'n1' });
  fireEvent.click(screen.getByRole('button', { name: /^Minhas/ }));
  expect(screen.getByRole('button', { name: /^Minhas/ }).textContent).toBe('Minhas0');
  fireEvent.click(screen.getByRole('button', { name: 'Dizer meu nome' }));
  expect(espias.onPedirNome).toHaveBeenCalledTimes(1);
});

it('Nova página cria com o autor, abre a página e põe o cursor no título', async () => {
  const { espias } = montar({ selecionada: 'n1' });
  fireEvent.click(screen.getByRole('button', { name: 'Nova página' }));
  await waitFor(() => expect(espias.add).toHaveBeenCalledWith({
    titulo: '', conteudo: '', fixada: false, autor: 'Derylson', editado_por: 'Derylson',
  }));
  await waitFor(() => expect(espias.onSelecionar).toHaveBeenLastCalledWith('nova', undefined));
  const titulo = screen.getByLabelText('Título da página') as HTMLInputElement;
  await waitFor(() => expect(document.activeElement).toBe(titulo));
  expect(titulo.value).toBe('');
  expect(titulo.placeholder).toBe('Sem título');
  // Na lista, a página sem título segue o vocabulário de vazio.
  expect(titulosNaLista()).toContain('Sem título');

  fireEvent.change(titulo, { target: { value: 'Pauta S&OP' } });
  expect(espias.update).toHaveBeenLastCalledWith('nova', { titulo: 'Pauta S&OP', editado_por: 'Derylson' });
});

it('digitar no corpo grava o documento com quem editou', () => {
  const { espias } = montar({ selecionada: 'n1' });
  fireEvent.change(editor(), { target: { value: 'Meus\nNova linha' } });
  expect(espias.update).toHaveBeenLastCalledWith('n1', { conteudo: docDeTexto('Meus\nNova linha'), editado_por: 'Derylson' });
  expect(estado().textContent).toBe('Salvando…');
});

it('Fixar alterna pela gravação automática', () => {
  const { espias } = montar({ selecionada: 'n1' });
  const fixada = screen.getByRole('button', { name: 'Fixar' });
  expect(fixada.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(fixada);
  expect(espias.update).toHaveBeenLastCalledWith('n1', { fixada: false, editado_por: 'Derylson' });
  expect(screen.getByRole('button', { name: 'Fixar' }).getAttribute('aria-pressed')).toBe('false');
});

it('Excluir pede confirmação; só então sai da página e depois exclui', async () => {
  const conteudo = JSON.stringify({
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Meus' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Alinhar com Plínio' }] },
      { type: 'image', attrs: { src: `/api/notas/${UUID_N1}/imagens/22222222-2222-4222-8222-222222222222` } },
      { type: 'image', attrs: { src: `/api/notas/${UUID_N1}/imagens/33333333-3333-4333-8333-333333333333` } },
    ],
  });
  const notas = paginas().map(n => (n.id === 'n1' ? { ...n, conteudo } : n));
  const { espias, log } = montar({ notas, selecionada: 'n1' });

  fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
  let dialogo = await screen.findByRole('dialog', { name: 'Excluir “Triagem”?' });
  expect(dialogo.textContent).toContain('As 2 linhas e as 2 imagens da página somem junto. Não há lixeira.');
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Manter' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(espias.remove).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
  dialogo = await screen.findByRole('dialog', { name: 'Excluir “Triagem”?' });
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Excluir' }));
  await waitFor(() => expect(espias.remove).toHaveBeenCalledWith('n1'));
  // A seguinte na ordem da lista abre ANTES de a página sumir.
  expect(log.slice(-2)).toEqual(['abrir n2', 'remover n1']);
  expect(espias.onSelecionar).toHaveBeenLastCalledWith('n2', { substituir: true });
  await waitFor(() => expect(titulosNaLista()).toEqual(['Reunião com DROs', 'Excessos de fralda CD10']));
});

it('página sem texto anuncia só que some', async () => {
  const notas = paginas().map(n => (n.id === 'n1' ? { ...n, titulo: '', conteudo: '' } : n));
  montar({ notas, selecionada: 'n1' });
  fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
  const dialogo = await screen.findByRole('dialog', { name: 'Excluir “Sem título”?' });
  expect(dialogo.textContent).toContain('A página some. Não há lixeira.');
});

it('versão de outra pessoa com a tela limpa troca o texto em silêncio', () => {
  const { espias, deFora } = montar({ selecionada: 'n1' });
  expect(editor().dataset.recarregar).toBe('0');
  // Só o título mudou: o corpo (e o cursor nele) não recarrega.
  deFora('n1', { titulo: 'Triagem da semana', version: 5 });
  expect((screen.getByLabelText('Título da página') as HTMLInputElement).value).toBe('Triagem da semana');
  expect(editor().dataset.recarregar).toBe('0');
  deFora('n1', { conteudo: docDeTexto('Linha que outra pessoa escreveu'), version: 6 });
  expect(editor().dataset.recarregar).toBe('1');
  expect(editor().value).toBe('Linha que outra pessoa escreveu');
  expect(screen.queryByText(/Outra pessoa editou/)).toBeNull();
  // Recarregar não grava nada: abrir e recarregar nunca editam a página.
  expect(espias.update).not.toHaveBeenCalled();
});

it('409: a faixa aparece, o texto local fica, e Manter a minha grava sobre a versão do servidor', async () => {
  const { espias, conflito } = montar({ selecionada: 'n1' });
  fireEvent.change(editor(), { target: { value: 'Meus\nO meu texto' } });

  conflito('n1', { conteudo: docDeTexto('A versão dela'), version: 7, updated_at: minutosAntes(1), editado_por: 'Rafael Costa' });
  const faixa = screen.getByRole('alert');
  expect(faixa.textContent).toContain('Outra pessoa editou esta página há 1 min.');
  expect(faixa.textContent).toContain('O seu texto continua aqui.');
  expect(estado().textContent).toBe('Não salvo');
  expect(espias.clearError).toHaveBeenCalled();
  // O texto da tela não foi trocado pelo do servidor.
  expect(editor().value).toBe('Meus\nO meu texto');
  expect(editor().dataset.recarregar).toBe('0');

  // Enquanto a pessoa não escolhe, nada grava por cima da outra versão.
  espias.update.mockClear();
  fireEvent.change(editor(), { target: { value: 'Meus\nO meu texto\nMais uma' } });
  expect(espias.update).not.toHaveBeenCalled();

  fireEvent.click(within(faixa).getByRole('button', { name: 'Manter a minha' }));
  await waitFor(() => expect(espias.saveNow).toHaveBeenCalledWith(
    'n1',
    { titulo: 'Triagem', conteudo: docDeTexto('Meus\nO meu texto\nMais uma'), editado_por: 'Derylson' },
    7,
  ));
  await waitFor(() => expect(screen.queryByText(/Outra pessoa editou/)).toBeNull());
  expect(estado().textContent).toBe('Salvo');
});

it('409 de novo ao Manter a minha deixa a faixa, com o tempo da versão nova', async () => {
  const { espias, conflito } = montar({ selecionada: 'n1', saveNow: async () => false });
  fireEvent.change(editor(), { target: { value: 'Meus\nO meu texto' } });
  conflito('n1', { conteudo: docDeTexto('A versão dela'), version: 7, updated_at: minutosAntes(3) });
  expect(screen.getByRole('alert').textContent).toContain('editou esta página há 3 min.');
  fireEvent.click(screen.getByRole('button', { name: 'Manter a minha' }));
  await waitFor(() => expect(espias.saveNow).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('editou esta página agora.'));
  expect(estado().textContent).toBe('Não salvo');
  expect(editor().value).toBe('Meus\nO meu texto');

  // A segunda tentativa vai sobre a versão que o segundo 409 devolveu.
  fireEvent.click(screen.getByRole('button', { name: 'Manter a minha' }));
  await waitFor(() => expect(espias.saveNow).toHaveBeenCalledTimes(2));
  expect(espias.saveNow.mock.calls[1][2]).toBe(8);
});

it('Carregar a dela pede confirmação e só então troca o texto da tela', async () => {
  const { espias, conflito } = montar({ selecionada: 'n1' });
  fireEvent.change(editor(), { target: { value: 'Meus\nO meu texto' } });
  conflito('n1', { conteudo: docDeTexto('A versão dela'), version: 7 });

  fireEvent.click(screen.getByRole('button', { name: 'Carregar a dela' }));
  let dialogo = await screen.findByRole('dialog', { name: 'Descartar o seu texto e carregar a versão salva?' });
  expect(dialogo.textContent).toContain('O seu texto, com 2 linhas, sai da tela, e a página volta à versão salva, com 1 linha.');
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Manter' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(editor().value).toBe('Meus\nO meu texto');
  expect(screen.getByText(/Outra pessoa editou/)).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Carregar a dela' }));
  dialogo = await screen.findByRole('dialog', { name: 'Descartar o seu texto e carregar a versão salva?' });
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Carregar a dela' }));
  await waitFor(() => expect(editor().dataset.recarregar).toBe('1'));
  expect(editor().value).toBe('A versão dela');
  expect(screen.queryByText(/Outra pessoa editou/)).toBeNull();
  expect(espias.saveNow).not.toHaveBeenCalled();
  expect(estado().textContent).toBe('Salvo');

  // Daqui em diante a edição volta ao caminho normal.
  fireEvent.change(editor(), { target: { value: 'A versão dela\nE a minha linha' } });
  expect(espias.update).toHaveBeenLastCalledWith('n1', { conteudo: docDeTexto('A versão dela\nE a minha linha'), editado_por: 'Derylson' });
});

it('carregando sem cache mostra o esqueleto, não o vazio', () => {
  montar({ notas: [], loading: true });
  expect(screen.getByRole('status', { name: 'Carregando páginas…' })).toBeTruthy();
  expect(screen.queryByText('Nenhuma página ainda')).toBeNull();
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Anotações');
});

it('sem página nenhuma, o vazio explica e cria a primeira', async () => {
  const { espias } = montar({ notas: [] });
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Anotações');
  expect(screen.getByText('Nenhuma página ainda')).toBeTruthy();
  expect(screen.getByText(/As páginas guardam resumos, pautas e pendências da equipe/)).toBeTruthy();
  // Dois "Nova página": o da barra e o do vazio. O do vazio também cria.
  const botoes = screen.getAllByRole('button', { name: 'Nova página' });
  expect(botoes).toHaveLength(2);
  fireEvent.click(botoes[1]);
  await waitFor(() => expect(espias.add).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(espias.onSelecionar).toHaveBeenLastCalledWith('nova', undefined));
});

it('link para uma página que não existe mais abre a primeira, sem empilhar histórico', async () => {
  const { espias } = montar({ selecionada: 'apagada' });
  await waitFor(() => expect(espias.onSelecionar).toHaveBeenCalledWith('n1', { substituir: true }));
});

it('a busca ativa é limpa ao criar uma página, senão a nova sumiria da lista', async () => {
  const { espias } = montar({ selecionada: 'n1' });
  fireEvent.change(busca(), { target: { value: 'reuniao' } });
  fireEvent.click(screen.getByRole('button', { name: 'Nova página' }));
  await waitFor(() => expect(espias.onSelecionar).toHaveBeenLastCalledWith('nova', undefined));
  expect(busca().value).toBe('');
  const ativa = screen.getAllByRole('link').find(a => a.getAttribute('aria-current') === 'true');
  expect(ativa?.querySelector('.notas-item-titulo')?.textContent).toBe('Sem título');
});

it('se alguém diz "ficar" ao sair da página, Excluir não exclui', async () => {
  const { espias } = montar({ selecionada: 'n1', podeSair: () => false });
  fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
  const dialogo = await screen.findByRole('dialog', { name: 'Excluir “Triagem”?' });
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Excluir' }));
  await waitFor(() => expect(espias.onSelecionar).toHaveBeenCalledWith('n2', { substituir: true }));
  await act(async () => {});
  expect(espias.remove).not.toHaveBeenCalled();
  expect((screen.getByLabelText('Título da página') as HTMLInputElement).value).toBe('Triagem');
});

it('se alguém diz "ficar", a página nova em branco não fica para trás', async () => {
  const { espias } = montar({ selecionada: 'n1', podeSair: () => false });
  fireEvent.click(screen.getByRole('button', { name: 'Nova página' }));
  await waitFor(() => expect(espias.remove).toHaveBeenCalledWith('nova'));
  expect(titulosNaLista()).not.toContain('Sem título');
  expect((screen.getByLabelText('Título da página') as HTMLInputElement).value).toBe('Triagem');
});
