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
        aria-label={fatias.filter(f => f.valor > 0).map(f => `${f.label}: ${f.valor}`).join(', ')}
      >
        {fatias.filter(f => f.valor > 0).map(f => (
          <div
            key={f.chave}
            className="stack-seg"
            data-serie={f.serie}
            style={{ flex: `${f.valor} 0 0` }}
            title={`${f.label}: ${f.valor}`}
          />
        ))}
      </div>
      {!semLegenda && (
        <div className="lista-linhas">
          {fatias.map(f => (
            <div className="lista-linha" key={f.chave}>
              <span className="serie-dot" data-serie={f.serie} aria-hidden="true" />
              <span className="lista-texto">{f.label}</span>
              {f.nota && <span className="lista-nota">{f.nota}</span>}
              <span className="lista-valor tabular">{f.valor}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
