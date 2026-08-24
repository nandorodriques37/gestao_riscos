import { useEffect, useState } from 'react';
import type { Tab } from '../../types';
import { applyThemePref, readThemePref, type ThemePref } from '../../lib/uiPrefs';
import { lerAutor, gravarAutor } from '../../lib/autor';

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

const THEME_CYCLE: ThemePref[] = ['system', 'light', 'dark'];
const THEME_LABEL: Record<ThemePref, string> = {
  system: 'Tema: seguindo o sistema',
  light: 'Tema: claro',
  dark: 'Tema: escuro',
};

export function TopBar({
  tab, onChangeTab, sync, mostrarTriagem = false, triagemPendente = 0,
}: TopBarProps) {
  const [theme, setTheme] = useState<ThemePref>(() => readThemePref());
  const [autor, setAutor] = useState(lerAutor);

  /**
   * Identidade autodeclarada: o nome vai junto de cada gravação e aparece no
   * histórico. Não autentica ninguém — e o texto do prompt diz isso, para
   * ninguém confundir a trilha com controle de acesso.
   */
  function pedirNome() {
    const novo = window.prompt(
      'Seu nome aparece no histórico de quem alterou o quê.\n\n'
      + 'Isto não é login: qualquer pessoa com acesso ao app pode digitar qualquer nome.',
      autor,
    );
    if (novo === null) return;
    gravarAutor(novo);
    setAutor(novo.trim());
  }

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
            onClick={pedirNome}
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
            onClick={cycleTheme}
            title={`${THEME_LABEL[theme]} · clique para alternar`}
            aria-label={THEME_LABEL[theme]}
          />
        </div>
      </div>
    </header>
  );
}
