import type { MouseEvent } from 'react';
import type { Nota } from '../../types';
import { EmptyState } from '../common/EmptyState';
import { quandoEditada, trechoDaNota, type RecorteNotas } from '../../lib/notas';
import { routeHash } from '../../lib/navigation';
import { plural } from '../../lib/portfolioLabels';

/**
 * Coluna das páginas: busca, recorte Todas | Minhas e as duas seções (Fixadas
 * e Recentes). Não filtra nem ordena nada — recebe os grupos prontos da aba,
 * que é quem conhece a régua (`filtrarNotas` + `ordenarNotas`). Assim a
 * contagem do segmento e a lista nunca discordam.
 */
export interface ListaNotasProps {
  fixadas: readonly Nota[];
  recentes: readonly Nota[];
  busca: string;
  onBusca: (busca: string) => void;
  recorte: RecorteNotas;
  onRecorte: (recorte: RecorteNotas) => void;
  /** Quantas páginas cada recorte mostra COM a busca aplicada. */
  contagens: Record<RecorteNotas, number>;
  autor: string;
  onPedirNome: () => void;
  /** Página aberta; marca a linha com `aria-current`. */
  selecionada: string | null;
  /** Página da metade de baixo, com a tela dividida. */
  abaixo: string | null;
  onAbrir: (id: string) => void;
  /** Abre a página na metade de baixo. Sem ele (tela estreita), a linha não oferece. */
  onAbrirAbaixo?: (id: string) => void;
  agora: Date;
  carregando: boolean;
}

const RECORTES: { valor: RecorteNotas; rotulo: string }[] = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'minhas', rotulo: 'Minhas' },
];

/**
 * Id do item na lista. A aba devolve o foco a ele ao voltar da página no
 * celular (`AnotacoesTab`, mesmo formato).
 */
const idDoItem = (id: string) => `nota-item-${id}`;

export function ListaNotas({
  fixadas, recentes, busca, onBusca, recorte, onRecorte, contagens,
  autor, onPedirNome, selecionada, abaixo, onAbrir, onAbrirAbaixo, agora, carregando,
}: ListaNotasProps) {
  const vazia = fixadas.length === 0 && recentes.length === 0;

  return (
    <section className="notas-lista" aria-label="Páginas">
      <div className="notas-filtros">
        <label className="sr-only" htmlFor="notas-busca">Buscar nas páginas</label>
        <input
          id="notas-busca"
          className="search-input notas-busca"
          type="search"
          placeholder="Buscar nas páginas"
          value={busca}
          onChange={e => onBusca(e.target.value)}
          autoComplete="off"
        />
        <div className="view-toggle notas-recorte" role="group" aria-label="Recorte das páginas">
          {RECORTES.map(r => (
            <button
              key={r.valor}
              type="button"
              className={recorte === r.valor ? 'active' : ''}
              aria-pressed={recorte === r.valor}
              onClick={() => onRecorte(r.valor)}
            >
              {r.rotulo}
              <span className="view-toggle-count tabular">{contagens[r.valor]}</span>
            </button>
          ))}
        </div>
      </div>

      {carregando && vazia ? (
        <div className="notas-carregando" role="status" aria-label="Carregando páginas…">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton-row" />)}
        </div>
      ) : vazia ? (
        <ListaVazia
          busca={busca} recorte={recorte} contagens={contagens} autor={autor}
          onBusca={onBusca} onRecorte={onRecorte} onPedirNome={onPedirNome}
        />
      ) : (
        <>
          <Secao id="notas-fixadas" titulo="Fixadas" notas={fixadas} {...{ selecionada, abaixo, onAbrir, onAbrirAbaixo, agora }} />
          <Secao id="notas-recentes" titulo="Recentes" notas={recentes} {...{ selecionada, abaixo, onAbrir, onAbrirAbaixo, agora }} />
        </>
      )}
    </section>
  );
}

interface SecaoProps {
  id: string;
  titulo: string;
  notas: readonly Nota[];
  selecionada: string | null;
  abaixo: string | null;
  onAbrir: (id: string) => void;
  onAbrirAbaixo?: (id: string) => void;
  agora: Date;
}

