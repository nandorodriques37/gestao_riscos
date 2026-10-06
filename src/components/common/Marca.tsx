/**
 * O glifo da marca: a rede de decisão, quatro nós ligados com o de risco em
 * coral. É desenho próprio do produto — não o logo da Pague Menos.
 *
 * Mora em um componente porque aparece em dois lugares que nunca aparecem juntos:
 * no topo do rail (≥1101px) e no header (≤1100px, quando o rail sai de cena).
 */
export function Marca() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 64 32" fill="none">
        <path d="M10 16h12m8 0h10m8 0h6" />
        <circle cx="6" cy="16" r="4" />
        <circle cx="26" cy="16" r="4" />
        <circle className="brand-mark-risk" cx="44" cy="16" r="4" />
        <circle cx="58" cy="16" r="4" />
      </svg>
    </div>
  );
}
