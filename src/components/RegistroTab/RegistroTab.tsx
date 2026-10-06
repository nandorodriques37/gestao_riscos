import { useSessionState } from '../../hooks/useSessionState';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AcaoRisco, Density, Iniciativa, RegistroStatus, RiskRecord, SortDir, SortKey, StoredRiskRecord } from '../../types';
import { REGISTRO_STATUSES } from '../../types';
import { buildRows, type EnrichedRow } from '../../lib/rows';
import { computeCompletude, computeScore, scoreTier, COMPLETUDE_FIELDS } from '../../lib/calculations';
import { riscosMapeados, riscosSemTratamento } from '../../lib/portfolioMetrics';
import { plural } from '../../lib/portfolioLabels';
import { julgar } from '../../lib/portfolioUi';
import { readColWidths, readDensity, readStatusFilter, writeDensity, writePref } from '../../lib/uiPrefs';
import { Kpi, KpiRow } from '../common/Kpi';
import { FilterBar } from './FilterBar';
import { RiskTable } from './RiskTable';

const COL_WIDTHS_KEY = 'riskMatrix.colWidths.v1';
const DENSITY_KEY = 'riskMatrix.density.v1';
const STATUS_FILTER_KEY = 'riskMatrix.statusFilter.v1';
const COL_WIDTHS_SAVE_DELAY = 300;

/** Nome de cada campo da completude, como a barra de qualidade o cita. */
const ROTULO_CAMPO: Record<string, string> = {
  risco: 'descrição', probab: 'probabilidade', impact: 'impacto', acoes: 'ações',
  esforco: 'esforço', impacto2: 'impacto da ação', gravidade: 'gravidade',
  recurso: 'recurso', responsavel: 'responsável', status: 'status',
};

function campoVazio(r: RiskRecord, f: keyof RiskRecord): boolean {
  const v = r[f];
  return v == null || v === '';
}

interface RegistroTabProps {
  idsDoRecorte?: Set<string> | null;
  records: StoredRiskRecord[];
  /** Ações e iniciativas: o título conta os riscos sem tratamento, que é derivado. */
  acoes: AcaoRisco[];
  iniciativas: Iniciativa[];
  onOpenEdit: (idx: number) => void;
  onDeleteRow: (idx: number) => void;
  onAddRow: () => void;
  onExportCSV: () => void;
  areaOptions: string[];
  categoriaOptions: string[];
  /**
   * Alternador entre tabela e rastro de mitigação. Vem de fora porque o modo é
   * estado do `App` — as duas leituras são a mesma seção, e quem escolhe qual
   * componente montar é ele.
   */
  modoToggle?: ReactNode;
}

function sortValue(row: EnrichedRow, key: SortKey): number | null {
  if (key === 'score') return row.score;
  if (key === 'prioriz') return row.prioriz;
  if (key === 'probab') return row.record.probab;
  if (key === 'impact') return row.record.impact;
  return null;
}

