import { useMemo, useState } from 'react';
import type {
  AcaoRisco, Iniciativa, Marco, Objetivo, Pessoa, StoredRiskRecord,
} from '../../types';
import type { UsePortfolio } from '../../hooks/usePortfolio';
import { computePrioriz, computeScore, priorizTier, round2, scoreTier } from '../../lib/calculations';
import { marcosNoPrazo, slipMedio, riscosPorIniciativa, hojeISO } from '../../lib/portfolioMetrics';
import {
  ROTULO_FONTE, ROTULO_VETOR, ROTULO_STATUS_INICIATIVA, ROTULO_STATUS_MARCO,
  ROTULO_STATUS_ACAO, BADGE_STATUS_INICIATIVA, BADGE_STATUS_ACAO,
  ROTULO_CONFIANCA, formatarData, formatarMoeda, formatarMoedaCheia,
  formatarNumero, formatarPct, nomeRisco, plural,
} from '../../lib/portfolioLabels';
import { estadoDoMarco } from '../../lib/marcos';
import { TrilhaMarcos, LegendaTrilha } from './TrilhaMarcos';
import { MarcoModal } from './MarcoModal';
import { VincularRiscoModal } from './VincularRiscoModal';
import { Historico } from '../common/Historico';

interface IniciativaDetalheProps {
  iniciativa: Iniciativa;
  objetivo: Objetivo | null;
  pessoas: Pessoa[];
  marcos: Marco[];
  acoes: AcaoRisco[];
  riscos: StoredRiskRecord[];
  pf: UsePortfolio;
  onEditar: () => void;
  onAbrirRisco: (id: string) => void;
}

