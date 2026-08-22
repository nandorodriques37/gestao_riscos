import type { AcaoRisco, Iniciativa } from '../../types';
import type { EstadoTratamento } from '../../lib/portfolioMetrics';
import {
  ROTULO_STATUS_ACAO, BADGE_STATUS_ACAO, ROTULO_STATUS_INICIATIVA,
  formatarData, plural,
} from '../../lib/portfolioLabels';
import { ROTULO_TRATAMENTO, BADGE_TRATAMENTO, AJUDA_TRATAMENTO } from '../../lib/portfolioUi';

interface AcoesVinculadasProps {
  acoes: AcaoRisco[];
  iniciativas: Iniciativa[];
  estado: EstadoTratamento;
  onAbrirIniciativa: (id: string) => void;
  onPromover: (acao: AcaoRisco) => void;
}

/**
 * Bloco somente-leitura das mitigações que saíram deste risco e viraram linha
 * própria. Não é o editor do plano de ação — esse continua acima, intacto.
 *
 * O que este bloco acrescenta é o DESTINO de cada mitigação: autônoma, ou
 * dentro de uma iniciativa. É a informação que o plano em texto nunca teve, e a
 * que explica por que o estado de tratamento à direita é o que é.
 */
export function AcoesVinculadas({
  acoes, iniciativas, estado, onAbrirIniciativa, onPromover,
}: AcoesVinculadasProps) {
  const porId = new Map(iniciativas.map(i => [i.id, i]));

  return (
    <div>
      <div className="modal-section-title">Mitigações e para onde foram</div>

      <div className="ini-meta" style={{ marginTop: 0, marginBottom: 'var(--sp-3)' }}>
        <span className="badge" data-badge={BADGE_TRATAMENTO[estado]} title={AJUDA_TRATAMENTO[estado]}>
          {ROTULO_TRATAMENTO[estado]}
        </span>
        <span>{AJUDA_TRATAMENTO[estado]}</span>
      </div>

      {acoes.length === 0 ? (
        <div className="campo-ajuda">
          Nenhuma mitigação extraída para linha própria ainda. Enquanto a extração não roda,
          o plano de ação acima continua sendo a única versão — e o rastro não tem o que seguir.
        </div>
      ) : (
        <div className="rastro-grid">
          {acoes.map(a => {
            const ini = a.iniciativa_id ? porId.get(a.iniciativa_id) : undefined;
            return (
              <div className="acao-card" data-em-iniciativa={Boolean(ini)} key={a.id}>
                <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-1)', lineHeight: 1.45 }}>
                  {a.descricao}
                </div>
                <div className="ini-meta">
                  <span className="badge" data-badge={BADGE_STATUS_ACAO[a.status]}>
                    {ROTULO_STATUS_ACAO[a.status]}
                  </span>
                  {a.prazo && <span className="tabular">{formatarData(a.prazo)}</span>}
                </div>
                {ini ? (
                  <div className="ini-meta">
                    <span>dentro de</span>
                    <button className="link-ini" onClick={() => onAbrirIniciativa(ini.id)}>
                      {ini.nome || 'Iniciativa sem nome'}
                    </button>
                    <span>· {ROTULO_STATUS_INICIATIVA[ini.status]}</span>
                  </div>
                ) : (
                  <div className="ini-meta">
                    <span>mitigação autônoma</span>
                    <button className="link-ini" onClick={() => onPromover(a)}>
                      promover a iniciativa
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {acoes.length > 0 && (
        <div className="campo-ajuda" style={{ marginTop: 'var(--sp-3)' }}>
          {plural(acoes.filter(a => a.iniciativa_id).length, 'mitigação é executada', 'mitigações são executadas')}
          {' '}dentro de uma iniciativa. Nesses casos, marcar a ação não basta: o risco só conta
          como tratado quando a iniciativa concluir.
        </div>
      )}
    </div>
  );
}
