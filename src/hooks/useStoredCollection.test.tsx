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
