import { useMemo, useState } from 'react';
import type { RiskRecord, GraphFilter } from '../../types';
import { buildRows } from '../../lib/rows';
import { computeScore, round1 } from '../../lib/calculations';
import { matchGraphFilter, graphFilterLabel } from './graphFilter';
import { buildScoreBars, buildResourceStatusBars } from './scoreBars';
import { FilterBanner } from './FilterBanner';
import { KpiStrip } from './KpiStrip';
import { Heatmap } from './Heatmap';
import { CriticidadeDonut, type CritLegendItem } from './CriticidadeDonut';
import { RiskDescriptionTable, type RiskListItem } from './RiskDescriptionTable';
import { ScoreBarList } from './ScoreBarList';
import { TierColorLegend } from './TierColorLegend';
import { StatusDonut, type StatusLegendItem } from './StatusDonut';
import { ResourceStackedBars } from './ResourceStackedBars';

interface GraficosTabProps {
  records: RiskRecord[];
}

const STATUS_COLORS: Record<string, string> = {
  'Não iniciado': '#94A3B8',
  'Em andamento': '#D97706',
  'Concluído': '#15803D',
};
const STATUS_ORDER = ['Não iniciado', 'Em andamento', 'Concluído'];

const CRIT_DEFS: { label: string; color: string; test: (sc: number) => boolean }[] = [
  { label: 'Crítico', color: '#DC2626', test: sc => sc > 14 },
  { label: 'Alto', color: '#D97706', test: sc => sc > 9 && sc <= 14 },
  { label: 'Médio', color: '#B8901F', test: sc => sc > 4 && sc <= 9 },
  { label: 'Baixo', color: '#15803D', test: sc => sc <= 4 },
];

export function GraficosTab({ records }: GraficosTabProps) {
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
    let cursor = 0;
    const gradParts: string[] = [];
    const legend: StatusLegendItem[] = STATUS_ORDER.map(label => {
      const count = actionRows.filter(r => r.normSt === label).length;
      const pct = totalAcoesComStatus ? Math.round((count / totalAcoesComStatus) * 100) : 0;
      const start = cursor;
      cursor += pct;
      gradParts.push(`${STATUS_COLORS[label]} ${start}% ${cursor}%`);
      return { label, color: STATUS_COLORS[label], count, pct };
    });
    return {
      statusLegend: legend,
      donutBg: totalAcoesComStatus ? `conic-gradient(${gradParts.join(',')})` : '#F1F5F9',
    };
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
    let critAcc = 0;
    const critGrad: string[] = [];
    const legend: CritLegendItem[] = CRIT_DEFS.map(d => {
      const count = scoredVals.filter(d.test).length;
      const start = totalAvaliados ? (critAcc / totalAvaliados) * 100 : 0;
      critAcc += count;
      const end = totalAvaliados ? (critAcc / totalAvaliados) * 100 : 0;
      if (count > 0) critGrad.push(`${d.color} ${start}% ${end}%`);
      return { label: d.label, color: d.color, count, pct: totalAvaliados ? Math.round((count / totalAvaliados) * 100) : 0 };
    });
    return {
      critLegend: legend,
      critDonutBg: totalAvaliados ? `conic-gradient(${critGrad.join(',')})` : '#EEF2F6',
    };
  }, [scoredVals, totalAvaliados]);

  const recStatusBars = useMemo(() => buildResourceStatusBars(actionRows), [actionRows]);

  const pctConcluido = totalAcoesComStatus
    ? Math.round((actionRows.filter(r => r.normSt === 'Concluído').length / totalAcoesComStatus) * 100)
    : 0;

  return (
    <div className="tab-page-lg">
      {graphFilter && (
        <FilterBanner label={graphFilterLabel(graphFilter)} count={riskListCount} onClear={() => setGraphFilterState(null)} />
      )}

      <KpiStrip
        totalAvaliados={totalAvaliados}
        totalRiscos={totalRiscos}
        scoreMedio={scoreMedio}
        criticosCount={criticosCount}
        pctConcluido={pctConcluido}
      />

      <div className="grid-heat">
        <Heatmap records={gfRecords} onCellClick={(prob, imp) => toggleGraphFilter({ type: 'heat', prob, imp })} />
        <CriticidadeDonut
          totalAvaliados={totalAvaliados}
          critLegend={critLegend}
          donutBg={critDonutBg}
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

      <div style={{ marginTop: -4 }}>
        <TierColorLegend />
      </div>

      <div className="card">
        <div className="section-title">Risco por Rotina</div>
        <div className="section-subtitle">Score inerente total (probabilidade × impacto) por rotina — barras coloridas pela criticidade</div>
        <ScoreBarList bars={rotinaBars} nameWidthClass="wide" rotina onClick={name => toggleGraphFilter({ type: 'rotina', value: name })} />
        <TierColorLegend bordered />
      </div>

      <StatusDonut
        totalAcoesComStatus={totalAcoesComStatus}
        statusLegend={statusLegend}
        donutBg={donutBg}
        onLegendClick={label => toggleGraphFilter({ type: 'status', value: label })}
      />

      <ResourceStackedBars bars={recStatusBars} onClick={name => toggleGraphFilter({ type: 'recurso', value: name })} />
    </div>
  );
}
