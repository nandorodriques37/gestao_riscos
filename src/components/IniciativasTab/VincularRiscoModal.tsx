import { useMemo, useState } from 'react';
import type { AcaoRisco, StoredRiskRecord } from '../../types';
import { computeScore, scoreTier } from '../../lib/calculations';
import { ROTULO_STATUS_ACAO, BADGE_STATUS_ACAO, nomeRisco } from '../../lib/portfolioLabels';
import { ModalShell } from '../common/ModalShell';

interface VincularRiscoModalProps {
  iniciativaNome: string;
  riscos: StoredRiskRecord[];
  acoes: AcaoRisco[];
  /** Já cobertos por esta iniciativa — não aparecem na busca. */
  jaCobertos: Set<string>;
  /** Prende uma ação existente a esta iniciativa. */
  onAnexar: (acaoId: string) => Promise<boolean>;
  /** Cria uma ação nova para o risco, já apontando para esta iniciativa. */
  onCriar: (riscoId: string, descricao: string) => Promise<boolean>;
  onClose: () => void;
}

/**
 * Lado (b) do vínculo bidirecional: da iniciativa, dizer qual risco ela trata.
 *
 * É o que permite uma iniciativa nascida de oportunidade passar a cobrir um
 * risco sem falsear a origem — `fonte` continua sendo o que ela foi, e a
 * cobertura cresce por fora.
 *
 * O vínculo mora na AÇÃO, nunca no risco: um risco pode ter cinco mitigações
 * com destinos diferentes. Por isso aqui só há dois caminhos — prender uma ação
 * que já existe, ou criar a ação que descreve o que esta iniciativa faz por
 * esse risco.
 */
export function VincularRiscoModal({
  iniciativaNome, riscos, acoes, jaCobertos, onAnexar, onCriar, onClose,
}: VincularRiscoModalProps) {
  const [busca, setBusca] = useState('');
  const [riscoId, setRiscoId] = useState<string | null>(null);
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const candidatos = useMemo(() => {
    const q = busca.toLowerCase().trim();
    return riscos
      .filter(r => r.risco && !jaCobertos.has(r.id))
      .filter(r => !q || [r.risco, r.area, r.categoria, r.rotina].join(' ').toLowerCase().includes(q))
      .slice(0, 40);
  }, [riscos, jaCobertos, busca]);

  const risco = riscoId ? riscos.find(r => r.id === riscoId) ?? null : null;

  // Ações do risco que ainda não estão dentro de nenhuma iniciativa.
  const soltas = useMemo(
    () => (riscoId ? acoes.filter(a => a.risco_id === riscoId && !a.iniciativa_id) : []),
    [acoes, riscoId],
  );

  async function anexar(acaoId: string) {
    setSalvando(true);
    const ok = await onAnexar(acaoId);
    setSalvando(false);
    if (ok) onClose();
  }

  async function criar() {
    if (!riscoId) return;
    setSalvando(true);
    const ok = await onCriar(riscoId, descricao.trim());
    setSalvando(false);
    if (ok) onClose();
  }

  return (
    <ModalShell
      largo
      titulo="Vincular um risco"
      subtitulo={`Riscos que “${iniciativaNome}” passa a tratar`}
      onClose={onClose}
      rodape={
        <div className="modal-footer-actions">
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
        </div>
      }
    >
      {!risco ? (
        <>
          <input
            className="search-input"
            style={{ maxWidth: 'none', width: '100%' }}
            placeholder="Buscar risco por texto, área ou categoria…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
          {candidatos.length === 0 ? (
            <div className="bento-sub" style={{ marginTop: 'var(--sp-3)' }}>
              Nenhum risco encontrado fora dos que esta iniciativa já cobre.
            </div>
          ) : (
            <div className="lista-linhas">
              {candidatos.map(r => {
                const score = computeScore(r);
                return (
                  <div className="lista-linha" key={r.id}>
                    <button
                      className="lista-texto link-ini"
                      style={{ fontSize: 'var(--fs-xs)', fontWeight: 'var(--fw-medium)' }}
                      onClick={() => setRiscoId(r.id)}
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
        </>
      ) : (
        <>
          <button className="link-ini" onClick={() => { setRiscoId(null); setDescricao(''); }}>
            ‹ Escolher outro risco
          </button>

          <div className="rastro-risco" style={{ marginTop: 'var(--sp-3)' }}>{nomeRisco(risco)}</div>
          <div className="ini-meta">
            <span>{risco.area}</span>
            {risco.categoria && <><span>·</span><span>{risco.categoria}</span></>}
            {risco.resposta && <><span>·</span><span>{risco.resposta}</span></>}
          </div>

          {soltas.length > 0 && (
            <>
              <div className="modal-section-title">Prender uma ação que já existe</div>
              <div className="bento-sub">
                Estas mitigações já estão cadastradas neste risco e ainda são autônomas.
                Prender uma delas faz o risco só contar como tratado quando esta iniciativa concluir.
              </div>
              <div className="lista-linhas">
                {soltas.map(a => (
                  <div className="lista-linha" key={a.id}>
                    <span className="lista-texto" title={a.descricao}>{a.descricao}</span>
                    <span className="badge" data-badge={BADGE_STATUS_ACAO[a.status]}>
                      {ROTULO_STATUS_ACAO[a.status]}
                    </span>
                    <button
                      className="btn btn-outline-navy"
                      onClick={() => { void anexar(a.id); }}
                      disabled={salvando}
                    >
                      Prender
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="modal-section-title">
            {soltas.length > 0 ? 'Ou descrever uma mitigação nova' : 'Descrever a mitigação'}
          </div>
          <div className="form-campo">
            <textarea
              className="modal-textarea"
              rows={2}
              placeholder="O que esta iniciativa faz por este risco?"
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
            />
            <div className="campo-ajuda">
              Cria uma ação vinculada a esta iniciativa. O plano de ação que está dentro do
              registro de risco não é alterado.
            </div>
          </div>
          <div className="actions-row" style={{ marginTop: 'var(--sp-3)' }}>
            <button
              className="btn btn-navy"
              onClick={() => { void criar(); }}
              disabled={salvando || descricao.trim().length === 0}
            >
              {salvando ? 'Vinculando…' : 'Vincular risco'}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}
