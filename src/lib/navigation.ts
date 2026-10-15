import type { Tab } from '../types';
const tabs: Tab[] = ['painel', 'objetivos', 'iniciativas', 'registro', 'priorizacao', 'tarefas', 'pessoas', 'anotacoes', 'triagem'];
/**
 * Destino e seleção, na URL. `nota` é a página aberta da aba Anotações — o
 * link direto para uma página, como `tarefa` é para um card do quadro — e
 * `notaAbaixo` a da metade de baixo, quando a tela está dividida.
 */
export interface AppRoute { tab: Tab; risco: string | null; iniciativa: string | null; tarefa: string | null; objetivo: string | null; recorte: string | null; nota: string | null; notaAbaixo: string | null }
export function readRoute(hash: string): AppRoute {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  const tab = q.get('tab') as Tab;
  return { tab: tabs.includes(tab) ? tab : 'painel', risco: q.get('risco'), iniciativa: q.get('iniciativa'), tarefa: q.get('tarefa'), objetivo: q.get('objetivo'), recorte: q.get('recorte'), nota: q.get('nota'), notaAbaixo: q.get('notaAbaixo') };
}
export function routeHash(route: Partial<AppRoute>) {
  const q = new URLSearchParams();
  Object.entries(route).forEach(([key, value]) => { if (value) q.set(key, value); });
  return '#' + q.toString();
}
/**
 * Quem tem rascunho sujo registra um guard. Ele pode abrir um diálogo, então
 * responde por Promise: `window.confirm` bloqueava a thread, o diálogo não.
 *
 * `destino` é para onde a navegação vai, quando quem pergunta sabe. Serve ao
 * guard que só existe para UMA página na tela: com as Anotações divididas,
 * trocar a página de baixo não tira a de cima do lugar, e perguntar a ela
 * seria um diálogo sobre um texto que não sai. Sem destino, todo guard
 * pergunta, como sempre.
 */
export type GuardNavegacao = (destino?: AppRoute) => boolean | Promise<boolean>;
const guards = new Set<GuardNavegacao>();
export function guardNavigation(guard: GuardNavegacao) { guards.add(guard); return () => { guards.delete(guard); }; }
export function temGuard() { return guards.size > 0; }
/** Pergunta um a um e para no primeiro "não": dois diálogos em fila seriam pior que um. */
export async function canNavigate(destino?: AppRoute) {
  for (const guard of [...guards]) if (!(await guard(destino))) return false;
  return true;
}
