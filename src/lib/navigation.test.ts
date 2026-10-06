import { afterEach, expect, it, vi } from 'vitest';
import { canNavigate, guardNavigation, temGuard } from './navigation';

const soltar: Array<() => void> = [];
afterEach(() => { soltar.splice(0).forEach(f => f()); });
const registrar = (g: () => boolean | Promise<boolean>) => { soltar.push(guardNavigation(g)); };

it('sem guard, navega', async () => {
  expect(temGuard()).toBe(false);
  expect(await canNavigate()).toBe(true);
});
it('guard assíncrono que nega bloqueia, e que aceita libera', async () => {
  let resposta = false;
  registrar(async () => resposta);
  expect(temGuard()).toBe(true);
  expect(await canNavigate()).toBe(false);
  resposta = true;
  expect(await canNavigate()).toBe(true);
});
it('para no primeiro "não": o guard seguinte nem pergunta', async () => {
  const depois = vi.fn(() => true);
  registrar(() => false);
  registrar(depois);
  expect(await canNavigate()).toBe(false);
  expect(depois).not.toHaveBeenCalled();
});
it('guard removido deixa de valer', async () => {
  const soltarGuard = guardNavigation(() => false);
  expect(await canNavigate()).toBe(false);
  soltarGuard();
  expect(await canNavigate()).toBe(true);
});
