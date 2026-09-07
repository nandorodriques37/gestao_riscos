import { useMemo, useState } from 'react';
import type { Objetivo, StoredRiskRecord, Tab } from '../../types';
import type { UsePortfolio } from '../../hooks/usePortfolio';
import {
  iniciativaAtiva, progressoObjetivo, riscosPorObjetivo, saudeObjetivos,
} from '../../lib/portfolioMetrics';
import { computeScore, scoreTier } from '../../lib/calculations';
import {
  ROTULO_HORIZONTE, ROTULO_STATUS_OBJETIVO, ROTULO_STATUS_INICIATIVA,
  BADGE_STATUS_INICIATIVA, formatarData, formatarMoeda, formatarNumero,
  formatarPct, nomeRisco, plural,
} from '../../lib/portfolioLabels';
import { OBJETIVO_BALDE } from '../../lib/portfolioUi';
import { EmptyState } from '../common/EmptyState';
import { Kpi, KpiRow } from '../common/Kpi';
import { ObjetivoModal } from './ObjetivoModal';
import { MedicaoModal } from './MedicaoModal';
import { Sparkline } from './Sparkline';

interface ObjetivosTabProps {
  idsDoRecorte?: Set<string> | null;
  onCriarIniciativa: (objetivoId: string) => void;
  /** Para o bloco "riscos que ameaçam este objetivo", derivado das iniciativas. */
  riscos: StoredRiskRecord[];
  pf: UsePortfolio;
  onIrPara: (tab: Tab) => void;
  onAbrirIniciativa: (id: string) => void;
  onAbrirRisco: (id: string) => void;
}

const ROTULO_TENDENCIA: Record<string, string> = {
  melhorou: 'melhorou', piorou: 'piorou', estavel: 'estável',
};

/** Badge do status do objetivo: verde só quando a meta caiu de fato. */
const BADGE_STATUS: Record<string, string> = {
  ativo: 'blue', atingido: 'green', abandonado: 'slate', '': 'slate',
};

