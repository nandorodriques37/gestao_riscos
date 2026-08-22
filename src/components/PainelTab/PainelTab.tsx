import { useMemo, useState } from 'react';
import type { StoredRiskRecord, Tab } from '../../types';
import { FONTES_INICIATIVA, VETORES } from '../../types';
import type { UsePortfolio } from '../../hooks/usePortfolio';
import {
  impactoComprometido, marcosNoPrazo, slipMedio, wipPorDono, cargaPorPessoa,
  zumbis, coberturaObjetivos, mixPorVetor, portfolioPorOrigem, fonteVsVetor,
  tratamentoDosRiscos, prontosParaFechar, riscosMitigados, exposicaoResidual,
  hojeISO, periodoDe, LIMITE_WIP, DIAS_PARA_ZUMBI, LIMITE_DEFENSIVO,
  type EstadoTratamento,
} from '../../lib/portfolioMetrics';
import {
  ROTULO_VETOR, ROTULO_FONTE, formatarMoeda, formatarMoedaCheia,
  formatarNumero, formatarPct, plural,
} from '../../lib/portfolioLabels';
import { OBJETIVO_BALDE } from '../../lib/portfolioUi';
import { baixarPortfolioCSV, baixarBackup } from '../../lib/portfolioCsv';
import { EmptyState } from '../common/EmptyState';

interface PainelTabProps {
  records: StoredRiskRecord[];
  pf: UsePortfolio;
  onIrPara: (tab: Tab) => void;
  onAbrirIniciativa: (id: string) => void;
}

/** Rótulo e ordem dos estados de tratamento. A ordem é a da leitura, não do enum. */
const ESTADOS: { estado: EstadoTratamento; label: string }[] = [
  { estado: 'tratamento_concluido', label: 'Tratamento entregue' },
  { estado: 'em_tratamento', label: 'Em tratamento' },
  { estado: 'aceito', label: 'Aceito' },
  { estado: 'sem_tratamento', label: 'Sem tratamento' },
];

/** Série de cor do estado no gráfico empilhado — casa com `portfolio.css`. */
const SERIE_ESTADO: Record<EstadoTratamento, string> = {
  tratamento_concluido: 'mitigado',
  em_tratamento: 'em_tratamento',
  aceito: 'aceito',
  sem_tratamento: 'sem_tratamento',
};

interface Fatia { chave: string; serie: string; label: string; valor: number; nota?: string }

/**
 * Barra empilhada + legenda. A legenda é obrigatória e sempre carrega o número
 * junto da cor: a escada de tiers não passa nos limites de daltonismo por
 * matiz, então cor sozinha nunca identifica nada aqui.
 */
