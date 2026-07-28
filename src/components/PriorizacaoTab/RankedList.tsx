import type { RankedListItem } from './matrixPoints';
import { EmptyState } from '../common/EmptyState';

interface RankedListProps {
  items: RankedListItem[];
  title: string;
  filterActive: boolean;
  selectedRank: number | null;
  onItemClick: (rankIndex: number) => void;
  onClearFilter: () => void;
}

export function RankedList({ items, title, filterActive, selectedRank, onItemClick, onClearFilter }: RankedListProps) {
  return (
    <div className="ranked-list-panel">
      <div className="ranked-list-header">
        <span className="ranked-list-title">{title}</span>
        {filterActive && (
          <button className="ranked-list-clear" onClick={onClearFilter}>Limpar filtro ×</button>
        )}
      </div>
      <div className="ranked-list-body">
        {items.length === 0 && <EmptyState message="Nenhuma ação neste filtro." />}
        {items.map(item => (
          <button
            key={item.rankIndex}
            className={`ranked-item${selectedRank === item.rankIndex ? ' selected' : ''}`}
            aria-pressed={selectedRank === item.rankIndex}
            onClick={() => onItemClick(item.rankIndex)}
          >
            <span className="ranked-item-num" data-tier={item.tier}>{item.num}</span>
            <div className="ranked-item-body">
              <div className="ranked-item-action clamp-2">{item.acoes}</div>
              <div className="ranked-item-eig">E {item.esforco} · I {item.impacto2} · G {item.gravidade}</div>
            </div>
            <span className="tier-chip" data-tier={item.tier}>
              <span className="tier-dot" />
              {item.prioriz}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
