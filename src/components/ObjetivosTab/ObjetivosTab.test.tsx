// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ObjetivosTab } from './ObjetivosTab';
import type { UsePortfolio } from '../../hooks/usePortfolio';
import type { AcaoRisco, Iniciativa, Objetivo, StoredRiskRecord } from '../../types';
import { OBJETIVO_BALDE } from '../../lib/portfolioUi';

beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// Ordem manual do servidor: o abandonado `x` e o balde ficam no meio de
// propósito — reordenar os visíveis não pode tirá-los do lugar.
const objetivos = [
  { id: 'a', descricao: 'Disponibilidade', status: 'ativo', indicador: 'Ruptura', unidade: '%', baseline: 8, meta: 4, prazo: '2027-01-01', dono_id: 'p' },
  { id: 'x', descricao: 'Antigo', status: 'abandonado', indicador: '', unidade: '', baseline: null, meta: null, prazo: null, dono_id: null },
  { id: 'b', descricao: 'Margem', status: 'ativo', indicador: '', unidade: '', baseline: null, meta: null, prazo: null, dono_id: null },
  { id: 'balde', descricao: OBJETIVO_BALDE, status: 'ativo', indicador: '', unidade: '', baseline: null, meta: null, prazo: '2020-01-01', dono_id: null },
  { id: 'c', descricao: 'Capital de giro', status: 'ativo', indicador: '', unidade: '', baseline: null, meta: null, prazo: '2026-10-01', dono_id: null },
] as Objetivo[];

const iniciativas = [
  { id: 'i1', objetivo_id: 'a', nome: 'BI de rupturas', status: 'concluida', impacto_rs: 100_000 },
  { id: 'i2', objetivo_id: 'a', nome: 'Rever pedidos', status: 'em_execucao', impacto_rs: 50_000 },
  { id: 'i3', objetivo_id: 'b', nome: 'Renegociar fretes', status: 'concluida', impacto_rs: 900_000 },
  { id: 'i4', objetivo_id: 'c', nome: 'Prazo de fornecedor', status: 'em_execucao', impacto_rs: null },
  { id: 'i5', objetivo_id: 'balde', nome: 'Migrada', status: 'backlog', impacto_rs: null },
] as Iniciativa[];

// r1 mitigado confirmado; r2 em tratamento; r3 com o tratamento ENTREGUE
// (ação e iniciativa concluídas) mas não fechado — não conta como neutralizado.
const acoes = [
  { id: 'ac1', risco_id: 'r1', iniciativa_id: 'i1', status: 'concluida' },
  { id: 'ac2', risco_id: 'r2', iniciativa_id: 'i2', status: 'em_andamento' },
  { id: 'ac3', risco_id: 'r3', iniciativa_id: 'i3', status: 'concluida' },
] as AcaoRisco[];

const riscos = [
  { id: 'r1', risco: 'Falta de estoque', probab: 3, impact: 4, resposta: 'Mitigar', situacao: 'mitigado' },
  { id: 'r2', risco: 'Atraso de pedido', probab: 2, impact: 3, resposta: 'Mitigar', situacao: 'validado' },
  { id: 'r3', risco: 'Frete caro', probab: 4, impact: 4, resposta: 'Mitigar', situacao: 'validado' },
] as unknown as StoredRiskRecord[];

interface Opcoes {
  idsDoRecorte?: Set<string>;
  iniciativas?: Iniciativa[];
  reordenarObjetivos?: (ordem: string[]) => Promise<boolean>;
}

function montar(opcoes: Opcoes = {}) {
  const reordenarObjetivos = vi.fn(opcoes.reordenarObjetivos ?? (async () => true));
  const pf = {
    portfolio: {
      objetivos, iniciativas: opcoes.iniciativas ?? iniciativas, acoes_risco: acoes, medicoes: [], marcos: [],
      pessoas: [{ id: 'p', nome: 'Ana' }],
    },
    loading: false, saving: false, error: null, clearError: vi.fn(),
    createEntidade: vi.fn(), patchEntidade: vi.fn(), deleteEntidade: vi.fn(),
    reordenarObjetivos,
  } as unknown as UsePortfolio;
  const tela = (ids?: Set<string>) => (
    <ObjetivosTab
      riscos={riscos} pf={pf} idsDoRecorte={ids}
      onIrPara={vi.fn()} onAbrirIniciativa={vi.fn()} onAbrirRisco={vi.fn()} onCriarIniciativa={vi.fn()}
    />
  );
  const { rerender } = render(tela(opcoes.idsDoRecorte));
  return { reordenarObjetivos, trocarRecorte: (ids?: Set<string>) => rerender(tela(ids)) };
}

