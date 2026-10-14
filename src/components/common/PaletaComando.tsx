import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Tab } from '../../types';
import type { Grupo } from '../NavRail/secoes';
import { chaveDoNome } from '../../lib/nomes';
import { useBloqueioDeRolagem } from '../../hooks/useBloqueioDeRolagem';

/**
 * Paleta de comando: Ctrl/⌘+K.
 *
 * Um app com sete seções, dezenas de iniciativas, sessenta riscos e mais de
 * cem tarefas não tinha busca global — cada aba tinha a sua, e ir de um risco
 * a uma iniciativa era três cliques. A paleta indexa os destinos (a mesma
 * lista do trilho), os registros das quatro camadas, as pessoas e as páginas
 * da aba Anotações, e abre qualquer um.
 *
 * Portal no <body>, `role="dialog"`, foco no campo ao abrir e devolvido ao
 * fechar, ↑↓ navegam, Enter abre, Esc fecha. Não usa o ModalShell porque a
 * paleta não é um formulário: é um campo e uma lista, e o cabeçalho com
 * título seria peso.
 */
export type TipoItemPaleta = 'risco' | 'iniciativa' | 'objetivo' | 'tarefa' | 'pessoa' | 'nota';

export interface ItemPaleta {
  tipo: TipoItemPaleta;
  id: string;
  rotulo: string;
  sub?: string;
}

/**
 * Para onde cada tipo vai: um destino por tipo, sem "senão". A versão anterior
 * recebia uma função só e terminava em `else irPara('pessoas')` — todo tipo
 * novo caía em Pessoas calado, e uma página escolhida na paleta abriria a aba
 * errada. Com um destino declarado por tipo, o `App` não compila esquecendo um.
 */
export type AberturaPorTipo = Record<TipoItemPaleta, (id: string) => void>;

interface PaletaComandoProps {
  aberta: boolean;
  onFechar: () => void;
  grupos: Grupo[];
  itens: ItemPaleta[];
  onIrPara: (tab: Tab) => void;
  abrir: AberturaPorTipo;
}

interface ApresentacaoTipo {
  /** Cabeçalho do grupo na lista. */
  grupo: string;
  /** A camada da cadeia: o quadradinho do item usa a cor dela. Sem camada, sem quadradinho. */
  camada?: 'objetivo' | 'iniciativa' | 'risco' | 'trabalho';
  /** O tipo escrito no item, para quando o nome sozinho se confunde com uma seção. */
  etiqueta?: string;
}

const TIPOS: Record<TipoItemPaleta, ApresentacaoTipo> = {
  objetivo: { grupo: 'Objetivos', camada: 'objetivo' },
  iniciativa: { grupo: 'Iniciativas', camada: 'iniciativa' },
  risco: { grupo: 'Riscos', camada: 'risco' },
  tarefa: { grupo: 'Tarefas e ações', camada: 'trabalho' },
  pessoa: { grupo: 'Pessoas' },
  // Página não é camada da cadeia: sem quadradinho, como Pessoas. E o título é
  // texto livre que repete nome de seção (a página "Triagem" e a aba Triagem):
  // o cabeçalho do grupo é só visual, então o item leva o tipo escrito — que
  // também entra no nome acessível da opção.
  nota: { grupo: 'Páginas', etiqueta: 'Página' },
};
const ORDEM_TIPO: TipoItemPaleta[] = ['objetivo', 'iniciativa', 'risco', 'tarefa', 'pessoa', 'nota'];
const POR_TIPO = 6;

/** Exaustividade: um tipo novo em `TipoItemPaleta` sem `case` abaixo não compila. */
function semDestino(tipo: never): never {
  throw new Error(`A paleta não sabe abrir itens do tipo "${String(tipo)}".`);
}

function abrirItem(item: ItemPaleta, abrir: AberturaPorTipo) {
  switch (item.tipo) {
    case 'objetivo': abrir.objetivo(item.id); return;
    case 'iniciativa': abrir.iniciativa(item.id); return;
    case 'risco': abrir.risco(item.id); return;
    case 'tarefa': abrir.tarefa(item.id); return;
    case 'pessoa': abrir.pessoa(item.id); return;
    case 'nota': abrir.nota(item.id); return;
    default: semDestino(item.tipo);
  }
}

interface Resultado {
  chave: string;
  grupo: string;
  rotulo: string;
  sub?: string;
  camada?: ApresentacaoTipo['camada'];
  etiqueta?: string;
  acao: () => void;
}

