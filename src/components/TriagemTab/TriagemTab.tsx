import { useMemo, useState } from 'react';
import type { AcaoRisco, DestinoTriagem, StoredRiskRecord } from '../../types';
import type { UsePortfolio } from '../../hooks/usePortfolio';
import { sugerirDestino, ROTULO_DESTINO, type DestinoSugerido } from '../../lib/triagem';
import { EmptyState } from '../common/EmptyState';

interface TriagemTabProps {
  records: StoredRiskRecord[];
  /**
   * O hook vive no `App`, não aqui: ele decide se esta aba aparece, e duas
   * instâncias do mesmo estado dariam duas verdades sobre a mesma fila.
   */
  pf: UsePortfolio;
}

const DESTINOS: DestinoSugerido[] = ['acao', 'iniciativa', 'rotina'];

/** Cor do destino: categórica, não ordinal — nenhum destino é "pior". */
const BADGE_DESTINO: Record<DestinoSugerido, string> = {
  acao: 'slate',
  iniciativa: 'blue',
  rotina: 'purple',
};

const STATUS_ROTULO: Record<string, string> = {
  aberta: 'A fazer',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

function formatarData(iso: string | null): string {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return d ? `${d}/${m}/${a.slice(2)}` : iso;
}

/**
 * Tela de triagem da migração: uma linha por ação extraída, com destino
 * sugerido e a decisão do gestor. Aparece só enquanto houver o que classificar
 * — quando a fila esvazia, some do menu.
 */
export function TriagemTab({ records, pf }: TriagemTabProps) {
  const { portfolio, loading, error, clearError, patchEntidade, migrarAcoes, promoverTriagem } = pf;
  const [migrando, setMigrando] = useState(false);
  const [promovendo, setPromovendo] = useState(false);
  const [resumoMigracao, setResumoMigracao] = useState<string | null>(null);
  const [resumoPromocao, setResumoPromocao] = useState<string | null>(null);
  const [mostrarDecididas, setMostrarDecididas] = useState(false);

  const riscoPorId = useMemo(() => new Map(records.map(r => [r.id, r])), [records]);
  const pessoaPorId = useMemo(
    () => new Map(portfolio.pessoas.map(p => [p.id, p.nome])),
    [portfolio.pessoas],
  );

  // A sugestão lê o risco de origem: esforço e recurso vivem lá, não na ação.
  const linhas = useMemo(() => portfolio.acoes_risco.map(acao => {
    const risco = acao.risco_id ? riscoPorId.get(acao.risco_id) : undefined;
    return {
      acao,
      risco,
      sugestao: sugerirDestino({
        descricao: acao.descricao,
        esforco: risco?.esforco ?? null,
        recurso: risco?.recurso ?? '',
      }),
    };
  }), [portfolio.acoes_risco, riscoPorId]);

  const pendentes = useMemo(() => linhas.filter(l => !l.acao.triagem), [linhas]);
  const decididas = useMemo(() => linhas.filter(l => l.acao.triagem), [linhas]);

  const paraPromover = useMemo(
    () => portfolio.acoes_risco.filter(a => a.triagem === 'iniciativa' && !a.iniciativa_id).length,
    [portfolio.acoes_risco],
  );
  const jaPromovidas = useMemo(
    () => portfolio.acoes_risco.filter(a => a.triagem === 'iniciativa' && a.iniciativa_id).length,
    [portfolio.acoes_risco],
  );

  const contagem = useMemo(() => {
    const c: Record<DestinoSugerido, number> = { acao: 0, iniciativa: 0, rotina: 0 };
    decididas.forEach(l => {
      const d = l.acao.triagem as DestinoSugerido;
      if (d in c) c[d]++;
    });
    return c;
  }, [decididas]);

  async function handleMigrar() {
    setMigrando(true);
    const r = await migrarAcoes();
    setMigrando(false);
    if (!r) return;
    const partes = [
      `${r.acoesCriadas} ${r.acoesCriadas === 1 ? 'ação extraída' : 'ações extraídas'} de ${r.riscosComPlano} riscos`,
    ];
    if (r.acoesJaExistiam > 0) partes.push(`${r.acoesJaExistiam} já estavam extraídas`);
    if (r.pessoasCriadas > 0) partes.push(`${r.pessoasCriadas} pessoas cadastradas`);
    setResumoMigracao(`${partes.join(' · ')}. Nenhum registro de risco foi alterado.`);
  }

  function decidir(acao: AcaoRisco, destino: DestinoTriagem) {
    void patchEntidade('acoes-risco', acao.id, { triagem: destino });
  }

  async function handlePromover() {
    setPromovendo(true);
    const r = await promoverTriagem();
    setPromovendo(false);
    if (!r) return;
    if (r.iniciativasCriadas === 0) {
      setResumoPromocao(r.jaPromovidas > 0
        ? `Nada novo para promover — as ${r.jaPromovidas} já viraram iniciativa.`
        : 'Nenhuma ação marcada como iniciativa ainda.');
      return;
    }
    const partes = [
      `${r.iniciativasCriadas} ${r.iniciativasCriadas === 1 ? 'iniciativa criada' : 'iniciativas criadas'} sob "A CLASSIFICAR"`,
    ];
    if (r.comStatusHerdadoEmObs > 0) {
      partes.push(r.comStatusHerdadoEmObs === 1
        ? 'Uma delas veio de uma ação já em andamento e nasceu em "backlog" — cadastre os marcos antes de mover o status'
        : `${r.comStatusHerdadoEmObs} vieram de ações já em andamento e nasceram em "backlog" — cadastre os marcos antes de mover o status`);
    }
    if (r.semRiscoDeOrigem > 0) {
      partes.push(r.semRiscoDeOrigem === 1
        ? 'Uma foi pulada por não ter risco de origem'
        : `${r.semRiscoDeOrigem} foram puladas por não terem risco de origem`);
    }
    setResumoPromocao(`${partes.join('. ')}.`);
  }

  if (loading && portfolio.acoes_risco.length === 0) {
    return (
      <div className="tab-page">
        <div className="app-loading" role="status" aria-label="Carregando a triagem…">
          <div className="skeleton-table">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton-row" />)}
          </div>
        </div>
      </div>
    );
  }

  const listaVisivel = mostrarDecididas ? decididas : pendentes;

  return (
    <div className="tab-page">
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button className="error-banner-dismiss" onClick={clearError} aria-label="Fechar aviso">×</button>
        </div>
      )}

      <div className="section-header-row" style={{ marginBottom: 'var(--sp-4)' }}>
        <div>
          <div className="section-title">Triagem do plano de ação</div>
          <div className="section-subtitle">
            Cada ação que estava dentro de um risco precisa de um destino. Nada foi apagado —
            o plano continua no registro até você validar tudo.
          </div>
        </div>
      </div>

      {portfolio.acoes_risco.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="↓"
            message="Os planos de ação ainda estão dentro dos registros de risco"
            hint="A extração só insere linhas novas: os campos Ações e Resultado Esperado de cada risco ficam exatamente como estão."
            action={{
              label: migrando ? 'Extraindo…' : 'Extrair planos de ação',
              onClick: () => { void handleMigrar(); },
            }}
          />
        </div>
      ) : (
        <>
          <div className="triagem-resumo" style={{ marginBottom: 'var(--sp-4)' }}>
            <div className="kpi-card" data-accent={pendentes.length > 0 ? 'alto' : 'baixo'}>
              <div className="kpi-body">
                <div className="kpi-label">Na fila</div>
                <div className="kpi-value tabular">{pendentes.length}</div>
              </div>
            </div>
            {DESTINOS.map(d => (
              <div className="kpi-card" data-accent="brand" key={d}>
                <div className="kpi-body">
                  <div className="kpi-label">{ROTULO_DESTINO[d]}</div>
                  <div className="kpi-value tabular">{contagem[d]}</div>
                </div>
              </div>
            ))}
          </div>

          {resumoMigracao && (
            <div className="card" style={{ marginBottom: 'var(--sp-4)' }}>
              <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-2)' }}>{resumoMigracao}</div>
            </div>
          )}

          {(paraPromover > 0 || jaPromovidas > 0 || resumoPromocao) && (
            <div className="card triagem-promover" style={{ marginBottom: 'var(--sp-4)' }}>
              <div className="section-header-row">
                <div>
                  <div className="section-title">
                    {paraPromover > 0
                      ? `${paraPromover} ${paraPromover === 1 ? 'ação pronta' : 'ações prontas'} para virar iniciativa`
                      : 'Nada esperando promoção'}
                  </div>
                  <div className="section-subtitle" style={{ marginBottom: 0 }}>
                    Cada uma vira uma iniciativa sob <strong>A CLASSIFICAR</strong>, herdando esforço,
                    impacto, gravidade, recurso e dono do risco de origem. Nasce em <strong>backlog</strong> —
                    sem marco não se declara execução.
                    {jaPromovidas > 0 && ` ${jaPromovidas} já foram promovidas.`}
                  </div>
                </div>
                <button
                  className="btn btn-navy"
                  onClick={() => { void handlePromover(); }}
                  disabled={promovendo || paraPromover === 0}
                >
                  {promovendo ? 'Promovendo…' : 'Promover a iniciativas'}
                </button>
              </div>
              {resumoPromocao && (
                <div style={{
                  marginTop: 'var(--sp-3)', paddingTop: 'var(--sp-3)',
                  borderTop: '1px solid var(--line-hairline)',
                  fontSize: 'var(--fs-sm)', color: 'var(--ink-2)', lineHeight: 1.55,
                }}>
                  {resumoPromocao}
                </div>
              )}
            </div>
          )}

          <div className="filter-pills" style={{ marginBottom: 'var(--sp-3)' }}>
            <button
              className={`filter-pill${mostrarDecididas ? '' : ' active'}`}
              onClick={() => setMostrarDecididas(false)}
            >
              Na fila · {pendentes.length}
            </button>
            <button
              className={`filter-pill${mostrarDecididas ? ' active' : ''}`}
              onClick={() => setMostrarDecididas(true)}
            >
              Já classificadas · {decididas.length}
            </button>
            <button
              className="btn btn-ghost"
              style={{ marginLeft: 'auto' }}
              onClick={() => { void handleMigrar(); }}
              disabled={migrando}
              title="Procura planos de ação que ainda não foram extraídos. Não duplica o que já veio."
            >
              {migrando ? 'Procurando…' : 'Procurar novos planos'}
            </button>
          </div>

          {listaVisivel.length === 0 ? (
            <div className="card">
              <EmptyState
                icon="✓"
                message={mostrarDecididas ? 'Nada classificado ainda' : 'Fila vazia — tudo classificado'}
                hint={mostrarDecididas
                  ? 'Classifique alguma ação na fila para ela aparecer aqui.'
                  : 'As ações marcadas como iniciativa serão promovidas na próxima etapa.'}
              />
            </div>
          ) : (
            <div>
              {listaVisivel.map(({ acao, risco, sugestao }) => {
                const decidida = Boolean(acao.triagem);
                const dono = acao.dono_id ? pessoaPorId.get(acao.dono_id) : '';
                return (
                  <div className="triagem-item" key={acao.id} data-decidida={decidida}>
                    <div className="triagem-corpo">
                      <div className="triagem-origem">
                        <span>{risco?.area || 'Área não informada'}</span>
                        {risco?.categoria && <><span>·</span><span>{risco.categoria}</span></>}
                        {risco?.recurso && <><span>·</span><span>{risco.recurso}</span></>}
                        {risco?.esforco != null && (
                          <><span>·</span><span className="tabular">esforço {String(risco.esforco).replace('.', ',')}</span></>
                        )}
                      </div>

                      <div className="triagem-risco">
                        {risco?.risco || 'Risco de origem não encontrado'}
                      </div>

                      <div className="triagem-acao">{acao.descricao}</div>

                      <div className="triagem-meta">
                        {dono && <span>{dono}</span>}
                        {dono && acao.prazo && <span>·</span>}
                        {acao.prazo && <span className="tabular">{formatarData(acao.prazo)}</span>}
                        {(dono || acao.prazo) && <span>·</span>}
                        <span className="badge" data-badge={acao.status === 'concluida' ? 'green' : acao.status === 'em_andamento' ? 'amber' : 'slate'}>
                          {STATUS_ROTULO[acao.status] ?? 'A fazer'}
                        </span>
                      </div>
                    </div>

                    <div className="triagem-decisao">
                      {decidida ? (
                        <>
                          <div className="triagem-decidida">
                            <span className="badge" data-badge={BADGE_DESTINO[acao.triagem as DestinoSugerido]}>
                              {ROTULO_DESTINO[acao.triagem as DestinoSugerido]}
                            </span>
                            {acao.triagem === 'iniciativa' && (
                              <span className="badge" data-badge={acao.iniciativa_id ? 'green' : 'amber'}>
                                {acao.iniciativa_id ? 'Promovida' : 'Aguardando promoção'}
                              </span>
                            )}
                          </div>
                          <button
                            className="btn btn-ghost"
                            onClick={() => decidir(acao, '')}
                            disabled={Boolean(acao.iniciativa_id)}
                            title={acao.iniciativa_id
                              ? 'Já virou iniciativa. Para desfazer, exclua a iniciativa — a ação volta a ser autônoma.'
                              : undefined}
                          >
                            Devolver para a fila
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="triagem-sugestao">
                            <div className="triagem-sugestao-label">
                              Sugestão{sugestao.confiante ? '' : ' fraca'}: {ROTULO_DESTINO[sugestao.destino]}
                            </div>
                            <div className="triagem-motivo">{sugestao.motivo}</div>
                          </div>
                          <div className="triagem-botoes">
                            {DESTINOS.map(d => (
                              <button
                                key={d}
                                className="btn btn-outline-navy"
                                data-sugerido={d === sugestao.destino}
                                onClick={() => decidir(acao, d)}
                              >
                                {ROTULO_DESTINO[d]}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{
            marginTop: 'var(--sp-4)', fontSize: 'var(--fs-xs)', color: 'var(--ink-4)', lineHeight: 1.6,
          }}>
            <strong style={{ color: 'var(--ink-3)', fontWeight: 'var(--fw-semibold)' }}>Rotina</strong> apenas
            sinaliza que a ação é um controle contínuo — nada é criado na aba Tarefas automaticamente.
          </div>
        </>
      )}
    </div>
  );
}