/** Gravação que só termina quando o teste manda — para pôr duas em voo. */
function gravacoesAdiadas() {
  const pendentes: ((ok: boolean) => void)[] = [];
  const gravar = (_ordem: string[]) => new Promise<boolean>(resolve => { pendentes.push(resolve); });
  return { gravar, terminar: async (i: number, ok: boolean) => { await act(async () => { pendentes[i](ok); }); } };
}

/** Nomes das linhas, na ordem da tela. */
function ordemNaTela(): string[] {
  return screen.getAllByRole('button', { name: /^Detalhe de / })
    .map(b => (b.getAttribute('aria-label') ?? '').replace('Detalhe de ', ''));
}

const alca = (nome: string) => screen.getByRole('button', { name: `Reordenar ${nome}. Setas movem.` });

it('abre recolhido e o chevron expande o detalhe', () => {
  montar();
  const chevron = screen.getByRole('button', { name: 'Detalhe de Disponibilidade' });
  expect(chevron.getAttribute('aria-expanded')).toBe('false');
  expect(document.getElementById('objetivo-detalhe-a')).toBeNull();
  expect(screen.queryByRole('region', { name: 'Detalhe de Disponibilidade' })).toBeNull();

  fireEvent.click(chevron);
  expect(chevron.getAttribute('aria-expanded')).toBe('true');
  const detalhe = screen.getByRole('region', { name: 'Detalhe de Disponibilidade' });
  expect(chevron.getAttribute('aria-controls')).toBe(detalhe.id);
  expect(within(detalhe).getByRole('heading', { name: 'O número andou?' })).toBeTruthy();
  expect(within(detalhe).getByRole('heading', { name: 'Quanto as entregas renderam?' })).toBeTruthy();
  expect(within(detalhe).getByRole('heading', { name: 'O que ainda ameaça?' })).toBeTruthy();
});

