import { formatarData, formatarNumero } from '../../lib/portfolioLabels';

interface SparklineProps {
  serie: { data: string; valor: number }[];
  /** Extremos do objetivo, para a linha ser lida contra o caminho e não contra si mesma. */
  baseline: number | null;
  meta: number | null;
  unidade: string;
}

const W = 220;
const H = 44;
const PAD = 4;

/**
 * Série do indicador em miniatura.
 *
 * A escala inclui baseline e meta de propósito: normalizada só pelos próprios
 * pontos, uma variação de 0,2 ponto viraria uma montanha. Com os extremos
 * dentro, a inclinação mostra o quanto do caminho a série de fato andou.
 *
 * O último ponto é marcado — é o número que a tela está afirmando.
 */
export function Sparkline({ serie, baseline, meta, unidade }: SparklineProps) {
  if (serie.length === 0) return null;

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
    : PAD + (i / (serie.length - 1)) * (W - PAD * 2));
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);

  const pontos = serie.map((p, i) => `${x(i)},${y(p.valor)}`).join(' ');
  const ultimo = serie[serie.length - 1];

  const rotulo = serie.length === 1
    ? `Uma leitura: ${formatarNumero(ultimo.valor, 1)}${unidade} em ${formatarData(ultimo.data)}`
    : `${serie.length} leituras, de ${formatarNumero(serie[0].valor, 1)}${unidade} `
      + `em ${formatarData(serie[0].data)} a ${formatarNumero(ultimo.valor, 1)}${unidade} `
      + `em ${formatarData(ultimo.data)}`;

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={rotulo}
      preserveAspectRatio="none"
    >
      {/* Linha da meta ao fundo: recessiva, é referência e não dado. */}
      {meta != null && (
        <line
          x1="0" x2={W} y1={y(meta)} y2={y(meta)}
          className="sparkline-meta"
        />
      )}
      {serie.length > 1 && <polyline className="sparkline-linha" points={pontos} />}
      <circle className="sparkline-ponta" cx={x(serie.length - 1)} cy={y(ultimo.valor)} r="3" />
    </svg>
  );
}
