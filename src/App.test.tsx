// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { guardNavigation } from './lib/navigation';

// Os atalhos que trocam de aba — paleta (iniciativa, tarefa) e "abrir
// iniciativa" — passam pelos guards, como `irPara`. Um guard que mora numa
// página (texto recusado na aba Anotações, imagem subindo) não abre diálogo
// que impeça a paleta de abrir; sem a pergunta, a aba desmontava e levava o
// texto junto.

const INI = '33333333-3333-4333-8333-333333333333';
const TAREFA = '44444444-4444-4444-8444-444444444444';

const iniciativa = {
  id: INI, version: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', position: 0,
  objetivo_id: null, nome: 'Projeto Alfa', descricao: '', vetor: 'evitar_perda', fonte: 'manual', dono_id: null, recurso: '',
  esforco: null, impacto2: null, gravidade: null, esforco_dias: null, impacto_rs: null, confianca_impacto: 'estimado',
  inicio: null, fim_plano_original: null, fim_plano_atual: null, fim_real: null, status: 'planejada', resultado: '', obs: '',
};

const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#tab=anotacoes');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/portfolio') {
      return json({ pessoas: [], objetivos: [], medicoes: [], iniciativas: [iniciativa], marcos: [], acoes_risco: [] });
    }
    if (url.startsWith('/api/tasks')) return json([{ id: TAREFA, tarefa: 'Ligar para a Beta', tipo: '', status: 'A fazer', version: 1, anexos: [] }]);
    return json([]);
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

async function escolherNaPaleta(termo: string, nome: RegExp) {
  await act(async () => { fireEvent.keyDown(window, { key: 'k', ctrlKey: true }); });
  const campo = screen.getByRole('combobox', { name: 'Buscar e navegar' });
  fireEvent.change(campo, { target: { value: termo } });
  fireEvent.click(await screen.findByRole('option', { name: nome }));
  // `canNavigate` é assíncrono: deixa a pergunta responder.
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
}

it('paleta → iniciativa e → tarefa perguntam aos guards antes de trocar de aba', async () => {
  const guard = vi.fn(() => false);
  const soltar = guardNavigation(guard);
  try {
    render(<App />);
    await escolherNaPaleta('alfa', /Projeto Alfa/);
    expect(guard).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe('#tab=anotacoes');

    await escolherNaPaleta('beta', /Ligar para a Beta/);
    expect(guard).toHaveBeenCalledTimes(2);
    expect(window.location.hash).toBe('#tab=anotacoes');
  } finally {
    soltar();
  }
});

it('com o guard dizendo "pode sair", a paleta abre a iniciativa', async () => {
  const guard = vi.fn(() => true);
  const soltar = guardNavigation(guard);
  try {
    render(<App />);
    await escolherNaPaleta('alfa', /Projeto Alfa/);
    expect(guard).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe(`#tab=iniciativas&iniciativa=${INI}`);
  } finally {
    soltar();
  }
});
