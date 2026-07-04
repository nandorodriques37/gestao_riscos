import type { ScoreBar } from './scoreBars';

interface ScoreBarListProps {
  bars: ScoreBar[];
  nameWidthClass?: 'wide';
  rotina?: boolean;
  onClick: (name: string) => void;
}

export function ScoreBarList({ bars, nameWidthClass, rotina, onClick }: ScoreBarListProps) {
  return (
    <div className={`bar-list${rotina ? ' tight' : ''}`}>
      {bars.map(bar => (
        <button
          key={bar.name}
          className={`bar-row${rotina ? ' rotina' : ''}`}
          title="Clique para filtrar toda a aba por este item"
          onClick={() => onClick(bar.name)}
        >
          <div className={`bar-name${nameWidthClass ? ' ' + nameWidthClass : ''}`} title={bar.name}>{bar.name}</div>
          <div className="bar-track">
            <div className={`bar-fill${rotina ? ' short' : ''}`} style={{ width: `${bar.pct}%`, background: bar.color }} />
            <span className="bar-score">{bar.score}</span>
            <span className="bar-meta">{bar.meta}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
