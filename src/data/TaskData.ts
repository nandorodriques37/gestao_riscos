// Fonte única das tarefas iniciais: `api/_tasksSeed.ts`. O front usa esses
// dados apenas para derivar as listas de sugestão (datalists); em produção as
// tarefas vêm da API/banco. O backend usa o mesmo módulo para o seed.
export { INITIAL_TASKS } from '../../api/_tasksSeed';
import { INITIAL_TASKS } from '../../api/_tasksSeed';

export const TASK_TIPOS: string[] = [...new Set(INITIAL_TASKS.map(t => t.tipo).filter(Boolean))];
export const TASK_RESPONSAVEIS: string[] = [...new Set(INITIAL_TASKS.map(t => t.responsavel).filter(Boolean))];
export const TASK_STATUSES = ['A fazer', 'Em andamento', 'Concluída'] as const;