export function RegistroTab({
  records, acoes, iniciativas, onOpenEdit, onDeleteRow, onAddRow, onExportCSV,
  areaOptions, categoriaOptions, modoToggle, idsDoRecorte,
}: RegistroTabProps) {
  const [search, setSearch] = useSessionState('riscos.busca', '');
  // Seleção múltipla de status persistida entre sessões; array vazio = todos.
  const [statusFilter, setStatusFilter] = useState<RegistroStatus[]>(() => readStatusFilter(STATUS_FILTER_KEY, REGISTRO_STATUSES));
  const [areaFilter, setAreaFilter] = useSessionState('riscos.area', 'Todos');
  const [categoriaFilter, setCategoriaFilter] = useSessionState('riscos.categoria', 'Todos');
  const [sortKey, setSortKey] = useSessionState<SortKey>('riscos.ordem', null);
  const [sortDir, setSortDir] = useSessionState<SortDir>('riscos.direcao', 'desc');
  // Recorte "só o que falta preencher": vem da barra de qualidade do cadastro.
  const [soIncompletos, setSoIncompletos] = useSessionState('riscos.incompletos', false);
  const [colWidths, setColWidths] = useState(() => readColWidths(COL_WIDTHS_KEY));
  const [density, setDensity] = useState<Density>(() => readDensity(DENSITY_KEY));

  // O drag de resize atualiza colWidths a cada mousemove; grava com debounce
  // para não escrever no localStorage dezenas de vezes por segundo.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(colWidths));
      } catch {
        // storage indisponível — preferência vale só para a sessão
      }
    }, COL_WIDTHS_SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [colWidths]);

  useEffect(() => { writeDensity(DENSITY_KEY, density); }, [density]);

  useEffect(() => { writePref(STATUS_FILTER_KEY, statusFilter); }, [statusFilter]);

  const rows = useMemo(() => buildRows(records), [records]);

  const totalRiscos = useMemo(() => records.filter(r => r.risco).length, [records]);
  const totalEmAndamento = useMemo(() => rows.filter(r => r.normSt === 'Em andamento').length, [rows]);
  const totalConcluido = useMemo(() => rows.filter(r => r.normSt === 'Concluído').length, [rows]);
  // Criticidade é o score (P × I) acima de 14 — a mesma régua da Análise e do
  // heatmap. A conta antiga olhava a priorização (≥ 6), que é outra pergunta.
  const totalCritico = useMemo(() => rows.filter(r => scoreTier(r.score) === 'critico').length, [rows]);
  const semTratamento = useMemo(
    () => riscosSemTratamento(riscosMapeados(records), acoes, iniciativas),
    [records, acoes, iniciativas],
  );
  const semTratamentoCriticos = useMemo(
    () => semTratamento.filter(t => scoreTier(computeScore(t.risco)) === 'critico').length,
    [semTratamento],
  );
  const completude = useMemo(() => computeCompletude(records), [records]);
  /** Campos mais vazios, do pior para o melhor — é o que a barra de qualidade cita. */
  const camposVazios = useMemo(() => COMPLETUDE_FIELDS
    .map(f => ({ campo: f, n: records.filter(r => campoVazio(r, f)).length }))
    .filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n), [records]);
  const nIncompletos = useMemo(
    () => rows.filter(row => COMPLETUDE_FIELDS.some(f => campoVazio(row.record, f))).length,
    [rows],
  );

  const visibleRows = useMemo(() => {
    const q = search.toLowerCase().trim();
    let result = rows.filter(row => {
      if (idsDoRecorte) return idsDoRecorte.has((row.record as RiskRecord & { id: string }).id);
      if (soIncompletos && !COMPLETUDE_FIELDS.some(f => campoVazio(row.record, f))) return false;
      if (statusFilter.length > 0 && !statusFilter.includes(row.normSt as RegistroStatus)) return false;
      if (areaFilter !== 'Todos' && row.record.area !== areaFilter) return false;
      if (categoriaFilter !== 'Todos' && row.record.categoria !== categoriaFilter) return false;
      if (!q) return true;
      const hay = [row.record.area, row.record.rotina, row.record.categoria, row.record.risco, row.record.acoes, row.record.recurso, row.record.responsavel]
        .join(' ').toLowerCase();
      return hay.includes(q);
    });
    if (sortKey) {
      const dir = sortDir === 'asc' ? 1 : -1;
      result = result.slice().sort((a, b) => {
        const va = sortValue(a, sortKey);
        const vb = sortValue(b, sortKey);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        return (va - vb) * dir;
      });
    }
    return result;
  }, [rows, idsDoRecorte, soIncompletos, search, statusFilter, areaFilter, categoriaFilter, sortKey, sortDir]);

  function handleSort(key: NonNullable<SortKey>) {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function handleColWidthChange(id: string, width: number) {
    setColWidths(prev => ({ ...prev, [id]: width }));
  }

  function handleToggleStatus(status: RegistroStatus) {
    setStatusFilter(prev => (prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]));
  }

  const emptyMessage = rows.length === 0
    ? 'Nenhum risco mapeado'
    : visibleRows.length === 0
      ? 'Nenhum risco com esses filtros'
      : undefined;
  const emptyHint = rows.length === 0
    ? 'O risco é o primeiro elo da cadeia. Com ele cadastrado, o Painel passa a mostrar o que ainda está solto.'
    : `Os filtros não encontram nada entre os ${plural(rows.length, 'registro', 'registros')}. Limpe-os para ver tudo de novo.`;

  const emptyAction = rows.length === 0
    ? { label: '+ Adicionar registro', onClick: onAddRow }
    : visibleRows.length === 0
      ? {
          label: 'Limpar filtros', onClick: () => {
            setSearch('');
            setStatusFilter([]);
            setAreaFilter('Todos');
            setCategoriaFilter('Todos');
            setSoIncompletos(false);
          },
        }
      : undefined;

  return (
    <div className="tab-page">
      {/* Título e ações numa barra própria; os KPIs abaixo, em faixa inteira.
          Antes os cinco cartões e os dois botões dividiam a mesma linha e
          embolavam a partir de qualquer largura de notebook. */}
      <div className="page-bar">
        <div>
          <div className="page-title">
            {totalRiscos === 0 ? 'Registro de riscos e ações' : semTratamento.length === 0 ? 'Nenhum risco sem tratamento' : (
              <>
                <em>{plural(semTratamento.length, 'risco sem tratamento', 'riscos sem tratamento')}</em>
                {semTratamentoCriticos > 0 && `, ${semTratamentoCriticos} ${semTratamentoCriticos === 1 ? 'deles crítico' : 'deles críticos'}`}
              </>
            )}
          </div>
          <div className="page-subtitle">
            {plural(totalRiscos, 'risco mapeado', 'riscos mapeados')} · criticidade = probabilidade × impacto · clique em uma linha para editar
          </div>
        </div>
        <div className="actions-row">
          {modoToggle}
          <button className="btn btn-ghost" onClick={onExportCSV}>↓ Exportar CSV</button>
          <button className="btn btn-navy" onClick={onAddRow}>+ Adicionar registro</button>
        </div>
      </div>

      {/* A melhor métrica da tela estava enterrada como quinto KPI. Vira uma
          régua sob o título, com os campos mais vazios e o botão que abre só
          o que falta preencher — preencher aqui muda decisão lá na Priorização. */}
      {rows.length > 0 && (
        <div className="qualidade-bar" role="group" aria-label="Qualidade do cadastro">
          <span className="qualidade-rotulo">Cadastro preenchido</span>
          <span className="qualidade-track" aria-hidden="true">
            <span className="qualidade-fill" style={{ width: `${completude}%` }} />
          </span>
          <span className="qualidade-valor tabular">{completude}%</span>
          {camposVazios.length > 0 && (
            <span className="qualidade-nota">
              mais vazios: {camposVazios.slice(0, 3).map(c => `${ROTULO_CAMPO[c.campo] ?? c.campo} (${c.n})`).join(' · ')}
            </span>
          )}
          {nIncompletos > 0 && (
            <button
              className="btn btn-ghost"
              aria-pressed={soIncompletos}
              onClick={() => setSoIncompletos(!soIncompletos)}
            >
              {soIncompletos ? 'Mostrar todos' : `Abrir os incompletos · ${nIncompletos}`}
            </button>
          )}
        </div>
      )}

      <KpiRow colunas={4}>
        <Kpi label="Riscos mapeados" valor={totalRiscos} sub="só linhas com descrição" acento="brand" />
        <Kpi label="Em andamento" valor={totalEmAndamento} sub="com status em andamento" acento="alto" />
        <Kpi
          label="Concluídas" valor={totalConcluido} sub="com status concluído" acento="baixo"
          {...(totalConcluido > 0 ? julgar('ok', 'Concluído') : {})}
        />
        <Kpi
          label="Criticidade crítica" valor={totalCritico} sub="acima de 14 pontos" acento="critico"
          {...(totalCritico > 0 ? julgar('risco', 'Crítico') : {})}
        />
      </KpiRow>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onToggleStatus={handleToggleStatus}
        onClearStatus={() => setStatusFilter([])}
        areaFilter={areaFilter}
        onAreaFilterChange={setAreaFilter}
        areaOptions={areaOptions}
        categoriaFilter={categoriaFilter}
        onCategoriaFilterChange={setCategoriaFilter}
        categoriaOptions={categoriaOptions}
        visibleCount={visibleRows.length}
        totalCount={rows.length}
        density={density}
        onDensityChange={setDensity}
      />

      <RiskTable
        rows={visibleRows}
        colWidths={colWidths}
        onColWidthChange={handleColWidthChange}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        onOpenEdit={onOpenEdit}
        onDeleteRow={onDeleteRow}
        emptyMessage={emptyMessage}
        emptyHint={emptyHint}
        emptyAction={emptyAction}
        density={density}
      />
    </div>
  );
}
