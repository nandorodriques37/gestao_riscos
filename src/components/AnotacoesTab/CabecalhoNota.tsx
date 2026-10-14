import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Nota } from '../../types';
import { quandoEditada } from '../../lib/notas';

/**
 * O que o cabeçalho escreve ao lado da meta. Uma régua só, decidida pela aba:
 * - `salvando` e `enviando` são neutros (está acontecendo, nada a fazer);
 * - `salvo` tem o ponto verde;
 * - `conflito` é âmbar: nada se perdeu enquanto a pessoa não escolher;
 * - `erro` é coral: o texto existe só nesta tela até a conexão voltar.
 */
export type EstadoGravacao = 'salvo' | 'salvando' | 'enviando' | 'conflito' | 'erro';

/**
 * Teto do título — o mesmo `MAX_TITULO_NOTA` que o servidor valida
 * (`api/_notasDb.ts`). Passar dele faria o salvamento automático tentar para
 * sempre um PATCH que o servidor recusa.
 */
const MAX_TITULO = 200;

export interface CabecalhoNotaProps {
  nota: Nota;
  /**
   * O campo do título é um rascunho: lê `nota.titulo` ao montar e quando este
   * número muda ("Carregar a dela", versão de fora) — nunca a cada gravação,
   * senão um conflito apagaria o título que a pessoa está escrevendo.
   */
  recarregar: number;
  /** Foca o título ao montar (página recém-criada). */
  focarTitulo: boolean;
  onTituloFocado: () => void;
  onTitulo: (titulo: string) => void;
  estado: EstadoGravacao;
  /** Imagens subindo agora; só conta quando `estado` é `enviando`. */
  enviando: number;
  /** Outra pessoa gravou por cima: mostra a faixa de escolha. */
  conflito: boolean;
  /** "Manter a minha" em curso: os dois botões da faixa ficam inertes. */
  resolvendo: boolean;
  agora: Date;
  onFixar: () => void;
  onExcluir: () => void;
  onManterMinha: () => void;
  onCarregarDela: () => void;
  onTentarAgora: () => void;
}

const ROTULO: Record<Exclude<EstadoGravacao, 'enviando'>, string> = {
  salvo: 'Salvo',
  salvando: 'Salvando…',
  conflito: 'Não salvo',
  erro: 'Não salvo · tentando de novo',
};

/**
 * Há quanto tempo, pronto para entrar numa frase: "há 5 min", "ontem",
 * "agora", "em 08/10" (a data pede a preposição). `''` se a data é ilegível.
 */
function tempoDesde(iso: string, agora: Date): string {
  const quando = quandoEditada(iso, agora);
  return /^\d/.test(quando) ? `em ${quando}` : quando;
}

export function CabecalhoNota({
  nota, recarregar, focarTitulo, onTituloFocado, onTitulo, estado, enviando, conflito, resolvendo,
  agora, onFixar, onExcluir, onManterMinha, onCarregarDela, onTentarAgora,
}: CabecalhoNotaProps) {
  const [titulo, setTitulo] = useState(nota.titulo);
  const [carregado, setCarregado] = useState(recarregar);
  // Recarregar troca o rascunho pelo título salvo ("Carregar a dela", ou a
  // versão de outra pessoa que chegou com a tela limpa). Estado derivado de
  // prop no próprio render, sem efeito: o campo nunca pinta um quadro com o
  // título velho.
  if (carregado !== recarregar) {
    setCarregado(recarregar);
    setTitulo(nota.titulo);
  }

  const campo = useRef<HTMLInputElement>(null);
  // Só ao montar (o cabeçalho é montado com `key` da página): a página nova
  // abre com o cursor no título.
  const focarAoMontar = useRef(focarTitulo);
  const avisarFocado = useRef(onTituloFocado);
  useEffect(() => {
    if (!focarAoMontar.current) return;
    campo.current?.focus();
    avisarFocado.current();
  }, []);

  // Enter no título leva ao corpo, como num documento: o título é uma linha só.
  function aoTeclar(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    e.currentTarget.closest('.notas-pagina')?.querySelector<HTMLElement>('[contenteditable="true"], textarea')?.focus();
  }

  const autor = nota.autor.trim();
  const quando = tempoDesde(nota.updated_at, agora);
  const rotuloEstado = estado === 'enviando'
    ? (enviando > 1 ? `Enviando ${enviando} imagens…` : 'Enviando imagem…')
    : ROTULO[estado];
  const idTitulo = `nota-titulo-${nota.id}`;

  return (
    <header className="nota-cab">
      <div className="nota-cab-linha">
        <label className="sr-only" htmlFor={idTitulo}>Título da página</label>
        <input
          ref={campo}
          id={idTitulo}
          className="nota-titulo"
          type="text"
          value={titulo}
          placeholder="Sem título"
          maxLength={MAX_TITULO}
          autoComplete="off"
          onChange={e => { setTitulo(e.target.value); onTitulo(e.target.value); }}
          onKeyDown={aoTeclar}
        />
        <div className="nota-cab-acoes">
          <button type="button" className="btn btn-ghost nota-acao" aria-pressed={nota.fixada} onClick={onFixar}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 3h6l-1 7 3.5 3.5V15h-11v-1.5L10 10 9 3z" fill={nota.fixada ? 'currentColor' : 'none'} />
              <path d="M12 15v6" />
            </svg>
            {/* Verbo fixo e estado no aria-pressed: "Fixada" num botão desligado
                afirmava um estado que a página não tinha. */}
            Fixar
          </button>
          <button type="button" className="btn btn-ghost nota-acao" onClick={onExcluir}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h16" />
              <path d="M9 7V4h6v3" />
              <path d="M6 7l1 12.5a1.5 1.5 0 0 0 1.5 1.5h7a1.5 1.5 0 0 0 1.5-1.5L18 7" />
              <path d="M10 11v6M14 11v6" />
            </svg>
            Excluir
          </button>
        </div>
      </div>

      <p className="nota-meta tabular">
        <span>
          Escrita por <b>{autor || '—'}</b>
          {quando && ` · editada ${quando}`}
        </span>
        <output className="nota-status" data-estado={estado}>
          <i aria-hidden="true" />
          {rotuloEstado}
        </output>
      </p>

      {conflito && (
        <div className="nota-conflito" role="alert">
          <p className="nota-faixa-texto">
            <b>Outra pessoa editou esta página{quando && ` ${quando}`}.</b>
            {' '}O seu texto continua aqui.
          </p>
          <div className="nota-faixa-acoes">
            <button type="button" className="btn btn-navy" onClick={onManterMinha} disabled={resolvendo}>
              Manter a minha
            </button>
            <button type="button" className="btn btn-ghost" onClick={onCarregarDela} disabled={resolvendo}>
              Carregar a dela
            </button>
          </div>
        </div>
      )}

      {!conflito && estado === 'erro' && (
        <div className="nota-erro" role="alert">
          <p className="nota-faixa-texto">
            Sem conexão com o servidor. O que você escreveu continua aqui e sobe quando a conexão voltar.
          </p>
          <div className="nota-faixa-acoes">
            <button type="button" className="btn btn-ghost" onClick={onTentarAgora}>Tentar agora</button>
          </div>
        </div>
      )}
    </header>
  );
}
