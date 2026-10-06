import type { Tab } from '../types';
const tabs: Tab[] = ['painel', 'objetivos', 'iniciativas', 'registro', 'priorizacao', 'tarefas', 'pessoas', 'triagem'];
export interface AppRoute { tab: Tab; risco: string | null; iniciativa: string | null; tarefa: string | null; objetivo: string | null; recorte: string | null }
export function readRoute(hash: string): AppRoute {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const tab = q.get('tab') as Tab;
  return { tab: tabs.includes(tab) ? tab : 'painel', risco: q.get('risco'), iniciativa: q.get('iniciativa'), tarefa: q.get('tarefa'), objetivo: q.get('objetivo'), recorte: q.get('recorte') };
}
export function routeHash(route: Partial<AppRoute>) {
  const q = new URLSearchParams();
  Object.entries(route).forEach(([key, value]) => { if (value) q.set(key, value); });
  return '#' + q.toString();
}
/**
 * Quem tem rascunho sujo registra um guard. Ele pode abrir um diálogo, então
 * responde por Promise: `window.confirm` bloqueava a thread, o diálogo não.
 */
export type GuardNavegacao = () => boolean | Promise<boolean>;
const guards = new Set<GuardNavegacao>();
export function guardNavigation(guard: GuardNavegacao) { guards.add(guard); return () => { guards.delete(guard); }; }
export function temGuard() { return guards.size > 0; }
/** Pergunta um a um e para no primeiro "não": dois diálogos em fila seriam pior que um. */
export async function canNavigate() {
  for (const guard of [...guards]) if (!(await guard())) return false;
  return true;
}
