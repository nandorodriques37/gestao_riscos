import { useMemo, useState, type ReactNode } from 'react';
import type { RiskRecord, GraphFilter } from '../../types';
import { buildRows } from '../../lib/rows';
import { computeScore, round1, scoreTier, ROTULO_TIER, type TierKind } from '../../lib/calculations';
import { buildDonutGradient } from '../../lib/donut';
import { matchGraphFilter, graphFilterLabel } from './graphFilter';
import { buildScoreBars, buildResourceStatusBars } from './scoreBars';
import { FilterBanner } from './FilterBanner';
import { Kpi, KpiRow } from '../common/Kpi';
import { Heatmap } from './Heatmap';
import { CriticidadeDonut, type CritLegendItem } from './CriticidadeDonut';
import { RiskDescriptionTable, type RiskListItem } from './RiskDescriptionTable';
import { ScoreBarList } from './ScoreBarList';
import { TierColorLegend } from './TierColorLegend';
import { StatusDonut, type StatusLegendItem } from './StatusDonut';
import { ResourceStackedBars } from './ResourceStackedBars';

interface GraficosTabProps {
  records: RiskRecord[];
  /**
   * Barra de título com o alternador de leitura, montada pelo `App`. Esta tela
   * era uma aba própria e começava direto num filtro, sem título nenhum — hoje
   * é a leitura "Análise" da seção Riscos e usa o mesmo cabeçalho do Rastro.
   */
  cabecalho?: ReactNode;
}

// Os status reaproveitam as faixas de cor já existentes: cinza para não
// iniciado, laranja para em andamento, verde para concluído — exatamente os
// mesmos hex de antes, agora vindos dos tokens.
const STATUS_DEFS: { label: string; tier: TierKind }[] = [
  { label: 'Não iniciado', tier: 'null' },
  { label: 'Em andamento', tier: 'alto' },
  { label: 'Concluído', tier: 'baixo' },
];

// A faixa sai de `scoreTier` e o nome de `ROTULO_TIER` — os limiares estavam
// reescritos aqui, uma quarta cópia da mesma regra de negócio.
const CRIT_DEFS: { label: string; tier: TierKind }[] =
  (['critico', 'alto', 'medio', 'baixo'] as const).map(tier => ({
    tier, label: ROTULO_TIER[tier],
  }));

