import type { RiskRecord } from '../types';
import initialRecords from './initialRecords.json';

// Registros iniciais do levantamento de riscos. Os dados vivem em
// `initialRecords.json` (importado como dado puro) para serem empacotados de
// forma confiável tanto pelo Vite (front) quanto pelo bundler das funções
// serverless do Vercel (seed do banco). Em produção os dados vêm da API/banco.
export const INITIAL_RECORDS: RiskRecord[] = initialRecords as RiskRecord[];

export const AREAS: string[] = [...new Set(INITIAL_RECORDS.map(r => r.area).filter(Boolean))];
export const ROTINAS: string[] = [...new Set(INITIAL_RECORDS.map(r => r.rotina).filter(Boolean))];
export const CATEGORIAS: string[] = [...new Set(INITIAL_RECORDS.map(r => r.categoria).filter(Boolean))];
export const RECURSOS: string[] = [...new Set(INITIAL_RECORDS.map(r => r.recurso).filter(Boolean))];
export const RESPONSAVEIS: string[] = [...new Set(INITIAL_RECORDS.map(r => r.responsavel).filter(Boolean))];
export const RESPOSTAS = ['Mitigar', 'Aceitar', 'Transferir', 'Evitar'] as const;
export const STATUSES = ['Não iniciado', 'Em andamento', 'Concluído'] as const;
