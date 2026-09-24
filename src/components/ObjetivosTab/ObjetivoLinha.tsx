import type { KeyboardEvent, ReactNode } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import {
  ROTULO_STATUS_OBJETIVO, formatarData, formatarMoeda, formatarMoedaCheia, formatarPct, plural,
} from '../../lib/portfolioLabels';
import { ROTULO_AMEACA } from '../../lib/portfolioUi';
import { Sparkline } from './Sparkline';
import {
  BADGE_STATUS_OBJETIVO, ROTULO_TENDENCIA, SETA_TENDENCIA, numeroIndicador, type LinhaObjetivo,
} from './objetivosUi';

/** Quadradinhos de risco por linha antes do "+N". */
const QUADROS_VISIVEIS = 20;

/** De onde veio o movimento — é para lá que o foco volta depois de a linha mudar de lugar. */
export type OrigemMovimento = 'alca' | 'subir' | 'descer';

interface ObjetivoLinhaProps {
  linha: LinhaObjetivo;
  /** Posição na vista (1…n). Null no balde, que não entra na ordem. */
  posicao: number | null;
  /** Quantas linhas reordenáveis há — a última não desce. */
  total: number;
  aberto: boolean;
  onAlternar: () => void;
  /** Abre sem alternar: é o que "Sem valor" faz, e ele nunca fecha. */
  onAbrir: () => void;
  /** Maior entregue + em jogo entre as linhas visíveis: a barra de todas usa a mesma régua. */
  escalaImpacto: number;
  /** Critério Manual. Fora dele a alça fica desabilitada: a vista não grava. */
  podeReordenar: boolean;
  /** Modo Reordenar: só nome e setas; o resto recolhe. */
  reordenando: boolean;
  onMover: (delta: -1 | 1, origem: OrigemMovimento) => void;
  /** Onde o item arrastado cairia se fosse solto aqui. */
  alvo: 'acima' | 'abaixo' | null;
  onEditar: () => void;
  onMedir: () => void;
  /** O detalhe expandido, montado por quem conhece os callbacks dele. */
  children?: ReactNode;
}

