import type { Tab } from '../../types';

interface TopBarProps {
  tab: Tab;
  onChangeTab: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'registro', label: 'Registro de Riscos e Ações' },
  { id: 'graficos', label: 'Gráficos' },
  { id: 'priorizacao', label: 'Resumo de Priorização' },
];

export function TopBar({ tab, onChangeTab }: TopBarProps) {
  return (
    <div className="topbar">
      <div className="topbar-brand">
        <div className="topbar-logo">RM</div>
        <div>
          <div className="topbar-title">Gestão da Matriz de Risco</div>
          <div className="topbar-subtitle">Registro de riscos, ações e priorização</div>
        </div>
      </div>
      <div className="topbar-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => onChangeTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}
