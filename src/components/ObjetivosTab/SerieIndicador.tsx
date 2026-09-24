import { formatarData } from '../../lib/portfolioLabels';
import { descreverSerie, numeroIndicador } from './objetivosUi';

interface SerieIndicadorProps {
  serie: { data: string; valor: number }[];
  baseline: number | null;
  meta: number | null;
  /** ' %', ' dias'… — já com o espaço. */
  sufixo: string;
}

const W = 320;
const H = 132;
const PAD_X = 8;
const PAD_Y = 20;

/**
 * A série do indicador em tamanho de leitura, no detalhe do objetivo.
 *
 * SVG sem lib, na mesma doutrina do `Sparkline`: a escala inclui baseline e
 * meta, senão uma variação de 0,2 ponto viraria montanha. As duas linhas de
 * referência ficam ao fundo, recessivas; a área entre o baseline e a série é o
 * caminho andado — e ela cresce para baixo quando a meta é menor que o
 * baseline, porque descer é melhorar ali.
 *
 * O desenho estica na largura (`preserveAspectRatio: none`), então nada que
 * deforma pode morar dentro dele: o traço tem espessura fixa pelo
 * `vector-effect`, os pontos são traços de comprimento zero com ponta
 * redonda (continuam redondos em qualquer proporção) e os rótulos de
 * referência são HTML posicionado por cima, não `<text>`.
 */
export function SerieIndicador({ serie, baseline, meta, sufixo }: SerieIndicadorProps) {
  const valores = [
    ...serie.map(p => p.valor),
    ...(baseline != null ? [baseline] : []),
    ...(meta != null ? [meta] : []),
  ];
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const span = max - min || 1;

  const x = (i: number) => (serie.length === 1
    ? W / 2
    : PAD_X + (i / (serie.length - 1)) * (W - PAD_X * 2));
  const y = (v: number) => H - PAD_Y - ((v - min) / span) * (H - PAD_Y * 2);
  const topo = (v: number) => `${(y(v) / H) * 100}%`;

  const pontos = serie.map((p, i) => `${x(i)},${y(p.valor)}`).join(' ');
  const caminho = baseline != null && serie.length > 1
    ? `${x(0)},${y(baseline)} ${pontos} ${x(serie.length - 1)},${y(baseline)}`
    : null;

  // Cada rótulo vai para o lado de fora da faixa entre as duas linhas. Sem
  // uma delas, o que sobra vai para cima.
  const baselineAbaixo = baseline != null && meta != null && baseline < meta;
  const ladoBaseline = baselineAbaixo ? 'abaixo' : 'acima';
  const ladoMeta = baseline != null && meta != null && !baselineAbaixo ? 'abaixo' : 'acima';

  const extremos = [
    baseline != null ? `baseline ${numeroIndicador(baseline)}${sufixo}` : null,
    meta != null ? `meta ${numeroIndicador(meta)}${sufixo}` : null,
  ].filter(Boolean).join(', ');

  return (
    <figure className="serie-indicador">
      <div className="serie-area">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${descreverSerie(serie, sufixo)}${extremos ? ` (${extremos})` : ''}`}
        >
          {caminho && <polygon className="serie-caminho" points={caminho} />}
          {baseline != null && (
            <line className="serie-ref" data-ref="baseline" x1="0" x2={W} y1={y(baseline)} y2={y(baseline)} />
          )}
          {meta != null && (
            <line className="serie-ref" data-ref="meta" x1="0" x2={W} y1={y(meta)} y2={y(meta)} />
          )}
          {serie.length > 1 && <polyline className="serie-linha" points={pontos} />}
          {serie.map((p, i) => (
            <line
              key={`${p.data}-${i}`}
              className="serie-ponto"
              data-ultimo={i === serie.length - 1 || undefined}
              x1={x(i)} x2={x(i)} y1={y(p.valor)} y2={y(p.valor)}
            />
          ))}
        </svg>
        {/* Baseline à esquerda, meta à direita, cada um do lado de fora da
            faixa: mesmo com as duas linhas quase juntas, não se atropelam. */}
        {baseline != null && (
          <span className="serie-ref-rotulo" data-ref="baseline" data-lado={ladoBaseline} style={{ top: topo(baseline) }} aria-hidden="true">
            baseline <span className="tabular">{numeroIndicador(baseline)}{sufixo}</span>
          </span>
        )}
        {meta != null && (
          <span className="serie-ref-rotulo" data-ref="meta" data-lado={ladoMeta} style={{ top: topo(meta) }} aria-hidden="true">
            meta <span className="tabular">{numeroIndicador(meta)}{sufixo}</span>
          </span>
        )}
      </div>
      <figcaption className="serie-eixo" aria-hidden="true">
        <span className="tabular">{formatarData(serie[0]?.data)}</span>
        {serie.length > 1 && <span className="tabular">{formatarData(serie[serie.length - 1].data)}</span>}
      </figcaption>
    </figure>
  );
}
