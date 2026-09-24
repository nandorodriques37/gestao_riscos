import type { Iniciativa } from '../../types';
import { scoreTier } from '../../lib/calculations';
import {
  BADGE_STATUS_INICIATIVA, ROTULO_STATUS_INICIATIVA, formatarData, formatarMoeda,
  formatarMoedaCheia, formatarPct, nomeRisco, plural,
} from '../../lib/portfolioLabels';
import { BADGE_AMEACA, ROTULO_AMEACA, SERIE_AMEACA } from '../../lib/portfolioUi';
import { Composicao, type Fatia } from '../common/Composicao';
import { SerieIndicador } from './SerieIndicador';
import {
  ROTULO_TENDENCIA, SETA_TENDENCIA, numeroIndicador, type LinhaObjetivo,
} from './objetivosUi';

interface ObjetivoDetalheProps {
  /** Id do painel — é o alvo do `aria-controls` do chevron e do título. */
  id: string;
  linha: LinhaObjetivo;
  onEditar: () => void;
  onMedir: () => void;
  onDeclarar: () => void;
  onCriarIniciativa: () => void;
  onAbrirIniciativa: (id: string) => void;
  onAbrirRisco: (id: string) => void;
}

/** Quantos riscos a lista mostra antes do "e mais N". */
const RISCOS_VISIVEIS = 8;

/** Maior valor primeiro; sem valor fecha a fila, como toda ausência. */
function porValorDesc(a: Iniciativa, b: Iniciativa): number {
  if (a.impacto_rs == null && b.impacto_rs == null) return 0;
  if (a.impacto_rs == null) return 1;
  if (b.impacto_rs == null) return -1;
  return b.impacto_rs - a.impacto_rs;
}

/**
 * O objetivo aberto: três perguntas lado a lado, cada uma com a sua prova.
 *
 * O número andou (a série do indicador), quanto as entregas renderam (as
 * iniciativas, com o valor de cada uma) e o que ainda ameaça (os riscos que
 * chegam aqui pelas iniciativas). A ordem é a da cadeia: o porquê, o quê e o
 * que pode dar errado — e cada seção leva ao lugar onde o dado se corrige.
 */
export function ObjetivoDetalhe({
  id, linha, onEditar, onMedir, onDeclarar, onCriarIniciativa, onAbrirIniciativa, onAbrirRisco,
}: ObjetivoDetalheProps) {
  return (
    <div className="objetivo-detalhe" id={id} role="region" aria-label={`Detalhe de ${linha.nome}`}>
      <div className="objetivo-detalhe-grade">
        <SecaoIndicador id={id} linha={linha} onEditar={onEditar} onMedir={onMedir} onDeclarar={onDeclarar} />
        <SecaoImpacto
          id={id} linha={linha}
          onCriarIniciativa={onCriarIniciativa} onAbrirIniciativa={onAbrirIniciativa}
        />
        <SecaoRiscos id={id} linha={linha} onAbrirRisco={onAbrirRisco} />
      </div>
      <div className="objetivo-detalhe-rodape">
        <button type="button" className="btn btn-ghost" onClick={onEditar}>Editar objetivo</button>
      </div>
    </div>
  );
}

