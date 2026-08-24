import { useEffect, useRef, useState } from 'react';
import type { Tab } from '../../types';
import type { ThemePref } from '../../lib/uiPrefs';
import { useBloqueioDeRolagem } from '../../hooks/useBloqueioDeRolagem';
import { DESTINOS_BARRA, GRUPOS, ICONES, gruposCom, type Secao } from '../NavRail/secoes';

/**
 * Navegação do celular: barra inferior fixa, na zona do polegar.
 *
 * Substitui a fita de abas do topo abaixo de 760px. A fita rolava 8 destinos
 * dentro de um header de 56px que ainda carregava marca, chip de autor, estado
 * de sincronização e botão de tema — a 375px cabiam duas abas, a barra de
 * rolagem é invisível por regra do próprio app, e os grupos Direção/Risco/
 * Execução sumiam. Quem abria no telefone não tinha como saber que existiam
 * Pessoas ou Priorização.
 *
 * São quatro destinos fixos (um por camada da cadeia) mais "Mais", que abre uma
 * folha com os grupos INTEIROS — os mesmos rótulos e a mesma ordem do rail,
 * porque vêm da mesma lista (`secoes.tsx`).
 *
 * A folha também é onde moram o chip de autor e o botão de tema. Os dois vivem
 * no header e são os primeiros a sumir quando a tela encolhe (o autor some a
 * 900px), e o autor não é enfeite: é o nome que vai para o histórico de quem
 * alterou o quê. Sem um lugar no celular, todo mundo grava como "não
 * identificado".
 */

interface NavBottomProps {
  tab: Tab;
  onChangeTab: (tab: Tab) => void;
  mostrarTriagem: boolean;
  triagemPendente: number;
  /** Identidade autodeclarada; o `App` é dono do estado, como do tema. */
  autor: string;
  onPedirNome: () => void;
  theme: ThemePref;
  onCycleTheme: () => void;
  themeLabel: string;
}

export function NavBottom({
  tab, onChangeTab, mostrarTriagem, triagemPendente,
  autor, onPedirNome, theme, onCycleTheme, themeLabel,
}: NavBottomProps) {
  const [folhaAberta, setFolhaAberta] = useState(false);
  const maisRef = useRef<HTMLButtonElement>(null);
  const folhaRef = useRef<HTMLElement>(null);

  const grupos = gruposCom(mostrarTriagem);
  const fixos = DESTINOS_BARRA
    .map(id => GRUPOS.flatMap(g => g.itens).find(s => s.id === id))
    .filter((s): s is Secao => s != null);
  // O destino atual não está entre os quatro: o "Mais" acende para o usuário
  // não ficar sem saber onde está. Identidade não se dá só por cor — o ponto
  // acompanha o rótulo, que continua escrito.
  const ativoNoMais = !DESTINOS_BARRA.includes(tab);

  useBloqueioDeRolagem(folhaAberta);

  // Esc fecha e devolve o foco ao gatilho; o primeiro item recebe o foco ao
  // abrir; Tab circula dentro da folha. Mesma doutrina do `ModalShell`, sem
  // herdar o cartão dele — a folha não é um diálogo de formulário.
  //
  // O laço de Tab não é preciosismo: a página atrás continua no DOM (a folha
  // apenas a cobre), então sem ele o Tab sai da folha e vai passeando por
  // botões que ninguém está vendo.
  useEffect(() => {
    if (!folhaAberta) return;
    const itens = () => [...(folhaRef.current?.querySelectorAll<HTMLElement>('button') ?? [])];
    itens()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setFolhaAberta(false);
        maisRef.current?.focus();
        return;
      }
      if (e.key !== 'Tab') return;
      const lista = itens();
      if (lista.length === 0) return;
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [folhaAberta]);

  function irPara(destino: Tab) {
    setFolhaAberta(false);
    onChangeTab(destino);
  }

  function fatia(s: Secao) {
    const ativo = tab === s.id;
    return (
      <button
        key={s.id}
        className="nav-bottom-item"
        data-ativo={ativo}
        aria-current={ativo ? 'page' : undefined}
        onClick={() => onChangeTab(s.id)}
      >
        {s.icone}
        <span className="nav-bottom-label">{s.label}</span>
      </button>
    );
  }

  return (
    <>
      <nav className="nav-bottom" aria-label="Seções">
        {fixos.map(fatia)}

        <button
          ref={maisRef}
          className="nav-bottom-item"
          data-ativo={ativoNoMais}
          onClick={() => setFolhaAberta(v => !v)}
          aria-expanded={folhaAberta}
        >
          {ICONES.mais}
          <span className="nav-bottom-label">Mais</span>
          {/* Fila de triagem: o número viaja junto do rótulo, nunca sozinho. */}
          {triagemPendente > 0 && (
            <span className="nav-bottom-count tabular" aria-label={`${triagemPendente} na fila de triagem`}>
              {triagemPendente}
            </span>
          )}
        </button>
      </nav>

      {folhaAberta && (
        <div className="nav-sheet-overlay" onClick={() => setFolhaAberta(false)}>
          {/* `nav`, e não `role="menu"`: menu ARIA promete navegação por setas,
              que isto não implementa nem quer — são links de seção, percorridos
              com Tab como qualquer navegação. */}
          <nav
            ref={folhaRef}
            className="nav-sheet"
            aria-label="Todas as seções"
            onClick={e => e.stopPropagation()}
          >
            <div className="nav-sheet-alca" aria-hidden="true" />

            {grupos.map(g => (
              <div className="nav-sheet-grupo" key={g.titulo}>
                <div className="rail-group-label">{g.titulo}</div>
                {g.itens.map(s => {
                  const ativo = tab === s.id;
                  const contador = s.id === 'triagem' && triagemPendente > 0 ? triagemPendente : null;
                  return (
                    <button
                      key={s.id}
                      className="rail-item"
                      data-ativo={ativo}
                      aria-current={ativo ? 'page' : undefined}
                      onClick={() => irPara(s.id)}
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
                })}
              </div>
            ))}

            <div className="nav-sheet-pe">
              <button className="autor-chip" data-vazio={autor ? undefined : 'true'} onClick={onPedirNome}>
                {autor || 'Quem é você?'}
              </button>
              {/* O ícone é desenhado em CSS a partir do data-pref (ver layout.css). */}
              <button
                className="theme-toggle"
                data-pref={theme}
                onClick={onCycleTheme}
                aria-label={themeLabel}
                title={themeLabel}
              />
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