/** Seis pontos em grade: a alça. Desenho, não glifo — o braile cai em fallback torto. */
function GlifoAlca() {
  return (
    <svg viewBox="0 0 8 14" width="8" height="14" aria-hidden="true" focusable="false">
      {[2, 7, 12].map(y => (
        <g key={y}>
          <circle cx="2" cy={y} r="1.2" fill="currentColor" />
          <circle cx="6" cy={y} r="1.2" fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}

/** Não se aplica. */
function Travessao() {
  return <span className="objetivo-travessao">—</span>;
}

/**
 * Uma linha da lista de objetivos: a pergunta inteira em uma faixa — o número
 * andou, quanto rendeu, o que ameaça, para onde vai — e o detalhe logo abaixo
 * quando aberta.
 *
 * O arraste é do `@dnd-kit/core`, como no quadro de tarefas: a linha toda é
 * alvo de soltura, mas só a alça levanta. A alça também é o caminho do
 * teclado — ↑ e ↓ com ela em foco movem uma posição —, e no celular, onde a
 * alça some, o caminho é o modo Reordenar com as setas grandes.
 */
export function ObjetivoLinha({
  linha, posicao, total, aberto, onAlternar, onAbrir, escalaImpacto, podeReordenar, reordenando,
  onMover, alvo, onEditar, onMedir, children,
}: ObjetivoLinhaProps) {
  const { objetivo: o, nome, balde, orfao, dono, progresso, pronto, sufixo, impacto, ameacas } = linha;
  const arrastavel = podeReordenar && !balde;
  // O papel padrão do dnd-kit é "draggable", em inglês, e o leitor de tela o
  // anuncia junto do rótulo da alça.
  const {
    attributes, listeners, setNodeRef: setArrasteRef, setActivatorNodeRef, isDragging,
  } = useDraggable({ id: o.id, disabled: !arrastavel, attributes: { roleDescription: 'arrastável' } });
  const { setNodeRef: setSolturaRef } = useDroppable({ id: o.id, disabled: !arrastavel });
  const painelId = `objetivo-detalhe-${o.id}`;

  function refLinha(el: HTMLLIElement | null) {
    setArrasteRef(el);
    setSolturaRef(el);
  }

  function teclaNaAlca(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    onMover(e.key === 'ArrowUp' ? -1 : 1, 'alca');
  }

  return (
    <li
      ref={refLinha}
      className="objetivo-item"
      data-balde={balde || undefined}
      data-aberto={(aberto && !reordenando) || undefined}
      data-arrastando={isDragging || undefined}
      data-alvo={alvo ?? undefined}
    >
      <div className="objetivo-linha">
        {balde ? (
          <span className="objetivo-alca objetivo-alca-vazia" aria-hidden="true" />
        ) : (
          <button
            type="button"
            id={`objetivo-alca-${o.id}`}
            ref={setActivatorNodeRef}
            className="objetivo-alca"
            {...attributes}
            {...listeners}
            disabled={!arrastavel}
            aria-label={`Reordenar ${nome}. Setas movem.`}
            title={arrastavel ? 'Arraste, ou use ↑ ↓' : 'Reordenar só no critério Manual'}
            onKeyDown={teclaNaAlca}
          >
            <GlifoAlca />
          </button>
        )}

        <span className="objetivo-num" aria-hidden={posicao == null || undefined}>
          {posicao ?? '—'}
        </span>

        {!reordenando && (
          <button
            type="button"
            className="objetivo-chevron"
            aria-expanded={aberto}
            aria-controls={painelId}
            aria-label={`Detalhe de ${nome}`}
            onClick={onAlternar}
          >
            <span aria-hidden="true">›</span>
          </button>
        )}

        <div className="objetivo-cel-titulo">
          {reordenando ? (
            <span className="objetivo-nome">{nome}</span>
          ) : (
            <button
              type="button"
              id={`objetivo-${o.id}`}
              className="objetivo-nome"
              aria-expanded={aberto}
              aria-controls={painelId}
              onClick={onAlternar}
            >
              {nome}
            </button>
          )}
          {balde ? (
            <div className="objetivo-balde-texto">
              Balde temporário da migração. Reclassifique as iniciativas daqui para objetivos de
              verdade — depois ele pode ser excluído.
            </div>
          ) : !reordenando && (
            <div className="objetivo-meta">
              <span>{dono ?? 'Sem dono'}</span>
              {o.prazo && <span>até <span className="tabular">{formatarData(o.prazo)}</span></span>}
              {o.status !== 'ativo' && (
                <span className="badge" data-badge={BADGE_STATUS_OBJETIVO[o.status] ?? 'neutro'}>
                  {ROTULO_STATUS_OBJETIVO[o.status]}
                </span>
              )}
              {pronto && <span className="badge" data-badge="atencao">Pronto para declarar atingido</span>}
            </div>
          )}
          {orfao && !reordenando && (
            <div className="bento-lacuna">
              <span aria-hidden="true">▲</span> Sem iniciativa ativa
            </div>
          )}
        </div>

        {reordenando ? (
          <div className="objetivo-setas">
            {!balde && (
              <>
                <button
                  type="button"
                  id={`objetivo-subir-${o.id}`}
                  className="objetivo-seta"
                  disabled={posicao === 1}
                  aria-label={`Subir ${nome}`}
                  onClick={() => onMover(-1, 'subir')}
                >
                  <span aria-hidden="true">↑</span>
                </button>
                <button
                  type="button"
                  id={`objetivo-descer-${o.id}`}
                  className="objetivo-seta"
                  disabled={posicao === total}
                  aria-label={`Descer ${nome}`}
                  onClick={() => onMover(1, 'descer')}
                >
                  <span aria-hidden="true">↓</span>
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="objetivo-cel" data-area="ind" data-rotulo="Indicador">
              <CelulaIndicador linha={linha} onEditar={onEditar} onMedir={onMedir} />
            </div>

            <div className="objetivo-cel" data-area="imp" data-rotulo="Impacto">
              {/* "Sem valor" é campo em branco, não soma zero: um impacto_rs = 0
                  declarado (entrega de conformidade) sai como R$ 0, como no
                  detalhe e no KPI. */}
              {impacto.concluidas + impacto.ativas === 0 ? (
                <Travessao />
              ) : impacto.semValor === impacto.concluidas + impacto.ativas ? (
                <button type="button" className="nao-preenchido" onClick={onAbrir}>Sem valor</button>
              ) : (
                <>
                  <span className="objetivo-valores">
                    {impacto.concluidas === 0 ? (
                      <Travessao />
                    ) : linha.entreguesSemValor === impacto.concluidas ? (
                      <button type="button" className="nao-preenchido" onClick={onAbrir}>Sem valor</button>
                    ) : (
                      <span className="objetivo-cifra" title={`${formatarMoedaCheia(impacto.entregue)} entregues`}>
                        {formatarMoeda(impacto.entregue)}
                      </span>
                    )}
                    {impacto.emJogo > 0 && (
                      <span className="objetivo-emjogo">
                        + <span className="tabular">{formatarMoeda(impacto.emJogo)}</span> em jogo
                      </span>
                    )}
                  </span>
                  <div
                    className="impacto-barra"
                    role="img"
                    aria-label={`${formatarMoedaCheia(impacto.entregue)} entregues, ${formatarMoedaCheia(impacto.emJogo)} em jogo`}
                  >
                    {impacto.entregue > 0 && (
                      <span
                        className="stack-seg"
                        data-serie="concluida"
                        style={{ width: `${(impacto.entregue / escalaImpacto) * 100}%` }}
                      />
                    )}
                    {impacto.emJogo > 0 && (
                      <span
                        className="stack-seg"
                        data-serie="em_jogo"
                        style={{ width: `${(impacto.emJogo / escalaImpacto) * 100}%` }}
                      />
                    )}
                  </div>
                  {impacto.semValor > 0 && (
                    <span className="objetivo-nota">
                      {plural(impacto.semValor, 'iniciativa sem valor', 'iniciativas sem valor')}
                    </span>
                  )}
                </>
              )}
            </div>

            <div className="objetivo-cel" data-area="risc" data-rotulo="Riscos neutralizados">
              {ameacas.total === 0 ? (
                <Travessao />
              ) : (
                <>
                  <span className="objetivo-valores">
                    <span className="objetivo-cifra">
                      {ameacas.neutralizados} de {ameacas.total}
                      <span className="sr-only"> neutralizados</span>
                    </span>
                    {ameacas.semTratamento > 0 && (
                      <span className="objetivo-sem-trat">· {ameacas.semTratamento} sem trat.</span>
                    )}
                  </span>
                  {/* Um quadrado por risco, do mais grave ao sem nota. Cor é
                      reforço: o número ao lado é quem conta. */}
                  <span className="ameaca-quadros" aria-hidden="true">
                    {ameacas.itens.slice(0, QUADROS_VISIVEIS).map(a => (
                      <span
                        key={a.risco.id}
                        className="ameaca-quadro"
                        data-estado={a.estado}
                        title={ROTULO_AMEACA[a.estado]}
                      />
                    ))}
                    {ameacas.itens.length > QUADROS_VISIVEIS && (
                      <span className="ameaca-mais">+{ameacas.itens.length - QUADROS_VISIVEIS}</span>
                    )}
                  </span>
                </>
              )}
            </div>

            <div className="objetivo-cel" data-area="tend" data-rotulo="Tendência">
              {balde || progresso.serie.length === 0 ? (
                <Travessao />
              ) : (
                <>
                  <Sparkline compacta serie={progresso.serie} baseline={o.baseline} meta={o.meta} unidade={sufixo} />
                  {progresso.tendencia ? (
                    <span className="tendencia" data-t={progresso.tendencia}>
                      <span aria-hidden="true">{SETA_TENDENCIA[progresso.tendencia]}</span>
                      {ROTULO_TENDENCIA[progresso.tendencia]}
                    </span>
                  ) : (
                    <span className="objetivo-nota">1 leitura</span>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {!reordenando && aberto && children}
    </li>
  );
}

function CelulaIndicador({
  linha, onEditar, onMedir,
}: { linha: LinhaObjetivo; onEditar: () => void; onMedir: () => void }) {
  const { objetivo: o, progresso, semMeta, sufixo, balde } = linha;
  if (balde) return <Travessao />;
  if (!o.indicador.trim()) {
    return <button type="button" className="nao-preenchido" onClick={onEditar}>Definir indicador</button>;
  }

  // Sem meta ou sem medição a trilha é tracejada e não tem preenchimento —
  // nunca uma barra em 0%. Zero diz "não andou"; o que aconteceu foi "ninguém
  // mediu", e só o primeiro é fracasso do objetivo.
  const titulo = progresso.pct == null
    ? (semMeta ? 'Sem baseline ou meta — não há caminho para medir' : 'Sem medição — não há onde marcar o ponto')
    : `${formatarPct(progresso.pct)} do caminho entre baseline e meta`;

  return (
    <>
      <span className="objetivo-ind-nome" title={o.indicador}>{o.indicador}</span>
      {progresso.serie.length === 0 ? (
        <button type="button" className="link-ini objetivo-medir" onClick={onMedir}>Registrar 1ª medição</button>
      ) : (
        <span className="objetivo-valores">
          <span className="objetivo-cifra">{numeroIndicador(progresso.atual)}{sufixo}</span>
          {/* Seta e meta quebram juntas: sozinha no fim da linha, a seta
              apontava para o nada ("131 linhas/h →" / "160 linhas/h"). */}
          {o.meta != null && (
            <span className="objetivo-alvo">
              <span className="objetivo-seta-meta" aria-hidden="true">→</span>
              <span className="sr-only">, meta </span>
              <span className="objetivo-cifra-meta">{numeroIndicador(o.meta)}{sufixo}</span>
            </span>
          )}
        </span>
      )}
      <div className="meta-track" data-sem-medida={progresso.pct == null || undefined} title={titulo}>
        {progresso.pct != null && (
          <span className="meta-fill" style={{ width: `${Math.round(progresso.pct * 100)}%` }} />
        )}
        <span className="meta-alvo" />
      </div>
      <span className="objetivo-nota">
        {progresso.pct == null
          ? (semMeta ? 'Sem meta definida' : 'Sem medição')
          : `${formatarPct(progresso.pct)} do caminho`}
      </span>
    </>
  );
}
