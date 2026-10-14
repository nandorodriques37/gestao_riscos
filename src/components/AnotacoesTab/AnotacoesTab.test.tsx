// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AnotacoesTab } from './AnotacoesTab';
import type { EditorNotaProps } from './EditorNota';
import { useNotas, type NotaSaveStatus, type UseNotas } from '../../hooks/useNotas';
import { canNavigate } from '../../lib/navigation';
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
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const UUID_N1 = '11111111-1111-4111-8111-111111111111';

function paginas(): Nota[] {
  return [
    {
      id: 'n2', version: 2, updated_at: minutosAntes(120), titulo: 'Reunião regional', fixada: false,
      // Escrita por outra pessoa, editada por último por mim (em caixa alta): é "minha".
      autor: 'Camila Nunes', editado_por: 'DERYLSON',
      conteudo: docDeTexto('Faltas na região sul\nMaterial de apoio'),
    },
    {
      id: 'n1', version: 4, updated_at: minutosAntes(5), titulo: 'Triagem', fixada: true,
      autor: 'Derylson', editado_por: 'Derylson',
      conteudo: docDeTexto('Meus\nRevisar com a Ana o relatório de vendas;\nLigar para os fornecedores atrasados;'),
    },
    {
      id: 'n3', version: 1, updated_at: new Date(2026, 9, 8, 16, 0).toISOString(), titulo: 'Estoque parado no depósito', fixada: false,
      autor: 'Rafael Costa', editado_por: 'Rafael Costa',
      conteudo: docDeTexto('Transportadora: remanejar as cargas'),
    },
  ];
}

const SEM_TEXTO_RECUSADO: UseNotas['naoSalvas'] = new Map();

interface Opcoes {
  notas?: Nota[];
  loading?: boolean;
  autor?: string;
  selecionada?: string | null;
  saveNow?: (id: string, patch: NotaPatch, version?: number) => Promise<boolean>;
  /** Resposta dos guards de navegação (imagem subindo, por exemplo). */
  podeSair?: () => boolean;
  /** O que a releitura traz do servidor (sem isto, a lista não muda). */
  releitura?: () => Promise<Nota[]>;
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
    refresh: vi.fn(async () => {
      const doServidor = await opcoes.releitura?.();
      if (doServidor) controle.setLista!(doServidor);
    }),
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
      notas: lista, loading: opcoes.loading ?? false, error: null, semConexao: false, saveStatus: status,
      hasPendingWrites: () => false,
      hasPendingWrite: () => false,
      naoSalvas: SEM_TEXTO_RECUSADO,
      textoNaoSalvo: () => undefined,
      guardarTexto: () => {},
      descartarTexto: () => {},
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
  expect(titulosNaLista()).toEqual(['Triagem', 'Reunião regional', 'Estoque parado no depósito']);
  // A meta diz quem editou por último e quando.
  const triagem = screen.getAllByRole('link')[0];
  expect(triagem.querySelector('.notas-item-meta')?.textContent).toBe('Derylson · há 5 min');
  expect(triagem.querySelector('.notas-item-trecho')?.textContent).toContain('Revisar com a Ana');

  // Acima de 760px a primeira da ordem abre sozinha, sem empilhar histórico.
  await waitFor(() => expect(espias.onSelecionar).toHaveBeenCalledWith('n1', { substituir: true }));
  await waitFor(() => expect(triagem.getAttribute('aria-current')).toBe('true'));
  expect((screen.getByLabelText('Título da página') as HTMLInputElement).value).toBe('Triagem');
  expect(screen.getByText(/Escrita por/).textContent).toBe('Escrita por Derylson · editada há 5 min');
});