export function IniciativaDetalhe({
  iniciativa, objetivo, pessoas, marcos, acoes, riscos, pf, onEditar, onAbrirRisco,
}: IniciativaDetalheProps) {
  const [marcoEditando, setMarcoEditando] = useState<Marco | null>(null);
  const [criandoMarco, setCriandoMarco] = useState(false);
  const [vinculando, setVinculando] = useState(false);

  const hoje = useMemo(() => new Date(), []);
  const hojeStr = hojeISO(hoje);

  const meusMarcos = useMemo(() => {
    return marcos
      .filter(m => m.iniciativa_id === iniciativa.id)
      .sort((a, b) => {
        const da = a.data_real ?? a.data_plano_atual ?? a.data_plano_original ?? '';
        const db = b.data_real ?? b.data_plano_atual ?? b.data_plano_original ?? '';
        return da.localeCompare(db);
      });
  }, [marcos, iniciativa.id]);

  const minhasAcoes = useMemo(
    () => acoes.filter(a => a.iniciativa_id === iniciativa.id),
    [acoes, iniciativa.id],
  );

  const riscosCobertos = useMemo(
    () => riscosPorIniciativa(iniciativa.id, acoes, riscos),
    [iniciativa.id, acoes, riscos],
  );

  const jaCobertos = useMemo(() => new Set(riscosCobertos.map(r => r.id)), [riscosCobertos]);

  const prazo = useMemo(() => marcosNoPrazo(meusMarcos, hoje), [meusMarcos, hoje]);
  const slip = useMemo(() => slipMedio(meusMarcos), [meusMarcos]);
  const prioriz = computePrioriz(iniciativa);
  const pessoaPorId = useMemo(() => new Map(pessoas.map(p => [p.id, p.nome])), [pessoas]);

  // Origem é histórico e cobertura é presente. Quando as duas discordam, a tela
  // diz as duas coisas — é o caso que prova que os eixos não se derivam.
  const nasceuDeRisco = iniciativa.fonte === 'risco';
  const cobreSemSerDeRisco = !nasceuDeRisco && riscosCobertos.length > 0;

  async function salvarMarco(dados: Record<string, unknown>) {
    return pf.createEntidade('marcos', dados);
  }

  async function editarMarco(id: string, dados: Record<string, unknown>) {
    return pf.patchEntidade('marcos', id, dados);
  }

  async function excluirMarco(m: Marco) {
    if (!window.confirm(`Excluir o marco "${m.nome}"?`)) return;
    const ok = await pf.deleteEntidade('marcos', m.id);
    if (ok) setMarcoEditando(null);
  }

  async function anexarAcao(acaoId: string) {
    return pf.patchEntidade('acoes-risco', acaoId, { iniciativa_id: iniciativa.id });
  }

  async function criarAcaoVinculada(riscoId: string, descricao: string) {
    return pf.createEntidade('acoes-risco', {
      risco_id: riscoId,
      iniciativa_id: iniciativa.id,
      descricao,
      status: 'aberta',
      // Nasce classificada: veio de uma decisão explícita, não da fila da migração.
      triagem: 'iniciativa',
    });
  }

  async function soltarAcao(a: AcaoRisco) {
    if (!window.confirm(
      'Desvincular esta ação da iniciativa? Ela volta a ser uma mitigação autônoma do risco.',
    )) return;
    await pf.patchEntidade('acoes-risco', a.id, { iniciativa_id: null });
  }

  return (
    <div className="card-col" style={{ gap: 'var(--sp-3)' }}>
      <div className="card">
        <div className="section-header-row">
          <div style={{ minWidth: 0 }}>
            <div className="ini-meta" style={{ marginTop: 0 }}>
              <span className="badge" data-badge={BADGE_STATUS_INICIATIVA[iniciativa.status]}>
                {ROTULO_STATUS_INICIATIVA[iniciativa.status]}
              </span>
              <span>{objetivo?.descricao ?? 'Sem objetivo'}</span>
              <span>·</span>
              <span>{iniciativa.dono_id ? pessoaPorId.get(iniciativa.dono_id) ?? 'Dono removido' : 'Sem dono'}</span>
              {iniciativa.recurso && <><span>·</span><span>{iniciativa.recurso}</span></>}
            </div>
            <div className="ini-hero-titulo">{iniciativa.nome || 'Iniciativa sem nome'}</div>
            {iniciativa.descricao && (
              <div className="bento-sub" style={{ maxWidth: '70ch' }}>{iniciativa.descricao}</div>
            )}
          </div>
          <div className="actions-row">
            <button className="btn btn-ghost" onClick={onEditar}>Editar</button>
            <button className="btn btn-navy" onClick={() => setCriandoMarco(true)}>+ Marco</button>
          </div>
        </div>

        <div className="stat-grid" style={{ marginTop: 'var(--sp-4)' }}>
          <div className="stat" data-tier={priorizTier(prioriz)} data-destaque={prioriz != null}>
            <div className="stat-label">Priorização</div>
            <div className="stat-valor tabular">
              {prioriz == null ? '—' : String(round2(prioriz)).replace('.', ',')}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Impacto</div>
            <div className="stat-valor tabular" title={formatarMoedaCheia(iniciativa.impacto_rs)}>
              {formatarMoeda(iniciativa.impacto_rs)}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Esforço</div>
            <div className="stat-valor tabular">
              {iniciativa.esforco_dias == null ? '—' : `${formatarNumero(iniciativa.esforco_dias)} d`}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Marcos no prazo</div>
            <div className="stat-valor tabular">
              {prazo.pct == null ? '—' : formatarPct(prazo.pct)}
            </div>
          </div>
        </div>

        {iniciativa.impacto_rs != null && iniciativa.confianca_impacto && (
          <div className="bento-sub">
            Confiança no impacto: {ROTULO_CONFIANCA[iniciativa.confianca_impacto].toLowerCase()}.
          </div>
        )}
      </div>

      {/* ---- Origem × cobertura: dois fatos, nunca um derivado do outro ---- */}

      <div className="card">
        <div className="section-header-row">
          <div>
            <div className="section-title">Origem e cobertura</div>
            <div className="bento-sub">
              {cobreSemSerDeRisco
                ? `Nasceu de ${ROTULO_FONTE[iniciativa.fonte].toLowerCase()} · cobre ${plural(riscosCobertos.length, 'risco', 'riscos')}. `
                  + 'Uma coisa não vira a outra: a origem é histórico e não muda.'
                : 'Por que ela nasceu, e quais riscos ela trata hoje. São perguntas diferentes.'}
            </div>
          </div>
          <button className="btn btn-outline-navy" onClick={() => setVinculando(true)}>
            + Vincular risco
          </button>
        </div>

        <div className="fato-par">
          <div className="fato">
            <div className="fato-label">Nasceu de</div>
            <div className="fato-valor">
              <span className="serie-dot" data-serie={nasceuDeRisco ? 'risco' : 'oportunidade'} aria-hidden="true" />
              <span style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-semibold)', color: 'var(--ink-1)' }}>
                {ROTULO_FONTE[iniciativa.fonte]}
              </span>
            </div>
            <div className="bento-sub">Um valor, histórico. Não muda com o tempo.</div>
          </div>
          <div className="fato">
            <div className="fato-label">Vetor</div>
            <div className="fato-valor">
              <span className="serie-dot" data-serie={iniciativa.vetor || 'null'} aria-hidden="true" />
              <span style={{ fontSize: 'var(--fs-md)', fontWeight: 'var(--fw-semibold)', color: 'var(--ink-1)' }}>
                {ROTULO_VETOR[iniciativa.vetor]}
              </span>
            </div>
            <div className="bento-sub">O que faz com o valor. Independe da origem.</div>
          </div>
        </div>

        <div className="fato-label" style={{ marginTop: 'var(--sp-4)' }}>
          Riscos que esta iniciativa trata hoje · {riscosCobertos.length}
        </div>
        {riscosCobertos.length === 0 ? (
          <div className="bento-sub">
            Nenhum risco vinculado. Isso é normal numa iniciativa de oportunidade — e pode
            mudar sem que a origem mude.
          </div>
        ) : (
          <div className="lista-linhas">
            {riscosCobertos.map(r => {
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
                  <span className="lista-nota">{r.area}</span>
                  <span className="tier-chip" data-tier={scoreTier(score)}>
                    <span className="tier-dot" aria-hidden="true" />
                    {score == null ? 'sem score' : String(score).replace('.', ',')}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ---- Trilha de marcos ---- */}

      <div className="card">
        <div className="section-header-row">
          <div>
            <div className="section-title">Marcos</div>
            <div className="bento-sub">
              {meusMarcos.length === 0
                ? 'Sem marco, o status não passa de backlog — é a regra que impede iniciativa aprovada sem entrega verificável.'
                : slip.replanejados > 0
                  ? `${plural(slip.replanejados, 'marco replanejado', 'marcos replanejados')} · +${formatarNumero(slip.diasMedioDosReplanejados, 0)} dias em média contra o plano original.`
                  : 'Nenhuma data escorregou desde o plano original.'}
            </div>
          </div>
        </div>

        <TrilhaMarcos marcos={meusMarcos} hoje={hoje} />
        {meusMarcos.length > 0 && <LegendaTrilha />}

        {meusMarcos.length > 0 && (
          <table className="marcos-tabela">
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th>Marco</th>
                <th>Plano original</th>
                <th>Plano atual</th>
                <th>Entrega</th>
                <th>Status</th>
                <th style={{ width: 72 }} />
              </tr>
            </thead>
            <tbody>
              {meusMarcos.map((m, idx) => {
                const estado = estadoDoMarco(m, hojeStr);
                const moveu = m.data_plano_original
                  && m.data_plano_atual
                  && m.data_plano_original !== m.data_plano_atual;
                return (
                  <tr key={m.id}>
                    <td>
                      <span className="marco-num" data-estado={estado}>{idx + 1}</span>
                    </td>
                    <td>
                      <div style={{ color: 'var(--ink-1)', fontWeight: 'var(--fw-medium)' }}>
                        {m.nome || 'Marco sem nome'}
                      </div>
                      {m.criterio_aceite && <div className="lista-nota">{m.criterio_aceite}</div>}
                      {m.motivo_replanejamento && (
                        <div className="lista-nota">Replanejado: {m.motivo_replanejamento}</div>
                      )}
                      {m.obs && <div className="lista-nota">Obs.: {m.obs}</div>}
                    </td>
                    <td className={`num${moveu ? ' data-riscada' : ''}`} data-rotulo="Plano original">
                      {formatarData(m.data_plano_original)}
                    </td>
                    <td className="num" data-rotulo="Plano atual">{formatarData(m.data_plano_atual)}</td>
                    <td className="num" data-rotulo="Entrega">{formatarData(m.data_real)}</td>
                    <td data-rotulo="Status">
                      <span className="badge" data-badge={
                        estado === 'entregue' ? 'green'
                          : estado === 'atrasado' ? 'red'
                            : estado === 'cancelado' ? 'slate' : 'blue'
                      }>
                        {estado === 'atrasado' ? 'Vencido' : ROTULO_STATUS_MARCO[m.status]}
                      </span>
                    </td>
                    <td>
                      <button className="link-ini" onClick={() => setMarcoEditando(m)}>Editar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ---- Ações vinculadas ---- */}

      {minhasAcoes.length > 0 && (
        <div className="card">
          <div className="section-title">Mitigações executadas aqui dentro</div>
          <div className="bento-sub">
            Cada uma sai de um registro de risco. Enquanto esta iniciativa não concluir, o
            risco de origem continua contando como em tratamento — mesmo que a ação esteja marcada.
          </div>
          <div className="rastro-grid">
            {minhasAcoes.map(a => {
              const risco = a.risco_id ? riscos.find(r => r.id === a.risco_id) : undefined;
              return (
                <div className="mitigacao-card" data-de-origem="true" key={a.id}>
                  {risco && (
                    <button
                      className="link-ini"
                      onClick={() => onAbrirRisco(risco.id)}
                      title={nomeRisco(risco)}
                      style={{ display: 'block', marginBottom: 'var(--sp-2)' }}
                    >
                      {nomeRisco(risco)}
                    </button>
                  )}
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-1)', lineHeight: 1.45 }}>
                    {a.descricao}
                  </div>
                  <div className="ini-meta">
                    <span className="badge" data-badge={BADGE_STATUS_ACAO[a.status]}>
                      {ROTULO_STATUS_ACAO[a.status]}
                    </span>
                    {a.prazo && <span className="tabular">{formatarData(a.prazo)}</span>}
                    <button className="link-ini" onClick={() => { void soltarAcao(a); }}>
                      Desvincular
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- Histórico ---- */}

      <div className="card">
        <div className="section-title">Histórico</div>
        <div className="bento-sub">
          Quem mudou status, dono, objetivo, prazo ou impacto — e quando. Marcos e
          ações têm trilha própria, sob o registro de cada um.
        </div>
        <Historico
          registroId={iniciativa.id}
          chaveDeAtualizacao={iniciativa.version}
          vazio="Nada mudou nesta iniciativa desde que o histórico passou a existir."
        />
      </div>

      {(criandoMarco || marcoEditando) && (
        <MarcoModal
          key={marcoEditando?.id ?? 'novo'}
          marco={marcoEditando ?? undefined}
          iniciativaId={iniciativa.id}
          iniciativaNome={iniciativa.nome || 'Iniciativa sem nome'}
          onSalvar={dados => (marcoEditando
            ? editarMarco(marcoEditando.id, dados)
            : salvarMarco(dados))}
          onExcluir={marcoEditando ? () => { void excluirMarco(marcoEditando); } : undefined}
          onClose={() => { setCriandoMarco(false); setMarcoEditando(null); }}
        />
      )}

      {vinculando && (
        <VincularRiscoModal
          iniciativaNome={iniciativa.nome || 'Iniciativa sem nome'}
          riscos={riscos}
          acoes={acoes}
          jaCobertos={jaCobertos}
          onAnexar={anexarAcao}
          onCriar={criarAcaoVinculada}
          onClose={() => setVinculando(false)}
        />
      )}
    </div>
  );
}
