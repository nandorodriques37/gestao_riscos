import type { ColWidths } from '../types';

/**
 * Preferências de UI persistidas em localStorage (larguras de coluna e seleção
 * de filtros por aba). Sobrevivem ao recarregar a página. Leitura sempre valida
 * o conteúdo e cai no padrão quando o storage está ausente ou corrompido.
 */

/** Larguras salvas na sessão anterior; descarta entradas inválidas (mín. 44px, igual ao resize). */
export function readColWidths(key: string): ColWidths {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const valid: ColWidths = {};
        Object.entries(parsed as Record<string, unknown>).forEach(([id, w]) => {
          if (typeof w === 'number' && Number.isFinite(w) && w >= 44) valid[id] = w;
        });
        return valid;
      }
    }
  } catch {
    // storage ausente/corrompido — usa larguras padrão
  }
  return {};
}

/** Seleção múltipla de filtro salva; mantém só valores da lista permitida (ignora legados/corrompidos). */
export function readStatusFilter<T extends string>(key: string, allowed: readonly T[]): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is T => typeof v === 'string' && (allowed as readonly string[]).includes(v));
      }
    }
  } catch {
    // storage ausente/corrompido — sem filtro (mostra todos)
  }
  return [];
}

/** Modo de visualização da aba Tarefas. */
export type TaskView = 'lista' | 'kanban';
export const TASK_VIEWS: readonly TaskView[] = ['lista', 'kanban'];

/** Critério que vira coluna no quadro Kanban. */
export type KanbanGroupBy = 'prioridade' | 'status';
export const KANBAN_GROUP_BYS: readonly KanbanGroupBy[] = ['prioridade', 'status'];

/** Preferência de valor único (modo de visualização, agrupamento…) validada contra a lista permitida. */
export function readEnumPref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'string' && (allowed as readonly string[]).includes(parsed)) return parsed as T;
    }
  } catch {
    // storage ausente/corrompido — usa o padrão
  }
  return fallback;
}

export type ThemePref = 'light' | 'dark' | 'system';

const THEME_KEY = 'riskMatrix.theme.v1';

/** Tema escolhido pelo usuário; 'system' segue a preferência do sistema operacional. */
export function readThemePref(): ThemePref {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // storage ausente/corrompido — segue o sistema
  }
  return 'system';
}

/**
 * Marca o <html> com o tema escolhido. 'system' remove o atributo, deixando o
 * `color-scheme: light dark` do :root responder à media query — é o que faz o
 * light-dark() dos tokens escolher o lado certo.
 */
export function applyThemePref(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    // storage indisponível — tema vale só para a sessão
  }
}

export function writePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage indisponível — preferência vale só para a sessão
  }
}
