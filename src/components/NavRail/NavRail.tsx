import { useSyncExternalStore } from 'react';
import type { Tab } from '../../types';
import { gruposCom, type Grupo, type Secao } from './secoes';
import { Marca } from '../common/Marca';

/**
 * Navegação lateral. Substitui as abas do topo, que já quebravam linha em
 * notebook com quatro rótulos e não seguram as seções do portfólio.
 *
 * Recolhido mostra só o ícone, com o rótulo em tooltip (`title`) e como nome
 * acessível — é a única forma de manter os destinos identificáveis a 76 px.
 *
 * Três faixas, dois componentes (ver o fim de `styles/rail.css`):
 *
 * - ≥1101px: o rail como a pessoa deixou — expandido ou recolhido pelo botão
 *   "Recolher", e a escolha persiste.
 * - 761–1100px: o MESMO rail, recolhido à força. Era a faixa da fita de abas do
 *   topo, que deixou de caber quando os destinos passaram de oito: a 1024px tudo
 *   depois de "Tarefas" sumia, a 830px tudo depois de "Riscos". O botão
 *   "Recolher" não aparece aqui — não haveria o que expandir —, e a preferência
 *   gravada fica intacta para quando a janela voltar a crescer.
 * - ≤760px: o rail sai e quem navega é a barra inferior (`NavBottom`).
 *
 * Os destinos das duas formas vêm de `secoes.tsx`.
 */

/**
 * Faixa em que o rail fica recolhido independentemente da preferência. É o
 * mesmo corte de `styles/rail.css`: abaixo de 761px o rail nem aparece, então
 * o "recolhido" ali não tem efeito visível.
 */
const FAIXA_RECOLHIDA = '(max-width: 1100px)';

let consulta: MediaQueryList | null | undefined;

function consultaDaFaixa(): MediaQueryList | null {
  if (consulta === undefined) {
    consulta = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(FAIXA_RECOLHIDA)
      : null;
  }
  return consulta;
}

function assinarFaixa(aviso: () => void): () => void {
  const mq = consultaDaFaixa();
  if (!mq) return () => {};
  mq.addEventListener('change', aviso);
  return () => mq.removeEventListener('change', aviso);
}

const lerFaixa = () => consultaDaFaixa()?.matches ?? false;
const foraDaFaixa = () => false;

interface NavRailProps {
  tab: Tab;
  onChangeTab: (tab: Tab) => void;
  /** A PREFERÊNCIA da pessoa. Entre 761 e 1100px o rail recolhe mesmo assim. */
  expandido: boolean;
  onToggle: () => void;
  mostrarTriagem: boolean;
  triagemPendente: number;
}

export function NavRail({
  tab, onChangeTab, expandido, onToggle, mostrarTriagem, triagemPendente,
}: NavRailProps) {
  const grupos: Grupo[] = gruposCom(mostrarTriagem);
  // Lido no primeiro render (sem pulo de largura) e atualizado ao cruzar o corte.
  const recolhidoPelaTela = useSyncExternalStore(assinarFaixa, lerFaixa, foraDaFaixa);
  // O estado EFETIVO. É ele que vai para `data-expandido`, então os estilos do
  // recolhido valem igual para quem recolheu e para a faixa que obriga.
  const aberto = expandido && !recolhidoPelaTela;

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
        // Recolhido o rótulo some da tela, mas não do leitor nem do tooltip. O
        // contador entra no nome: o `aria-label` do botão cobre o do selo.
        title={aberto ? undefined : s.label}
        aria-label={aberto ? undefined : contador != null ? `${s.label}, ${contador} na fila` : s.label}
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
    <aside className="nav-rail" data-expandido={aberto}>
      <div className="rail-brand">
        <Marca />
        <div className="rail-brand-copy">
          <div className="rail-brand-name">Matriz de Risco</div>
          <div className="rail-brand-sig">Rede de decisão</div>
        </div>
      </div>

      <nav className="rail-nav" aria-label="Seções">
        {grupos.map(g => (
          // O nome do grupo vai no `role="group"`, não no rótulo visível: recolhido
          // o rótulo vira um filete, e o leitor perderia Direção/Risco/Execução.
          <div className="rail-group" role="group" aria-label={g.titulo} key={g.titulo}>
            <div className="rail-group-label" aria-hidden="true">{g.titulo}</div>
            {g.itens.map(item)}
          </div>
        ))}
      </nav>

      {!recolhidoPelaTela && (
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
      )}
    </aside>
  );
}
