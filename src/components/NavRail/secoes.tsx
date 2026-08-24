import type { ReactElement } from 'react';
import type { Tab } from '../../types';

/**
 * Os destinos do app, em UMA lista.
 *
 * Moram aqui, e não dentro do `NavRail`, porque a navegação tem três formas —
 * rail lateral acima de 1100px, abas do topo entre 761 e 1100, barra inferior
 * abaixo de 760 — e as três precisam concordar sobre quais destinos existem, em
 * que ordem e sob que grupo. Duas listas derivariam exatamente como a regra da
 * Triagem derivou entre `App` e `TopBar` antes de virar um booleano só.
 *
 * Os ícones são SVG traçado em grade de 24: sem lib e sem emoji, como o resto do
 * app.
 */

export interface Secao {
  id: Tab;
  label: string;
  icone: ReactElement;
}

export interface Grupo {
  titulo: string;
  itens: Secao[];
}

const svg = (d: ReactElement) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);

export const ICONES = {
  painel: svg(<><rect x="3" y="3" width="8" height="10" rx="1.5" /><rect x="13" y="3" width="8" height="6" rx="1.5" /><rect x="3" y="15" width="8" height="6" rx="1.5" /><rect x="13" y="11" width="8" height="10" rx="1.5" /></>),
  objetivos: svg(<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.6" fill="currentColor" /></>),
  iniciativas: svg(<><path d="M3.5 18.5h17" /><path d="M6 18.5V9.5l6-4.5 6 4.5v9" /><path d="M12 18.5v-5" /></>),
  registro: svg(<><path d="M12 4.2 20.8 19.4H3.2Z" /><path d="M12 10v3.6" /><path d="M12 16.6v.3" /></>),
  priorizacao: svg(<><rect x="3" y="3" width="18" height="18" rx="2.5" /><path d="M3 12h18M12 3v18" /></>),
  tarefas: svg(<><rect x="3" y="3" width="18" height="18" rx="3" /><polyline points="8 12.4 11 15.4 16.4 9" /></>),
  pessoas: svg(<><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><path d="M16.5 5.4a3.2 3.2 0 0 1 0 5.2" /><path d="M17.5 14.9c2 .6 3.2 2.3 3.2 4.6" /></>),
  triagem: svg(<><path d="M4 5h16" /><path d="M7 12h10" /><path d="M10 19h4" /></>),
  /** Só a barra inferior usa: abre a folha com o resto dos destinos. */
  mais: svg(<><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" /></>),
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
export const GRUPOS: Grupo[] = [
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

/** Seção temporária da migração — entra na navegação só enquanto há trabalho. */
export const TRIAGEM: Secao = { id: 'triagem', label: 'Triagem', icone: ICONES.triagem };

/**
 * Os quatro destinos fixos da barra inferior: um por camada da cadeia
 * (objetivo → iniciativa → risco → trabalho), que é o próprio princípio
 * organizador do app. O resto — Iniciativas, Priorização, Pessoas, Triagem —
 * vive atrás do botão "Mais", com os grupos inteiros e os mesmos rótulos do
 * rail.
 *
 * Quatro e não cinco: a quinta fatia é o "Mais", e uma barra de seis a 375px
 * devolveria o problema que ela existe para resolver.
 */
export const DESTINOS_BARRA: Tab[] = ['painel', 'objetivos', 'registro', 'tarefas'];

/** Os grupos, com a Triagem anexada quando a migração ainda tem trabalho. */
export function gruposCom(mostrarTriagem: boolean): Grupo[] {
  return mostrarTriagem
    ? [...GRUPOS, { titulo: 'Migração', itens: [TRIAGEM] }]
    : GRUPOS;
}