function Composicao({ fatias, vazio }: { fatias: Fatia[]; vazio: string }) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  if (total === 0) return <div className="bento-sub">{vazio}</div>;

  return (
    <>
      <div className="stack-bar" role="img" aria-label={fatias.map(f => `${f.label}: ${f.valor}`).join(', ')}>
        {fatias.filter(f => f.valor > 0).map(f => (
          <div
            key={f.chave}
            className="stack-seg"
            data-serie={f.serie}
            style={{ flex: `${f.valor} 0 0` }}
          />
        ))}
      </div>
      <div className="lista-linhas">
        {fatias.map(f => (
          <div className="lista-linha" key={f.chave}>
            <span className="serie-dot" data-serie={f.serie} aria-hidden="true" />
            <span className="lista-texto">{f.label}</span>
            {f.nota && <span className="lista-nota">{f.nota}</span>}
            <span className="lista-nota tabular" style={{ color: 'var(--ink-1)', fontWeight: 'var(--fw-semibold)' }}>
              {f.valor}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Painel de direção. Cada tile responde a uma pergunta que muda uma decisão;
 * nenhum é decorativo. O tamanho do tile é a prioridade do dado.
 */
export function PainelTab({ records, pf, onIrPara, onAbrirIniciativa }: PainelTabProps) {
  const { portfolio, loading } = pf;
  const { objetivos, iniciativas, marcos, acoes_risco, pessoas } = portfolio;
  const [baixando, setBaixando] = useState(false);
  const [erroBackup, setErroBackup] = useState<string | null>(null);

  async function handleBackup() {
    setBaixando(true);
    setErroBackup(null);
    try {
      await baixarBackup();
    } catch (e) {
      setErroBackup(e instanceof Error ? e.message : 'Falha ao gerar o backup.');
    } finally {
      setBaixando(false);
    }
  }

  const hoje = useMemo(() => new Date(), []);
  const hojeStr = hojeISO(hoje);
  const ano = Number(hojeStr.slice(0, 4));

  const impacto = useMemo(() => impactoComprometido(iniciativas, objetivos), [iniciativas, objetivos]);
  const prazo = useMemo(() => marcosNoPrazo(marcos, hoje), [marcos, hoje]);
  const slip = useMemo(() => slipMedio(marcos), [marcos]);
  const wip = useMemo(() => wipPorDono(iniciativas, pessoas), [iniciativas, pessoas]);
  const carga = useMemo(
    () => cargaPorPessoa(iniciativas, pessoas, periodoDe(hojeStr)),
    [iniciativas, pessoas, hojeStr],
  );
  const parados = useMemo(() => zumbis(iniciativas, marcos, hoje), [iniciativas, marcos, hoje]);
  const cobertura = useMemo(() => coberturaObjetivos(objetivos, iniciativas), [objetivos, iniciativas]);
  const mix = useMemo(() => mixPorVetor(iniciativas), [iniciativas]);
  const origem = useMemo(() => portfolioPorOrigem(iniciativas), [iniciativas]);
  const matriz = useMemo(() => fonteVsVetor(iniciativas), [iniciativas]);

  // Só as combinações que existem, na ordem em que a matriz será lida. Uma
  // grade 4×3 fixa mostraria nove células vazias e esconderia as três cheias.
  const fontesUsadas = useMemo(
    () => FONTES_INICIATIVA.filter(f => matriz.some(c => c.fonte === f && c.iniciativas > 0)),
    [matriz],
  );
  const vetoresUsados = useMemo(
    () => VETORES.filter(v => matriz.some(c => c.vetor === v && c.iniciativas > 0)),
    [matriz],
  );
  const celula = (f: string, v: string) =>
    matriz.find(c => c.fonte === f && c.vetor === v)?.iniciativas ?? 0;
  // Prova visual: mais de uma origem cruzando mais de um vetor.
  const eixosIndependentes = fontesUsadas.length > 1 && vetoresUsados.length > 1;

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

  const porEstado = useMemo(() => {
    const c = new Map<EstadoTratamento, number>();
    tratamento.forEach(t => c.set(t.estado, (c.get(t.estado) ?? 0) + 1));
    return c;
  }, [tratamento]);

  // O balde da migração é objetivo de verdade no banco, e a métrica pura está
  // certa em contá-lo como órfão. Mas ele é temporário, então a tela o separa
  // em vez de a métrica ganhar um caso especial com nome mágico dentro.
  const orfaosReais = cobertura.orfaos.filter(o => o.descricao !== OBJETIVO_BALDE);
  const baldeOrfao = cobertura.orfaos.length - orfaosReais.length > 0;

  const maiorWip = wip[0];
  const sobrecarregados = wip.filter(w => w.acimaDoLimite).length;

  if (loading && iniciativas.length === 0 && objetivos.length === 0) {
    return (
      <div className="tab-page-lg">
        <div className="app-loading" role="status" aria-label="Carregando o painel…">
          <div className="skeleton-kpis">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton-kpi" />)}
          </div>
        </div>
      </div>
    );
  }

  if (iniciativas.length === 0 && objetivos.length === 0) {
    return (
      <div className="tab-page-lg">
        <div className="page-bar">
          <div>
            <div className="page-title">Painel</div>
            <div className="page-subtitle">O portfólio ainda não tem nada para medir</div>
          </div>
        </div>
        <div className="card">
          <EmptyState
            icon="◇"
            message="Nenhum objetivo e nenhuma iniciativa cadastrados"
            hint="O painel lê objetivos, iniciativas e marcos. Comece cadastrando um objetivo — ou extraia os planos de ação dos riscos pela Triagem."
            action={{ label: 'Ir para Objetivos', onClick: () => onIrPara('objetivos') }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="tab-page-lg">
      <div className="page-bar">
        <div>
          <div className="page-title">Painel</div>
          <div className="page-subtitle">
            {plural(iniciativas.length, 'iniciativa', 'iniciativas')} ·{' '}
            {plural(objetivos.length, 'objetivo', 'objetivos')} ·{' '}
            {plural(records.length, 'risco', 'riscos')}
          </div>
        </div>
        <div className="actions-row sem-impressao">
          <button
            className="btn btn-ghost"
            onClick={() => window.print()}
            title="Imprime este painel em uma folha, sem menu e sem botões."
          >
            Imprimir
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => baixarPortfolioCSV({
              iniciativas, objetivos, pessoas, marcos, acoes: acoes_risco,
            })}
            disabled={iniciativas.length === 0}
            title="Uma linha por iniciativa, com objetivo, marcos e riscos cobertos."
          >
            ↓ CSV do portfólio
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => { void handleBackup(); }}
            disabled={baixando}
            title="Dump completo: riscos, tarefas e todas as tabelas do portfólio."
          >
            {baixando ? 'Gerando…' : '↓ Backup'}
          </button>
        </div>
      </div>

      {erroBackup && (
        <div className="error-banner sem-impressao">
          <span>{erroBackup}</span>
          <button className="error-banner-dismiss" onClick={() => setErroBackup(null)} aria-label="Fechar aviso">×</button>
        </div>
      )}

      <div className="bento">
        {/* ---- Linha 1: os quatro números que abrem a conversa ---- */}

        <div className="card" data-span="3">
          <div className="kpi-label">Impacto comprometido</div>
          <div className="bento-valor" title={formatarMoedaCheia(impacto.total)}>
            {formatarMoeda(impacto.total)}
          </div>
          <div className="bento-sub">
            {plural(iniciativas.filter(i => ['aprovada', 'em_execucao', 'pausada'].includes(i.status)).length,
              'iniciativa ativa', 'iniciativas ativas')}
          </div>
          {impacto.semValor > 0 && (
            <div className="bento-lacuna">
              <span aria-hidden="true">▲</span>
              {plural(impacto.semValor, 'iniciativa ativa sem valor', 'iniciativas ativas sem valor')} — o total é piso
            </div>
          )}
        </div>

        <div className="card" data-span="3">
          <div className="kpi-label">Marcos no prazo</div>
          <div className="bento-valor">
            {prazo.pct == null ? '—' : formatarPct(prazo.pct)}
          </div>
          <div className="bento-sub">
            {prazo.pct == null
              ? 'Nenhum marco venceu ainda'
              : `${prazo.noPrazo} de ${prazo.total} medidos contra a data original`}
          </div>
          {slip.replanejados > 0 && (
            <div className="bento-sub">
              {plural(slip.replanejados, 'marco replanejado', 'marcos replanejados')} ·
              {' '}+{formatarNumero(slip.diasMedioDosReplanejados, 0)} dias em média
            </div>
          )}
        </div>

        <div className="card" data-span="3">
          <div className="kpi-label">Maior WIP por dono</div>
          <div className="bento-valor">{maiorWip ? maiorWip.wip : '0'}</div>
          <div className="bento-sub">
            {maiorWip ? maiorWip.nome : 'Ninguém com iniciativa em execução'}
          </div>
          {sobrecarregados > 0 && (
            <div className="bento-lacuna">
              <span aria-hidden="true">▲</span>
              {plural(sobrecarregados, 'pessoa acima', 'pessoas acima')} de {LIMITE_WIP} em execução
            </div>
          )}
        </div>

        <div className="card" data-span="3">
          <div className="kpi-label">Iniciativas paradas</div>
          <div className="bento-valor">{parados.length}</div>
          <div className="bento-sub">
            Em execução sem marco movimentado há mais de {DIAS_PARA_ZUMBI} dias
          </div>
        </div>

        {/* ---- Mix e cobertura de objetivo ---- */}

        <div className="card" data-span="6">
          <div className="section-title">O portfólio cria valor ou só defende?</div>
          <div className="bento-sub">
            Vetor das iniciativas ativas, por contagem. Independe da origem: uma iniciativa
            que nasceu de gap de KPI pode perfeitamente evitar perda.
          </div>
          <Composicao
            vazio="Nenhuma iniciativa ativa para classificar."
            fatias={mix.fatias.map(f => ({
              chave: f.vetor,
              serie: f.vetor || 'null',
              label: ROTULO_VETOR[f.vetor],
              valor: f.iniciativas,
              nota: f.impacto > 0 ? formatarMoeda(f.impacto) : undefined,
            }))}
          />
          {mix.soDefensivo && (
            <div className="form-aviso">
              {formatarPct(mix.defensivoPct)} do impacto está em evitar perda, acima do
              limite de {formatarPct(LIMITE_DEFENSIVO)}. O portfólio está só se defendendo.
            </div>
          )}
        </div>

        <div className="card" data-span="6">
          <div className="section-header-row">
            <div>
              <div className="section-title">Objetivos sem iniciativa ativa</div>
              <div className="bento-sub">
                {cobertura.comIniciativa} de {cobertura.totalAtivos} objetivos ativos têm
                alguém trabalhando neles. O resto é intenção, não plano.
              </div>
            </div>
            <button className="btn btn-ghost" onClick={() => onIrPara('objetivos')}>Ver objetivos</button>
          </div>
          {orfaosReais.length === 0 ? (
            <div className="bento-sub" style={{ marginTop: 'var(--sp-3)' }}>
              Todo objetivo ativo tem pelo menos uma iniciativa em pé.
            </div>
          ) : (
            <div className="lista-linhas">
              {orfaosReais.slice(0, 6).map(o => (
                <div className="lista-linha" key={o.id}>
                  <span className="lista-texto" title={o.descricao}>{o.descricao || 'Objetivo sem descrição'}</span>
                  <span className="lista-nota">{o.horizonte || '—'}</span>
                </div>
              ))}
              {orfaosReais.length > 6 && (
                <div className="lista-linha">
                  <span className="lista-nota">e mais {orfaosReais.length - 6}</span>
                </div>
              )}
            </div>
          )}
          {baldeOrfao && (
            <div className="bento-sub" style={{ marginTop: 'var(--sp-3)' }}>
              O balde <strong>{OBJETIVO_BALDE}</strong> também está sem iniciativa ativa, mas é
              temporário da migração — não conta como objetivo descoberto.
            </div>
          )}
        </div>

        {/* ---- Carga, paradas e exposição ---- */}

        <div className="card" data-span="4">
          <div className="section-title">Carga por pessoa</div>
          <div className="bento-sub">
            Dias-pessoa que caem neste mês, contra o teto declarado de cada um.
          </div>
          {carga.length === 0 ? (
            <div className="bento-sub" style={{ marginTop: 'var(--sp-3)' }}>
              Nenhuma iniciativa ativa com esforço e janela preenchidos. Sem isso, não dá
              para acusar sobrecarga de forma auditável.
            </div>
          ) : (
            <div className="lista-linhas">
              {carga.slice(0, 6).map(c => {
                const teto = c.capacidade && c.capacidade > 0 ? c.capacidade : null;
                const escala = Math.max(c.diasNoPeriodo, teto ?? 0) || 1;
                return (
                  <div className="lista-linha" key={c.pessoa.id}>
                    <span className="lista-texto" style={{ flex: '0 0 34%' }}>{c.pessoa.nome}</span>
                    <span className="carga-track">
                      <span
                        className="carga-fill"
                        data-acima={c.acimaDaCapacidade}
                        style={{ width: `${Math.min(100, (c.diasNoPeriodo / escala) * 100)}%` }}
                      />
                      {teto != null && (
                        <span className="carga-limite" style={{ left: `${(teto / escala) * 100}%` }} />
                      )}
                    </span>
                    <span className="lista-nota tabular">
                      {formatarNumero(c.diasNoPeriodo, 1)}{teto != null ? `/${teto}` : ''} d
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card" data-span="4">
          <div className="section-title">Paradas há mais de {DIAS_PARA_ZUMBI} dias</div>
          <div className="bento-sub">
            Ninguém cancela uma iniciativa — só para de mexer nela.
          </div>
          {parados.length === 0 ? (
            <div className="bento-sub" style={{ marginTop: 'var(--sp-3)' }}>
              Nada abandonado em silêncio.
            </div>
          ) : (
            <div className="lista-linhas">
              {parados.slice(0, 6).map(z => (
                <div className="lista-linha" key={z.iniciativa.id}>
                  <button
                    className="lista-texto link-ini"
                    style={{ fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-medium)' }}
                    onClick={() => onAbrirIniciativa(z.iniciativa.id)}
                  >
                    {z.iniciativa.nome || 'Iniciativa sem nome'}
                  </button>
                  <span className="lista-nota tabular">
                    {z.diasParado} d{z.temMarco ? '' : ' · sem marco'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" data-span="4">
          <div className="kpi-label">Exposição residual</div>
          <div className="bento-valor" title={formatarMoedaCheia(exposicao.total)}>
            {formatarMoeda(exposicao.total)}
          </div>
          <div className="bento-sub">
            {plural(exposicao.riscos, 'risco ainda aberto', 'riscos ainda abertos')} —
            nem mitigados, nem obsoletos, nem descartados.
          </div>
          {exposicao.semValor > 0 && (
            <div className="bento-lacuna">
              <span aria-hidden="true">▲</span>
              {plural(exposicao.semValor, 'risco aberto sem exposição', 'riscos abertos sem exposição')} em R$
            </div>
          )}
        </div>

        {/* ---- Origem × vetor: a prova de que são dois eixos ---- */}

        {matriz.length > 0 && (
          <div className="card" data-span="12">
            <div className="section-title">Origem × vetor</div>
            <div className="bento-sub" style={{ maxWidth: '78ch' }}>
              {eixosIndependentes
                ? 'De onde a iniciativa veio não determina o que ela faz com o valor. '
                  + 'Se determinasse, esta matriz teria uma célula por linha — e não tem.'
                : 'Por enquanto o portfólio ocupa poucas combinações. A matriz fica interessante '
                  + 'quando origens diferentes aparecem no mesmo vetor, e vice-versa.'}
            </div>

            <div className="matriz-wrap">
              <table className="matriz">
                <thead>
                  <tr>
                    <th />
                    {vetoresUsados.map(v => <th key={v} className="num">{ROTULO_VETOR[v]}</th>)}
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {fontesUsadas.map(f => {
                    const totalLinha = vetoresUsados.reduce((s, v) => s + celula(f, v), 0);
                    return (
                      <tr key={f}>
                        <th scope="row">
                          <span className="matriz-rotulo">
                            <span className="serie-dot" data-serie={f === 'risco' ? 'risco' : 'oportunidade'} aria-hidden="true" />
                            {ROTULO_FONTE[f]}
                          </span>
                        </th>
                        {vetoresUsados.map(v => {
                          const n = celula(f, v);
                          return (
                            <td key={v} className="num" data-vazio={n === 0 || undefined}>{n}</td>
                          );
                        })}
                        <td className="num total">{totalLinha}</td>
                      </tr>
                    );
                  })}
                  <tr className="matriz-total">
                    <th scope="row">Total</th>
                    {vetoresUsados.map(v => (
                      <td key={v} className="num">
                        {fontesUsadas.reduce((s, f) => s + celula(f, v), 0)}
                      </td>
                    ))}
                    <td className="num total">{iniciativas.length}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---- Cobertura: as duas metades da história ---- */}

        <div className="card" data-span="12">
          <div className="section-header-row">
            {/* Sem o teto de largura, a explicação empurra os botões para a
                linha de baixo já em 1600px. */}
            <div style={{ maxWidth: '68ch' }}>
              <div className="section-title">Riscos tratados × iniciativas criadas</div>
              <div className="bento-sub">
                São duas perguntas diferentes, e nenhuma se deriva da outra. À esquerda, o que
                o registro de risco recebeu de tratamento. À direita, por que cada iniciativa
                do portfólio nasceu.
              </div>
            </div>
            <div className="actions-row">
              <button className="btn btn-ghost" onClick={() => onIrPara('registro')}>Rastro de mitigação</button>
              <button className="btn btn-ghost" onClick={() => onIrPara('iniciativas')}>Ver iniciativas</button>
            </div>
          </div>

          <div className="cobertura">
            <div>
              <div className="fato-label">Riscos</div>
              <div className="fato-par">
                <div className="fato">
                  <div className="fato-label">Mitigados em {ano}</div>
                  <div className="fato-valor">
                    <span className="bento-valor" style={{ marginTop: 0 }}>{mitigados.length}</span>
                  </div>
                  <div className="bento-sub">Confirmados por você, com data. É o número do comitê.</div>
                </div>
                <div className="fato">
                  <div className="fato-label">Prontos para fechar</div>
                  <div className="fato-valor">
                    <span className="bento-valor" style={{ marginTop: 0 }}>{prontos.length}</span>
                  </div>
                  <div className="bento-sub">
                    Tratamento entregue, decisão pendente. O sistema prova; quem fecha é você.
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 'var(--sp-4)' }}>
                <Composicao
                  vazio="Nenhum risco cadastrado."
                  fatias={ESTADOS.map(e => ({
                    chave: e.estado,
                    serie: SERIE_ESTADO[e.estado],
                    label: e.label,
                    valor: porEstado.get(e.estado) ?? 0,
                  }))}
                />
              </div>
            </div>

            <div className="cobertura-divisor" aria-hidden="true" />

            <div>
              <div className="fato-label">Iniciativas</div>
              <div className="fato-par">
                <div className="fato">
                  <div className="fato-label">Nasceram de risco</div>
                  <div className="fato-valor">
                    <span className="bento-valor" style={{ marginTop: 0 }}>{origem.deRisco.iniciativas}</span>
                    <span className="lista-nota">{formatarMoeda(origem.deRisco.impacto)}</span>
                  </div>
                </div>
                <div className="fato">
                  <div className="fato-label">Nasceram de oportunidade</div>
                  <div className="fato-valor">
                    <span className="bento-valor" style={{ marginTop: 0 }}>{origem.deOportunidade.iniciativas}</span>
                    <span className="lista-nota">{formatarMoeda(origem.deOportunidade.impacto)}</span>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 'var(--sp-4)' }}>
                <Composicao
                  vazio="Nenhuma iniciativa cadastrada."
                  fatias={origem.fatias.map(f => ({
                    chave: f.fonte,
                    serie: f.fonte === 'risco' ? 'risco' : 'oportunidade',
                    label: ROTULO_FONTE[f.fonte],
                    valor: f.iniciativas,
                    nota: f.impacto > 0 ? formatarMoeda(f.impacto) : undefined,
                  }))}
                />
              </div>

              <div className="bento-sub" style={{ marginTop: 'var(--sp-3)' }}>
                Origem é histórico e não muda. Quantos riscos uma iniciativa cobre hoje é
                outro número, que cresce — está no detalhe de cada uma.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
