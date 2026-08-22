import { useMemo, useState } from 'react';
import type { Iniciativa, Objetivo, Pessoa, Quadrant, RiskRecord, StatusFilterValue } from '../../types';
import { normStatus } from '../../lib/calculations';
import { buildActionable, buildActionableDeIniciativas } from './actionable';
import { buildMatrixPoints, buildRankedList } from './matrixPoints';
import { buildPriorityGroups } from './priorityGroups';
import { QUADRANT_NAMES } from './quadrant';
import { QuadrantMatrix } from './QuadrantMatrix';
import { RankedList } from './RankedList';
import { ResourceSummary } from './ResourceSummary';
import { TierColorLegend } from '../GraficosTab/TierColorLegend';

interface PriorizacaoTabProps {
  records: RiskRecord[];
  iniciativas: Iniciativa[];
  objetivos: Objetivo[];
  pessoas: Pessoa[];
  onAbrirIniciativa: (id: string) => void;
}

const STATUS_PILLS: StatusFilterValue[] = ['Todos', 'Não iniciado', 'Em andamento', 'Concluído'];

type Fonte = 'iniciativas' | 'riscos';

export function PriorizacaoTab({
  records, iniciativas, objetivos, pessoas, onAbrirIniciativa,
}: PriorizacaoTabProps) {
  const [prioStatusFilter, setPrioStatusFilter] = useState<StatusFilterValue>('Todos');
  const [selectedRank, setSelectedRank] = useState<number | null>(null);
  const [selectedQuadrant, setSelectedQuadrant] = useState<Quadrant | null>(null);

  const dosRiscos = useMemo(() => buildActionable(records), [records]);
  const dasIniciativas = useMemo(
    () => buildActionableDeIniciativas(iniciativas, objetivos, pessoas),
    [iniciativas, objetivos, pessoas],
  );

  // A leitura de hoje é a iniciativa: esforço, impacto e gravidade descrevem a
  // ação, não a ameaça, e mudaram de dono na migração. Enquanto não houver
  // nenhuma iniciativa priorizável, a tela continua lendo os riscos — assim ela
  // não fica vazia no meio da transição.
  const [fonte, setFonte] = useState<Fonte>('iniciativas');
  const podeEscolher = dasIniciativas.length > 0 && dosRiscos.length > 0;
  const fonteEfetiva: Fonte = dasIniciativas.length === 0 ? 'riscos' : fonte;

  const actionableAll = fonteEfetiva === 'riscos' ? dosRiscos : dasIniciativas;
  const prioTotalCount = actionableAll.length;
  const substantivo = fonteEfetiva === 'riscos' ? 'ações' : 'iniciativas';

  const actionable = useMemo(
    () => (prioStatusFilter === 'Todos' ? actionableAll : actionableAll.filter(x => normStatus(x.item.status) === prioStatusFilter)),
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
        matrixListTitle: `${QUADRANT_NAMES[selectedQuadrant]} · ${filtered.length} ${filtered.length === 1 ? substantivo.slice(0, -1) : substantivo}`,
      };
    }
    return { matrixListFiltered: matrixList, matrixListTitle: 'Ranking de priorização' };
  }, [matrixList, selectedRank, selectedQuadrant, substantivo]);

  const matrixFilterActive = selectedRank != null || selectedQuadrant != null;

  /** Iniciativa por trás do item destacado — o ranking leva ao detalhe dela. */
  const iniciativaSelecionada = selectedRank != null
    ? ranked[selectedRank]?.iniciativaId ?? null
    : null;

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
        {podeEscolher && (
          <div className="view-toggle" role="group" aria-label="Origem do ranking">
            <button
              className={fonteEfetiva === 'iniciativas' ? 'active' : ''}
              onClick={() => setFonte('iniciativas')}
              aria-pressed={fonteEfetiva === 'iniciativas'}
            >
              Iniciativas · {dasIniciativas.length}
            </button>
            <button
              className={fonteEfetiva === 'riscos' ? 'active' : ''}
              onClick={() => setFonte('riscos')}
              aria-pressed={fonteEfetiva === 'riscos'}
              title="Leitura anterior: os mesmos três campos ainda preenchidos no registro de risco."
            >
              Riscos · {dosRiscos.length}
            </button>
          </div>
        )}
        <span className="prio-filter-count">
          {prioVisibleCount} de {prioTotalCount} {substantivo}
        </span>
      </div>

      <div className="card">
        <div className="section-header-row">
          <div>
            <div className="section-title">Matriz Esforço × Impacto</div>
            <div className="section-subtitle" style={{ marginBottom: 0 }}>
              Número = ranking de priorização · Tamanho = gravidade · Cor = nível de priorização · Clique para destacar
            </div>
          </div>
          <div className="actions-row" style={{ paddingTop: 4 }}>
            {iniciativaSelecionada && (
              <button
                className="btn btn-outline-navy"
                onClick={() => onAbrirIniciativa(iniciativaSelecionada)}
              >
                Abrir iniciativa
              </button>
            )}
            <TierColorLegend labels={['Crítica', 'Alta', 'Média', 'Baixa']} redondo />
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

      <ResourceSummary
        groups={priorityGroups}
        substantivo={substantivo}
        singular={fonteEfetiva === 'riscos' ? 'Ação' : 'Iniciativa'}
        colunaContexto={fonteEfetiva === 'riscos' ? 'Área · Rotina · Categoria' : 'Objetivo · Dono'}
      />
    </div>
  );
}
