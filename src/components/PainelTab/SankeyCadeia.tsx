import type { Tab } from '../../types';
import type { CamadaCadeia, ChaveLacuna, FluxoDaCadeia, PontaSolta } from '../../lib/portfolioMetrics';
import { onActivateKey } from '../../lib/a11y';

/**
 * A cadeia como fluxo: quatro colunas, faixas proporcionais entre vizinhas e,
 * em coral, o que está solto em cada ponta. É a peça de assinatura do Painel
 * — a fileira anterior de quatro contadores prometia relação e entregava
 * contagem.
 *
 * SVG inline, sem lib, como os donuts e a matriz. Este componente não calcula
 * nada: recebe `fluxoDaCadeia` pronto e desenha. Os números das pontas soltas
 * são os mesmos da lista de atenção logo abaixo, e clicar numa ponta abre o
 * mesmo recorte que o botão dela — dois caminhos para o mesmo buraco, com a
 * mesma conta.
 *
 * A altura de cada coluna cresce com a RAIZ QUADRADA do total, não com o
 * total. Três objetivos e sessenta tarefas na mesma tela é a forma normal
 * deste domínio, não uma exceção; em escala linear os objetivos viravam um
 * fio de 10px e nada à esquerda se lia. As partes DENTRO de uma coluna (o que
 * está ligado, o que está solto) continuam proporcionais entre si, e todo
 * número está escrito — a altura sugere, o número afirma.
 *
 * Regras do dataviz do projeto: vão de superfície entre preenchimentos
 * vizinhos, legenda sempre presente, identidade nunca por cor sozinha (todo
 * número está escrito), e uma alternativa textual para o leitor de tela.
 * Abaixo de 760px este desenho some e a fileira de elos volta: quatro colunas
 * com rótulo não cabem em 360px.
 */

const LARG = 1000;
const ALT = 300;
const TOPO = 52;
const ALTURA = 210;
const LARG_NO = 16;
const COMP_SOLTO = 64;
const X = [40, 340, 640, 1000 - 40 - LARG_NO] as const;

const ROTULO: Record<CamadaCadeia, string> = {
  objetivo: 'Objetivos', iniciativa: 'Iniciativas', risco: 'Riscos', trabalho: 'Tarefas e ações',
};
const DESTINO: Record<CamadaCadeia, Tab> = {
  objetivo: 'objetivos', iniciativa: 'iniciativas', risco: 'registro', trabalho: 'tarefas',
};
const NOME_SOLTO: Record<ChaveLacuna, string> = {
  objetivo_sem_iniciativa: 'sem iniciativa',
  iniciativa_sem_objetivo: 'sem objetivo',
  iniciativa_sem_marco: 'sem marco',
  iniciativa_parada: 'paradas',
  risco_sem_tratamento: 'sem tratamento',
  risco_sem_objetivo: 'só mitigação autônoma',
  trabalho_sem_dono: 'sem dono',
  trabalho_atrasado: 'atrasadas',
};
/** Nome da ponta solta que não é lacuna — depende da camada, não da chave. */
const NOME_LIVRE: Record<CamadaCadeia, string> = {
  objetivo: 'sem iniciativa', iniciativa: 'sem risco coberto', risco: 'sem trabalho', trabalho: 'livres',
};

interface SankeyCadeiaProps {
  fluxo: FluxoDaCadeia;
  onIrPara: (tab: Tab) => void;
  onAbrirLacuna: (chave: ChaveLacuna) => void;
}

interface NoPosicionado { camada: CamadaCadeia; total: number; x: number; y: number; h: number }

