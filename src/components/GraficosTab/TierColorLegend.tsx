const TIERS = [
  { label: 'Crítico', color: '#DC2626' },
  { label: 'Alto', color: '#D97706' },
  { label: 'Médio', color: '#B8901F' },
  { label: 'Baixo', color: '#15803D' },
];

export function TierColorLegend({ bordered }: { bordered?: boolean }) {
  return (
    <div className={`color-legend-row${bordered ? ' with-border' : ''}`}>
      {TIERS.map(t => (
        <div key={t.label} className="color-legend-item">
          <span className="color-legend-swatch" style={{ background: t.color }} />
          {t.label}
        </div>
      ))}
    </div>
  );
}
