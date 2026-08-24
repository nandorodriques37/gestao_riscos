import type { Tab } from '../../types';
import type { ThemePref } from '../../lib/uiPrefs';

interface TopBarProps {
  tab: Tab;
  onChangeTab: (tab: Tab) => void;
  /** Estado de sincronização com o servidor, exibido à direita do header. */
  sync?: { state: 'idle' | 'saving' | 'error'; label: string };
  /**
   * Se a aba Triagem entra na lista. Vem PRONTO do `App`.
   *
   * A regra ("fica enquanto há fila, promoção pendente, ou a extração nem
   * rodou") já morava lá, e estava escrita aqui uma segunda vez, idêntica —
   * duas cópias de uma regra de negócio que decidiam a mesma coisa em dois
   * lugares. Quem tem a fonte é o `App`; aqui basta o booleano.
   */
  mostrarTriagem?: boolean;
  /**
   * Ações do plano de ação ainda esperando classificação — só para o contador
   * ao lado do rótulo.
   */
  triagemPendente?: number;
  /**
   * Identidade autodeclarada e tema. O estado dos dois SUBIU para o `App`.
   *
   * Não por gosto: abaixo de 760px o header perde as abas para a barra
   * inferior, e o chip de autor e o botão de tema passam a morar na folha
   * "Mais". Dois componentes com um `useState` cada dariam duas verdades sobre
   * o mesmo tema — trocar no header não mexeria no que a folha mostra. É o
   * mesmo argumento que já tirou `useTasks` da aba Tarefas.
   */
  autor: string;
  onPedirNome: () => void;
  theme: ThemePref;
  onCycleTheme: () => void;
  themeLabel: string;
}

// Rótulos curtos. Os anteriores ("Registro de Riscos e Ações", "Resumo de
// Priorização", "Gestão de Tarefas") ocupavam metade do header e forçavam
// quebra de linha já em telas de notebook.
//
// A ordem é a mesma do rail, que é a da jornada. Esta lista só aparece abaixo
// de 1100px, onde o rail sai de cena; as duas precisam concordar.
const TABS: { id: Tab; label: string }[] = [
  { id: 'painel', label: 'Painel' },
  { id: 'objetivos', label: 'Objetivos' },
  { id: 'iniciativas', label: 'Iniciativas' },
  { id: 'priorizacao', label: 'Priorização' },
  { id: 'registro', label: 'Riscos' },
  { id: 'tarefas', label: 'Tarefas' },
  { id: 'pessoas', label: 'Pessoas' },
];

export function TopBar({
  tab, onChangeTab, sync, mostrarTriagem = false, triagemPendente = 0,
  autor, onPedirNome, theme, onCycleTheme, themeLabel,
}: TopBarProps) {
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
          {mostrarTriagem && (
            <button
              className={`nav-tab${tab === 'triagem' ? ' active' : ''}`}
              aria-current={tab === 'triagem' ? 'page' : undefined}
              onClick={() => onChangeTab('triagem')}
            >
              Triagem
              {triagemPendente > 0 && (
                <span className="nav-tab-count tabular" aria-label={`${triagemPendente} na fila`}>
                  {triagemPendente}
                </span>
              )}
            </button>
          )}
        </nav>

        <div className="header-aside">
          <button
            className="autor-chip"
            data-vazio={autor ? undefined : 'true'}
            onClick={onPedirNome}
            title={autor
              ? `As suas alterações são registradas como "${autor}". Clique para trocar.`
              : 'Diga quem é você — sem isso as alterações entram no histórico como "não identificado".'}
          >
            {autor || 'Quem é você?'}
          </button>
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
            onClick={onCycleTheme}
            title={`${themeLabel} · clique para alternar`}
            aria-label={themeLabel}
          />
        </div>
      </div>
    </header>
  );
}