function faixa(x1: number, a1: number, b1: number, x2: number, a2: number, b2: number): string {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${a1} C ${mx} ${a1}, ${mx} ${a2}, ${x2} ${a2} L ${x2} ${b2} C ${mx} ${b2}, ${mx} ${b1}, ${x1} ${b1} Z`;
}

/** Toco que sai (ou chega) afunilando: o elo que não continua. */
function toco(x: number, a: number, b: number, sentido: 1 | -1): string {
  const xf = x + sentido * COMP_SOLTO;
  const recuo = (b - a) * 0.3;
  return `M ${x} ${a} L ${xf} ${a + recuo} L ${xf} ${b - recuo} L ${x} ${b} Z`;
}

export function SankeyCadeia({ fluxo, onIrPara, onAbrirLacuna }: SankeyCadeiaProps) {
  const maxRaiz = Math.max(1, ...fluxo.nos.map(n => Math.sqrt(n.total)));
  const nos: NoPosicionado[] = fluxo.nos.map((no, k) => {
    const h = no.total === 0 ? 0 : Math.max(14, (Math.sqrt(no.total) / maxRaiz) * ALTURA);
    return { ...no, x: X[k], y: TOPO + (ALTURA - h) / 2, h };
  });
  const fracao = (no: NoPosicionado, n: number) => (no.total === 0 ? 0 : no.h * (n / no.total));

  const resumo = fluxo.elos.map(e => {
    const partes = [`${e.ligados} ${ROTULO[e.para].toLowerCase()} ligadas a ${ROTULO[e.de].toLowerCase()}`];
    e.soltosDe.filter(s => s.n > 0).forEach(s => partes.push(`${s.n} ${ROTULO[e.de].toLowerCase()} ${s.chave ? NOME_SOLTO[s.chave] : NOME_LIVRE[e.de]}`));
    e.soltosPara.filter(s => s.n > 0).forEach(s => partes.push(`${s.n} ${ROTULO[e.para].toLowerCase()} ${s.chave ? NOME_SOLTO[s.chave] : NOME_LIVRE[e.para]}`));
    return partes.join(' · ');
  });

  return (
    <div className="cadeia-sankey">
      <svg
        className="sankey"
        viewBox={`0 0 ${LARG} ${ALT}`}
        role="img"
        aria-label={`Fluxo da cadeia. ${resumo.join('. ')}.`}
      >
        {fluxo.elos.map((e, k) => {
          const A = nos[k];
          const B = nos[k + 1];
          const soltosDeN = e.soltosDe.reduce((s, x) => s + x.n, 0);
          const ligadosDe = Math.max(0, A.total - soltosDeN);
          const bandaA = fracao(A, ligadosDe);
          const bandaB = fracao(B, e.ligados);
          const xA = A.x + LARG_NO;
          const xB = B.x;
          const elementos = [];

          if (e.ligados > 0 && ligadosDe > 0) {
            elementos.push(
              <path key="faixa" className="sankey-faixa" data-camada={e.para} d={faixa(xA, A.y, A.y + bandaA, xB, B.y, B.y + bandaB)}>
                <title>{`${e.ligados} ${ROTULO[e.para].toLowerCase()} ligadas a ${ROTULO[e.de].toLowerCase()}`}</title>
              </path>,
              <text key="faixa-n" className="sankey-n" x={(xA + xB) / 2} y={(A.y + bandaA / 2 + B.y + bandaB / 2) / 2 + 4} textAnchor="middle">{e.ligados}</text>,
            );
          }

          // Pontas soltas: abaixo da faixa, cada uma com a própria altura.
          let yDe = A.y + bandaA;
          e.soltosDe.forEach((s: PontaSolta, i: number) => {
            if (s.n === 0) return;
            const h = Math.max(6, fracao(A, s.n));
            const nome = s.chave ? NOME_SOLTO[s.chave] : NOME_LIVRE[e.de];
            const chave = s.chave;
            elementos.push(
              <g
                key={`de-${i}`}
                className="sankey-solto"
                data-tipo={chave ? 'lacuna' : 'livre'}
                role={chave ? 'button' : undefined}
                tabIndex={chave ? 0 : undefined}
                aria-label={chave ? `${s.n} ${ROTULO[e.de].toLowerCase()} ${nome} — abrir` : undefined}
                onClick={chave ? () => onAbrirLacuna(chave) : undefined}
                onKeyDown={chave ? onActivateKey(() => onAbrirLacuna(chave)) : undefined}
              >
                <title>{`${s.n} ${ROTULO[e.de].toLowerCase()} ${nome}`}</title>
                <path d={toco(xA, yDe, yDe + h, 1)} />
                <text className="sankey-solto-n" x={xA + 6} y={yDe + h / 2 + 4} textAnchor="start">
                  {s.n} <tspan className="sankey-solto-nome">{nome}</tspan>
                </text>
              </g>,
            );
            yDe += h;
          });

          let yPara = B.y + bandaB;
          e.soltosPara.forEach((s: PontaSolta, i: number) => {
            if (s.n === 0) return;
            const h = Math.max(6, fracao(B, s.n));
            const nome = s.chave ? NOME_SOLTO[s.chave] : NOME_LIVRE[e.para];
            const chave = s.chave;
            elementos.push(
              <g
                key={`para-${i}`}
                className="sankey-solto"
                data-tipo={chave ? 'lacuna' : 'livre'}
                role={chave ? 'button' : undefined}
                tabIndex={chave ? 0 : undefined}
                aria-label={chave ? `${s.n} ${ROTULO[e.para].toLowerCase()} ${nome} — abrir` : undefined}
                onClick={chave ? () => onAbrirLacuna(chave) : undefined}
                onKeyDown={chave ? onActivateKey(() => onAbrirLacuna(chave)) : undefined}
              >
                <title>{`${s.n} ${ROTULO[e.para].toLowerCase()} ${nome}`}</title>
                <path d={toco(xB, yPara, yPara + h, -1)} />
                <text className="sankey-solto-n" x={xB - 6} y={yPara + h / 2 + 4} textAnchor="end">
                  {s.n} <tspan className="sankey-solto-nome">{nome}</tspan>
                </text>
              </g>,
            );
            yPara += h;
          });

          return <g key={k}>{elementos}</g>;
        })}

        {nos.map((no, k) => {
          const ancora = k === 0 ? 'start' : k === nos.length - 1 ? 'end' : 'middle';
          const xTexto = k === 0 ? no.x : k === nos.length - 1 ? no.x + LARG_NO : no.x + LARG_NO / 2;
          return (
            <g
              key={no.camada}
              className="sankey-no"
              data-camada={no.camada}
              role="button"
              tabIndex={0}
              aria-label={`${ROTULO[no.camada]}: ${no.total}. Abrir a seção.`}
              onClick={() => onIrPara(DESTINO[no.camada])}
              onKeyDown={onActivateKey(() => onIrPara(DESTINO[no.camada]))}
            >
              <title>{`${ROTULO[no.camada]} · ${no.total}`}</title>
              <rect x={no.x} y={no.y} width={LARG_NO} height={Math.max(no.h, 2)} rx={2} />
              <text className="sankey-rotulo" x={xTexto} y={TOPO - 28} textAnchor={ancora}>{ROTULO[no.camada]}</text>
              <text className="sankey-total" x={xTexto} y={TOPO - 10} textAnchor={ancora}>{no.total}</text>
            </g>
          );
        })}
      </svg>

      <ul className="sankey-legenda" aria-hidden="true">
        <li><span className="sankey-swatch" data-tipo="faixa" /> ligados à camada anterior</li>
        <li><span className="sankey-swatch" data-tipo="lacuna" /> elo partido — clique abre quem resolve</li>
        <li><span className="sankey-swatch" data-tipo="livre" /> solto por natureza (tarefa livre, iniciativa de oportunidade)</li>
      </ul>
    </div>
  );
}