it('a busca casa título e texto sem acento e sem caixa, e o vazio diz o que foi buscado', () => {
  montar({ selecionada: 'n1' });
  fireEvent.change(busca(), { target: { value: 'reuniao' } });
  expect(titulosNaLista()).toEqual(['Reunião regional']);
  expect(screen.getByRole('button', { name: /^Todas/ }).textContent).toBe('Todas1');

  fireEvent.change(busca(), { target: { value: 'RELATORIO' } });
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
  expect(titulosNaLista()).toEqual(['Triagem', 'Reunião regional']);
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
      { type: 'paragraph', content: [{ type: 'text', text: 'Revisar com a Ana' }] },
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
  await waitFor(() => expect(titulosNaLista()).toEqual(['Reunião regional', 'Estoque parado no depósito']));
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
  // Sem versão explícita: o hook lê a da lista depois de gravar a fila da página.
  await waitFor(() => expect(espias.saveNow).toHaveBeenCalledWith(
    'n1',
    { titulo: 'Triagem', conteudo: docDeTexto('Meus\nO meu texto\nMais uma'), editado_por: 'Derylson' },
    undefined,
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

  // A segunda tentativa também vai sem versão: o hook usa a que o segundo 409
  // deixou na lista (o teste com o hook de verdade, abaixo, confere o número).
  fireEvent.click(screen.getByRole('button', { name: 'Manter a minha' }));
  await waitFor(() => expect(espias.saveNow).toHaveBeenCalledTimes(2));
  expect(espias.saveNow.mock.calls[1][2]).toBeUndefined();
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

it('link para uma página que esta tela ainda não leu: relê antes, diz que está abrindo e abre a pedida, sem trocar pela primeira', async () => {
  let liberar!: () => void;
  const chegou = new Promise<void>(r => { liberar = r; });
  const nova: Nota = {
    id: 'n9', version: 1, updated_at: minutosAntes(1), titulo: 'Pauta do comitê de riscos', fixada: false,
    autor: 'Bia Lima', editado_por: 'Bia Lima', conteudo: docDeTexto('Itens da pauta'),
  };
  const { espias } = montar({ selecionada: 'n9', releitura: async () => { await chegou; return [...paginas(), nova]; } });

  expect(await screen.findByText('Abrindo a página…')).toBeTruthy();
  expect(espias.refresh).toHaveBeenCalledTimes(1);
  // Enquanto relê, a escolha automática não troca a página pedida pela primeira.
  expect(espias.onSelecionar).not.toHaveBeenCalled();
  expect(screen.queryByText(/não existe mais/)).toBeNull();

  await act(async () => { liberar(); });
  await waitFor(() => expect(tituloDaPagina()).toBe('Pauta do comitê de riscos'));
  expect(editor().value).toBe('Itens da pauta');
  expect(screen.queryByText('Abrindo a página…')).toBeNull();
  expect(itemDaLista('n9').getAttribute('aria-current')).toBe('true');
  // A URL continua a do link: ninguém navegou.
  expect(espias.onSelecionar).not.toHaveBeenCalled();
  expect(espias.refresh).toHaveBeenCalledTimes(1);
});

it('link para uma página que não existe nem depois de reler: diz isso, não abre outra no lugar, e Ver as páginas volta à lista', async () => {
  const { espias } = montar({ selecionada: 'apagada' });
  expect(await screen.findByText('Esta página não existe mais ou foi excluída.')).toBeTruthy();
  expect(espias.refresh).toHaveBeenCalledTimes(1);
  expect(espias.onSelecionar).not.toHaveBeenCalled();
  // A lista continua inteira ao lado, sem nenhuma marcada.
  expect(titulosNaLista()).toHaveLength(3);
  expect(screen.getAllByRole('link').some(a => a.getAttribute('aria-current') === 'true')).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Ver as páginas' }));
  await waitFor(() => expect(espias.onSelecionar).toHaveBeenCalledWith(null, undefined));
  // Sem página pedida, a tela larga volta a abrir a primeira — substituindo, sem empilhar histórico.
  await waitFor(() => expect(espias.onSelecionar).toHaveBeenLastCalledWith('n1', { substituir: true }));
  expect(screen.queryByText('Esta página não existe mais ou foi excluída.')).toBeNull();
});

it('o título longo quebra em vez de sumir: o campo cresce com o texto, Enter leva ao corpo e a quebra colada vira espaço', () => {
  const { espias } = montar({ selecionada: 'n1' });
  const titulo = screen.getByLabelText('Título da página') as HTMLTextAreaElement;
  expect(titulo.tagName).toBe('TEXTAREA');
  expect(titulo.maxLength).toBe(200);

  // A altura acompanha o texto (o jsdom não mede: o teste diz quanto o texto ocupa).
  Object.defineProperty(titulo, 'scrollHeight', { configurable: true, get: () => 88 });
  fireEvent.change(titulo, { target: { value: 'Pauta do comitê de riscos\n— outubro de 2026' } });
  expect(titulo.value).toBe('Pauta do comitê de riscos — outubro de 2026');
  expect(titulo.style.height).toBe('88px');
  expect(espias.update).toHaveBeenLastCalledWith('n1', { titulo: 'Pauta do comitê de riscos — outubro de 2026', editado_por: 'Derylson' });

  // Enter (com ou sem Shift) não quebra a linha: vai para o corpo.
  titulo.focus();
  expect(fireEvent.keyDown(titulo, { key: 'Enter' })).toBe(false);
  expect(document.activeElement).toBe(editor());
  titulo.focus();
  expect(fireEvent.keyDown(titulo, { key: 'Enter', shiftKey: true })).toBe(false);
  expect(document.activeElement).toBe(editor());
  expect(titulo.value).toBe('Pauta do comitê de riscos — outubro de 2026');
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

/* -------------------------------------------------------------------------- */
/* Com o hook de verdade (useNotas) e um servidor falso: o que a tela faz      */
/* quando o servidor recusa o texto — 409, página excluída, limite, sem rede.  */
/* -------------------------------------------------------------------------- */

const ID_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const ID_B = 'bbbbbbbb-2222-4222-8222-222222222222';

function paginaNoServidor(id: string, titulo: string, texto: string, version = 1): Nota {
  return {
    id, titulo, conteudo: docDeTexto(texto), fixada: false, autor: 'Ana', editado_por: 'Ana',
    version, updated_at: minutosAntes(30),
  };
}

const respostaJson = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), {
  status, headers: { 'Content-Type': 'application/json' },
});

/**
 * O servidor da rota `/api/portfolio/notas`, com a mesma regra de versão (409
 * com a linha atual), o 404 de `Registro não encontrado` e uma chave de "sem
 * rede" que faz o `fetch` rejeitar como o do navegador.
 */
function servidorDeNotas(iniciais: Nota[]) {
  const linhas = new Map(iniciais.map(n => [n.id, n]));
  const patches: { id: string; corpo: Record<string, unknown> }[] = [];
  const posts: Record<string, unknown>[] = [];
  const estado = { offline: false, recusa: null as null | { status: number; error: string }, criadas: 0 };
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (estado.offline) throw new TypeError('Failed to fetch');
    const metodo = init?.method ?? 'GET';
    const m = /^\/api\/portfolio\/notas(?:\/([^/]+))?$/.exec(url);
    if (!m) return respostaJson({ error: 'Rota não encontrada' }, 404);
    if (metodo === 'GET') return respostaJson([...linhas.values()]);
    const corpo = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    if (metodo === 'POST') {
      posts.push(corpo);
      const nova = { ...paginaNoServidor(`cccccccc-0000-4000-8000-00000000000${++estado.criadas}`, '', ''), ...corpo, version: 1 } as Nota;
      linhas.set(nova.id, nova);
      return respostaJson(nova, 201);
    }
    const id = decodeURIComponent(m[1] ?? '');
    if (metodo === 'PATCH') {
      patches.push({ id, corpo });
      if (estado.recusa) return respostaJson({ error: estado.recusa.error }, estado.recusa.status);
      const atual = linhas.get(id);
      if (!atual) return respostaJson({ error: 'Registro não encontrado' }, 404);
      const { expectedVersion, ...campos } = corpo;
      if (expectedVersion != null && expectedVersion !== atual.version) return respostaJson(atual, 409);
      const salva = { ...atual, ...campos, version: atual.version + 1 } as Nota;
      linhas.set(id, salva);
      return respostaJson(salva);
    }
    return respostaJson({ error: 'Método não suportado' }, 405);
  }));
  return {
    linhas, patches, posts, estado,
    /** Outra pessoa grava a página direto no servidor. */
    gravarPorFora: (id: string, texto: string) => {
      const atual = linhas.get(id)!;
      linhas.set(id, { ...atual, conteudo: docDeTexto(texto), version: atual.version + 1, editado_por: 'Bia', updated_at: AGORA.toISOString() });
    },
  };
}

/** A aba com o `useNotas` de verdade e a seleção passando pelos guards, como no `App`. */
function montarComHook(inicial: string) {
  const ref: { notas?: UseNotas } = {};
  function HarnessReal() {
    const notas = useNotas();
    ref.notas = notas;
    const [sel, setSel] = useState<string | null>(inicial);
    const onSelecionar = async (id: string | null) => {
      if (!(await canNavigate())) return false;
      setSel(id);
      return true;
    };
    return <AnotacoesTab notas={notas} autor="Ana" onPedirNome={() => {}} selecionada={sel} onSelecionar={onSelecionar} />;
  }
  render(<HarnessReal />);
  return ref as { notas: UseNotas };
}

const itemDaLista = (id: string) => document.getElementById(`nota-item-${id}`)!;
const tituloDaPagina = () => (screen.getByLabelText('Título da página') as HTMLInputElement).value;

async function abertaCom(texto: string) {
  await waitFor(() => expect(editor().value).toBe(texto));
}

it('trocar de página com gravação na fila espera o envio: o 409 acende a faixa ANTES de sair, com o texto na tela', async () => {
  localStorage.clear();
  const srv = servidorDeNotas([paginaNoServidor(ID_A, 'Pagina A', 'linha original A'), paginaNoServidor(ID_B, 'Pagina B', 'linha B')]);
  montarComHook(ID_A);
  await abertaCom('linha original A');

  srv.gravarPorFora(ID_A, 'texto dela');
  fireEvent.change(editor(), { target: { value: 'linha original A\nMEU PARAGRAFO' } });
  // Antes dos 600 ms do salvamento automático, clica na outra página.
  fireEvent.click(itemDaLista(ID_B));

  const faixa = await screen.findByRole('alert');
  expect(faixa.textContent).toContain('Outra pessoa editou esta página');
  // A página não saiu, e o texto continua na tela.
  expect(tituloDaPagina()).toBe('Pagina A');
  expect(editor().value).toBe('linha original A\nMEU PARAGRAFO');
  expect(srv.patches).toHaveLength(1);
  expect(srv.patches[0].corpo.expectedVersion).toBe(1);
});

it('a página que sai com gravação na fila e leva 409 depois (sem rede na hora) não perde o texto: o aviso nomeia a página e reabrir acende a faixa', async () => {
  localStorage.clear();
  const srv = servidorDeNotas([paginaNoServidor(ID_A, 'Pagina A', 'linha original A'), paginaNoServidor(ID_B, 'Pagina B', 'linha B')]);
  const ref = montarComHook(ID_A);
  await abertaCom('linha original A');

  srv.estado.offline = true;
  fireEvent.change(editor(), { target: { value: 'linha original A\nTEXTO SEM REDE' } });
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Sem conexão com o servidor'), { timeout: 3000 });
  // Nada que o servidor não confirmou vai para o cache: reaberto sem rede, nada diria "Salvo".
  expect(localStorage.getItem('notas.cache.v1')).not.toContain('TEXTO SEM REDE');

  // Sem rede, sair não fica preso: a fila continua no hook.
  srv.gravarPorFora(ID_A, 'texto dela');
  fireEvent.click(itemDaLista(ID_B));
  await waitFor(() => expect(tituloDaPagina()).toBe('Pagina B'));

  // A conexão volta e a nova tentativa leva 409, com a página fora da tela.
  srv.estado.offline = false;
  await act(async () => { await ref.notas.flushPending(); });
  const aviso = await screen.findByText('O seu texto em “Pagina A” não foi salvo: outra pessoa editou a página.');
  // Um aviso só: o genérico do hook ("Este registro foi alterado…") não repete.
  expect(screen.queryByText(/Este registro foi alterado/)).toBeNull();
  expect(localStorage.getItem('notas.cache.v1')).not.toContain('TEXTO SEM REDE');
  // Fora da fila e fora do cache, o texto só existe na memória: fechar o navegador pergunta.
  const fechar = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(fechar);
  expect(fechar.defaultPrevented).toBe(true);

  fireEvent.click(within(aviso.closest('.error-banner') as HTMLElement).getByRole('button', { name: 'Abrir página' }));
  await waitFor(() => expect(tituloDaPagina()).toBe('Pagina A'));
  // Reabre a partir do texto guardado, com a faixa de escolha.
  expect(editor().value).toBe('linha original A\nTEXTO SEM REDE');
  expect(screen.getByRole('alert').textContent).toContain('Outra pessoa editou esta página');
  expect(screen.queryByText(/não foi salvo: outra pessoa/)).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Manter a minha' }));
  await waitFor(() => expect(estado().textContent).toBe('Salvo'));
  expect(srv.linhas.get(ID_A)!.conteudo).toBe(docDeTexto('linha original A\nTEXTO SEM REDE'));
  expect(screen.queryByRole('alert')).toBeNull();
});

it('Descartar e sair leva o texto guardado: o aviso da página não volta depois', async () => {
  localStorage.clear();
  const srv = servidorDeNotas([paginaNoServidor(ID_A, 'Pagina A', 'linha original A'), paginaNoServidor(ID_B, 'Pagina B', 'linha B')]);
  montarComHook(ID_A);
  await abertaCom('linha original A');
  srv.gravarPorFora(ID_A, 'texto dela');
  fireEvent.change(editor(), { target: { value: 'linha original A\nMEU PARAGRAFO' } });
  fireEvent.click(itemDaLista(ID_B));
  await screen.findByRole('alert');

  fireEvent.click(itemDaLista(ID_B));
  const dialogo = await screen.findByRole('dialog', { name: 'Sair sem salvar o seu texto?' });
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Descartar e sair' }));
  await waitFor(() => expect(tituloDaPagina()).toBe('Pagina B'));
  expect(screen.queryByText(/não foi salvo/)).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('Manter a minha depois de um Fixar no conflito grava sobre a versão certa, sem 409 da própria pessoa', async () => {
  localStorage.clear();
  const srv = servidorDeNotas([paginaNoServidor(ID_A, 'Pagina A', 'linha original A'), paginaNoServidor(ID_B, 'Pagina B', 'linha B')]);
  montarComHook(ID_A);
  await abertaCom('linha original A');
  srv.gravarPorFora(ID_A, 'texto dela');
  fireEvent.change(editor(), { target: { value: 'linha original A\nMEU PARAGRAFO' } });
  fireEvent.click(itemDaLista(ID_B));
  await screen.findByRole('alert');

  // Fixar durante o conflito vai pela fila; Manter a minha grava a fila antes.
  fireEvent.click(screen.getByRole('button', { name: 'Fixar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Manter a minha' }));
  await waitFor(() => expect(estado().textContent).toBe('Salvo'));

  expect(srv.patches.map(p => [Object.keys(p.corpo).filter(k => k !== 'editado_por' && k !== 'expectedVersion').sort().join(','), p.corpo.expectedVersion]))
    .toEqual([['conteudo', 1], ['fixada', 2], ['conteudo,titulo', 3]]);
  expect(srv.linhas.get(ID_A)).toMatchObject({ version: 4, fixada: true, conteudo: docDeTexto('linha original A\nMEU PARAGRAFO') });
  expect(screen.queryByText(/Outra pessoa editou/)).toBeNull();
});

it('página excluída por outra pessoa: diz isso (não "Sem conexão"), não tenta de novo, e Recriar com o meu texto cria e abre a página', async () => {
  localStorage.clear();
  const srv = servidorDeNotas([paginaNoServidor(ID_A, 'Pagina A', 'linha original A'), paginaNoServidor(ID_B, 'Pagina B', 'linha B')]);
  const ref = montarComHook(ID_A);
  await abertaCom('linha original A');

  srv.linhas.delete(ID_A);
  fireEvent.change(editor(), { target: { value: 'linha original A\nMEU TEXTO' } });
  const faixa = await screen.findByText('Esta página foi excluída por outra pessoa.', {}, { timeout: 3000 });
  expect(screen.queryByText(/Sem conexão/)).toBeNull();
  expect(estado().textContent).toBe('Não salvo');
  // O 404 sai da fila: nada fica tentando, e a releitura destrava.
  expect(ref.notas.hasPendingWrites()).toBe(false);
  await act(async () => { await ref.notas.refresh(); });
  expect(titulosNaLista()).toEqual(['Pagina B']);
  // A página saiu da lista, mas o texto continua na tela.
  expect(tituloDaPagina()).toBe('Pagina A');
  expect(editor().value).toBe('linha original A\nMEU TEXTO');
  expect(srv.patches).toHaveLength(1);

  fireEvent.click(within(faixa.closest('.nota-erro') as HTMLElement).getByRole('button', { name: 'Recriar com o meu texto' }));
  await waitFor(() => expect(srv.posts).toHaveLength(1));
  expect(srv.posts[0]).toMatchObject({ titulo: 'Pagina A', conteudo: docDeTexto('linha original A\nMEU TEXTO'), autor: 'Ana', editado_por: 'Ana' });
  await waitFor(() => expect(screen.queryByText('Esta página foi excluída por outra pessoa.')).toBeNull());
  expect(tituloDaPagina()).toBe('Pagina A');
  expect(editor().value).toBe('linha original A\nMEU TEXTO');
  expect(estado().textContent).toBe('Salvo');
  expect(titulosNaLista().sort()).toEqual(['Pagina A', 'Pagina B']);
});

it('recusa do servidor (limite de tamanho) mostra a mensagem dele e não tenta de novo sozinha; Tentar de novo grava o texto corrigido', async () => {
  localStorage.clear();
  const srv = servidorDeNotas([paginaNoServidor(ID_A, 'Pagina A', 'linha original A'), paginaNoServidor(ID_B, 'Pagina B', 'linha B')]);
  const ref = montarComHook(ID_A);
  await abertaCom('linha original A');

  srv.estado.recusa = { status: 400, error: 'A página passou do limite de tamanho. Divida o texto em duas páginas.' };
  fireEvent.change(editor(), { target: { value: 'linha original A\n(texto colado enorme)' } });
  const faixa = await screen.findByText(/Divida o texto em duas páginas/, {}, { timeout: 3000 });
  expect(faixa.textContent).toContain('O servidor não aceitou o texto.');
  expect(screen.queryByText(/Sem conexão/)).toBeNull();
  expect(estado().textContent).toBe('Não salvo');
  expect(ref.notas.hasPendingWrites()).toBe(false);

  // A pessoa corta o texto e tenta de novo.
  srv.estado.recusa = null;
  fireEvent.change(editor(), { target: { value: 'linha original A\n(resumo)' } });
  expect(srv.patches).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  await waitFor(() => expect(estado().textContent).toBe('Salvo'));
  expect(srv.linhas.get(ID_A)!.conteudo).toBe(docDeTexto('linha original A\n(resumo)'));
  expect(screen.queryByRole('alert')).toBeNull();
});

it('com o texto recusado (400) na tela, a lista mostra a versão que o servidor tem; gravado o texto corrigido, mostra o novo', async () => {
  localStorage.clear();
  const srv = servidorDeNotas([paginaNoServidor(ID_A, 'Pagina A', 'linha original A'), paginaNoServidor(ID_B, 'Pagina B', 'linha B')]);
  montarComHook(ID_A);
  await abertaCom('linha original A');

  srv.estado.recusa = { status: 400, error: 'A página passou do limite de tamanho. Divida o texto em duas páginas.' };
  fireEvent.change(screen.getByLabelText('Título da página'), { target: { value: 'TITULO RECUSADO' } });
  fireEvent.change(editor(), { target: { value: 'linha original A\nTEXTO RECUSADO' } });
  await screen.findByText(/Divida o texto em duas páginas/, {}, { timeout: 3000 });

  // A lista não anuncia o que o servidor recusou…
  const item = itemDaLista(ID_A);
  expect(item.textContent).not.toContain('RECUSADO');
  expect(item.querySelector('.notas-item-titulo')?.textContent).toBe('Pagina A');
  expect(item.querySelector('.notas-item-trecho')?.textContent).toContain('linha original A');
  expect(item.querySelector('.notas-item-meta')?.textContent).toContain('Ana');
  // …e a tela continua com o texto de quem escreveu.
  expect(editor().value).toBe('linha original A\nTEXTO RECUSADO');
  expect(tituloDaPagina()).toBe('TITULO RECUSADO');

  srv.estado.recusa = null;
  fireEvent.change(editor(), { target: { value: 'linha original A\n(resumo)' } });
  expect(itemDaLista(ID_A).textContent).not.toContain('(resumo)');
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  await waitFor(() => expect(estado().textContent).toBe('Salvo'));
  expect(itemDaLista(ID_A).querySelector('.notas-item-titulo')?.textContent).toBe('TITULO RECUSADO');
  expect(itemDaLista(ID_A).textContent).toContain('(resumo)');
});

it('Descartar e sair depois de uma recusa (400) descarta de verdade: reabrir mostra o texto do servidor, sem "Sem conexão", e a próxima edição não sobe o descartado', async () => {
  localStorage.clear();
  const srv = servidorDeNotas([paginaNoServidor(ID_A, 'Pagina A', 'linha original A'), paginaNoServidor(ID_B, 'Pagina B', 'linha B')]);
  montarComHook(ID_A);
  await abertaCom('linha original A');

  srv.estado.recusa = { status: 400, error: 'A página passou do limite de tamanho. Divida o texto em duas páginas.' };
  fireEvent.change(editor(), { target: { value: 'linha original A\nTEXTO RECUSADO' } });
  await screen.findByText(/Divida o texto em duas páginas/, {}, { timeout: 3000 });

  fireEvent.click(itemDaLista(ID_B));
  const dialogo = await screen.findByRole('dialog', { name: 'Sair sem salvar o seu texto?' });
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Descartar e sair' }));
  await waitFor(() => expect(tituloDaPagina()).toBe('Pagina B'));
  srv.estado.recusa = null;
  // A lista não anuncia o texto descartado.
  expect(itemDaLista(ID_A).textContent).not.toContain('TEXTO RECUSADO');

  fireEvent.click(itemDaLista(ID_A));
  await abertaCom('linha original A');
  expect(estado().textContent).toBe('Salvo');
  expect(screen.queryByRole('alert')).toBeNull();

  fireEvent.change(editor(), { target: { value: 'linha original A\nNOVO' } });
  await waitFor(() => expect(srv.linhas.get(ID_A)!.version).toBe(2), { timeout: 3000 });
  expect(srv.linhas.get(ID_A)!.conteudo).toBe(docDeTexto('linha original A\nNOVO'));
});

it('erro do servidor que passa sozinho (500) mostra a mensagem dele, não "Sem conexão", e segue tentando', async () => {
  localStorage.clear();
  const srv = servidorDeNotas([paginaNoServidor(ID_A, 'Pagina A', 'linha original A'), paginaNoServidor(ID_B, 'Pagina B', 'linha B')]);
  const ref = montarComHook(ID_A);
  await abertaCom('linha original A');

  srv.estado.recusa = { status: 500, error: 'Falha no banco de dados.' };
  fireEvent.change(editor(), { target: { value: 'linha original A\nMEU TEXTO' } });
  const faixa = await screen.findByText(/Falha no banco de dados\./, {}, { timeout: 3000 });
  expect(faixa.textContent).toContain('sobe na próxima tentativa');
  expect(screen.queryByText(/Sem conexão/)).toBeNull();
  expect(estado().textContent).toBe('Não salvo · tentando de novo');
  // Continua na fila: não é recusa definitiva.
  expect(ref.notas.hasPendingWrites()).toBe(true);

  srv.estado.recusa = null;
  fireEvent.click(screen.getByRole('button', { name: 'Tentar agora' }));
  await waitFor(() => expect(estado().textContent).toBe('Salvo'));
  expect(srv.linhas.get(ID_A)!.conteudo).toBe(docDeTexto('linha original A\nMEU TEXTO'));
});

it('sair da ABA com gravação na fila e levar 409 depois também não perde o texto: ao voltar, o aviso nomeia a página', async () => {
  localStorage.clear();
  const srv = servidorDeNotas([paginaNoServidor(ID_A, 'Pagina A', 'linha original A'), paginaNoServidor(ID_B, 'Pagina B', 'linha B')]);
  const ref: { notas?: UseNotas } = {};
  // O hook mora acima da aba, como no `App`: trocar de aba desmonta só a aba.
  function ComAbas() {
    const notas = useNotas();
    ref.notas = notas;
    const [naAba, setNaAba] = useState(true);
    const [sel, setSel] = useState<string | null>(ID_A);
    const sair = async () => { if (await canNavigate()) setNaAba(false); };
    return (
      <>
        <button type="button" onClick={() => void sair()}>Ir para Pessoas</button>
        {/* Volta por um link para a outra página (no `App`, a URL leva a página). */}
        <button type="button" onClick={() => { setSel(ID_B); setNaAba(true); }}>Abrir a Pagina B</button>
        {naAba && (
          <AnotacoesTab notas={notas} autor="Ana" onPedirNome={() => {}} selecionada={sel}
            onSelecionar={async id => { if (!(await canNavigate())) return false; setSel(id); return true; }} />
        )}
      </>
    );
  }
  render(<ComAbas />);
  await abertaCom('linha original A');

  srv.estado.offline = true;
  fireEvent.change(editor(), { target: { value: 'linha original A\nTEXTO DA ABA' } });
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Sem conexão'), { timeout: 3000 });
  srv.gravarPorFora(ID_A, 'texto dela');
  fireEvent.click(screen.getByRole('button', { name: 'Ir para Pessoas' }));
  await waitFor(() => expect(screen.queryByLabelText('Conteúdo da página')).toBeNull());

  srv.estado.offline = false;
  await act(async () => { await ref.notas!.flushPending(); });
  fireEvent.click(screen.getByRole('button', { name: 'Abrir a Pagina B' }));
  await abertaCom('linha B');
  expect(screen.getByText('O seu texto em “Pagina A” não foi salvo: outra pessoa editou a página.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Abrir página' }));
  await waitFor(() => expect(editor().value).toBe('linha original A\nTEXTO DA ABA'));
  expect(screen.getByRole('alert').textContent).toContain('Outra pessoa editou esta página');
});
