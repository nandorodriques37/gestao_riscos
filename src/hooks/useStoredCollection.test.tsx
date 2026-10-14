// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useStoredCollection } from './useStoredCollection';
import { invalidarDados } from '../lib/dataSync';
interface Item { id: string; version: number; nome: string }
const initial: Item = { id: 'a', version: 1, nome: 'Original' };
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (err: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function adapter() {
  return { source: 'riscos' as const, cache: 'test.records', fetch: vi.fn(async () => [initial]), create: vi.fn(async () => initial),
    patch: vi.fn<(id: string, patch: { nome?: string }, version?: number) => Promise<Item>>(), remove: vi.fn(async () => {}) };
}
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
it('serializa edições rápidas sem sobrescrever o segundo texto com a primeira resposta', async () => {
  const api = adapter(), first = deferred<Item>();
  api.patch.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ ...initial, version: 3, nome: 'Segunda' });
  const { result } = renderHook(() => useStoredCollection(api)); await act(async () => {});
  let one!: Promise<boolean>;
  act(() => { result.current.update('a', { nome: 'Primeira' }); one = result.current.flushPending(); });
  act(() => { result.current.update('a', { nome: 'Segunda' }); });
  expect(api.patch).toHaveBeenCalledTimes(1);
  await act(async () => { first.resolve({ ...initial, version: 2, nome: 'Primeira' }); await one; });
  expect(result.current.items[0]).toEqual({ ...initial, version: 2, nome: 'Segunda' });
  await act(async () => { await result.current.flushPending(); });
  expect(api.patch).toHaveBeenLastCalledWith('a', { nome: 'Segunda' }, 2);
});
it('ignora leitura iniciada antes da gravação e não aceita downgrade de versão', async () => {
  const api = adapter(), oldRead = deferred<Item[]>();
  api.fetch.mockResolvedValueOnce([initial]).mockReturnValueOnce(oldRead.promise);
  api.patch.mockResolvedValue({ ...initial, version: 2, nome: 'Salvo' });
  const { result } = renderHook(() => useStoredCollection(api)); await act(async () => {});
  let read!: Promise<void>;
  act(() => { read = result.current.refresh(); });
  await act(async () => { expect(await result.current.saveNow('a', { nome: 'Salvo' }, 1)).toBe(true); });
  await act(async () => { oldRead.resolve([initial]); await read; });
  act(() => result.current.accept(initial));
  expect(result.current.items[0]).toEqual({ ...initial, version: 2, nome: 'Salvo' });
});
it('falha explícita mantém dado confirmado, bloqueia duplo envio e aguarda nova tentativa manual', async () => {
  const api = adapter(), saving = deferred<Item>();
  api.patch.mockReturnValue(saving.promise);
  const { result } = renderHook(() => useStoredCollection(api)); await act(async () => {});
  let first!: Promise<boolean>;
  await act(async () => { first = result.current.saveNow('a', { nome: 'Rascunho' }, 1); expect(await result.current.saveNow('a', { nome: 'Rascunho' }, 1)).toBe(false); });
  await act(async () => { saving.reject(new Error('Sem rede')); expect(await first).toBe(false); });
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(api.patch).toHaveBeenCalledTimes(1); expect(result.current.items[0]).toEqual(initial);
  expect(result.current.saveStatus.a).toBe('error');
});
it('mutação no portfólio atualiza as outras coleções; conflito interrompe reenvios', async () => {
  const api = adapter(), latest = { ...initial, version: 4, nome: 'Atual' };
  api.fetch.mockResolvedValueOnce([initial]).mockResolvedValueOnce([latest]);
  api.patch.mockRejectedValue(Object.assign(new Error('Conflito'), { current: latest }));
  const { result } = renderHook(() => useStoredCollection(api)); await act(async () => {});
  await act(async () => invalidarDados('portfolio'));
  expect(result.current.items[0].version).toBe(4);
  act(() => result.current.update('a', { nome: 'Texto antigo' }));
  await act(async () => { expect(await result.current.flushPending()).toBe(false); await vi.advanceTimersByTimeAsync(10_000); });
  expect(api.patch).toHaveBeenCalledTimes(1); expect(result.current.saveStatus.a).toBe('conflict');
});
const comStatus = (message: string, status: number) => Object.assign(new Error(message), { status });
it('4xx definitivo não tenta de novo: o pendente sai da fila, a mensagem do servidor fica e a releitura destrava', async () => {
  const api = adapter(), onRefused = vi.fn();
  api.patch.mockRejectedValue(comStatus('Registro não encontrado', 404));
  const { result } = renderHook(() => useStoredCollection(api, { onRefused })); await act(async () => {});
  act(() => result.current.update('a', { nome: 'Meu texto' }));
  await act(async () => { await vi.advanceTimersByTimeAsync(600); });
  expect(result.current.saveStatus.a).toBe('error');
  expect(result.current.error).toBe('Registro não encontrado');
  expect(result.current.hasPendingWrites()).toBe(false);
  // O texto recusado é entregue a quem chamou antes de sair da fila.
  expect(onRefused).toHaveBeenCalledWith('a', { ...initial, nome: 'Meu texto' }, expect.objectContaining({ status: 404 }));
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(api.patch).toHaveBeenCalledTimes(1);
  api.fetch.mockClear();
  await act(async () => { await result.current.refresh(); });
  expect(api.fetch).toHaveBeenCalledTimes(1);
});
it('408, 429 e erro sem status (rede, ou riscos e tarefas, que não informam) seguem tentando, como antes', async () => {
  for (const erro of [comStatus('Muitas requisições', 429), comStatus('Tempo esgotado', 408), new Error('Sem rede')]) {
    const api = adapter(), onRefused = vi.fn();
    api.patch.mockRejectedValueOnce(erro).mockResolvedValueOnce({ ...initial, version: 2, nome: 'Texto' });
    const { result, unmount } = renderHook(() => useStoredCollection(api, { onRefused })); await act(async () => {});
    act(() => result.current.update('a', { nome: 'Texto' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(result.current.saveStatus.a, erro.message).toBe('error');
    expect(result.current.hasPendingWrites(), erro.message).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(api.patch, erro.message).toHaveBeenCalledTimes(2);
    expect(result.current.saveStatus.a, erro.message).toBe('saved');
    expect(onRefused, erro.message).not.toHaveBeenCalled();
    unmount();
  }
});
it('saveNow que leva 404 entrega o texto que tentava gravar', async () => {
  const api = adapter(), onRefused = vi.fn();
  api.patch.mockRejectedValue(comStatus('Registro não encontrado', 404));
  const { result } = renderHook(() => useStoredCollection(api, { onRefused })); await act(async () => {});
  await act(async () => { expect(await result.current.saveNow('a', { nome: 'Explícito' })).toBe(false); });
  expect(onRefused).toHaveBeenCalledWith('a', { ...initial, nome: 'Explícito' }, expect.objectContaining({ status: 404 }));
  expect(result.current.saveStatus.a).toBe('error');
});
it('o carregamento só termina com a leitura MAIS RECENTE: a resposta descartada não deixa o cache passar por servidor', async () => {
  const api = adapter(), montagem = deferred<Item[]>(), segunda = deferred<Item[]>();
  localStorage.setItem('test.records', JSON.stringify([{ ...initial, nome: 'Do cache' }]));
  api.fetch.mockReturnValueOnce(montagem.promise).mockReturnValueOnce(segunda.promise);
  const { result } = renderHook(() => useStoredCollection(api));
  let releitura!: Promise<void>;
  act(() => { releitura = result.current.refresh(); });
  await act(async () => { montagem.resolve([{ ...initial, nome: 'Velha' }]); await Promise.resolve(); });
  expect(result.current.loading).toBe(true);
  expect(result.current.items[0].nome).toBe('Do cache');
  await act(async () => { segunda.resolve([{ ...initial, nome: 'Atual' }]); await releitura; });
  expect(result.current.loading).toBe(false);
  expect(result.current.items[0].nome).toBe('Atual');
});
it('a leitura mais recente que falha também encerra o carregamento', async () => {
  const api = adapter();
  api.fetch.mockRejectedValueOnce(new Error('Sem rede'));
  const { result } = renderHook(() => useStoredCollection(api)); await act(async () => {});
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toBe('Sem rede');
});
it('confirmedCache: o cache guarda só o que o servidor confirmou, nunca a edição otimista', async () => {
  const api = adapter(), resposta = deferred<Item>();
  api.patch.mockReturnValueOnce(resposta.promise);
  const { result } = renderHook(() => useStoredCollection(api, { confirmedCache: true })); await act(async () => {});
  const cache = () => JSON.parse(localStorage.getItem('test.records') ?? '[]') as Item[];
  expect(cache()).toEqual([initial]);
  act(() => result.current.update('a', { nome: 'Não confirmado' }));
  expect(result.current.items[0].nome).toBe('Não confirmado');
  expect(cache()).toEqual([initial]);
  await act(async () => { await vi.advanceTimersByTimeAsync(600); });
  // Durante o envio, outra edição: a tela mostra as duas, o cache só o que voltou.
  act(() => result.current.update('a', { nome: 'Ainda não' }));
  await act(async () => { resposta.resolve({ ...initial, version: 2, nome: 'Não confirmado' }); });
  expect(result.current.items[0]).toEqual({ ...initial, version: 2, nome: 'Ainda não' });
  expect(cache()).toEqual([{ ...initial, version: 2, nome: 'Não confirmado' }]);
});
it('sem confirmedCache (riscos e tarefas) o cache segue a tela, como antes', async () => {
  const api = adapter();
  api.patch.mockResolvedValue({ ...initial, version: 2, nome: 'Salvo' });
  const { result } = renderHook(() => useStoredCollection(api)); await act(async () => {});
  act(() => result.current.update('a', { nome: 'Otimista' }));
  expect(JSON.parse(localStorage.getItem('test.records') ?? '[]')[0].nome).toBe('Otimista');
});
it('hasPendingWrite olha só o registro pedido', async () => {
  const api = adapter();
  api.fetch.mockResolvedValue([initial, { id: 'b', version: 1, nome: 'Outro' }]);
  const { result } = renderHook(() => useStoredCollection(api)); await act(async () => {});
  act(() => result.current.update('a', { nome: 'X' }));
  expect(result.current.hasPendingWrite('a')).toBe(true);
  expect(result.current.hasPendingWrite('b')).toBe(false);
});
