import type { TierKind } from '../../lib/calculations';

const TIERS: { label: string; tier: TierKind }[] = [
  { label: 'Crítico', tier: 'critico' },
  { label: 'Alto', tier: 'alto' },
  { label: 'Médio', tier: 'medio' },
  { label: 'Baixo', tier: 'baixo' },
];

export function TierColorLegend() {
  return (
    <div className="color-legend-row">
      {TIERS.map(t => (
        <div key={t.label} className="color-legend-item">
          <span className="color-legend-swatch" data-tier={t.tier} />
          {t.label}
        </div>
      ))}
    </div>
  );
}
