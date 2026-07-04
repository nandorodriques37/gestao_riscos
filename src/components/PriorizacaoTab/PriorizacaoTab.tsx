import { useMemo, useState } from 'react';
import type { Quadrant, RiskRecord, StatusFilterValue } from '../../types';
import { normStatus } from '../../lib/calculations';
import { buildActionable } from './actionable';
import { buildMatrixPoints, buildRankedList } from './matrixPoints';
import { buildPriorityGroups } from './priorityGroups';
import { QUADRANT_NAMES } from './quadrant';
import { QuadrantMatrix } from './QuadrantMatrix';
import { RankedList } from './RankedList';
import { ResourceSummary } from './ResourceSummary';

interface PriorizacaoTabProps {
  records: RiskRecord[];
}

const STATUS_PILLS: StatusFilterValue[] = ['Todos', 'Não iniciado', 'Em andamento', 'Concluído'];

export function PriorizacaoTab({ records }: PriorizacaoTabProps) {
  const [prioStatusFilter, setPrioStatusFilter] = useState<StatusFilterValue>('Todos');
  const [selectedRank, setSelectedRank] = useState<number | null>(null);
  const [selectedQuadrant, setSelectedQuadrant] = useState<Quadrant | null>(null);

  const actionableAll = useMemo(() => buildActionable(records), [records]);
  const prioTotalCount = actionableAll.length;

  const actionable = useMemo(
    () => (prioStatusFilter === 'Todos' ? actionableAll : actionableAll.filter(x => normStatus(x.record.status) === prioStatusFilter)),
    [actionableAll, prioStatusFilter],
  );
  const prioVisibleCount = actionable.length;

  const ranked = useMemo(() => actionable.slice().sort((a, b) => b.prioriz - a.prioriz), [actionable]);

  const matrixPoints = useMemo(
    () => buildMatrixPoints(ranked, selectedRank, selectedQuadrant),
    [ranked, selectedRank, selectedQuadrant],
  );
  const matrixList = useMemo(() => buildRankedList(ranked), [ranked]);

  const { matrixListFiltered, matrixListTitle } = useMemo(() => {
    if (selectedRank != null) {
      return { matrixListFiltered: matrixList.filter(it => it.rankIndex === selectedRank), matrixListTitle: 'Ação selecionada' };
    }
    if (selectedQuadrant != null) {
      const filtered = matrixList.filter(it => it.quadrant === selectedQuadrant);
      return {
        matrixListFiltered: filtered,
        matrixListTitle: `${QUADRANT_NAMES[selectedQuadrant]} · ${filtered.length}${filtered.length === 1 ? ' ação' : ' ações'}`,
      };
    }
    return { matrixListFiltered: matrixList, matrixListTitle: 'Ranking de priorização' };
  }, [matrixList, selectedRank, selectedQuadrant]);

  const matrixFilterActive = selectedRank != null || selectedQuadrant != null;

  const priorityGroups = useMemo(() => buildPriorityGroups(actionable), [actionable]);

  function handleRankClick(rankIndex: number) {
    setSelectedRank(cur => (cur === rankIndex ? null : rankIndex));
    setSelectedQuadrant(null);
  }

  function handleQuadrantClick(q: Quadrant) {
    setSelectedQuadrant(cur => (cur === q ? null : q));
    setSelectedRank(null);
  }

  function clearMatrixFilter() {
    setSelectedRank(null);
    setSelectedQuadrant(null);
  }

  return (
    <div className="tab-page-lg">
      <div className="prio-filter-row">
        <span className="prio-filter-label">Filtrar por status:</span>
        {STATUS_PILLS.map(s => (
          <button
            key={s}
            className={`filter-pill${prioStatusFilter === s ? ' active' : ''}`}
            onClick={() => setPrioStatusFilter(s)}
          >
            {s}
          </button>
        ))}
        <span className="prio-filter-count">{prioVisibleCount} de {prioTotalCount} ações</span>
      </div>

      <div className="card">
        <div className="section-header-row">
          <div>
            <div className="section-title">Matriz Esforço × Impacto</div>
            <div className="section-subtitle" style={{ marginBottom: 0 }}>
              Número = ranking de priorização · Tamanho = gravidade · Cor = nível de priorização · Clique para destacar
            </div>
          </div>
          <div className="color-legend-row" style={{ paddingTop: 4 }}>
            <div className="color-legend-item"><span className="color-legend-swatch" style={{ borderRadius: '50%', background: '#DC2626' }} />Crítica</div>
            <div className="color-legend-item"><span className="color-legend-swatch" style={{ borderRadius: '50%', background: '#D97706' }} />Alta</div>
            <div className="color-legend-item"><span className="color-legend-swatch" style={{ borderRadius: '50%', background: '#B8901F' }} />Média</div>
            <div className="color-legend-item"><span className="color-legend-swatch" style={{ borderRadius: '50%', background: '#15803D' }} />Baixa</div>
          </div>
        </div>

        <div className="matrix-layout">
          <QuadrantMatrix
            points={matrixPoints}
            selectedQuadrant={selectedQuadrant}
            onBubbleClick={handleRankClick}
            onQuadrantClick={handleQuadrantClick}
          />
          <RankedList
            items={matrixListFiltered}
            title={matrixListTitle}
            filterActive={matrixFilterActive}
            selectedRank={selectedRank}
            onItemClick={handleRankClick}
            onClearFilter={clearMatrixFilter}
          />
        </div>
      </div>

      <ResourceSummary groups={priorityGroups} />
    </div>
  );
}