export function PaletaComando({ aberta, onFechar, grupos, itens, onIrPara, abrir }: PaletaComandoProps) {
  const [busca, setBusca] = useState('');
  const [ativo, setAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const anteriorRef = useRef<HTMLElement | null>(null);
  useBloqueioDeRolagem(aberta);

  useEffect(() => {
    if (!aberta) return;
    anteriorRef.current = document.activeElement as HTMLElement | null;
    setBusca('');
    setAtivo(0);
    // O campo só existe depois desta renderização.
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => { clearTimeout(t); anteriorRef.current?.focus?.(); };
  }, [aberta]);

  const resultados = useMemo<Resultado[]>(() => {
    const q = chaveDoNome(busca);
    const bate = (texto: string) => !q || chaveDoNome(texto).includes(q);
    const destinos: Resultado[] = grupos.flatMap(g => g.itens)
      .filter(s => bate(s.label) || bate(`ir para ${s.label}`))
      .map(s => ({ chave: `ir:${s.id}`, grupo: 'Ir para', rotulo: s.label, acao: () => onIrPara(s.id) }));
    if (!q) return destinos;
    const registros: Resultado[] = ORDEM_TIPO.flatMap(tipo => itens
      .filter(i => i.tipo === tipo && (bate(i.rotulo) || (i.sub ? bate(i.sub) : false)))
      .slice(0, POR_TIPO)
      .map(i => ({
        chave: `${i.tipo}:${i.id}`, grupo: TIPOS[tipo].grupo, rotulo: i.rotulo, sub: i.sub,
        camada: TIPOS[tipo].camada, etiqueta: TIPOS[tipo].etiqueta, acao: () => abrirItem(i, abrir),
      })));
    return [...destinos, ...registros];
  }, [busca, grupos, itens, onIrPara, abrir]);

  useEffect(() => { setAtivo(0); }, [busca]);

  if (!aberta) return null;

  function executar(r: Resultado) {
    onFechar();
    r.acao();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); onFechar(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setAtivo(a => Math.min(resultados.length - 1, a + 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo(a => Math.max(0, a - 1)); return; }
    if (e.key === 'Enter') { e.preventDefault(); const r = resultados[ativo]; if (r) executar(r); return; }
    // O foco fica no campo: Tab não tem para onde ir aqui.
    if (e.key === 'Tab') e.preventDefault();
  }

  let grupoAnterior = '';

  return createPortal((
    <div className="paleta-overlay" onClick={onFechar}>
      <div
        className="paleta"
        role="dialog"
        aria-modal="true"
        aria-label="Buscar e navegar"
        onClick={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          className="paleta-campo"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar risco, iniciativa, objetivo, tarefa, pessoa, página — ou ir para uma seção"
          aria-label="Buscar e navegar"
          role="combobox"
          aria-expanded="true"
          aria-controls="paleta-lista"
          aria-activedescendant={resultados[ativo] ? `paleta-${resultados[ativo].chave}` : undefined}
          autoComplete="off"
          spellCheck={false}
        />
        <ul className="paleta-lista" id="paleta-lista" role="listbox">
          {resultados.length === 0 && (
            <li className="paleta-vazio">
              <strong>Nada com “{busca}”</strong>
              <span>A busca olha nome, área, responsável e o começo das páginas. Tente outra palavra, ou escolha uma seção.</span>
            </li>
          )}
          {resultados.map((r, i) => {
            const cabecalho = r.grupo !== grupoAnterior ? r.grupo : null;
            grupoAnterior = r.grupo;
            return (
              <li key={r.chave} role="presentation">
                {cabecalho && <div className="paleta-grupo" aria-hidden="true">{cabecalho}</div>}
                <div
                  id={`paleta-${r.chave}`}
                  role="option"
                  aria-selected={i === ativo}
                  className="paleta-item"
                  data-ativo={i === ativo || undefined}
                  data-camada={r.camada}
                  onMouseEnter={() => setAtivo(i)}
                  onClick={() => executar(r)}
                >
                  <span className="paleta-rotulo">{r.rotulo}</span>
                  {r.etiqueta && <span className="badge" data-badge="neutro">{r.etiqueta}</span>}
                  {r.sub && <span className="paleta-sub">{r.sub}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="paleta-dica" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>Enter</kbd> abrir</span>
          <span><kbd>Esc</kbd> fechar</span>
        </div>
      </div>
    </div>
  ), document.body);
}
