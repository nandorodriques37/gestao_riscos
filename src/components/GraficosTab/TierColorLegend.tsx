import type { TierKind } from '../../lib/calculations';

const TIERS: TierKind[] = ['critico', 'alto', 'medio', 'baixo'];

/** Rótulos padrão, concordando com "risco". */
const MASCULINO = ['Crítico', 'Alto', 'Médio', 'Baixo'];

interface TierColorLegendProps {
  /**
   * Quatro rótulos, do mais crítico ao menos. Existem porque a Priorização
   * concorda no feminino ("Crítica") e o Registro no masculino ("Crítico") —
   * trocar a cor pelo token não pode custar a concordância da cópia.
   */
  labels?: readonly string[];
  /** Bolinha em vez de quadrado, quando a marca que a legenda explica é redonda. */
  redondo?: boolean;
}

export function TierColorLegend({ labels = MASCULINO, redondo = false }: TierColorLegendProps = {}) {
  return (
    <div className="color-legend-row">
      {TIERS.map((tier, i) => (
        <div key={tier} className="color-legend-item">
          <span className="color-legend-swatch" data-tier={tier} data-redondo={redondo || undefined} />
          {labels[i]}
        </div>
      ))}
    </div>
  );
}
