import type { Density } from '../../types';

/**
 * Alternador de densidade da tabela. Único no app: Registro e Tarefas têm a
 * mesma pergunta ("mais respiro ou mais linhas por tela?") e mostravam-na com
 * rótulos próprios até esta virar o primitivo — como `Kpi` fez com os tiles.
 */
const OPCOES: { value: Density; label: string; title: string }[] = [
  { value: 'comfortable', label: 'Confortável', title: 'Linhas com mais respiro' },
  { value: 'compact', label: 'Compacto', title: 'Mais linhas visíveis por tela' },
];

interface DensityToggleProps {
  density: Density;
  onChange: (v: Density) => void;
}

export function DensityToggle({ density, onChange }: DensityToggleProps) {
  return (
    <div className="density-toggle" role="group" aria-label="Densidade da tabela">
      {OPCOES.map(opt => (
        <button
          key={opt.value}
          className={density === opt.value ? 'active' : ''}
          title={opt.title}
          aria-pressed={density === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
