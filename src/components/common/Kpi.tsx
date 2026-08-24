import type { ReactNode } from 'react';
import type { TierKind } from '../../lib/calculations';

/**
 * O tile de indicador do app inteiro.
 *
 * Existia em três cópias quase idênticas — `RegistroTab/KpiCards`,
 * `GraficosTab/KpiStrip` e `TarefasTab/TarefasKpiCards` — mais dois grids
 * escritos à mão no Rastro e na Triagem. No CSS a coisa era pior: `.kpi-card` e
 * `.kpi-tile` eram a MESMA regra com dois nomes, o que dava dois tamanhos de
 * número para o mesmo papel dependendo da aba em que se estava.
 *
 * O acento é semântico e viaja por atributo (`data-accent`), nunca por style
 * inline — é o que mantém o tema escuro fora dos componentes.
 */

/** Acento da barra lateral: a marca, ou uma faixa de criticidade. */
export type AcentoKpi = 'brand' | TierKind;

interface KpiProps {
  label: string;
  /** O número. String para caber '—', '42%' e '12 / 30' sem casos especiais. */
  valor: ReactNode;
  /** Linha discreta ao lado ou abaixo do número. */
  sub?: ReactNode;
  acento?: AcentoKpi;
  /** Fração 0–1: desenha a barra de progresso sob o número. */
  progresso?: number;
  /** Aviso de que o número está incompleto — nunca deixar lacuna passar por zero. */
  alerta?: ReactNode;
  /**
   * Torna o tile clicável. Só quando o clique FAZ algo: tile inerte com
   * aparência de botão é affordance falsa, e foi por isso que o hover-lift
   * saiu daqui.
   */
  onClick?: () => void;
  /** Para o tile clicável que filtra: marca o recorte vigente. */
  ativo?: boolean;
  /**
   * Ocupa a linha inteira em tela estreita. Só para o tile que carrega barra
   * de progresso — comprimido a meia largura, o progresso vira enfeite.
   */
  largo?: boolean;
  title?: string;
}

export function Kpi({
  label, valor, sub, acento = 'brand', progresso, alerta, onClick, ativo, largo, title,
}: KpiProps) {
  const classe = largo ? 'kpi-card wide' : 'kpi-card';
  const corpo = (
    <div className="kpi-body">
      <div className="kpi-label">{label}</div>
      {sub != null && typeof sub === 'string' ? (
        <>
          <div className="kpi-value">{valor}</div>
          <div className="kpi-value-sub">{sub}</div>
        </>
      ) : sub != null ? (
        <div className="kpi-value-row">
          <div className="kpi-value">{valor}</div>
          <span className="kpi-value-sub">{sub}</span>
        </div>
      ) : (
        <div className="kpi-value">{valor}</div>
      )}
      {progresso != null && (
        <div className="kpi-progress-track">
          <div
            className="kpi-progress-bar"
            style={{ width: `${Math.round(Math.max(0, Math.min(1, progresso)) * 100)}%` }}
          />
        </div>
      )}
      {alerta != null && (
        <div className="bento-lacuna">
          <span aria-hidden="true">▲</span>
          {alerta}
        </div>
      )}
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={classe}
        data-accent={acento}
        aria-pressed={ativo}
        onClick={onClick}
        title={title}
      >
        {corpo}
      </button>
    );
  }

  return (
    <div className={classe} data-accent={acento} title={title}>
      {corpo}
    </div>
  );
}

interface KpiRowProps {
  children: ReactNode;
  /**
   * Número fixo de colunas. Sem isto a faixa se ajusta sozinha a partir de
   * 160px por tile, que é o que quase toda aba quer.
   *
   * Vai por atributo, não por `style` inline: inline venceria a media query
   * que reduz a faixa a duas colunas em tela estreita, e os quatro tiles
   * ficariam espremidos em 320px.
   */
  colunas?: 3 | 4;
}

/** Faixa de KPIs. Uma grade só, para as abas pararem de inventar a sua. */
export function KpiRow({ children, colunas }: KpiRowProps) {
  return (
    <div className="kpi-strip" data-colunas={colunas}>
      {children}
    </div>
  );
}
