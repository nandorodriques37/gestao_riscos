import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { alternarDono, type OpcaoDono } from '../../lib/agrupamentoDono';
import { chaveDoNome } from '../../lib/nomes';

/** Largura do painel em `primitives.css` — só para decidir para que lado ele abre. */
const LARGURA_PAINEL = 320;

interface FiltroPessoasProps {
  opcoes: OpcaoDono[];
  /** Lista vazia = todas as pessoas, como no filtro de status. */
  selecionados: string[];
  onChange: (ids: string[]) => void;
  /** Ficha de quem usa o app. Sem ficha, o atalho "Só as minhas" não aparece. */
  autorId: string | null;
}

/**
 * Filtro de pessoas da aba Tarefas — vale para a Lista e o Quadro.
 *
 * É um painel, não um `<select multiple>`: com uma dúzia de pessoas a busca e o
 * número de tarefas abertas ao lado do nome são o que torna a escolha rápida, e
 * o select nativo não mostra nenhum dos dois.
 */
export function FiltroPessoas({ opcoes, selecionados, onChange, autorId }: FiltroPessoasProps) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  // O botão fica no fim da barra em tela larga e no começo no celular: o
  // painel abre para o lado onde cabe, senão vaza pela borda da janela.
  const [alinhamento, setAlinhamento] = useState<'inicio' | 'fim'>('inicio');
  const wrapRef = useRef<HTMLDivElement>(null);
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const painelId = useId();

  const todos = useMemo(() => opcoes.map(o => o.id), [opcoes]);
  // Ficha que sumiu (mesclada, excluída) não conta: senão o botão diria
  // "3 de 8" com só duas pessoas de fato no recorte.
  const ativos = selecionados.filter(id => todos.includes(id));
  const recorte = ativos.length > 0;
  const marcada = (id: string) => !recorte || ativos.includes(id);

  const visiveis = useMemo(() => {
    const q = chaveDoNome(busca);
    return q ? opcoes.filter(o => chaveDoNome(o.nome).includes(q)) : opcoes;
  }, [opcoes, busca]);

  // Fecha no Esc e no clique fora, devolvendo o foco ao gatilho — o mesmo
  // contrato do menu "Mover para" do quadro.
  useEffect(() => {
    if (!aberto) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setAberto(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setAberto(false);
      gatilhoRef.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [aberto]);

  useEffect(() => { if (!aberto) setBusca(''); }, [aberto]);

  const soMinhas = autorId != null && todos.includes(autorId);

  return (
    <div className="filtro-pessoas" ref={wrapRef}>
      <button
        ref={gatilhoRef}
        type="button"
        className="filtro-pessoas-gatilho"
        data-ativo={recorte || undefined}
        aria-expanded={aberto}
        aria-haspopup="dialog"
        aria-controls={aberto ? painelId : undefined}
        onClick={() => {
          const r = gatilhoRef.current?.getBoundingClientRect();
          if (r) setAlinhamento(r.left + LARGURA_PAINEL > window.innerWidth ? 'fim' : 'inicio');
          setAberto(v => !v);
        }}
      >
        {recorte ? (
          <>
            Pessoas
            <span className="filtros-toggle-count tabular">{ativos.length} de {todos.length}</span>
          </>
        ) : 'Todas as pessoas'}
        <span className="filtros-toggle-seta" aria-hidden="true">▾</span>
      </button>

      {aberto && (
        <div className="filtro-pessoas-painel" data-alinhamento={alinhamento} id={painelId} role="dialog" aria-label="Filtrar por pessoa">
          <input
            className="search-input"
            type="search"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar pessoa"
            aria-label="Buscar pessoa"
            autoFocus
          />
          <div className="filtro-pessoas-atalhos">
            {soMinhas && (
              <button type="button" onClick={() => onChange([autorId])}>Só as minhas</button>
            )}
            <button type="button" onClick={() => onChange([])} disabled={!recorte}>Todas</button>
          </div>
          <ul className="filtro-pessoas-lista">
            {visiveis.map(o => (
              <li key={o.id}>
                <label data-sem-dono={o.semDono || undefined}>
                  <input
                    type="checkbox"
                    checked={marcada(o.id)}
                    onChange={() => onChange(alternarDono(ativos, o.id, todos))}
                  />
                  <span className="filtro-pessoas-nome">{o.nome}</span>
                  <span className="filtro-pessoas-qtd tabular" aria-label={`${o.abertas} abertas`}>{o.abertas}</span>
                </label>
              </li>
            ))}
            {visiveis.length === 0 && <li className="filtro-pessoas-vazio">Ninguém com esse nome</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

interface EtiquetasPessoasProps {
  opcoes: OpcaoDono[];
  selecionados: string[];
  onChange: (ids: string[]) => void;
}

/** O recorte ativo à vista, com × para tirar cada pessoa sem abrir o painel. */
export function EtiquetasPessoas({ opcoes, selecionados, onChange }: EtiquetasPessoasProps) {
  const escolhidas = opcoes.filter(o => selecionados.includes(o.id));
  if (escolhidas.length === 0) return null;
  return (
    <ul className="filtro-pessoas-etiquetas" aria-label="Pessoas no filtro">
      {escolhidas.map(o => (
        <li key={o.id}>
          {o.nome}
          <button
            type="button"
            aria-label={`Tirar ${o.nome} do filtro`}
            onClick={() => onChange(selecionados.filter(id => id !== o.id))}
          >×</button>
        </li>
      ))}
    </ul>
  );
}
