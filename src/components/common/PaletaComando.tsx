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
 * lista do trilho) e os registros das quatro camadas, e abre qualquer um.
 *
 * Portal no <body>, `role="dialog"`, foco no campo ao abrir e devolvido ao
 * fechar, ↑↓ navegam, Enter abre, Esc fecha. Não usa o ModalShell porque a
 * paleta não é um formulário: é um campo e uma lista, e o cabeçalho com
 * título seria peso.
 */
export type TipoItemPaleta = 'risco' | 'iniciativa' | 'objetivo' | 'tarefa' | 'pessoa';

export interface ItemPaleta {
  tipo: TipoItemPaleta;
  id: string;
  rotulo: string;
  sub?: string;
}

interface PaletaComandoProps {
  aberta: boolean;
  onFechar: () => void;
  grupos: Grupo[];
  itens: ItemPaleta[];
  onIrPara: (tab: Tab) => void;
  onAbrir: (item: ItemPaleta) => void;
}

const ROTULO_TIPO: Record<TipoItemPaleta, string> = {
  risco: 'Riscos', iniciativa: 'Iniciativas', objetivo: 'Objetivos', tarefa: 'Tarefas e ações', pessoa: 'Pessoas',
};
const ORDEM_TIPO: TipoItemPaleta[] = ['objetivo', 'iniciativa', 'risco', 'tarefa', 'pessoa'];
const POR_TIPO = 6;

type Resultado =
  | { chave: string; grupo: string; rotulo: string; sub?: string; acao: () => void };

export function PaletaComando({ aberta, onFechar, grupos, itens, onIrPara, onAbrir }: PaletaComandoProps) {
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
      .map(i => ({ chave: `${i.tipo}:${i.id}`, grupo: ROTULO_TIPO[tipo], rotulo: i.rotulo, sub: i.sub, acao: () => onAbrir(i) })));
    return [...destinos, ...registros];
  }, [busca, grupos, itens, onIrPara, onAbrir]);

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
          placeholder="Buscar risco, iniciativa, objetivo, tarefa, pessoa — ou ir para uma seção"
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
            <li className="paleta-vazio">Nada com "{busca}". Tente outra palavra, ou uma seção.</li>
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
                  onMouseEnter={() => setAtivo(i)}
                  onClick={() => executar(r)}
                >
                  <span className="paleta-rotulo">{r.rotulo}</span>
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
