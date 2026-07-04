// Fonte única dos registros iniciais: `api/_seed.ts`. O front usa esses dados
// apenas para derivar as listas de sugestão (datalists); em produção os
// registros vêm da API/banco. O backend usa o mesmo módulo para o seed.
export { INITIAL_RECORDS } from '../../api/_seed';
import { INITIAL_RECORDS } from '../../api/_seed';

export const AREAS: string[] = [...new Set(INITIAL_RECORDS.map(r => r.area).filter(Boolean))];
export const ROTINAS: string[] = [...new Set(INITIAL_RECORDS.map(r => r.rotina).filter(Boolean))];
export const CATEGORIAS: string[] = [...new Set(INITIAL_RECORDS.map(r => r.categoria).filter(Boolean))];
export const RECURSOS: string[] = [...new Set(INITIAL_RECORDS.map(r => r.recurso).filter(Boolean))];
export const RESPONSAVEIS: string[] = [...new Set(INITIAL_RECORDS.map(r => r.responsavel).filter(Boolean))];
export const RESPOSTAS = ['Mitigar', 'Aceitar', 'Transferir', 'Evitar'] as const;
export const STATUSES = ['Não iniciado', 'Em andamento', 'Concluído'] as const;
