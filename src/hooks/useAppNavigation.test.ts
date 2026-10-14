// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { useAppNavigation } from './useAppNavigation';
import { guardNavigation, readRoute } from '../lib/navigation';

const soltar: Array<() => void> = [];
beforeEach(() => { window.history.replaceState(null, '', '#tab=anotacoes&nota=a'); });
// Sem desmontar, o hook do teste anterior continua ouvindo o hashchange.
afterEach(() => { cleanup(); soltar.splice(0).forEach(f => f()); });

/** Guard que só responde quando o teste mandar: o diálogo esperando a pessoa. */
function guardPendente() {
  const respostas: Array<(ok: boolean) => void> = [];
  soltar.push(guardNavigation(() => new Promise<boolean>(r => { respostas.push(r); })));
  return {
    perguntas: () => respostas.length,
    responder: async (ok: boolean) => { await act(async () => { respostas.splice(0).forEach(r => r(ok)); }); },
  };
}

/** O navegador muda o hash (Voltar, link colado, hash digitado) e avisa. */
async function navegador(hash: string) {
  await act(async () => {
    window.history.pushState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

const nota = (id: string) => ({ ...readRoute(''), tab: 'anotacoes' as const, nota: id });

it('sem guard, a troca do navegador vale na hora', async () => {
  const { result } = renderHook(() => useAppNavigation());
  await navegador('#tab=painel');
  expect(result.current.route.tab).toBe('painel');
});

it('a correção automática no meio da espera não engole o destino que a pessoa pediu', async () => {
  const guard = guardPendente();
  const { result } = renderHook(() => useAppNavigation());

  await navegador('#tab=painel');
  // Enquanto o guard pergunta, a URL volta para onde estava…
  expect(guard.perguntas()).toBe(1);
  expect(window.location.hash).toBe('#tab=anotacoes&nota=a');
  expect(result.current.emEspera()).toBe(true);
  // …e a escolha automática da primeira página tenta trocar a seleção.
  let aplicada = true;
  act(() => { aplicada = result.current.navigate(nota('b'), true); });
  expect(aplicada).toBe(false);
  expect(result.current.route.nota).toBe('a');

  await guard.responder(true);
  expect(result.current.route.tab).toBe('painel');
  expect(window.location.hash).toBe('#tab=painel');
  expect(result.current.emEspera()).toBe(false);
});

it('o guard que diz "ficar" deixa a URL e a rota onde estavam', async () => {
  const guard = guardPendente();
  const { result } = renderHook(() => useAppNavigation());
  await navegador('#tab=painel');
  await guard.responder(false);
  expect(result.current.route).toMatchObject({ tab: 'anotacoes', nota: 'a' });
  expect(window.location.hash).toBe('#tab=anotacoes&nota=a');
});

it('um clique explícito no meio da espera é mais novo que o Voltar: ele ganha, e a espera não reaplica o destino dela', async () => {
  const guard = guardPendente();
  const { result } = renderHook(() => useAppNavigation());
  await navegador('#tab=painel');
  act(() => { result.current.navigate({ ...readRoute(''), tab: 'pessoas' }); });
  expect(result.current.route.tab).toBe('pessoas');
  await guard.responder(true);
  expect(result.current.route.tab).toBe('pessoas');
  expect(window.location.hash).toBe('#tab=pessoas');
});

it('perguntar conta como espera: a correção automática também espera a troca que o app iniciou', async () => {
  const guard = guardPendente();
  const { result } = renderHook(() => useAppNavigation());
  let resposta: Promise<boolean> | undefined;
  act(() => { resposta = result.current.perguntar(); });
  expect(result.current.emEspera()).toBe(true);
  let aplicada = true;
  act(() => { aplicada = result.current.navigate(nota('b'), true); });
  expect(aplicada).toBe(false);
  await guard.responder(true);
  expect(await resposta).toBe(true);
  expect(result.current.emEspera()).toBe(false);
  act(() => { aplicada = result.current.navigate(nota('b'), true); });
  expect(aplicada).toBe(true);
  expect(window.location.hash).toBe('#tab=anotacoes&nota=b');
});
