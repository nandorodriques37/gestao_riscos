import type { ColWidths, Density } from '../types';

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

/** Densidade das tabelas — o mesmo par nas duas abas que têm tabela. */
export const DENSITIES: readonly Density[] = ['comfortable', 'compact'];

/**
 * Densidade salva. Gravada como string crua, e não JSON como as outras
 * preferências: é o formato que `riskMatrix.density.v1` já tem no navegador de
 * quem escolheu compacto na aba Registro, e trocar por JSON zeraria a escolha
 * em silêncio. Uma régua só para as duas abas — a de Tarefas tem chave própria,
 * não o mesmo valor, porque as duas tabelas são lidas em rituais diferentes.
 */
export function readDensity(key: string): Density {
  try {
    const raw = localStorage.getItem(key);
    if (raw === 'compact' || raw === 'comfortable') return raw;
  } catch {
    // storage ausente/corrompido — usa o padrão
  }
  return 'comfortable';
}

export function writeDensity(key: string, value: Density): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage indisponível — preferência vale só para a sessão
  }
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

const RAIL_KEY = 'riskMatrix.rail.v1';

/** Rail expandido ou colapsado. Padrão: expandido, porque sete destinos com
 *  rótulo são mais fáceis de aprender do que sete ícones. */
export function readRailExpandido(): boolean {
  try {
    const raw = localStorage.getItem(RAIL_KEY);
    if (raw === 'true' || raw === 'false') return raw === 'true';
  } catch {
    // storage ausente/corrompido — abre expandido
  }
  return true;
}

export function writeRailExpandido(expandido: boolean): void {
  const root = document.documentElement;
  root.setAttribute('data-rail', expandido ? 'full' : 'mini');
  try {
    localStorage.setItem(RAIL_KEY, String(expandido));
  } catch {
    // storage indisponível — vale só para a sessão
  }
}

/**
 * Troca de seção com View Transitions onde houver suporte; onde não houver,
 * degrada em silêncio para a troca direta. Respeita prefers-reduced-motion:
 * quem pediu menos movimento não ganha o cross-fade.
 */
export function trocarComTransicao(troca: () => void): void {
  const reduzido = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (reduzido || typeof doc.startViewTransition !== 'function') {
    troca();
    return;
  }
  doc.startViewTransition(troca);
}

export function writePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage indisponível — preferência vale só para a sessão
  }
}