function Cabecalho({ id, rotulo, pergunta }: { id: string; rotulo: string; pergunta: string }) {
  return (
    <>
      <div className="objetivo-rotulo">{rotulo}</div>
      <h3 className="objetivo-secao-titulo" id={id}>{pergunta}</h3>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Indicador                                                        */
/* ------------------------------------------------------------------ */

function SecaoIndicador({
  id, linha, onEditar, onMedir, onDeclarar,
}: Pick<ObjetivoDetalheProps, 'id' | 'linha' | 'onEditar' | 'onMedir' | 'onDeclarar'>) {
  const { objetivo: o, progresso, semMeta, sufixo, balde, pronto } = linha;
  const tituloId = `${id}-indicador`;

  if (balde) {
    return (
      <section className="objetivo-secao" aria-labelledby={tituloId}>
        <Cabecalho id={tituloId} rotulo="Balde da migração" pergunta="O que falta aqui?" />
        <p className="bento-sub">
          Balde temporário da migração. Reclassifique as iniciativas daqui para objetivos de
          verdade — depois ele pode ser excluído.
        </p>
      </section>
    );
  }

  return (
    <section className="objetivo-secao" aria-labelledby={tituloId}>
      <Cabecalho id={tituloId} rotulo="Indicador" pergunta="O número andou?" />

      {!o.indicador.trim() ? (
        <>
          <p className="bento-sub">Sem indicador. Objetivo sem número vira opinião no fim do trimestre.</p>
          <div className="actions-row objetivo-secao-acoes">
            <button type="button" className="btn btn-ghost" onClick={onEditar}>Definir indicador</button>
          </div>
        </>
      ) : (
        <>
          <p className="objetivo-det-indicador">{o.indicador}</p>

          {progresso.serie.length === 0 ? (
            // Sem série não há gráfico em zero: há uma área tracejada que diz
            // por que está vazia. "Não andou" e "ninguém mediu" são fracassos
            // diferentes, e só o primeiro é do objetivo.
            <div className="serie-vazia">
              <strong>Nenhuma medição ainda</strong>
              <span>
                {semMeta
                  ? 'E sem baseline e meta a série não teria caminho contra o qual ser lida.'
                  : 'Sem leitura não dá para dizer se o número andou — a primeira já vale.'}
              </span>
            </div>
          ) : (
            <>
              <div className="objetivo-det-numeros">
                <div className="objetivo-det-numero">
                  <span className="objetivo-det-valor">{numeroIndicador(progresso.atual)}{sufixo}</span>
                  <span className="objetivo-det-legenda">
                    hoje{o.meta != null ? <> · meta <span className="tabular">{numeroIndicador(o.meta)}{sufixo}</span></> : null}
                  </span>
                </div>
                <div className="objetivo-det-numero">
                  {progresso.pct == null ? (
                    <span className="objetivo-det-legenda">Sem meta definida — não há caminho para medir</span>
                  ) : (
                    <>
                      <span className="objetivo-det-valor objetivo-det-valor-2">{formatarPct(progresso.pct)}</span>
                      <span className="objetivo-det-legenda">do caminho entre baseline e meta</span>
                    </>
                  )}
                </div>
                {progresso.tendencia && (
                  <span className="tendencia" data-t={progresso.tendencia}>
                    <span aria-hidden="true">{SETA_TENDENCIA[progresso.tendencia]}</span>
                    {ROTULO_TENDENCIA[progresso.tendencia]}
                  </span>
                )}
              </div>
              <SerieIndicador serie={progresso.serie} baseline={o.baseline} meta={o.meta} sufixo={sufixo} />
            </>
          )}

          <div className="actions-row objetivo-secao-acoes">
            {semMeta && (
              <button type="button" className="btn btn-ghost" onClick={onEditar}>Definir meta</button>
            )}
            <button type="button" className="btn btn-ghost" onClick={onMedir}>
              {progresso.serie.length === 0 ? 'Registrar 1ª medição' : `Medições · ${progresso.serie.length}`}
            </button>
            {progresso.data && (
              <span className="objetivo-nota">última: <span className="tabular">{formatarData(progresso.data)}</span></span>
            )}
          </div>

          {/* O sistema prova que a meta foi alcançada; declarar é sempre de
              quem responde pelo objetivo. Nada aqui muda o status sozinho. */}
          {pronto && (
            <div className="objetivo-pronto">
              <span>A série já cobriu todo o caminho entre baseline e meta.</span>
              <button type="button" className="btn btn-navy" onClick={onDeclarar}>Declarar atingido</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Impacto                                                          */
/* ------------------------------------------------------------------ */

/** "+ 2 não priorizadas · 1 cancelada": o que existe mas não entra em nenhuma das duas contas. */
function resumoForaDaConta(lista: Iniciativa[]): string | null {
  if (lista.length === 0) return null;
  const n = (f: (i: Iniciativa) => boolean) => lista.filter(f).length;
  const partes = [
    [n(i => i.status === 'backlog'), 'não priorizada', 'não priorizadas'],
    [n(i => i.status === 'cancelada'), 'cancelada', 'canceladas'],
    [n(i => i.status !== 'backlog' && i.status !== 'cancelada'), 'sem status', 'sem status'],
  ] as const;
  return `+ ${partes.filter(([q]) => q > 0).map(([q, s, p]) => plural(q, s, p)).join(' · ')}`;
}

function SecaoImpacto({
  id, linha, onCriarIniciativa, onAbrirIniciativa,
}: Pick<ObjetivoDetalheProps, 'id' | 'linha' | 'onCriarIniciativa' | 'onAbrirIniciativa'>) {
  const { impacto, entregues, emCurso, foraDaConta, entreguesSemValor, emCursoSemValor } = linha;
  const tituloId = `${id}-impacto`;
  const nenhuma = entregues.length + emCurso.length + foraDaConta.length === 0;

  const listadas = [...[...entregues].sort(porValorDesc), ...[...emCurso].sort(porValorDesc)];
  // Escala do objetivo: a maior iniciativa dele enche a barra. É comparação
  // DENTRO do objetivo — entre objetivos, a lista usa a escala compartilhada.
  const escala = Math.max(0, ...listadas.map(i => i.impacto_rs ?? 0));
  const resumo = resumoForaDaConta(foraDaConta);

  return (
    <section className="objetivo-secao" aria-labelledby={tituloId}>
      <Cabecalho id={tituloId} rotulo="Impacto" pergunta="Quanto as entregas renderam?" />

      {nenhuma ? (
        <div className="bento-sub">
          <strong>Nenhuma iniciativa sustenta este objetivo.</strong> Enquanto não houver, ele é
          intenção — não plano.
        </div>
      ) : (
        <>
          <div className="objetivo-det-numeros">
            <div className="objetivo-det-numero" data-tom="entregue">
              {impacto.concluidas === 0 ? (
                <span className="objetivo-det-valor objetivo-travessao">—</span>
              ) : impacto.entregue === 0 && entreguesSemValor === impacto.concluidas ? (
                <button
                  type="button"
                  className="nao-preenchido objetivo-det-valor-vazio"
                  onClick={() => onAbrirIniciativa(entregues[0].id)}
                >
                  Sem valor
                </button>
              ) : (
                <span className="objetivo-det-valor" title={formatarMoedaCheia(impacto.entregue)}>
                  {formatarMoeda(impacto.entregue)}
                </span>
              )}
              <span className="objetivo-det-legenda">
                {impacto.concluidas === 0
                  ? 'entregue · nenhuma concluída ainda'
                  : `entregue · ${plural(impacto.concluidas, 'concluída', 'concluídas')}`}
              </span>
            </div>
            <div className="objetivo-det-numero" data-tom="em_jogo">
              {impacto.ativas === 0 ? (
                <span className="objetivo-det-valor objetivo-det-valor-2 objetivo-travessao">—</span>
              ) : impacto.emJogo === 0 && emCursoSemValor === impacto.ativas ? (
                <button
                  type="button"
                  className="nao-preenchido objetivo-det-valor-vazio"
                  onClick={() => onAbrirIniciativa(emCurso[0].id)}
                >
                  Sem valor
                </button>
              ) : (
                <span className="objetivo-det-valor objetivo-det-valor-2" title={formatarMoedaCheia(impacto.emJogo)}>
                  {formatarMoeda(impacto.emJogo)}
                </span>
              )}
              <span className="objetivo-det-legenda">
                {impacto.ativas === 0
                  ? 'em jogo · nenhuma ativa'
                  : `em jogo · ${plural(impacto.ativas, 'ativa', 'ativas')}`}
              </span>
            </div>
          </div>
          {impacto.semValor > 0 && (
            <div className="bento-lacuna">
              <span aria-hidden="true">▲</span>
              {plural(impacto.semValor, 'iniciativa sem valor de impacto', 'iniciativas sem valor de impacto')}
              {' '}— os totais são piso
            </div>
          )}

          {listadas.length > 0 && (
            <div className="lista-linhas">
              {listadas.map(i => {
                const nome = i.nome || 'Iniciativa sem nome';
                const concluida = i.status === 'concluida';
                return (
                  <div className="objetivo-ini" key={i.id}>
                    <div className="objetivo-ini-topo">
                      <button
                        type="button"
                        className="lista-texto link-ini objetivo-ini-nome"
                        onClick={() => onAbrirIniciativa(i.id)}
                        title={nome}
                      >
                        {nome}
                      </button>
                      <span className="badge" data-badge={BADGE_STATUS_INICIATIVA[i.status]}>
                        {ROTULO_STATUS_INICIATIVA[i.status]}
                      </span>
                      {i.impacto_rs == null ? (
                        <button
                          type="button"
                          className="nao-preenchido objetivo-ini-vazio"
                          onClick={() => onAbrirIniciativa(i.id)}
                          aria-label={`Sem valor de impacto: abrir ${nome}`}
                        >
                          Sem valor
                        </button>
                      ) : (
                        <span className="objetivo-ini-valor tabular" title={formatarMoedaCheia(i.impacto_rs)}>
                          {formatarMoeda(i.impacto_rs)}
                        </span>
                      )}
                    </div>
                    {i.impacto_rs != null && escala > 0 && (
                      <div className="impacto-barra" aria-hidden="true">
                        <span
                          className="stack-seg"
                          data-serie={concluida ? 'concluida' : 'em_jogo'}
                          style={{ width: `${(i.impacto_rs / escala) * 100}%` }}
                        />
                      </div>
                    )}
                    {i.confianca_impacto === 'baixa' && (
                      <span className="objetivo-nota">confiança baixa</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {resumo && <div className="objetivo-nota objetivo-resumo">{resumo}</div>}
        </>
      )}

      <div className="actions-row objetivo-secao-acoes">
        <button type="button" className="btn btn-ghost" onClick={onCriarIniciativa}>Criar iniciativa</button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Riscos                                                           */
/* ------------------------------------------------------------------ */

function SecaoRiscos({
  id, linha, onAbrirRisco,
}: Pick<ObjetivoDetalheProps, 'id' | 'linha' | 'onAbrirRisco'>) {
  const { ameacas } = linha;
  const tituloId = `${id}-riscos`;

  // Série por estado, na ordem do pior para o melhor desfecho. Estado sem
  // risco não entra: a frase de cima já diz o total.
  const fatias: Fatia[] = ([
    ['sem_tratamento', ameacas.semTratamento],
    ['em_tratamento', ameacas.emTratamento],
    ['aceito', ameacas.aceitos],
    ['neutralizado', ameacas.neutralizados],
  ] as const)
    .filter(([, n]) => n > 0)
    .map(([estado, n]) => ({ chave: estado, serie: SERIE_AMEACA[estado], label: ROTULO_AMEACA[estado], valor: n }));

  return (
    <section className="objetivo-secao" aria-labelledby={tituloId}>
      <Cabecalho id={tituloId} rotulo="Riscos" pergunta="O que ainda ameaça?" />

      {ameacas.total === 0 ? (
        <div className="bento-sub">
          Nenhuma iniciativa daqui trata risco mapeado. Vincular um risco a uma delas faz ele
          aparecer nesta lista.
        </div>
      ) : (
        <>
          <div className="objetivo-det-numeros">
            <div className="objetivo-det-numero">
              <span className="objetivo-det-valor">{ameacas.neutralizados} de {ameacas.total}</span>
              <span className="objetivo-det-legenda">neutralizados · só conta o mitigado confirmado</span>
            </div>
          </div>
          <Composicao fatias={fatias} vazio="" />
          <div className="lista-linhas">
            {ameacas.itens.slice(0, RISCOS_VISIVEIS).map(a => (
              <div className="lista-linha" key={a.risco.id}>
                {/* O número acompanha a cor: a faixa nunca é lida só pela matiz. */}
                <span
                  className="tier-chip"
                  data-tier={scoreTier(a.score)}
                  title={a.score == null ? 'Sem score: falta probabilidade ou impacto' : undefined}
                >
                  <span className="tier-dot" aria-hidden="true" />
                  {a.score == null ? '—' : String(a.score).replace('.', ',')}
                </span>
                <button
                  type="button"
                  className="lista-texto link-ini objetivo-risco-nome"
                  onClick={() => onAbrirRisco(a.risco.id)}
                  title={nomeRisco(a.risco)}
                >
                  {nomeRisco(a.risco)}
                </button>
                <span className="badge" data-badge={BADGE_AMEACA[a.estado]}>{ROTULO_AMEACA[a.estado]}</span>
              </div>
            ))}
            {ameacas.itens.length > RISCOS_VISIVEIS && (
              <div className="lista-linha">
                <span className="objetivo-nota">e mais {ameacas.itens.length - RISCOS_VISIVEIS}</span>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
