interface FilterBannerProps {
  label: string;
  count: number;
  onClear: () => void;
}

export function FilterBanner({ label, count, onClear }: FilterBannerProps) {
  return (
    <div className="filter-banner">
      <span className="filter-banner-label">Filtro ativo</span>
      <span className="filter-banner-chip">{label}</span>
      <span className="filter-banner-desc">{count} risco(s) neste recorte · todos os indicadores abaixo refletem o filtro</span>
      <button className="filter-banner-clear" onClick={onClear}>Limpar filtro ×</button>
    </div>
  );
}
