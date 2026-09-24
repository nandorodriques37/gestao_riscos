/**
 * Barra empilhada + legenda. Saiu de dentro do `PainelTab` porque a faixa da
 * cadeia a usa quatro vezes e as abas de Objetivos e Iniciativas também.
 *
 * A legenda é obrigatória e sempre carrega o número junto da cor: a escada
 * semáforo verde→amarelo→laranja→vermelho não passa nos limites de daltonismo
 * por matiz (médio × alto medem ΔE 1.1 em deuteranopia), então cor sozinha
 * nunca identifica nada aqui. O vão de 2px entre segmentos adjacentes é
 * `--viz-gap`, e vem do CSS — não é margem inventada por componente.
 */

export interface Fatia {
  chave: string;
  /** Série de cor, resolvida pelo CSS via `data-serie`. Nunca hex inline. */
  serie: string;
  label: string;
  valor: number;
  /** Segunda informação da linha (impacto em R$, percentual…). */
  nota?: string;
  /**
   * Como o valor se escreve, quando o número cru não diz nada sozinho
   * ('R$ 2,7 mi' em vez de 2700000). Vale para o segmento, a legenda, o
   * `title` e o `aria-label`; a largura continua vindo de `valor`.
   */
  rotulo?: string;
  /**
   * Ação da linha da legenda (abrir o item que ela nomeia). Com ela a linha
   * vira botão — mesma cara, alcançável por teclado. O segmento da barra não
   * vira alvo: fino demais para toque, e a legenda já nomeia cada um.
   */
  onClick?: () => void;
}

/** O valor como se lê: o rótulo quando existe, senão o número. */
function valorEscrito(f: Fatia): string | number {
  return f.rotulo ?? f.valor;
}

interface ComposicaoProps {
  fatias: Fatia[];
  /** Texto quando não há o que compor. Zero não é o mesmo que "nada medido". */
  vazio: string;
  /** Esconde a legenda — só para onde ela já existe logo ao lado. */
  semLegenda?: boolean;
}

export function Composicao({ fatias, vazio, semLegenda }: ComposicaoProps) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  if (total === 0) return <div className="bento-sub">{vazio}</div>;

  return (
    <>
      <div
        className="stack-bar"
        role="img"
        aria-label={fatias.filter(f => f.valor > 0).map(f => `${f.label}: ${valorEscrito(f)}`).join(', ')}
      >
        {fatias.filter(f => f.valor > 0).map(f => (
          <div
            key={f.chave}
            className="stack-seg"
            data-serie={f.serie}
            style={{ flex: `${f.valor} 0 0` }}
            title={`${f.label}: ${valorEscrito(f)}`}
          >
            {/* O número entra na faixa quando cabe (≥12% da barra). A barra
                inteira já tem aria-label; o rótulo visual é redundância para
                quem lê, não para quem ouve. */}
            {f.valor / total >= 0.12 && (
              <span className="stack-seg-rotulo" aria-hidden="true">{valorEscrito(f)}</span>
            )}
          </div>
        ))}
      </div>
      {!semLegenda && (
        <div className="lista-linhas">
          {fatias.map(f => {
            const conteudo = (
              <>
                <span className="serie-dot" data-serie={f.serie} aria-hidden="true" />
                <span className="lista-texto">{f.label}</span>
                {f.nota && <span className="lista-nota">{f.nota}</span>}
                <span className="lista-valor tabular">{valorEscrito(f)}</span>
              </>
            );
            return f.onClick ? (
              <button type="button" className="lista-linha" key={f.chave} onClick={f.onClick}>
                {conteudo}
              </button>
            ) : (
              <div className="lista-linha" key={f.chave}>{conteudo}</div>
            );
          })}
        </div>
      )}
    </>
  );
}
