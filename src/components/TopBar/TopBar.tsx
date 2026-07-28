import { useEffect, useState } from 'react';
import type { Tab } from '../../types';
import { applyThemePref, readThemePref, type ThemePref } from '../../lib/uiPrefs';

interface TopBarProps {
  tab: Tab;
  onChangeTab: (tab: Tab) => void;
  /** Estado de sincronização com o servidor, exibido à direita do header. */
  sync?: { state: 'idle' | 'saving' | 'error'; label: string };
}

// Rótulos curtos. Os anteriores ("Registro de Riscos e Ações", "Resumo de
// Priorização", "Gestão de Tarefas") ocupavam metade do header e forçavam
// quebra de linha já em telas de notebook.
const TABS: { id: Tab; label: string }[] = [
  { id: 'registro', label: 'Registro' },
  { id: 'graficos', label: 'Gráficos' },
  { id: 'priorizacao', label: 'Priorização' },
  { id: 'tarefas', label: 'Tarefas' },
];

const THEME_CYCLE: ThemePref[] = ['system', 'light', 'dark'];
const THEME_LABEL: Record<ThemePref, string> = {
  system: 'Tema: seguindo o sistema',
  light: 'Tema: claro',
  dark: 'Tema: escuro',
};

export function TopBar({ tab, onChangeTab, sync }: TopBarProps) {
  const [theme, setTheme] = useState<ThemePref>(() => readThemePref());

  useEffect(() => { applyThemePref(theme); }, [theme]);

  function cycleTheme() {
    setTheme(t => THEME_CYCLE[(THEME_CYCLE.indexOf(t) + 1) % THEME_CYCLE.length]);
  }

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">RM</div>
          <div className="brand-name">Matriz de Risco</div>
        </div>

        <nav className="nav-tabs" aria-label="Seções">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`nav-tab${tab === t.id ? ' active' : ''}`}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => onChangeTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="header-aside">
          {sync && (
            <div className="sync-status" data-state={sync.state} role="status" aria-live="polite">
              <span className="sync-dot" aria-hidden="true" />
              <span>{sync.label}</span>
            </div>
          )}
          {/* O ícone é desenhado em CSS a partir do data-pref (ver layout.css). */}
          <button
            className="theme-toggle"
            data-pref={theme}
            onClick={cycleTheme}
            title={`${THEME_LABEL[theme]} · clique para alternar`}
            aria-label={THEME_LABEL[theme]}
          />
        </div>
      </div>
    </header>
  );
}
