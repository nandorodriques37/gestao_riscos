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
const guards = new Set<() => boolean>();
export function guardNavigation(guard: () => boolean) { guards.add(guard); return () => { guards.delete(guard); }; }
export function canNavigate() { return [...guards].every(guard => guard()); }
