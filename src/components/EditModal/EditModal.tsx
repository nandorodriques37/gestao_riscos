import { useEffect, useRef, useState } from 'react';
import type { RiskRecord } from '../../types';
import type { SaveStatus } from '../../hooks/useRecords';
import { computeScore, computePrioriz, round1, round2, scoreColor, priorizColor } from '../../lib/calculations';

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

const SAVE_STATUS_TEXT: Record<SaveStatus, string> = {
  saving: 'Salvando…',
  saved: 'Alterações salvas',
  error: 'Falha ao salvar — tentando novamente…',
  conflict: 'Alterado por outra pessoa — dados atualizados',
};

interface EditModalProps {
  record: RiskRecord;
  saveStatus?: SaveStatus;
  onCommit: (patch: Partial<RiskRecord>) => void;
  onClose: () => void;
  onDelete: () => void;
  areaOptions: string[];
  rotinaOptions: string[];
  categoriaOptions: string[];
  recursoOptions: string[];
  responsavelOptions: string[];
}

const RESPOSTA_OPTIONS = ['Mitigar', 'Aceitar', 'Transferir', 'Evitar'];
const STATUS_SELECT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Não iniciado' },
  { value: 'Em andamento', label: 'Em andamento' },
  { value: 'Concluído', label: 'Concluído' },
];

function numOrNull(value: string): number | null {
  return value === '' ? null : parseFloat(value);
}

