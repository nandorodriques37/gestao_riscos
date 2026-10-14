import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { Nota } from '../../types';
import { quandoEditada } from '../../lib/notas';

/**
 * O que o cabeçalho escreve ao lado da meta. Uma régua só, decidida pela aba:
 * - `salvando` e `enviando` são neutros (está acontecendo, nada a fazer);
 * - `salvo` tem o ponto verde;
 * - `conflito` é âmbar: nada se perdeu enquanto a pessoa não escolher;
 * - `erro` é coral: o texto existe só nesta tela, e o envio tenta de novo;
 * - `recusada` é coral: o servidor recusou (limite, validação) e repetir o
 *   mesmo texto não muda a resposta;
 * - `excluida` é coral: outra pessoa excluiu a página com o texto na tela.
 */
export type EstadoGravacao = 'salvo' | 'salvando' | 'enviando' | 'conflito' | 'erro' | 'recusada' | 'excluida';

/**
 * Teto do título — o mesmo `MAX_TITULO_NOTA` que o servidor valida
 * (`api/_notasDb.ts`). Passar dele faria o salvamento automático tentar para
 * sempre um PATCH que o servidor recusa.
 */
const MAX_TITULO = 200;

/**
 * O título é uma linha só: Enter leva ao corpo, e a quebra que vier colada
 * vira espaço. O campo é um `<textarea>` só para o texto longo QUEBRAR em vez
 * de sumir à direita ("Pauta do comitê d…" a 761 e a 1024px).
 */
function umaLinha(texto: string): string {
  return texto.replace(/[\r\n]+/g, ' ');
}

/**
 * Altura do campo = altura do texto. `field-sizing: content` resolveria no
 * CSS, mas ainda não chegou a todos os navegadores. Campo fora da vista
 * (`display: none` num ancestral, `scrollHeight` 0) fica sem altura fixa,
 * senão nasceria com 0px quando aparecesse.
 */
function ajustarAltura(campo: HTMLTextAreaElement | null) {
  if (!campo) return;
  campo.style.height = 'auto';
  if (campo.scrollHeight === 0) { campo.style.removeProperty('height'); return; }
  // `scrollHeight` não conta a borda, e a caixa é border-box.
  const borda = campo.offsetHeight - campo.clientHeight;
  campo.style.height = `${campo.scrollHeight + borda}px`;
}

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
  /**
   * A mensagem do servidor, em `erro` e `recusada`. Em `erro`, `null` é falta
   * de rede — e a faixa diz "Sem conexão"; um 500 não é queda de conexão.
   */
  mensagem?: string | null;
  /** Em `excluida`: imagens do texto, que foram junto com a página e não voltam ao recriar. */
  imagensPerdidas?: number;
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
  /** Em `excluida`: cria uma página nova com o texto da tela. */
  onRecriar?: () => void;
  /** Em `erro`, manda a fila agora; em `recusada`, grava de novo o texto da tela. */
  onTentarAgora: () => void;
}

const ROTULO: Record<Exclude<EstadoGravacao, 'enviando'>, string> = {
  salvo: 'Salvo',
  salvando: 'Salvando…',
  conflito: 'Não salvo',
  erro: 'Não salvo · tentando de novo',
  recusada: 'Não salvo',
  excluida: 'Não salvo',
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
  nota, recarregar, focarTitulo, onTituloFocado, onTitulo, estado, mensagem = null, imagensPerdidas = 0,
  enviando, conflito, resolvendo, agora, onFixar, onExcluir, onManterMinha, onCarregarDela, onRecriar, onTentarAgora,
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

  const campo = useRef<HTMLTextAreaElement>(null);

  // A altura acompanha o texto (a cada mudança, inclusive a recarga) e a
  // largura: o mesmo título cabe numa linha na tela larga e quebra em várias
  // na estreita, ou quando a janela muda de tamanho.
  useLayoutEffect(() => { ajustarAltura(campo.current); }, [titulo]);
  useEffect(() => {
    const el = campo.current;
    if (!el) return;
    let largura = el.clientWidth;
    const observador = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
        // Só a largura importa; a altura que muda é a nossa.
        if (el.clientWidth === largura) return;
        largura = el.clientWidth;
        ajustarAltura(el);
      })
      : null;
    observador?.observe(el);
    // A fonte da interface chega depois do primeiro quadro e muda a quebra.
    void document.fonts?.ready.then(() => ajustarAltura(el));
    return () => observador?.disconnect();
  }, []);
  // Só ao montar (o cabeçalho é montado com `key` da página): a página nova
  // abre com o cursor no título.
  const focarAoMontar = useRef(focarTitulo);
  const avisarFocado = useRef(onTituloFocado);
  useEffect(() => {
    if (!focarAoMontar.current) return;
    campo.current?.focus();
    avisarFocado.current();
  }, []);

  // Enter no título leva ao corpo, como num documento: o título é uma linha só
  // (também com Shift: quebra de linha no título não existe).
  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    e.preventDefault();
    e.currentTarget.closest('.notas-pagina')
      ?.querySelector<HTMLElement>('[contenteditable="true"], textarea:not(.nota-titulo)')
      ?.focus();
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
        <textarea
          ref={campo}
          id={idTitulo}
          className="nota-titulo"
          rows={1}
          value={titulo}
          placeholder="Sem título"
          maxLength={MAX_TITULO}
          autoComplete="off"
          onChange={e => {
            const t = umaLinha(e.target.value);
            setTitulo(t);
            onTitulo(t);
          }}
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
            {mensagem
              ? <>{mensagem} O que você escreveu continua aqui e sobe na próxima tentativa.</>
              : 'Sem conexão com o servidor. O que você escreveu continua aqui e sobe quando a conexão voltar.'}
          </p>
          <div className="nota-faixa-acoes">
            <button type="button" className="btn btn-ghost" onClick={onTentarAgora}>Tentar agora</button>
          </div>
        </div>
      )}

      {estado === 'recusada' && (
        <div className="nota-erro" role="alert">
          <p className="nota-faixa-texto">
            <b>O servidor não aceitou o texto.</b>
            {mensagem && <> {mensagem}</>}
            {' '}O seu texto continua aqui.
          </p>
          <div className="nota-faixa-acoes">
            <button type="button" className="btn btn-ghost" onClick={onTentarAgora} disabled={resolvendo}>Tentar de novo</button>
          </div>
        </div>
      )}

      {estado === 'excluida' && (
        <div className="nota-erro" role="alert">
          <p className="nota-faixa-texto">
            <b>Esta página foi excluída por outra pessoa.</b>
            {' '}O seu texto continua aqui
            {imagensPerdidas > 0 && (imagensPerdidas === 1
              ? ', sem a imagem, que foi junto com a página'
              : `, sem as ${imagensPerdidas} imagens, que foram junto com a página`)}.
          </p>
          <div className="nota-faixa-acoes">
            <button type="button" className="btn btn-navy" onClick={onRecriar} disabled={resolvendo}>
              Recriar com o meu texto
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
