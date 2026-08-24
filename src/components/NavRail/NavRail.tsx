import type { ReactElement } from 'react';
import type { Tab } from '../../types';

/**
 * Navegação lateral. Substitui as abas do topo, que já quebravam linha em
 * notebook com quatro rótulos e não seguram as seções do portfólio.
 *
 * Colapsado mostra só o ícone, com o rótulo em tooltip — é a única forma de
 * manter os destinos identificáveis a 72 px. Os ícones são SVG traçado em
 * grade de 24: sem lib e sem emoji, como o resto do app.
 */

interface Secao {
  id: Tab;
  label: string;
  icone: ReactElement;
}

interface Grupo {
  titulo: string;
  itens: Secao[];
}

const svg = (d: ReactElement) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

const ICONES = {
  painel: svg(<><rect x="3" y="3" width="8" height="10" rx="1.5" /><rect x="13" y="3" width="8" height="6" rx="1.5" /><rect x="3" y="15" width="8" height="6" rx="1.5" /><rect x="13" y="11" width="8" height="10" rx="1.5" /></>),
  objetivos: svg(<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.6" fill="currentColor" /></>),
  iniciativas: svg(<><path d="M3.5 18.5h17" /><path d="M6 18.5V9.5l6-4.5 6 4.5v9" /><path d="M12 18.5v-5" /></>),
  registro: svg(<><path d="M12 4.2 20.8 19.4H3.2Z" /><path d="M12 10v3.6" /><path d="M12 16.6v.3" /></>),
  priorizacao: svg(<><rect x="3" y="3" width="18" height="18" rx="2.5" /><path d="M3 12h18M12 3v18" /></>),
  tarefas: svg(<><rect x="3" y="3" width="18" height="18" rx="3" /><polyline points="8 12.4 11 15.4 16.4 9" /></>),
  pessoas: svg(<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><path d="M16.5 5.4a3.2 3.2 0 0 1 0 5.2" /><path d="M17.5 14.9c2 .6 3.2 2.3 3.2 4.6" /></>),
  triagem: svg(<><path d="M4 5h16" /><path d="M7 12h10" /><path d="M10 19h4" /></>),
};

/**
 * Os grupos são a jornada, não um armário: objetivo → iniciativa → risco →
 * trabalho, de cima para baixo. Duas correções entraram aqui:
 *
 * - "Gráficos" saiu do rail. Viraram o modo Análise dentro de Riscos, porque
 *   liam exatamente os mesmos registros da seção ao lado.
 * - "Priorização" saiu de Risco e foi para Direção. Ela já lê INICIATIVAS por
 *   padrão desde a migração — estava catalogada onde não mora mais, e de
 *   quebra interrompia o caminho entre o risco e a tarefa que o trata.
 */
const GRUPOS: Grupo[] = [
  {
    titulo: 'Direção',
    itens: [
      { id: 'painel', label: 'Painel', icone: ICONES.painel },
      { id: 'objetivos', label: 'Objetivos', icone: ICONES.objetivos },
      { id: 'iniciativas', label: 'Iniciativas', icone: ICONES.iniciativas },
      { id: 'priorizacao', label: 'Priorização', icone: ICONES.priorizacao },
    ],
  },
  {
    titulo: 'Risco',
    itens: [
      { id: 'registro', label: 'Riscos', icone: ICONES.registro },
    ],
  },
  {
    titulo: 'Execução',
    itens: [
      { id: 'tarefas', label: 'Tarefas', icone: ICONES.tarefas },
      { id: 'pessoas', label: 'Pessoas', icone: ICONES.pessoas },
    ],
  },
];

/** Seção temporária da migração — entra no rail só enquanto há trabalho. */
const TRIAGEM: Secao = { id: 'triagem', label: 'Triagem', icone: ICONES.triagem };

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
  const grupos: Grupo[] = mostrarTriagem
    ? [...GRUPOS, { titulo: 'Migração', itens: [TRIAGEM] }]
    : GRUPOS;

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
