import type { Tab } from '../../types';
import { gruposCom, type Grupo, type Secao } from './secoes';

/**
 * Navegação lateral. Substitui as abas do topo, que já quebravam linha em
 * notebook com quatro rótulos e não seguram as seções do portfólio.
 *
 * Colapsado mostra só o ícone, com o rótulo em tooltip — é a única forma de
 * manter os destinos identificáveis a 72 px.
 *
 * Abaixo de 1100px o rail sai (ver `styles/rail.css`) e a navegação passa às
 * abas do topo; abaixo de 760px, à barra inferior. Os destinos das três formas
 * vêm de `secoes.tsx`.
 */

interface NavRailProps {
  tab: Tab;
  onChangeTab: (tab: Tab) => void;
  expandido: boolean;
  onToggle: () => void;
  mostrarTriagem: boolean;
  triagemPendente: number;
}

export function NavRail({
  tab, onChangeTab, expandido, onToggle, mostrarTriagem, triagemPendente,
}: NavRailProps) {
  const grupos: Grupo[] = gruposCom(mostrarTriagem);

  function item(s: Secao) {
    const ativo = tab === s.id;
    const contador = s.id === 'triagem' && triagemPendente > 0 ? triagemPendente : null;
    return (
      <button
        key={s.id}
        className="rail-item"
        data-ativo={ativo}
        aria-current={ativo ? 'page' : undefined}
        onClick={() => onChangeTab(s.id)}
        // Colapsado o rótulo some da tela, mas não do leitor nem do tooltip.
        title={expandido ? undefined : s.label}
        aria-label={expandido ? undefined : s.label}
      >
        {s.icone}
        <span className="rail-item-label">{s.label}</span>
        {contador != null && (
          <span className="rail-item-count tabular" aria-label={`${contador} na fila`}>
            {contador}
          </span>
        )}
      </button>
    );
  }

  return (
    <aside className="nav-rail" data-expandido={expandido}>
      <nav className="rail-nav" aria-label="Seções">
        {grupos.map(g => (
          <div className="rail-group" key={g.titulo}>
            <div className="rail-group-label" aria-hidden={!expandido}>{g.titulo}</div>
            {g.itens.map(item)}
          </div>
        ))}
      </nav>

      <div className="rail-foot">
        <button
          className="rail-toggle"
          onClick={onToggle}
          title={expandido ? 'Recolher o menu' : 'Expandir o menu'}
          aria-label={expandido ? 'Recolher o menu' : 'Expandir o menu'}
          aria-expanded={expandido}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2.5" />
            <path d="M9.5 4v16" />
          </svg>
          <span className="rail-item-label">Recolher</span>
        </button>
      </div>
    </aside>
  );
}
