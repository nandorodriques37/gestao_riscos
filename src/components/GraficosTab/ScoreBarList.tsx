import type { ScoreBar } from './scoreBars';

interface ScoreBarListProps {
  bars: ScoreBar[];
  tight?: boolean;
  onClick: (name: string) => void;
}

/**
 * Barras com o rótulo acima e a trilha ocupando a largura toda. O formato
 * anterior — nome numa coluna fixa de 120–230px e barra de 26px de altura ao
 * lado — lia como planilha e desperdiçava largura no rótulo.
 */
export function ScoreBarList({ bars, tight, onClick }: ScoreBarListProps) {
  return (
    <div className={`bar-list${tight ? ' tight' : ''}`}>
      {bars.map(bar => (
        <button
          key={bar.name}
          className="bar-row"
          title="Clique para filtrar toda a aba por este item"
          aria-label={`${bar.name}: score total ${bar.score}, ${bar.meta}. Clique para filtrar.`}
          onClick={() => onClick(bar.name)}
        >
          <div className="bar-head">
            <span className="bar-name" title={bar.name}>{bar.name}</span>
            <span className="bar-meta">{bar.meta}</span>
            <span className="bar-score">{bar.score}</span>
          </div>
          <div className="bar-track">
            <div className="bar-fill" data-tier={bar.tier} style={{ width: `${bar.pct}%` }} />
          </div>
        </button>
      ))}
    </div>
  );
}
