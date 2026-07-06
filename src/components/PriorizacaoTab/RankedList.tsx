import type { RankedListItem } from './matrixPoints';
import { TIER_CHIP_COLORS } from '../../lib/calculations';
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
        {items.map(item => {
          const chip = TIER_CHIP_COLORS[item.tier];
          return (
            <button
              key={item.rankIndex}
              className={`ranked-item${selectedRank === item.rankIndex ? ' selected' : ''}`}
              onClick={() => onItemClick(item.rankIndex)}
            >
              <span className="ranked-item-num" style={{ background: item.color }}>{item.num}</span>
              <div className="ranked-item-body">
                <div className="ranked-item-action">{item.acoes}</div>
                <div className="ranked-item-eig">E {item.esforco} · I {item.impacto2} · G {item.gravidade}</div>
              </div>
              <span className="tier-chip" style={{ background: chip.bg, color: chip.fg }}>
                <span className="tier-dot" style={{ background: chip.dot }} />
                {item.prioriz}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
