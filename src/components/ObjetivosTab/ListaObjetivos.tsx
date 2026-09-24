import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, closestCenter, useSensor, useSensors,
  type Announcements, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core';
import type { ContagemAmeacas, EstadoAmeaca } from '../../lib/portfolioMetrics';
import { formatarMoeda, formatarMoedaCheia, plural } from '../../lib/portfolioLabels';
import { ROTULO_AMEACA } from '../../lib/portfolioUi';
import { ObjetivoLinha, type OrigemMovimento } from './ObjetivoLinha';
import type { LinhaObjetivo, TotaisObjetivos } from './objetivosUi';

/** Estados da legenda, do pior ao melhor desfecho — a ordem da composição no detalhe. */
const LEGENDA_AMEACA: readonly (readonly [EstadoAmeaca, Exclude<keyof ContagemAmeacas, 'total'>])[] = [
  ['sem_tratamento', 'semTratamento'],
  ['em_tratamento', 'emTratamento'],
  ['aceito', 'aceitos'],
  ['neutralizado', 'neutralizados'],
];

interface ListaObjetivosProps {
  /** Objetivos na vista pedida, sem o balde. */
  linhas: LinhaObjetivo[];
  /** O balde da migração, quando visível. Sempre por último. */
  baldes: LinhaObjetivo[];
  abertos: ReadonlySet<string>;
  onAlternar: (id: string) => void;
  onAbrir: (id: string) => void;
  /** Critério Manual: a ordem da tela é a gravada. */
  podeReordenar: boolean;
  reordenando: boolean;
  onMover: (id: string, delta: -1 | 1) => void;
  onSoltar: (id: string, alvoId: string) => void;
  totais: TotaisObjetivos;
  onEditar: (id: string) => void;
  onMedir: (id: string) => void;
  /** "Sem valor" do total: leva a quem preenche o impacto das iniciativas. */
  onDeclararValor: () => void;
  /** O detalhe de uma linha aberta. */
  detalhe: (linha: LinhaObjetivo) => ReactNode;
}

const instrucoes = {
  draggable:
    'Para mudar a ordem, arraste o objetivo pela alça até outra linha. '
    + 'Pelo teclado, com a alça em foco, as setas para cima e para baixo movem uma posição.',
};

/**
 * A lista de objetivos: cabeçalho de colunas, uma linha por objetivo, o balde
 * no fim e a linha de total.
 *
 * É uma `<ol>` porque a ordem é o conteúdo — a posição escrita em cada linha
 * é a mesma que o leitor de tela anuncia.
 */