function Secao({ id, titulo, notas, selecionada, abaixo, onAbrir, onAbrirAbaixo, agora }: SecaoProps) {
  if (notas.length === 0) return null;
  return (
    <>
      <h2 className="notas-secao" id={id}>{titulo}</h2>
      <ul className="notas-itens" aria-labelledby={id}>
        {notas.map(n => (
          <li key={n.id} className="notas-li">
            <ItemNota nota={n} ativa={n.id === selecionada} embaixo={n.id === abaixo} onAbrir={onAbrir} agora={agora} />
            {/* Irmão do link, não filho: botão dentro de <a> não é HTML válido.
                Some na página que já está na tela, em cima ou embaixo — a
                mesma página nas duas metades seriam dois editores disputando
                o mesmo texto. */}
            {onAbrirAbaixo && n.id !== selecionada && n.id !== abaixo && (
              <button
                type="button"
                className="notas-abrir-abaixo"
                onClick={() => onAbrirAbaixo(n.id)}
                aria-label={`Abrir “${n.titulo.trim() || 'Sem título'}” abaixo`}
                title="Abrir abaixo"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="4" y="4" width="16" height="16" rx="3" />
                  <path d="M4 12h16" />
                  <path d="M12 14.5v3M10.5 16h3" />
                </svg>
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

interface ItemNotaProps {
  nota: Nota;
  ativa: boolean;
  /** Aberta na metade de baixo. */
  embaixo: boolean;
  onAbrir: (id: string) => void;
  agora: Date;
}

function ItemNota({ nota, ativa, embaixo, onAbrir, agora }: ItemNotaProps) {
  const titulo = nota.titulo.trim();
  const trecho = trechoDaNota(nota);
  const quem = nota.editado_por.trim() || nota.autor.trim();
  const quando = quandoEditada(nota.updated_at, agora);
  const meta = [quem, quando].filter(Boolean).join(' · ');

  // Link de verdade (abre em outra aba, copia o endereço); o clique simples
  // passa pela aba, que pergunta aos guards antes de trocar de página.
  function abrir(e: MouseEvent<HTMLAnchorElement>) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onAbrir(nota.id);
  }

  return (
    <a
      id={idDoItem(nota.id)}
      className="notas-item"
      href={routeHash({ tab: 'anotacoes', nota: nota.id })}
      aria-current={ativa || embaixo ? 'true' : undefined}
      data-onde={embaixo ? 'abaixo' : undefined}
      onClick={abrir}
    >
      <span className="notas-item-texto">
        <span className="notas-item-titulo" data-vazio={titulo ? undefined : 'true'}>
          {titulo || 'Sem título'}
        </span>
        {trecho && <span className="notas-item-trecho">{trecho}</span>}
        {(meta || embaixo) && (
          <span className="notas-item-meta tabular">
            {/* Onde ela está vai escrito: a marca da linha sozinha não diz qual metade. */}
            {embaixo && <span className="notas-item-onde">Aberta abaixo</span>}
            {embaixo && meta && ' · '}
            {meta}
          </span>
        )}
      </span>
      {/* Só aparece no celular, onde a linha leva a outra tela. */}
      <svg className="notas-item-seta" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </a>
  );
}

interface ListaVaziaProps {
  busca: string;
  recorte: RecorteNotas;
  contagens: Record<RecorteNotas, number>;
  autor: string;
  onBusca: (busca: string) => void;
  onRecorte: (recorte: RecorteNotas) => void;
  onPedirNome: () => void;
}

/**
 * Lista vazia com páginas na aba: a busca ou o recorte esconderam tudo. O
 * estado diz o que foi pedido e a saída que devolve as páginas.
 */
function ListaVazia({ busca, recorte, contagens, autor, onBusca, onRecorte, onPedirNome }: ListaVaziaProps) {
  const termo = busca.trim();
  if (recorte === 'minhas' && !autor.trim()) {
    return (
      <EmptyState
        message="Sem nome, nenhuma página é sua"
        hint="Minhas mostra as páginas que você escreveu ou editou por último, pelo nome do chip de autor."
        action={{ label: 'Dizer meu nome', onClick: onPedirNome }}
      />
    );
  }
  if (termo && recorte === 'minhas' && contagens.todas > 0) {
    return (
      <EmptyState
        message={`Nenhuma página sua com “${termo}”`}
        hint={`${plural(contagens.todas, 'página da equipe tem', 'páginas da equipe têm')} esse texto. Elas estão em Todas.`}
        action={{ label: 'Ver todas', onClick: () => onRecorte('todas') }}
      />
    );
  }
  if (termo) {
    return (
      <EmptyState
        message={`Nenhuma página com “${termo}”`}
        hint="A busca olha título e texto, sem acento e sem caixa."
        action={{ label: 'Limpar busca', onClick: () => onBusca('') }}
      />
    );
  }
  return (
    <EmptyState
      message="Nenhuma página sua ainda"
      hint="Minhas mostra as páginas que você escreveu ou editou por último. As da equipe estão em Todas."
      action={{ label: 'Ver todas', onClick: () => onRecorte('todas') }}
    />
  );
}
