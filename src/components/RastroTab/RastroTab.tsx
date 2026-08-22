import { useMemo, useState } from 'react';
import type { AcaoRisco, RiskRecord, SituacaoRisco, StoredRiskRecord, Tab } from '../../types';
import { SITUACOES_RISCO } from '../../types';
import type { UsePortfolio } from '../../hooks/usePortfolio';
import { computeScore, scoreTier } from '../../lib/calculations';
import {
  tratamentoDosRiscos, prontosParaFechar, riscosMitigados, exposicaoResidual,
  hojeISO, type EstadoTratamento,
} from '../../lib/portfolioMetrics';
import {
  ROTULO_SITUACAO, AJUDA_SITUACAO, BADGE_SITUACAO, ROTULO_STATUS_ACAO,
  BADGE_STATUS_ACAO, formatarData, formatarMoeda, nomeRisco, plural,
} from '../../lib/portfolioLabels';
import { ROTULO_TRATAMENTO, BADGE_TRATAMENTO, AJUDA_TRATAMENTO } from '../../lib/portfolioUi';
import { EmptyState } from '../common/EmptyState';

interface RastroTabProps {
  records: StoredRiskRecord[];
  pf: UsePortfolio;
  onAtualizarRisco: (id: string, patch: Partial<RiskRecord>) => void;
  onAbrirRisco: (id: string) => void;
  onAbrirIniciativa: (id: string) => void;
  onPromoverAcao: (acao: AcaoRisco) => void;
  onIrPara: (tab: Tab) => void;
  cabecalho: React.ReactNode;
}

const FILTROS: { chave: EstadoTratamento | 'todos'; label: string }[] = [
  { chave: 'todos', label: 'Todos' },
  { chave: 'tratamento_concluido', label: 'Tratamento entregue' },
  { chave: 'em_tratamento', label: 'Em tratamento' },
  { chave: 'sem_tratamento', label: 'Sem tratamento' },
  { chave: 'aceito', label: 'Aceitos' },
];

/**
 * Rastro de mitigação: o registro de risco lido pelo tratamento, não pelo
 * cadastro. Uma linha por risco mostra as ações, para onde cada uma foi
 * (autônoma ou dentro de uma iniciativa) e o estado derivado disso.
 *
 * O balde de "prontos para fechar" é o ponto da tela: o sistema prova que o
 * tratamento foi entregue, mas quem declara o risco mitigado é o gestor. Deriva
 * a evidência, não a decisão.
 */