it('"Expandir tudo" abre todos os visíveis e vira "Recolher tudo"', () => {
  montar();
  fireEvent.click(screen.getByRole('button', { name: 'Expandir tudo' }));
  const chevrons = screen.getAllByRole('button', { name: /^Detalhe de / });
  expect(chevrons).toHaveLength(4);
  for (const c of chevrons) expect(c.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Recolher tudo' }));
  for (const c of chevrons) expect(c.getAttribute('aria-expanded')).toBe('false');
});

it('trocar o critério para Impacto reordena a vista e desabilita a alça', () => {
  const { reordenarObjetivos } = montar();
  expect(ordemNaTela()).toEqual(['Disponibilidade', 'Margem', 'Capital de giro', OBJETIVO_BALDE]);
  expect((alca('Disponibilidade') as HTMLButtonElement).disabled).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Impacto' }));
  expect(screen.getByRole('button', { name: 'Impacto' }).getAttribute('aria-pressed')).toBe('true');
  // Entregue + em jogo: Margem 900 mil, Disponibilidade 150 mil, Capital 0.
  expect(ordemNaTela()).toEqual(['Margem', 'Disponibilidade', 'Capital de giro', OBJETIVO_BALDE]);
  expect((alca('Margem') as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Reordenar' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('Vista por impacto. A ordem manual continua guardada.')).toBeTruthy();

  // A vista não grava nada: seta na alça desabilitada não reordena.
  fireEvent.keyDown(alca('Margem'), { key: 'ArrowDown' });
  expect(reordenarObjetivos).not.toHaveBeenCalled();
});

it('ArrowDown na alça grava a ordem completa, com os ocultos no lugar', async () => {
  const { reordenarObjetivos } = montar();
  fireEvent.keyDown(alca('Disponibilidade'), { key: 'ArrowDown' });

  // Visíveis [a, b, c] → [b, a, c]; o abandonado `x` e o balde não se movem.
  expect(reordenarObjetivos).toHaveBeenCalledTimes(1);
  expect(reordenarObjetivos).toHaveBeenCalledWith(['b', 'x', 'a', 'balde', 'c']);
  // A tela já mostra a ordem pendente enquanto grava.
  expect(ordemNaTela()).toEqual(['Margem', 'Disponibilidade', 'Capital de giro', OBJETIVO_BALDE]);
  expect(screen.getByText('Disponibilidade na posição 2 de 3')).toBeTruthy();
  await waitFor(() => expect(screen.getByText('Ordem salva · vale para todos')).toBeTruthy());
});

it('o balde fica sempre por último e sem alça, em qualquer critério', () => {
  montar();
  expect(screen.queryByRole('button', { name: `Reordenar ${OBJETIVO_BALDE}. Setas movem.` })).toBeNull();
  expect(ordemNaTela().at(-1)).toBe(OBJETIVO_BALDE);

  // Por prazo o balde (2020) viria primeiro; continua no fim.
  fireEvent.click(screen.getByRole('button', { name: 'Prazo' }));
  expect(ordemNaTela()).toEqual(['Capital de giro', 'Disponibilidade', 'Margem', OBJETIVO_BALDE]);
  const itens = screen.getAllByRole('listitem');
  expect(itens.at(-1)?.getAttribute('data-balde')).toBe('true');
});

it('KPI "Riscos neutralizados" conta só o mitigado confirmado', () => {
  montar();
  const tile = screen.getByText('Riscos neutralizados', { selector: '.kpi-label' }).closest('.kpi-card');
  // r3 teve o tratamento entregue, mas ninguém confirmou o mitigado.
  expect(tile?.querySelector('.kpi-value')?.textContent).toBe('1 de 3');
});

it('chegar com recorte mostra e abre só os objetivos recortados', () => {
  montar({ idsDoRecorte: new Set(['c']) });
  expect(ordemNaTela()).toEqual(['Capital de giro']);
  expect(screen.getByRole('button', { name: 'Detalhe de Capital de giro' }).getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByRole('region', { name: 'Detalhe de Capital de giro' })).toBeTruthy();
});

it('movimentos seguidos gravam um por vez, e só a ordem mais recente sai depois', async () => {
  const { gravar, terminar } = gravacoesAdiadas();
  const { reordenarObjetivos } = montar({ reordenarObjetivos: gravar });

  fireEvent.keyDown(alca('Disponibilidade'), { key: 'ArrowDown' }); // [b, a, c]
  fireEvent.keyDown(alca('Disponibilidade'), { key: 'ArrowDown' }); // [b, c, a]
  fireEvent.keyDown(alca('Capital de giro'), { key: 'ArrowUp' });   // [c, b, a]

  // Um POST em voo; a tela já mostra a última ordem, que espera a vez.
  expect(reordenarObjetivos).toHaveBeenCalledTimes(1);
  expect(reordenarObjetivos).toHaveBeenLastCalledWith(['b', 'x', 'a', 'balde', 'c']);
  expect(ordemNaTela()).toEqual(['Capital de giro', 'Margem', 'Disponibilidade', OBJETIVO_BALDE]);

  // O primeiro termina: sai só a mais recente — a do meio já foi superada.
  await terminar(0, true);
  expect(reordenarObjetivos).toHaveBeenCalledTimes(2);
  expect(reordenarObjetivos).toHaveBeenLastCalledWith(['c', 'x', 'b', 'balde', 'a']);
  expect(screen.getByText('Salvando a ordem…')).toBeTruthy();
  expect(screen.queryByText('Ordem salva · vale para todos')).toBeNull();

  await terminar(1, true);
  expect(reordenarObjetivos).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Ordem salva · vale para todos')).toBeTruthy();
});

it('falha na gravação derruba a fila e volta à ordem do servidor', async () => {
  const { gravar, terminar } = gravacoesAdiadas();
  const { reordenarObjetivos } = montar({ reordenarObjetivos: gravar });

  fireEvent.keyDown(alca('Disponibilidade'), { key: 'ArrowDown' });
  fireEvent.keyDown(alca('Disponibilidade'), { key: 'ArrowDown' });
  await terminar(0, false);

  // A segunda foi montada sobre a que o servidor recusou: não viaja.
  expect(reordenarObjetivos).toHaveBeenCalledTimes(1);
  expect(ordemNaTela()).toEqual(['Disponibilidade', 'Margem', 'Capital de giro', OBJETIVO_BALDE]);
  expect(screen.getByText('A ordem não foi salva. A lista voltou à ordem anterior.')).toBeTruthy();
});

it('foco levado para fora da lista não é puxado de volta para a alça', async () => {
  const { gravar, terminar } = gravacoesAdiadas();
  montar({ reordenarObjetivos: gravar });

  const a = alca('Disponibilidade');
  a.focus();
  fireEvent.keyDown(a, { key: 'ArrowDown' });
  // A pessoa sai da lista pelo teclado e cai num botão que fica desabilitado
  // — como o "Salvando…" de um modal — enquanto a lista ainda re-renderiza.
  const fora = screen.getByRole('button', { name: '+ Novo objetivo' }) as HTMLButtonElement;
  fora.focus();
  fora.disabled = true;
  await terminar(0, true);

  expect(document.activeElement).toBe(fora);
});

it('recorte que encolhe não reabre o objetivo que a pessoa fechou', () => {
  const { trocarRecorte } = montar({ idsDoRecorte: new Set(['a', 'c']) });
  const chevronA = () => screen.getByRole('button', { name: 'Detalhe de Disponibilidade' });
  expect(chevronA().getAttribute('aria-expanded')).toBe('true');

  fireEvent.click(chevronA());
  expect(chevronA().getAttribute('aria-expanded')).toBe('false');

  // A lacuna de `c` foi resolvida: o recorte agora é só `a`.
  trocarRecorte(new Set(['a']));
  expect(chevronA().getAttribute('aria-expanded')).toBe('false');
});

it('impacto declarado como zero sai como R$ 0, não como "Sem valor"', () => {
  montar({
    iniciativas: [
      { id: 'z1', objetivo_id: 'a', nome: 'Conformidade', status: 'concluida', impacto_rs: 0 },
    ] as Iniciativa[],
  });
  const linha = screen.getByRole('button', { name: 'Detalhe de Disponibilidade' }).closest('li') as HTMLElement;
  const celula = linha.querySelector('[data-area="imp"]') as HTMLElement;
  expect(within(celula).queryByRole('button', { name: 'Sem valor' })).toBeNull();
  expect(celula.textContent).toMatch(/R\$\s0/);
  // Alguém declarou valor — ele só soma zero.
  const cartao = screen.getByRole('region', { name: 'De onde vem o impacto' });
  expect(cartao.textContent).toContain('soma zero');
  expect(cartao.textContent).not.toContain('Nenhuma iniciativa daqui tem valor de impacto declarado');
});

it('concluídas sem valor não viram "R$ 0" no total nem no cartão de impacto', () => {
  montar({
    iniciativas: [
      { id: 'v1', objetivo_id: 'a', nome: 'Sem valor 1', status: 'concluida', impacto_rs: null },
      { id: 'v2', objetivo_id: 'b', nome: 'Sem valor 2', status: 'concluida', impacto_rs: null },
      { id: 'v3', objetivo_id: 'c', nome: 'Com valor', status: 'em_execucao', impacto_rs: 1_000_000 },
    ] as Iniciativa[],
  });
  const total = document.querySelector('.objetivos-total [data-area="imp"]') as HTMLElement;
  expect(within(total).getByRole('button', { name: 'Sem valor' })).toBeTruthy();
  expect(total.textContent).toContain('R$ 1,0 mi em jogo');
  expect(total.textContent).not.toMatch(/R\$\s0\b/);

  const cartao = screen.getByRole('region', { name: 'De onde vem o impacto' });
  expect(cartao.textContent).not.toMatch(/R\$\s0\b/);
  expect(cartao.textContent).not.toContain('0%');
  expect(cartao.textContent).toContain('2 concluídas sem valor de impacto declarado');
});

it('sem iniciativa concluída o entregue do total é travessão, não R$ 0', () => {
  montar({
    iniciativas: [
      { id: 'v3', objetivo_id: 'c', nome: 'Com valor', status: 'em_execucao', impacto_rs: 500_000 },
    ] as Iniciativa[],
  });
  const total = document.querySelector('.objetivos-total [data-area="imp"]') as HTMLElement;
  expect(total.textContent?.startsWith('—')).toBe(true);
  expect(total.textContent).not.toMatch(/R\$\s0\b/);
});

it('a legenda dos riscos nomeia cada cor que aparece nos quadradinhos, com a contagem', () => {
  montar();
  const itens = [...document.querySelectorAll('.objetivos-legenda-item')].map(el => ({
    estado: el.querySelector('.ameaca-quadro')?.getAttribute('data-estado'),
    texto: el.textContent,
  }));
  // Estado com zero não pinta quadradinho, então também não entra na legenda.
  expect(itens).toEqual([
    { estado: 'em_tratamento', texto: 'Em tratamento 2' },
    { estado: 'neutralizado', texto: 'Neutralizado 1' },
  ]);
});