export function ObjetivosTab({
  riscos, pf, onAbrirIniciativa, onAbrirRisco, idsDoRecorte, onCriarIniciativa,
}: ObjetivosTabProps) {
  const { portfolio, loading, error, clearError, createEntidade, patchEntidade, deleteEntidade } = pf;
  const { objetivos, medicoes, iniciativas, acoes_risco, pessoas } = portfolio;
  const [editando, setEditando] = useState<Objetivo | null>(null);
  const [medindo, setMedindo] = useState<Objetivo | null>(null);
  const [criando, setCriando] = useState(false);
  const [mostrarEncerrados, setMostrarEncerrados] = useState(false);

  const pessoaPorId = useMemo(() => new Map(pessoas.map(p => [p.id, p.nome])), [pessoas]);

  const porObjetivo = useMemo(() => {
    const m = new Map<string, typeof iniciativas>();
    for (const i of iniciativas) {
      if (!i.objetivo_id) continue;
      const lista = m.get(i.objetivo_id) ?? [];
      lista.push(i);
      m.set(i.objetivo_id, lista);
    }
    return m;
  }, [iniciativas]);

  const semObjetivo = useMemo(() => iniciativas.filter(i => !i.objetivo_id), [iniciativas]);

  const visiveis = useMemo(() => {
    const lista = idsDoRecorte ? objetivos.filter(o => idsDoRecorte.has(o.id)) : mostrarEncerrados ? objetivos : objetivos.filter(o => o.status !== 'abandonado');
    // O balde da migração vai para o fim: é caixa de entrada, não direção.
    return [...lista].sort((a, b) => {
      const ba = a.descricao === OBJETIVO_BALDE ? 1 : 0;
      const bb = b.descricao === OBJETIVO_BALDE ? 1 : 0;
      return ba - bb;
    });
  }, [objetivos, mostrarEncerrados, idsDoRecorte]);

  const encerrados = objetivos.length - objetivos.filter(o => o.status !== 'abandonado').length;

  const saude = useMemo(() => saudeObjetivos(objetivos, medicoes), [objetivos, medicoes]);

  /**
   * Riscos que ameaçam cada objetivo, derivados do caminho que já existe:
   * objetivo ← iniciativa ← ação ← risco. Um `objetivo_id` no próprio risco
   * criaria um segundo caminho para o mesmo fato — e quando os dois
   * discordassem, ninguém saberia qual vale.
   */
  const riscosPorObj = useMemo(() => {
    const m = new Map<string, StoredRiskRecord[]>();
    for (const o of objetivos) {
      m.set(o.id, riscosPorObjetivo(o.id, iniciativas, acoes_risco, riscos));
    }
    return m;
  }, [objetivos, iniciativas, acoes_risco, riscos]);

  async function salvarNovo(dados: Record<string, unknown>) {
    return createEntidade('objetivos', dados);
  }

  /**
   * Declara o objetivo atingido. É decisão, não cálculo — igual ao "confirmar
   * mitigado" do Rastro. A métrica só prova que a série cobriu o caminho até a
   * meta; quem responde pelo resultado é quem clica.
   */
  async function declararAtingido(o: Objetivo) {
    if (!window.confirm(
      `Declarar "${o.descricao}" como atingido?\n\n`
      + 'A série já cobriu todo o caminho entre baseline e meta. Ele sai da conta de '
      + 'objetivos ativos e passa a contar como alcançado.',
    )) return;
    await patchEntidade('objetivos', o.id, { status: 'atingido' });
  }


  async function excluir(o: Objetivo) {
    const presas = porObjetivo.get(o.id)?.length ?? 0;
    if (presas > 0) {
      window.alert(
        `Este objetivo tem ${plural(presas, 'iniciativa pendurada', 'iniciativas penduradas')}. `
        + 'Mova-as para outro objetivo antes de excluir — iniciativa sem objetivo não é salva.',
      );
      return;
    }
    if (!window.confirm(`Excluir o objetivo "${o.descricao}"?`)) return;
    const ok = await deleteEntidade('objetivos', o.id);
    if (ok) setEditando(null);
  }

  if (loading && objetivos.length === 0) {
    return (
      <div className="tab-page-lg">
        <div className="app-loading" role="status" aria-label="Carregando objetivos…">
          <div className="skeleton-table">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton-row" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-page-lg">
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button className="error-banner-dismiss" onClick={clearError} aria-label="Fechar aviso">×</button>
        </div>
      )}

      <div className="page-bar">
        <div>
          <div className="page-title">Objetivos</div>
          <div className="page-subtitle">
            {plural(objetivos.filter(o => o.status === 'ativo').length, 'objetivo ativo', 'objetivos ativos')} ·
            {' '}toda iniciativa pendura em um deles
          </div>
        </div>
        <div className="actions-row">
          {encerrados > 0 && (
            <button
              className="btn btn-ghost"
              onClick={() => setMostrarEncerrados(v => !v)}
            >
              {mostrarEncerrados ? 'Ocultar abandonados' : `Mostrar abandonados · ${encerrados}`}
            </button>
          )}
          <button className="btn btn-navy" onClick={() => setCriando(true)}>+ Novo objetivo</button>
        </div>
      </div>

      {objetivos.length > 0 && (
        <KpiRow colunas={4}>
          <Kpi label="Ativos" valor={saude.ativos} acento="brand" />
          <Kpi
            label="Atingidos"
            valor={saude.atingidos}
            sub="declarados por você"
            acento="baixo"
          />
          <Kpi
            label="Prontos para atingir"
            valor={saude.prontosParaAtingir.length}
            sub="a série cobriu o caminho todo"
            acento={saude.prontosParaAtingir.length > 0 ? 'medio' : 'null'}
          />
          <Kpi
            label="Sem número"
            valor={saude.semIndicador + saude.semMedicao}
            sub={`${saude.semIndicador} sem indicador · ${saude.semMedicao} sem medição`}
            acento={saude.semIndicador + saude.semMedicao > 0 ? 'alto' : 'null'}
          />
        </KpiRow>
      )}

      {visiveis.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="◇"
            message="Nenhum objetivo cadastrado"
            hint="O objetivo é o porquê: o resultado de negócio que as iniciativas movem. Poucos e ativos — três a seis dão conta de um ano."
            action={{ label: '+ Novo objetivo', onClick: () => setCriando(true) }}
          />
        </div>
      ) : (
        <div className="card-col" style={{ gap: 'var(--sp-3)' }}>
          {visiveis.map(o => {
            const daqui = porObjetivo.get(o.id) ?? [];
            const ativas = daqui.filter(iniciativaAtiva);
            const concluidas = daqui.filter(i => i.status === 'concluida').length;
            const comprometido = daqui.reduce((s, i) => s + (i.impacto_rs ?? 0), 0);
            const balde = o.descricao === OBJETIVO_BALDE;
            const orfao = !balde && o.status === 'ativo' && ativas.length === 0;
            const pctExecucao = daqui.length === 0 ? 0 : concluidas / daqui.length;
            const progresso = progressoObjetivo(o, medicoes);
            const ameacas = riscosPorObj.get(o.id) ?? [];
            const sufixo = o.unidade ? ` ${o.unidade}` : '';
            // Casas decimais seguem o próprio número: 8,4% mantém a casa, 145 dias não ganha uma.
            const num = (v: number | null) => formatarNumero(v, v != null && !Number.isInteger(v) ? 1 : 0);

            return (
              <div className="card objetivo-card" key={o.id} data-orfao={orfao} data-balde={balde}>
                <div>
                  <div className="ini-meta" style={{ marginTop: 0 }}>
                    <span className="badge" data-badge={BADGE_STATUS[o.status] ?? 'slate'}>
                      {ROTULO_STATUS_OBJETIVO[o.status]}
                    </span>
                    <span>{ROTULO_HORIZONTE[o.horizonte]}</span>
                    {o.prazo && <><span>·</span><span className="tabular">até {formatarData(o.prazo)}</span></>}
                  </div>

                  <div className="objetivo-titulo">{o.descricao || 'Objetivo sem descrição'}</div>

                  <div className="ini-meta">
                    <span>{o.dono_id ? pessoaPorId.get(o.dono_id) ?? 'Dono removido' : 'Sem dono'}</span>
                    {comprometido > 0 && <><span>·</span><span>{formatarMoeda(comprometido)} em jogo</span></>}
                  </div>

                  <div className="actions-row" style={{ marginTop: 'var(--sp-3)' }}>
                    <button className="btn btn-ghost" onClick={() => setEditando(o)}>Editar</button>
                    {/* O sistema prova que a meta foi alcançada; declarar é
                        sempre de quem responde pelo objetivo. Nada aqui muda o
                        status sozinho. */}
                    {progresso.pct === 1 && o.status === 'ativo' && (
                      <button
                        className="btn btn-navy"
                        onClick={() => { void declararAtingido(o); }}
                        title="A série já cobriu todo o caminho entre baseline e meta."
                      >
                        Declarar atingido
                      </button>
                    )}
                  </div>

                  {balde && (
                    <div className="bento-sub" style={{ marginTop: 'var(--sp-3)' }}>
                      Balde temporário da migração. Reclassifique as iniciativas daqui para
                      objetivos de verdade — depois ele pode ser excluído.
                    </div>
                  )}
                  {orfao && (
                    <div className="bento-lacuna">
                      <span aria-hidden="true">▲</span> Sem iniciativa ativa — é intenção, não plano
                    </div>
                  )}
                </div>

                <div>
                  <div className="fato-label">Indicador</div>
                  {o.indicador ? (
                    <>
                      <div className="lista-texto" style={{ whiteSpace: 'normal', marginTop: 'var(--sp-1)' }}>
                        {o.indicador}
                      </div>

                      {/* baseline → hoje → meta. O do meio é o que a série diz,
                          e só existe quando alguém mediu. */}
                      <div className="ini-meta">
                        <span className="tabular">{num(o.baseline)}{sufixo}</span>
                        <span aria-hidden="true">→</span>
                        <span
                          className="tabular"
                          style={{
                            color: progresso.atual == null ? 'var(--ink-4)' : 'var(--ink-1)',
                            fontWeight: 'var(--fw-semibold)',
                          }}
                        >
                          {progresso.atual == null ? 'sem medição' : `${num(progresso.atual)}${sufixo}`}
                        </span>
                        <span aria-hidden="true">→</span>
                        <span className="tabular">{num(o.meta)}{sufixo}</span>
                      </div>

                      <div className="meta-track" title={
                        progresso.pct == null
                          ? 'Sem medição, baseline ou meta — não há caminho para medir'
                          : `${formatarPct(progresso.pct)} do caminho entre baseline e meta`
                      }>
                        <span className="meta-fill" style={{ width: `${Math.round((progresso.pct ?? 0) * 100)}%` }} />
                        <span className="meta-alvo" />
                      </div>
                      <div className="meta-legenda">
                        <span>
                          {progresso.pct == null ? 'sem progresso medido' : `${formatarPct(progresso.pct)} do caminho`}
                        </span>
                        {progresso.tendencia && (
                          <span className="tendencia" data-t={progresso.tendencia}>
                            <span aria-hidden="true">
                              {progresso.tendencia === 'melhorou' ? '▲' : progresso.tendencia === 'piorou' ? '▼' : '='}
                            </span>
                            {ROTULO_TENDENCIA[progresso.tendencia]}
                          </span>
                        )}
                      </div>

                      <Sparkline
                        serie={progresso.serie}
                        baseline={o.baseline}
                        meta={o.meta}
                        unidade={sufixo}
                      />

                      <div className="actions-row" style={{ marginTop: 'var(--sp-2)' }}>
                        <button className="btn btn-ghost" onClick={() => setMedindo(o)}>
                          {progresso.serie.length === 0
                            ? 'Registrar 1ª medição'
                            : `Medições · ${progresso.serie.length}`}
                        </button>
                        {progresso.data && (
                          <span className="lista-nota">última: {formatarData(progresso.data)}</span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="bento-sub">
                      Sem indicador. Objetivo sem número vira opinião no fim do trimestre.
                    </div>
                  )}

                  <div className="fato-label" style={{ marginTop: 'var(--sp-4)' }}>Execução</div>
                  <div className="meta-legenda" style={{ marginTop: 'var(--sp-1)' }}>
                    <span>{concluidas} de {daqui.length} iniciativas concluídas</span>
                    <span>{formatarPct(pctExecucao)}</span>
                  </div>
                </div>

                <div className="objetivo-iniciativas">
                  <div className="fato-label">
                    {daqui.length === 0
                      ? 'Nenhuma iniciativa'
                      : `${plural(daqui.length, 'iniciativa', 'iniciativas')} · ${ativas.length} ativas`}
                  </div>
                  {daqui.length === 0 ? (
                    <div className="bento-sub">
                      Nada pendurado aqui ainda.{' '}
                      <button className="link-ini" onClick={() => onCriarIniciativa(o.id)}>
                        Criar uma iniciativa
                      </button>
                    </div>
                  ) : (
                    <div className="lista-linhas">
                      {daqui.slice(0, 8).map(i => (
                        <div className="lista-linha" key={i.id}>
                          <button
                            className="lista-texto link-ini"
                            style={{ fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-medium)' }}
                            onClick={() => onAbrirIniciativa(i.id)}
                          >
                            {i.nome || 'Iniciativa sem nome'}
                          </button>
                          <span className="badge" data-badge={BADGE_STATUS_INICIATIVA[i.status]}>
                            {ROTULO_STATUS_INICIATIVA[i.status]}
                          </span>
                        </div>
                      ))}
                      {daqui.length > 8 && (
                        <div className="lista-linha">
                          <span className="lista-nota">e mais {daqui.length - 8}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Riscos que ameaçam este objetivo. Derivado: chega aqui
                      pelas iniciativas penduradas, nunca por um campo no
                      próprio risco. Risco tratado só por mitigação autônoma
                      não aparece em objetivo nenhum — e é justamente essa a
                      lacuna que o Painel cobra. */}
                  <div className="fato-label" style={{ marginTop: 'var(--sp-4)' }}>
                    {ameacas.length === 0
                      ? 'Nenhum risco vinculado'
                      : `${plural(ameacas.length, 'risco ameaça', 'riscos ameaçam')} este objetivo`}
                  </div>
                  {ameacas.length === 0 ? (
                    <div className="bento-sub">
                      Nenhuma iniciativa daqui trata risco mapeado. Vincular um risco a uma
                      delas faz ele aparecer nesta lista.
                    </div>
                  ) : (
                    <div className="lista-linhas">
                      {ameacas.slice(0, 6).map(r => {
                        const score = computeScore(r);
                        return (
                          <div className="lista-linha" key={r.id}>
                            <button
                              className="lista-texto link-ini"
                              style={{ fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-medium)' }}
                              onClick={() => onAbrirRisco(r.id)}
                              title={nomeRisco(r)}
                            >
                              {nomeRisco(r)}
                            </button>
                            <span className="tier-chip" data-tier={scoreTier(score)}>
                              <span className="tier-dot" aria-hidden="true" />
                              {score == null ? 'sem score' : String(score).replace('.', ',')}
                            </span>
                          </div>
                        );
                      })}
                      {ameacas.length > 6 && (
                        <div className="lista-linha">
                          <span className="lista-nota">e mais {ameacas.length - 6}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {semObjetivo.length > 0 && (
        <div className="card" style={{ marginTop: 'var(--sp-3)' }}>
          <div className="section-title">
            {plural(semObjetivo.length, 'iniciativa sem objetivo', 'iniciativas sem objetivo')}
          </div>
          <div className="bento-sub">
            Não deveriam existir — a regra recusa iniciativa sem objetivo na gravação.
            Provavelmente o objetivo delas foi excluído. Reatribua pelo detalhe de cada uma.
          </div>
          <div className="lista-linhas">
            {semObjetivo.map(i => (
              <div className="lista-linha" key={i.id}>
                <button
                  className="lista-texto link-ini"
                  style={{ fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-medium)' }}
                  onClick={() => onAbrirIniciativa(i.id)}
                >
                  {i.nome || 'Iniciativa sem nome'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {criando && (
        <ObjetivoModal
          pessoas={pessoas}
          erro={error} onSalvar={salvarNovo}
          onClose={() => setCriando(false)}
        />
      )}

      {medindo && (
        <MedicaoModal
          key={medindo.id}
          objetivo={medindo}
          medicoes={medicoes}
          pf={pf}
          onClose={() => setMedindo(null)}
        />
      )}

      {editando && (
        <ObjetivoModal
          key={editando.id}
          objetivo={editando}
          pessoas={pessoas}
          erro={error} onSalvar={dados => patchEntidade('objetivos', editando.id, dados, editando.version)}
          onExcluir={() => { void excluir(editando); }}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}
