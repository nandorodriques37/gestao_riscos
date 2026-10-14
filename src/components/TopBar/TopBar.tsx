import type { Tab } from '../../types';
import type { ThemePref } from '../../lib/uiPrefs';
import { gruposCom, grupoDe } from '../NavRail/secoes';
import { Marca } from '../common/Marca';
import { SeletorTema } from '../common/SeletorTema';

interface TopBarProps {
  tab: Tab;
  /**
   * @deprecated O header não navega mais: a fita de abas que usava isto saiu
   * (entre 761 e 1100px quem navega agora é o rail recolhido). Fica opcional
   * só até o `App` parar de passar; não é lido.
   */
  onChangeTab?: (tab: Tab) => void;
  /** Estado de sincronização com o servidor, exibido à direita do header. */
  sync?: { state: 'idle' | 'saving' | 'error'; label: string };
  /**
   * @deprecated Servia à fita de abas, que saiu. A migalha acha o rótulo da
   * Triagem sem ele (`gruposCom(true)`). Não é lido.
   */
  mostrarTriagem?: boolean;
  /** @deprecated Contador da fita de abas, que saiu. Não é lido. */
  triagemPendente?: number;
  /**
   * Identidade autodeclarada e tema. O estado dos dois SUBIU para o `App`.
   *
   * Não por gosto: abaixo de 760px quem navega é a barra inferior, e o chip
   * de autor e o botão de tema passam a morar na folha "Mais". Dois
   * componentes com um `useState` cada dariam duas verdades sobre o mesmo
   * tema — trocar no header não mexeria no que a folha mostra. É o mesmo
   * argumento que já tirou `useTasks` da aba Tarefas.
   */
  autor: string;
  onPedirNome: () => void;
  theme: ThemePref;
  onTheme: (pref: ThemePref) => void;
  /** Abre a paleta de comando (o mesmo que Ctrl/⌘+K). */
  onAbrirPaleta?: () => void;
}

/** Tecla que o sistema da pessoa usa — o rótulo do botão diz a certa. */
const TECLA_PALETA = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';

export function TopBar({
  tab, sync, autor, onPedirNome, theme, onTheme, onAbrirPaleta,
}: TopBarProps) {
  // A migalha lê os mesmos destinos do rail e da barra inferior. Com a Triagem
  // sempre incluída: se a aba está aberta, ela existe, e o rótulo tem de vir.
  const atual = gruposCom(true).flatMap(g => g.itens).find(s => s.id === tab);
  const grupo = grupoDe(tab);
  const iniciais = autor.trim().charAt(0).toUpperCase();

  return (
    <header className="app-header">
      <div className="app-header-inner">
        {/* A marca mora no topo do rail — expandido ou recolhido —; aqui ela só
            aparece quando o rail some (≤760px), senão apareceria duas vezes. */}
        <div className="brand">
          <Marca />
          <div className="brand-copy">
            <div className="brand-name">Matriz de Risco</div>
            <div className="brand-signature">Rede de Decisão</div>
          </div>
        </div>

        <div className="header-route" aria-label={`Seção atual: ${atual?.label ?? ''}`}>
          {grupo && <span>{grupo}</span>}
          <strong>{atual?.label}</strong>
        </div>

        <div className="header-aside">
          {onAbrirPaleta && (
            <button
              className="btn btn-ghost header-paleta"
              onClick={onAbrirPaleta}
              title="Buscar risco, iniciativa, objetivo, tarefa ou pessoa — e ir para qualquer seção"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-4-4" />
              </svg>
              <span className="header-paleta-texto">Buscar ou ir para…</span>
              <kbd>{TECLA_PALETA}</kbd>
            </button>
          )}
          <button
            className="autor-chip"
            data-vazio={autor ? undefined : 'true'}
            onClick={onPedirNome}
            title={autor
              ? `As suas alterações são registradas como "${autor}". Clique para trocar.`
              : 'Diga quem é você — sem isso as alterações entram no histórico como "não identificado".'}
          >
            {iniciais && <span className="autor-avatar" aria-hidden="true">{iniciais}</span>}
            {autor || 'Quem é você?'}
          </button>
          {sync && (
            <div className="sync-status" data-state={sync.state} role="status" aria-live="polite">
              <span className="sync-dot" aria-hidden="true" />
              <span>{sync.label}</span>
            </div>
          )}
          <SeletorTema theme={theme} onTheme={onTheme} />
        </div>
      </div>
    </header>
  );
}
