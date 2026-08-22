import { useMemo, useState } from 'react';
import type { Objetivo, Tab } from '../../types';
import type { UsePortfolio } from '../../hooks/usePortfolio';
import { iniciativaAtiva } from '../../lib/portfolioMetrics';
import {
  ROTULO_HORIZONTE, ROTULO_STATUS_OBJETIVO, ROTULO_STATUS_INICIATIVA,
  BADGE_STATUS_INICIATIVA, formatarData, formatarMoeda, formatarNumero, plural,
} from '../../lib/portfolioLabels';
import { OBJETIVO_BALDE } from '../../lib/portfolioUi';
import { EmptyState } from '../common/EmptyState';
import { ObjetivoModal } from './ObjetivoModal';

interface ObjetivosTabProps {
  pf: UsePortfolio;
  onIrPara: (tab: Tab) => void;
  onAbrirIniciativa: (id: string) => void;
}

/** Badge do status do objetivo: verde só quando a meta caiu de fato. */
const BADGE_STATUS: Record<string, string> = {
  ativo: 'blue', atingido: 'green', abandonado: 'slate', '': 'slate',
};

export function ObjetivosTab({ pf, onIrPara, onAbrirIniciativa }: ObjetivosTabProps) {
  const { portfolio, loading, error, clearError, createEntidade, patchEntidade, deleteEntidade } = pf;
  const { objetivos, iniciativas, pessoas } = portfolio;
  const [editando, setEditando] = useState<Objetivo | null>(null);
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
    const lista = mostrarEncerrados ? objetivos : objetivos.filter(o => o.status !== 'abandonado');
    // O balde da migração vai para o fim: é caixa de entrada, não direção.
    return [...lista].sort((a, b) => {
      const ba = a.descricao === OBJETIVO_BALDE ? 1 : 0;
      const bb = b.descricao === OBJETIVO_BALDE ? 1 : 0;
      return ba - bb;
    });
  }, [objetivos, mostrarEncerrados]);

  const encerrados = objetivos.length - objetivos.filter(o => o.status !== 'abandonado').length;

  async function salvarNovo(dados: Record<string, unknown>) {
    return createEntidade('objetivos', dados);
  }

  async function salvarEdicao(id: string, dados: Record<string, unknown>) {
    return patchEntidade('objetivos', id, dados);
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
                      <div className="ini-meta">
                        <span className="tabular">
                          {formatarNumero(o.baseline, o.baseline != null && !Number.isInteger(o.baseline) ? 1 : 0)}
                          {o.unidade && ` ${o.unidade}`}
                        </span>
                        <span aria-hidden="true">→</span>
                        <span className="tabular" style={{ color: 'var(--ink-1)', fontWeight: 'var(--fw-semibold)' }}>
                          {formatarNumero(o.meta, o.meta != null && !Number.isInteger(o.meta) ? 1 : 0)}
                          {o.unidade && ` ${o.unidade}`}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="bento-sub">
                      Sem indicador. Objetivo sem número vira opinião no fim do trimestre.
                    </div>
                  )}

                  <div className="fato-label" style={{ marginTop: 'var(--sp-4)' }}>Execução</div>
                  {/* Barra de EXECUÇÃO, não do indicador: sem medições cadastradas,
                      fingir progresso do indicador seria inventar dado. */}
                  <div className="meta-track" title={`${concluidas} de ${daqui.length} iniciativas concluídas`}>
                    <span className="meta-fill" style={{ width: `${Math.round(pctExecucao * 100)}%` }} />
                    <span className="meta-alvo" />
                  </div>
                  <div className="meta-legenda">
                    <span>{concluidas} concluídas</span>
                    <span>{daqui.length} no total</span>
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
                      <button className="link-ini" onClick={() => onIrPara('iniciativas')}>
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
          onSalvar={salvarNovo}
          onClose={() => setCriando(false)}
        />
      )}

      {editando && (
        <ObjetivoModal
          key={editando.id}
          objetivo={editando}
          pessoas={pessoas}
          onSalvar={dados => salvarEdicao(editando.id, dados)}
          onExcluir={() => { void excluir(editando); }}
          onClose={() => setEditando(null)}
        />
      )}
    </div>
  );
}