export function EditModal({
  record, saveStatus, onCommit, onClose, onDelete,
  areaOptions, rotinaOptions, categoriaOptions, recursoOptions, responsavelOptions,
}: EditModalProps) {
  // Rascunho local: digitar altera só este estado (instantâneo, sem re-render
  // global, sem rede). A gravação acontece por ação explícita — ver commit().
  const [draft, setDraft] = useState<RiskRecord>(record);
  const [dirty, setDirty] = useState(false);
  const score = computeScore(draft);
  const prioriz = computePrioriz(draft);
  const cardRef = useRef<HTMLDivElement>(null);

  function setField(patch: Partial<RiskRecord>) {
    setDraft(d => ({ ...d, ...patch }));
    setDirty(true);
  }

  // Grava apenas os campos que mudaram em relação ao registro salvo.
  function commit() {
    const patch: Partial<RiskRecord> = {};
    (Object.keys(draft) as (keyof RiskRecord)[]).forEach(key => {
      if (draft[key] !== record[key]) (patch as Record<string, unknown>)[key] = draft[key];
    });
    if (Object.keys(patch).length === 0) return;
    onCommit(patch);
    setDirty(false);
  }

  function requestClose() {
    if (dirty) commit();
    onClose();
  }

  // Foco inicial no primeiro campo e retorno do foco ao elemento anterior ao fechar.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const first = cardRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  // Retém o foco dentro do modal (Tab/Shift+Tab cíclicos) e fecha no Esc,
  // gravando o rascunho antes de sair.
  function handleTrapKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); requestClose(); return; }
    if (e.key !== 'Tab' || !cardRef.current) return;
    const items = Array.from(cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter(el => el.offsetParent !== null);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="modal-overlay" onClick={requestClose}>
      <div
        ref={cardRef}
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Editar registro de risco"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleTrapKeyDown}
      >
        <div className="modal-header">
          <div>
            <div className="modal-title">Editar registro</div>
            <div className={`modal-subtitle${saveStatus ? ` modal-subtitle-${saveStatus}` : ''}`} role="status" aria-live="polite">
              {saveStatus
                ? SAVE_STATUS_TEXT[saveStatus]
                : dirty ? 'Alterações não salvas' : 'Sem alterações pendentes'}
            </div>
          </div>
          <button className="modal-close" onClick={requestClose}>×</button>
        </div>

        <div className="modal-body">
          <datalist id="dl-area">{areaOptions.map(o => <option key={o} value={o} />)}</datalist>
          <datalist id="dl-rotina">{rotinaOptions.map(o => <option key={o} value={o} />)}</datalist>
          <datalist id="dl-categoria">{categoriaOptions.map(o => <option key={o} value={o} />)}</datalist>
          <datalist id="dl-recurso">{recursoOptions.map(o => <option key={o} value={o} />)}</datalist>
          <datalist id="dl-responsavel">{responsavelOptions.map(o => <option key={o} value={o} />)}</datalist>

          <div>
            <div className="modal-section-title">Identificação</div>
            <div className="modal-grid-3">
              <div>
                <div className="modal-field-label">Área</div>
                <input className="modal-input" list="dl-area" value={draft.area} onChange={e => setField({ area: e.target.value })} />
              </div>
              <div>
                <div className="modal-field-label">Rotina</div>
                <input className="modal-input" list="dl-rotina" value={draft.rotina} onChange={e => setField({ rotina: e.target.value })} />
              </div>
              <div>
                <div className="modal-field-label">Categoria</div>
                <input className="modal-input" list="dl-categoria" value={draft.categoria} onChange={e => setField({ categoria: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="modal-field-label">Risco</div>
              <textarea className="modal-textarea" rows={2} value={draft.risco} onChange={e => setField({ risco: e.target.value })} />
            </div>
          </div>

          <div>
            <div className="modal-section-title">Avaliação do Risco Inerente</div>
            <div className="modal-grid-4">
              <div>
                <div className="modal-field-label">Resposta</div>
                <select className="modal-input" value={draft.resposta} onChange={e => setField({ resposta: e.target.value })}>
                  <option value="">—</option>
                  {RESPOSTA_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div>
                <div className="modal-field-label">Probabilidade (0-5)</div>
                <input
                  className="modal-input" type="number" min={0} max={5} step={1}
                  value={draft.probab ?? ''}
                  onChange={e => setField({ probab: numOrNull(e.target.value) })}
                />
              </div>
              <div>
                <div className="modal-field-label">Impacto (0-5)</div>
                <input
                  className="modal-input" type="number" min={0} max={5} step={1}
                  value={draft.impact ?? ''}
                  onChange={e => setField({ impact: numOrNull(e.target.value) })}
                />
              </div>
              <div>
                <div className="modal-field-label">Score</div>
                <div className="badge-modal" style={{ background: scoreColor(score) }}>
                  {score != null ? round1(score) : '—'}
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="modal-section-title">Plano de Ação</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div className="modal-field-label">Ações</div>
                <textarea className="modal-textarea" rows={2} value={draft.acoes} onChange={e => setField({ acoes: e.target.value })} />
              </div>
              <div>
                <div className="modal-field-label">Resultado Esperado</div>
                <textarea className="modal-textarea" rows={2} value={draft.resultado} onChange={e => setField({ resultado: e.target.value })} />
              </div>
            </div>
          </div>

          <div>
            <div className="modal-section-title">Priorização do Esforço</div>
            <div className="modal-grid-4">
              <div>
                <div className="modal-field-label">Esforço (0-5)</div>
                <input
                  className="modal-input" type="number" min={0} max={5} step={0.5}
                  value={draft.esforco ?? ''}
                  onChange={e => setField({ esforco: numOrNull(e.target.value) })}
                />
              </div>
              <div>
                <div className="modal-field-label">Impacto (0-5)</div>
                <input
                  className="modal-input" type="number" min={0} max={5} step={0.5}
                  value={draft.impacto2 ?? ''}
                  onChange={e => setField({ impacto2: numOrNull(e.target.value) })}
                />
              </div>
              <div>
                <div className="modal-field-label">Gravidade (0-5)</div>
                <input
                  className="modal-input" type="number" min={0} max={5} step={0.5}
                  value={draft.gravidade ?? ''}
                  onChange={e => setField({ gravidade: numOrNull(e.target.value) })}
                />
              </div>
              <div>
                <div className="modal-field-label">Priorização</div>
                <div className="badge-modal" style={{ background: priorizColor(prioriz) }}>
                  {prioriz != null ? round2(prioriz) : '—'}
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="modal-section-title">Gestão e Acompanhamento</div>
            <div className="modal-grid-3">
              <div>
                <div className="modal-field-label">Recurso</div>
                <input className="modal-input" list="dl-recurso" value={draft.recurso} onChange={e => setField({ recurso: e.target.value })} />
              </div>
              <div>
                <div className="modal-field-label">Responsável</div>
                <input className="modal-input" list="dl-responsavel" value={draft.responsavel} onChange={e => setField({ responsavel: e.target.value })} />
              </div>
              <div>
                <div className="modal-field-label">Status</div>
                <select className="modal-input" value={draft.status} onChange={e => setField({ status: e.target.value })}>
                  {STATUS_SELECT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="modal-field-label">Observação</div>
              <textarea className="modal-textarea" rows={2} value={draft.obs} onChange={e => setField({ obs: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="modal-btn-delete" onClick={onDelete}>Excluir registro</button>
          <div className="modal-footer-actions">
            <button className="modal-btn-save" onClick={commit} disabled={!dirty}>Salvar</button>
            <button className="modal-btn-done" onClick={requestClose}>Concluído</button>
          </div>
        </div>
      </div>
    </div>
  );
}
