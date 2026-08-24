import type { Tab } from '../../types';
import type { ThemePref } from '../../lib/uiPrefs';
import { gruposCom } from '../NavRail/secoes';

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

export function TopBar({
  tab, onChangeTab, sync, mostrarTriagem = false, triagemPendente = 0,
  autor, onPedirNome, theme, onCycleTheme, themeLabel,
}: TopBarProps) {
  // Os mesmos destinos do rail e da barra inferior, achatados em uma fita.
  // Esta lista era escrita à mão aqui, com os rótulos repetidos — e a fita só
  // aparece entre 761 e 1100px, a faixa que ninguém abre para conferir. Um
  // destino novo entrava no rail e faltava aqui.
  const secoes = gruposCom(mostrarTriagem).flatMap(g => g.itens);

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">RM</div>
          <div className="brand-name">Matriz de Risco</div>
        </div>

        <nav className="nav-tabs" aria-label="Seções">
          {secoes.map(s => {
            const contador = s.id === 'triagem' && triagemPendente > 0 ? triagemPendente : null;
            return (
              <button
                key={s.id}
                className={`nav-tab${tab === s.id ? ' active' : ''}`}
                aria-current={tab === s.id ? 'page' : undefined}
                onClick={() => onChangeTab(s.id)}
              >
                {s.label}
                {contador != null && (
                  <span className="nav-tab-count tabular" aria-label={`${contador} na fila`}>
                    {contador}
                  </span>
                )}
              </button>
            );
          })}
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