export function ListaObjetivos({
  linhas, baldes, abertos, onAlternar, onAbrir, podeReordenar, reordenando, onMover, onSoltar,
  totais, onEditar, onMedir, onDeclararValor, detalhe,
}: ListaObjetivosProps) {
  const [ativo, setAtivo] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);

  // Mesmo limiar do quadro de tarefas: 6px de arraste antes de levantar, para
  // um clique na alça não virar arraste. PointerSensor cobre mouse e toque —
  // e no toque a alça some abaixo de 760px, onde o caminho é o modo Reordenar.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  /*
   * Foco depois de mover. Uma linha que troca de lugar é um nó que o React
   * tira e reinsere no DOM — e nó reinserido perde o foco. Quem estava com as
   * setas na alça ficaria, no segundo toque, falando com o <body>. O alvo fica
   * guardado até a pessoa pôr o foco em outro lugar; só é devolvido quando o
   * foco se PERDEU, nunca roubado de onde a pessoa o levou.
   *
   * "Perdido" é o foco no <body>, ou num controle DA LISTA que ficou
   * desabilitado (a seta que chegou à ponta). Botão desabilitado fora dela —
   * o "Salvando…" de um modal — é de outro dono e não se toca.
   */
  const focoPendente = useRef<string | null>(null);
  const listaRef = useRef<HTMLOListElement>(null);

  function mover(id: string, delta: -1 | 1, origem: OrigemMovimento) {
    focoPendente.current = `objetivo-${origem}-${id}`;
    onMover(id, delta);
  }

  useLayoutEffect(() => {
    const alvo = focoPendente.current;
    if (!alvo) return;
    const atual = document.activeElement as HTMLButtonElement | null;
    const naLista = !!atual && !!listaRef.current?.contains(atual);
    const perdido = !atual || atual === document.body || (naLista && atual.disabled);
    if (!perdido) return;
    let el = document.getElementById(alvo) as HTMLButtonElement | null;
    // A seta que levou a linha à ponta fica desabilitada ali: o foco passa
    // para a outra, que é a única que ainda faz algo.
    if (el?.disabled) {
      const outra = alvo.includes('-subir-') ? alvo.replace('-subir-', '-descer-') : alvo.replace('-descer-', '-subir-');
      el = document.getElementById(outra) as HTMLButtonElement | null;
    }
    if (el && !el.disabled) el.focus();
  });

  useEffect(() => {
    const soltar = () => { focoPendente.current = null; };
    // Foco levado para fora da lista (Tab, atalho, modal) desarma o alvo.
    const focoFora = (e: FocusEvent) => {
      if (e.target instanceof Node && !listaRef.current?.contains(e.target)) soltar();
    };
    document.addEventListener('pointerdown', soltar);
    document.addEventListener('focusin', focoFora);
    return () => {
      document.removeEventListener('pointerdown', soltar);
      document.removeEventListener('focusin', focoFora);
    };
  }, []);

  const ids = linhas.map(l => l.objetivo.id);
  const nomeDe = (id: string | number) => linhas.find(l => l.objetivo.id === String(id))?.nome ?? 'objetivo';
  const indiceAtivo = ativo ? ids.indexOf(ativo) : -1;
  const arrastada = ativo ? linhas.find(l => l.objetivo.id === ativo) ?? null : null;

  function comecar(e: DragStartEvent) {
    focoPendente.current = null;
    setAtivo(String(e.active.id));
  }

  function passar(e: DragOverEvent) {
    setSobre(e.over ? String(e.over.id) : null);
  }

  function terminar(e: DragEndEvent) {
    setAtivo(null);
    setSobre(null);
    const alvo = e.over?.id;
    if (alvo == null || alvo === e.active.id) return;
    onSoltar(String(e.active.id), String(alvo));
  }

  function cancelar() {
    setAtivo(null);
    setSobre(null);
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Pegou o objetivo ${nomeDe(active.id)}, na posição ${ids.indexOf(String(active.id)) + 1} de ${ids.length}.`,
    onDragOver: ({ over }) => (over ? `Sobre a posição ${ids.indexOf(String(over.id)) + 1}.` : 'Fora da lista.'),
    onDragEnd: ({ active, over }) => (over
      ? `${nomeDe(active.id)} solto na posição ${ids.indexOf(String(over.id)) + 1} de ${ids.length}.`
      : `${nomeDe(active.id)} devolvido ao lugar.`),
    onDragCancel: ({ active }) => `Movimento cancelado. ${nomeDe(active.id)} voltou ao lugar.`,
  };

  function alvoDe(id: string, indice: number): 'acima' | 'abaixo' | null {
    if (!ativo || sobre !== id || id === ativo || indiceAtivo < 0) return null;
    // O mesmo lugar em que `moverPara` vai pôr: vindo de cima cai abaixo do
    // alvo; vindo de baixo, acima.
    return indiceAtivo < indice ? 'abaixo' : 'acima';
  }

  const linhaProps = (l: LinhaObjetivo) => ({
    linha: l,
    aberto: abertos.has(l.objetivo.id),
    onAlternar: () => onAlternar(l.objetivo.id),
    onAbrir: () => onAbrir(l.objetivo.id),
    escalaImpacto: totais.escala,
    reordenando,
    onEditar: () => onEditar(l.objetivo.id),
    onMedir: () => onMedir(l.objetivo.id),
  });

  return (
    <section
      className="card objetivos-lista"
      aria-label="Objetivos"
      data-reordenando={reordenando || undefined}
    >
      {!reordenando && (
        <div className="objetivos-colunas objetivo-rotulo" aria-hidden="true">
          <span data-area="num">Nº</span>
          <span data-area="titulo">Objetivo</span>
          <span data-area="ind">Indicador · hoje → meta</span>
          <span data-area="imp">Impacto · entregue + em jogo</span>
          <span data-area="risc">Riscos neutralizados</span>
          <span data-area="tend">Tendência</span>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={comecar}
        onDragOver={passar}
        onDragEnd={terminar}
        onDragCancel={cancelar}
        accessibility={{ announcements, screenReaderInstructions: instrucoes }}
      >
        <ol
          ref={listaRef}
          className="objetivos-linhas"
          onFocus={e => {
            if (focoPendente.current && e.target.id !== focoPendente.current) focoPendente.current = null;
          }}
        >
          {linhas.map((l, i) => (
            <ObjetivoLinha
              key={l.objetivo.id}
              {...linhaProps(l)}
              posicao={i + 1}
              total={linhas.length}
              podeReordenar={podeReordenar}
              onMover={(delta, origem) => mover(l.objetivo.id, delta, origem)}
              alvo={alvoDe(l.objetivo.id, i)}
            >
              {detalhe(l)}
            </ObjetivoLinha>
          ))}
          {baldes.map(l => (
            <ObjetivoLinha
              key={l.objetivo.id}
              {...linhaProps(l)}
              posicao={null}
              total={linhas.length}
              podeReordenar={false}
              onMover={() => {}}
              alvo={null}
            >
              {detalhe(l)}
            </ObjetivoLinha>
          ))}
        </ol>

        {/* A linha levantada. A original fica no lugar, esmaecida, como vaga. */}
        <DragOverlay dropAnimation={null}>
          {arrastada && (
            <div className="objetivo-fantasma">
              <span className="objetivo-num">{indiceAtivo + 1}</span>
              <span>{arrastada.nome}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {!reordenando && (
        <div className="objetivos-total">
          <span data-area="titulo">
            Total · {plural(totais.n, 'objetivo', 'objetivos')}
          </span>
          <span className="objetivo-cel" data-area="ind" data-rotulo="Indicadores melhorando">
            {totais.ativos === 0
              ? <span className="objetivo-travessao">—</span>
              : <span><span className="objetivo-cifra">{totais.melhorando} de {totais.ativos}</span> melhorando</span>}
          </span>
          <span className="objetivo-cel" data-area="imp" data-rotulo="Impacto">
            {/* A mesma decisão da célula de cada linha: não se aplica é
                travessão, campo em branco é "Sem valor" — nunca R$ 0. */}
            {totais.concluidas + totais.ativas === 0 ? (
              <span className="objetivo-travessao">—</span>
            ) : totais.entreguesSemValor + totais.emCursoSemValor === totais.concluidas + totais.ativas ? (
              <button type="button" className="nao-preenchido" onClick={onDeclararValor}>Sem valor</button>
            ) : (
              <span className="objetivo-valores">
                {totais.concluidas === 0 ? (
                  <span className="objetivo-travessao">—</span>
                ) : totais.entreguesSemValor === totais.concluidas ? (
                  <button type="button" className="nao-preenchido" onClick={onDeclararValor}>Sem valor</button>
                ) : (
                  <span className="objetivo-cifra" title={`${formatarMoedaCheia(totais.entregue)} entregues`}>
                    {formatarMoeda(totais.entregue)}
                  </span>
                )}
                {totais.emJogo > 0 && (
                  <span className="objetivo-emjogo">
                    + <span className="tabular">{formatarMoeda(totais.emJogo)}</span> em jogo
                  </span>
                )}
              </span>
            )}
          </span>
          <span className="objetivo-cel" data-area="risc" data-rotulo="Riscos neutralizados">
            {totais.ameacas.total === 0 ? (
              <span className="objetivo-travessao">—</span>
            ) : (
              <span className="objetivo-valores">
                <span className="objetivo-cifra">
                  {totais.ameacas.neutralizados} de {totais.ameacas.total}
                  <span className="sr-only"> neutralizados</span>
                </span>
                {totais.ameacas.semTratamento > 0 && (
                  <span className="objetivo-sem-trat">· {totais.ameacas.semTratamento} sem trat.</span>
                )}
              </span>
            )}
          </span>
        </div>
      )}

      {/* Legenda dos quadradinhos de risco: cada cor com o rótulo e a
          contagem. Em tratamento e aceito não aparecem escritos na célula, e
          verde × âmbar não se separam em deuteranopia — sem isto a cor seria
          a única identidade deles. Só entra a cor que está na tela: "Sem
          tratamento 0" em coral, fixo, anunciava uma ameaça que não existe. */}
      {!reordenando && totais.ameacas.total > 0 && (
        <div className="objetivos-legenda">
          <span className="objetivo-rotulo">Riscos por estado</span>
          {LEGENDA_AMEACA.filter(([, campo]) => totais.ameacas[campo] > 0).map(([estado, campo]) => (
            <span className="objetivos-legenda-item" key={estado}>
              <span className="ameaca-quadro" data-estado={estado} aria-hidden="true" />
              {ROTULO_AMEACA[estado]}{' '}
              <span className="objetivo-cifra">{totais.ameacas[campo]}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