export function GraficosTab({ records, cabecalho }: GraficosTabProps) {
  const [graphFilter, setGraphFilterState] = useState<GraphFilter>(null);

  function toggleGraphFilter(gf: GraphFilter) {
    setGraphFilterState(cur => (cur && JSON.stringify(cur) === JSON.stringify(gf) ? null : gf));
  }

  const rows = useMemo(() => buildRows(records), [records]);
  const totalRiscos = useMemo(() => records.filter(r => r.risco).length, [records]);

  const gfRecords = useMemo(
    () => (graphFilter ? records.filter(r => matchGraphFilter(r, graphFilter)) : records),
    [records, graphFilter],
  );
  const gfRows = useMemo(
    () => (graphFilter ? rows.filter(row => matchGraphFilter(row.record, graphFilter)) : rows),
    [rows, graphFilter],
  );

  const riskList: RiskListItem[] = useMemo(() => gfRows
    .map(row => ({
      risco: row.record.risco && row.record.risco.trim() !== '' ? row.record.risco : '(sem descrição)',
      combo: [row.record.area, row.record.categoria].filter(Boolean).join(' · '),
      score: row.score,
      normSt: row.normSt,
    }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1)), [gfRows]);
  const riskListCount = riskList.length;

  const actionRows = useMemo(() => gfRows.filter(row => row.record.acoes && row.record.acoes.trim() !== ''), [gfRows]);
  const totalAcoesComStatus = actionRows.length;

  const { statusLegend, donutBg } = useMemo(() => {
    const legend: StatusLegendItem[] = STATUS_DEFS.map(d => {
      const count = actionRows.filter(r => r.normSt === d.label).length;
      return {
        label: d.label,
        tier: d.tier,
        count,
        pct: totalAcoesComStatus ? Math.round((count / totalAcoesComStatus) * 100) : 0,
      };
    });
    return { statusLegend: legend, donutBg: buildDonutGradient(legend, totalAcoesComStatus) };
  }, [actionRows, totalAcoesComStatus]);

  const categoryBars = useMemo(() => buildScoreBars(gfRecords, 'categoria'), [gfRecords]);
  const areaBars = useMemo(() => buildScoreBars(gfRecords, 'area'), [gfRecords]);
  const rotinaBars = useMemo(() => buildScoreBars(gfRecords, 'rotina'), [gfRecords]);

  const scoredVals = useMemo(
    () => gfRecords.map(r => computeScore(r)).filter((sc): sc is number => sc != null),
    [gfRecords],
  );
  const totalAvaliados = scoredVals.length;
  const criticosCount = scoredVals.filter(sc => sc > 14).length;
  const scoreMedio: number | '—' = totalAvaliados
    ? round1(scoredVals.reduce((a, b) => a + b, 0) / totalAvaliados)
    : '—';

  const { critLegend, critDonutBg } = useMemo(() => {
    const legend: CritLegendItem[] = CRIT_DEFS.map(d => {
      const count = scoredVals.filter(sc => scoreTier(sc) === d.tier).length;
      return {
        label: d.label,
        tier: d.tier,
        count,
        pct: totalAvaliados ? Math.round((count / totalAvaliados) * 100) : 0,
      };
    });
    return { critLegend: legend, critDonutBg: buildDonutGradient(legend, totalAvaliados) };
  }, [scoredVals, totalAvaliados]);

  const recStatusBars = useMemo(() => buildResourceStatusBars(actionRows), [actionRows]);

  const pctConcluido = totalAcoesComStatus
    ? Math.round((actionRows.filter(r => r.normSt === 'Concluído').length / totalAcoesComStatus) * 100)
    : 0;

  return (
    <div className="tab-page-lg">
      {cabecalho}

      {graphFilter && (
        <FilterBanner label={graphFilterLabel(graphFilter)} count={riskListCount} onClear={() => setGraphFilterState(null)} />
      )}

      <KpiRow colunas={4}>
        <Kpi
          label="Riscos avaliados"
          valor={totalAvaliados}
          sub={`de ${totalRiscos}`}
          acento="brand"
        />
        <Kpi label="Score médio (P × I)" valor={scoreMedio} acento="medio" />
        <Kpi label="Riscos críticos" valor={criticosCount} acento="critico" />
        <Kpi label="Ações concluídas" valor={`${pctConcluido}%`} acento="baixo" />
      </KpiRow>

      <div className="grid-heat">
        <Heatmap records={gfRecords} onCellClick={(prob, imp) => toggleGraphFilter({ type: 'heat', prob, imp })} />
        <CriticidadeDonut
          totalAvaliados={totalAvaliados}
          critLegend={critLegend}
          donutBg={critDonutBg}
          activeLabel={graphFilter?.type === 'criticidade' ? graphFilter.value : null}
          onLegendClick={label => toggleGraphFilter({ type: 'criticidade', value: label })}
        />
      </div>

      <RiskDescriptionTable riskList={riskList} count={riskListCount} />

      <div className="grid-2">
        <div className="card">
          <div className="section-title">Risco por Categoria</div>
          <div className="section-subtitle">Score inerente total (probabilidade × impacto) por categoria — barras coloridas pela criticidade</div>
          <ScoreBarList bars={categoryBars} onClick={name => toggleGraphFilter({ type: 'categoria', value: name })} />
        </div>
        <div className="card">
          <div className="section-title">Risco por Área</div>
          <div className="section-subtitle">Score inerente total (probabilidade × impacto) por área — barras coloridas pela criticidade</div>
          <ScoreBarList bars={areaBars} onClick={name => toggleGraphFilter({ type: 'area', value: name })} />
        </div>
      </div>

      <div className="card">
        <div className="section-header-row">
          <div>
            <div className="section-title">Risco por Rotina</div>
            <div className="section-subtitle">Score inerente total (probabilidade × impacto) por rotina — barras coloridas pela criticidade</div>
          </div>
          <TierColorLegend />
        </div>
        <ScoreBarList bars={rotinaBars} tight onClick={name => toggleGraphFilter({ type: 'rotina', value: name })} />
      </div>

      <StatusDonut
        totalAcoesComStatus={totalAcoesComStatus}
        statusLegend={statusLegend}
        donutBg={donutBg}
        activeLabel={graphFilter?.type === 'status' ? graphFilter.value : null}
        onLegendClick={label => toggleGraphFilter({ type: 'status', value: label })}
      />

      <ResourceStackedBars bars={recStatusBars} onClick={name => toggleGraphFilter({ type: 'recurso', value: name })} />
    </div>
  );
}