export function RastroTab({
  records, pf, onAtualizarRisco, onAbrirRisco, onAbrirIniciativa, onPromoverAcao,
  onIrPara, cabecalho,
}: RastroTabProps) {
  const { portfolio } = pf;
  const { iniciativas, acoes_risco, pessoas } = portfolio;
  const [filtro, setFiltro] = useState<EstadoTratamento | 'todos'>('todos');
  const [busca, setBusca] = useState('');

  const hojeStr = hojeISO();
  const ano = Number(hojeStr.slice(0, 4));

  const pessoaPorId = useMemo(() => new Map(pessoas.map(p => [p.id, p.nome])), [pessoas]);
  const iniciativaPorId = useMemo(() => new Map(iniciativas.map(i => [i.id, i])), [iniciativas]);

  const tratamento = useMemo(
    () => tratamentoDosRiscos(records, acoes_risco, iniciativas),
    [records, acoes_risco, iniciativas],
  );
  const prontos = useMemo(
    () => prontosParaFechar(records, acoes_risco, iniciativas),
    [records, acoes_risco, iniciativas],
  );
  const mitigados = useMemo(() => riscosMitigados(records, ano), [records, ano]);
  const exposicao = useMemo(() => exposicaoResidual(records), [records]);

  const contagem = useMemo(() => {
    const c = new Map<EstadoTratamento, number>();
    tratamento.forEach(t => c.set(t.estado, (c.get(t.estado) ?? 0) + 1));
    return c;
  }, [tratamento]);

  const visiveis = useMemo(() => {
    const q = busca.toLowerCase().trim();
    return tratamento.filter(t => {
      if (filtro !== 'todos' && t.estado !== filtro) return false;
      if (!q) return true;
      return [t.risco.risco, t.risco.area, t.risco.categoria, t.risco.rotina]
        .join(' ').toLowerCase().includes(q);
    });
  }, [tratamento, filtro, busca]);

  /** Confirma a decisão do gestor. É aqui que sai o número que vai ao comitê. */
  function confirmarSituacao(id: string, situacao: SituacaoRisco) {
    onAtualizarRisco(id, {
      situacao,
      // Sem data, "mitigados no ano" não tem como ser contado.
      data_situacao: situacao === '' ? null : hojeStr,
    });
  }

  const migracaoNaoRodou = acoes_risco.length === 0;

  return (
    <div className="tab-page-lg">
      {cabecalho}

      <div className="kpi-grid-4" style={{ marginBottom: 'var(--sp-4)' }}>
        <div className="kpi-card" data-accent="baixo">
          <div className="kpi-body">
            <div className="kpi-label">Mitigados em {ano}</div>
            <div className="kpi-value tabular">{mitigados.length}</div>
            <div className="kpi-value-sub">confirmados por você, com data</div>
          </div>
        </div>
        <div className="kpi-card" data-accent="brand">
          <div className="kpi-body">
            <div className="kpi-label">Prontos para fechar</div>
            <div className="kpi-value tabular">{prontos.length}</div>
            <div className="kpi-value-sub">tratamento entregue, decisão pendente</div>
          </div>
        </div>
        <div className="kpi-card" data-accent="medio">
          <div className="kpi-body">
            <div className="kpi-label">Em tratamento</div>
            <div className="kpi-value tabular">{contagem.get('em_tratamento') ?? 0}</div>
            <div className="kpi-value-sub">com ação ou iniciativa em aberto</div>
          </div>
        </div>
        <div className="kpi-card" data-accent="critico">
          <div className="kpi-body">
            <div className="kpi-label">Sem tratamento</div>
            <div className="kpi-value tabular">{contagem.get('sem_tratamento') ?? 0}</div>
            <div className="kpi-value-sub">
              {formatarMoeda(exposicao.total)} de exposição aberta no total
            </div>
          </div>
        </div>
      </div>

      {migracaoNaoRodou && (
        <div className="card" style={{ marginBottom: 'var(--sp-4)' }}>
          <EmptyState
            icon="↓"
            message="Os planos de ação ainda não foram extraídos"
            hint="Sem as ações em linha própria, o rastro não tem o que seguir: todo risco aparece como sem tratamento. A extração não altera nenhum registro."
            action={{ label: 'Ir para a Triagem', onClick: () => onIrPara('triagem') }}
          />
        </div>
      )}

      {prontos.length > 0 && (
        <div className="card rastro-balde" style={{ marginBottom: 'var(--sp-4)' }}>
          <div className="section-title">
            {plural(prontos.length, 'risco pronto para fechar', 'riscos prontos para fechar')}
          </div>
          <div className="bento-sub">
            Toda mitigação viva concluiu — e, quando estava dentro de uma iniciativa, a
            iniciativa também. O sistema prova a entrega; declarar a ameaça derrubada é sua.
          </div>
          <div className="rastro-grid">
            {prontos.map(t => (
              <div className="rastro-item" key={t.risco.id}>
                <button
                  className="link-ini"
                  onClick={() => onAbrirRisco(t.risco.id)}
                  title={nomeRisco(t.risco)}
                  style={{ display: 'block' }}
                >
                  {nomeRisco(t.risco)}
                </button>
                <div className="ini-meta" style={{ marginTop: 0 }}>
                  <span>
                    {[t.risco.area, plural(t.acoes.length, 'ação entregue', 'ações entregues')]
                      .filter(Boolean).join(' · ')}
                  </span>
                </div>
                <div className="actions-row">
                  <button
                    className="btn btn-navy"
                    onClick={() => confirmarSituacao(t.risco.id, 'mitigado')}
                  >
                    Confirmar mitigado
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => confirmarSituacao(t.risco.id, 'obsoleto')}
                    title={AJUDA_SITUACAO.obsoleto}
                  >
                    Obsoleto
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="filter-row" style={{ marginBottom: 'var(--sp-3)' }}>
        <input
          className="search-input"
          placeholder="Buscar risco…"
          value={busca}
          onChange={e => setBusca(e.target.value)}
        />
        <div className="filter-pills">
          {FILTROS.map(f => (
            <button
              key={f.chave}
              className={`filter-pill${filtro === f.chave ? ' active' : ''}`}
              onClick={() => setFiltro(f.chave)}
            >
              {f.label}
              {f.chave !== 'todos' && ` · ${contagem.get(f.chave) ?? 0}`}
            </button>
          ))}
        </div>
        <span className="filter-count">{visiveis.length} de {records.length}</span>
      </div>

      <div className="card">
        {visiveis.length === 0 ? (
          <EmptyState
            icon="⌕"
            message="Nenhum risco com esse recorte"
            hint="Troque o filtro de estado ou limpe a busca."
          />
        ) : (
          <>
            <div className="rastro-linha rastro-cabecalho">
              <div className="fato-label">Risco</div>
              <div className="fato-label">Score</div>
              <div className="fato-label">Mitigações e para onde foram</div>
              <div className="fato-label">Estado derivado</div>
              <div className="fato-label">Situação declarada</div>
            </div>

            {visiveis.map(t => {
              const score = computeScore(t.risco);
              const situacao = (t.risco.situacao ?? '') as SituacaoRisco;
              return (
                <div className="rastro-linha" key={t.risco.id}>
                  <div data-rotulo="Risco">
                    <button
                      className="rastro-risco link-ini"
                      onClick={() => onAbrirRisco(t.risco.id)}
                      title={nomeRisco(t.risco)}
                      style={{ display: 'block', width: '100%' }}
                    >
                      {nomeRisco(t.risco)}
                    </button>
                    {/* Uma string só, não uma sequência de spans: quebrando a linha,
                        o separador ficava órfão no fim da primeira. */}
                    <div className="ini-meta">
                      <span className="tabular">
                        {[
                          t.risco.area,
                          t.risco.resposta,
                          t.risco.exposicao_rs != null ? formatarMoeda(t.risco.exposicao_rs) : null,
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                  </div>

                  <div data-rotulo="Score">
                    <span className="tier-chip" data-tier={scoreTier(score)}>
                      <span className="tier-dot" aria-hidden="true" />
                      {score == null ? '—' : String(score).replace('.', ',')}
                    </span>
                  </div>

                  <div data-rotulo="Mitigações e para onde foram">
                    {t.acoes.length === 0 ? (
                      <div className="lista-nota">
                        {t.risco.resposta === 'Aceitar'
                          ? 'Resposta aceitar — não se cobra ação.'
                          : 'Nenhuma ação cadastrada.'}
                      </div>
                    ) : (
                      t.acoes.map(a => {
                        const ini = a.iniciativa_id ? iniciativaPorId.get(a.iniciativa_id) : undefined;
                        return (
                          <div className="rastro-acao" data-em-iniciativa={Boolean(ini)} key={a.id}>
                            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-1)', lineHeight: 1.4 }}>
                              {a.descricao}
                            </div>
                            <div className="ini-meta">
                              <span className="badge" data-badge={BADGE_STATUS_ACAO[a.status]}>
                                {ROTULO_STATUS_ACAO[a.status]}
                              </span>
                              {ini ? (
                                <>
                                  <span>dentro de</span>
                                  <button className="link-ini" onClick={() => onAbrirIniciativa(ini.id)}>
                                    {ini.nome || 'Iniciativa sem nome'}
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span>mitigação autônoma</span>
                                  <button className="link-ini" onClick={() => onPromoverAcao(a)}>
                                    promover a iniciativa
                                  </button>
                                </>
                              )}
                              {a.dono_id && <><span>·</span><span>{pessoaPorId.get(a.dono_id)}</span></>}
                              {a.prazo && <><span>·</span><span className="tabular">{formatarData(a.prazo)}</span></>}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div data-rotulo="Estado derivado">
                    <span
                      className="badge"
                      data-badge={BADGE_TRATAMENTO[t.estado]}
                      title={AJUDA_TRATAMENTO[t.estado]}
                    >
                      {ROTULO_TRATAMENTO[t.estado]}
                    </span>
                    {t.estado === 'tratamento_concluido' && !situacao && (
                      <div className="lista-nota" style={{ marginTop: 'var(--sp-1)' }}>
                        Esperando sua confirmação.
                      </div>
                    )}
                  </div>

                  <div data-rotulo="Situação declarada">
                    <select
                      className="select-filter"
                      style={{ width: '100%' }}
                      value={situacao}
                      onChange={e => confirmarSituacao(t.risco.id, e.target.value as SituacaoRisco)}
                      aria-label={`Situação de ${nomeRisco(t.risco)}`}
                    >
                      <option value="">Sem situação</option>
                      {SITUACOES_RISCO.map(s => (
                        <option key={s} value={s}>{ROTULO_SITUACAO[s]}</option>
                      ))}
                    </select>
                    {situacao && (
                      <div className="ini-meta">
                        <span className="badge" data-badge={BADGE_SITUACAO[situacao]}>
                          {ROTULO_SITUACAO[situacao]}
                        </span>
                        {t.risco.data_situacao && (
                          <span className="tabular">{formatarData(t.risco.data_situacao)}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <div className="bento-sub" style={{ marginTop: 'var(--sp-4)', maxWidth: '80ch' }}>
        <strong style={{ color: 'var(--ink-3)' }}>Mitigado</strong> é decisão, não cálculo.
        O estado à esquerda é derivado e auditável; a situação à direita é sua declaração —
        e só ela conta como risco mitigado no ano. <strong style={{ color: 'var(--ink-3)' }}>Obsoleto</strong> é
        a ameaça que deixou de existir sozinha, e por isso não entra nesse número.
      </div>
    </div>
  );
}
