import { useMemo } from 'react';
import type { Marco } from '../../types';
import { hojeISO } from '../../lib/portfolioMetrics';
import { formatarData } from '../../lib/portfolioLabels';
import { estadoDoMarco, dataEfetiva } from '../../lib/marcos';

interface TrilhaMarcosProps {
  marcos: Marco[];
  hoje?: Date;
}

/**
 * Trilha de marcos: uma linha do tempo onde o círculo cheio é onde o marco está
 * hoje e o círculo vazado é onde ele foi prometido. A distância entre os dois é
 * o atraso — e ela não some quando alguém replaneja, que é justamente o ponto.
 *
 * Regras do skill `dataviz`: marca fina, eixo recessivo, anel de 2px de
 * superfície em marca que se sobrepõe, e cada marcador leva o número que o liga
 * à tabela abaixo — identidade nunca só por cor.
 */
export function TrilhaMarcos({ marcos, hoje = new Date() }: TrilhaMarcosProps) {
  const hojeStr = hojeISO(hoje);

  const dados = useMemo(() => {
    const datas: string[] = [];
    for (const m of marcos) {
      if (m.data_plano_original) datas.push(m.data_plano_original);
      const efetiva = dataEfetiva(m);
      if (efetiva) datas.push(efetiva);
    }
    if (datas.length === 0) return null;

    datas.push(hojeStr);
    const min = datas.reduce((a, b) => (a < b ? a : b));
    const max = datas.reduce((a, b) => (a > b ? a : b));

    const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
    const span = t(max) - t(min);
    // Janela de um dia só: tudo no centro, sem divisão por zero.
    const pos = (iso: string) => (span === 0 ? 50 : ((t(iso) - t(min)) / span) * 100);

    return { min, max, pos };
  }, [marcos, hojeStr]);

  if (!dados) {
    return (
      <div className="trilha-vazia">
        Nenhum marco com data. A trilha mede a distância entre o que foi prometido e
        onde as entregas estão hoje — sem data, não há o que medir.
      </div>
    );
  }

  const { min, max, pos } = dados;
  // Margem interna para os marcadores das pontas não serem cortados.
  const escalar = (iso: string) => 3 + (pos(iso) / 100) * 94;

  const ordenados = [...marcos].sort((a, b) => {
    const da = dataEfetiva(a) ?? '';
    const db = dataEfetiva(b) ?? '';
    return da.localeCompare(db);
  });

  return (
    <div
      className="trilha"
      role="img"
      aria-label={`Trilha de ${marcos.length} marcos, de ${formatarData(min)} a ${formatarData(max)}`}
    >
      <div className="trilha-eixo" />

      <div className="trilha-hoje" style={{ left: `${escalar(hojeStr)}%` }} />
      <div className="trilha-hoje-label" style={{ left: `${escalar(hojeStr)}%` }}>hoje</div>

      {ordenados.map((m, idx) => {
        const efetiva = dataEfetiva(m);
        if (!efetiva) return null;
        const estado = estadoDoMarco(m, hojeStr);
        const original = m.data_plano_original;
        const escorregou = original != null && original !== efetiva;
        const x = escalar(efetiva);
        const xOriginal = original ? escalar(original) : x;

        return (
          <div key={m.id}>
            {escorregou && (
              <>
                <div
                  className="trilha-slip"
                  style={{
                    left: `${Math.min(x, xOriginal)}%`,
                    width: `${Math.abs(x - xOriginal)}%`,
                  }}
                />
                <div
                  className="trilha-fantasma"
                  style={{ left: `${xOriginal}%` }}
                  title={`Prometido para ${formatarData(original)}`}
                />
              </>
            )}
            <div
              className="trilha-marco"
              data-estado={estado}
              style={{ left: `${x}%` }}
              title={`${idx + 1}. ${m.nome || 'Marco sem nome'} — ${formatarData(efetiva)}`}
            >
              {idx + 1}
            </div>
          </div>
        );
      })}

      <div className="trilha-tick" style={{ left: '3%' }}>{formatarData(min)}</div>
      <div className="trilha-tick" style={{ left: '97%' }}>{formatarData(max)}</div>
    </div>
  );
}

/** Legenda da trilha. Fica fora do gráfico para não competir com as marcas. */
export function LegendaTrilha() {
  return (
    <div className="ini-meta" style={{ marginTop: 'var(--sp-3)' }}>
      <span className="trilha-legenda-item">
        <span className="marco-num" data-estado="entregue" aria-hidden="true">✓</span> Entregue
      </span>
      <span className="trilha-legenda-item">
        <span className="marco-num" data-estado="previsto" aria-hidden="true">•</span> Previsto
      </span>
      <span className="trilha-legenda-item">
        <span className="marco-num" data-estado="atrasado" aria-hidden="true">!</span> Vencido
      </span>
      <span className="trilha-legenda-item">
        <span className="trilha-legenda-fantasma" aria-hidden="true" /> Prometido no plano original
      </span>
    </div>
  );
}
