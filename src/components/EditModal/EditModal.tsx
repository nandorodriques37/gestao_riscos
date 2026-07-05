import { useEffect, useRef } from 'react';
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
  onUpdate: (patch: Partial<RiskRecord>) => void;
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
  record, saveStatus, onUpdate, onClose, onDelete,
  areaOptions, rotinaOptions, categoriaOptions, recursoOptions, responsavelOptions,
}: EditModalProps) {
  const score = computeScore(record);
  const prioriz = computePrioriz(record);
  const cardRef = useRef<HTMLDivElement>(null);

  // Foco inicial no primeiro campo e retorno do foco ao elemento anterior ao fechar.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const first = cardRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  // Retém o foco dentro do modal (Tab/Shift+Tab cíclicos).
  function handleTrapKeyDown(e: React.KeyboardEvent) {
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
    <div className="modal-overlay" onClick={onClose}>
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
              {saveStatus ? SAVE_STATUS_TEXT[saveStatus] : 'Alterações são salvas automaticamente'}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
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
                <input className="modal-input" list="dl-area" value={record.area} onChange={e => onUpdate({ area: e.target.value })} />
              </div>
              <div>
                <div className="modal-field-label">Rotina</div>
                <input className="modal-input" list="dl-rotina" value={record.rotina} onChange={e => onUpdate({ rotina: e.target.value })} />
              </div>
              <div>
                <div className="modal-field-label">Categoria</div>
                <input className="modal-input" list="dl-categoria" value={record.categoria} onChange={e => onUpdate({ categoria: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="modal-field-label">Risco</div>
              <textarea className="modal-textarea" rows={2} value={record.risco} onChange={e => onUpdate({ risco: e.target.value })} />
            </div>
          </div>

          <div>
            <div className="modal-section-title">Avaliação do Risco Inerente</div>
            <div className="modal-grid-4">
              <div>
                <div className="modal-field-label">Resposta</div>
                <select className="modal-input" value={record.resposta} onChange={e => onUpdate({ resposta: e.target.value })}>
                  <option value="">—</option>
                  {RESPOSTA_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div>
                <div className="modal-field-label">Probabilidade (0-5)</div>
                <input
                  className="modal-input" type="number" min={0} max={5} step={1}
                  value={record.probab ?? ''}
                  onChange={e => onUpdate({ probab: numOrNull(e.target.value) })}
                />
              </div>
              <div>
                <div className="modal-field-label">Impacto (0-5)</div>
                <input
                  className="modal-input" type="number" min={0} max={5} step={1}
                  value={record.impact ?? ''}
                  onChange={e => onUpdate({ impact: numOrNull(e.target.value) })}
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
                <textarea className="modal-textarea" rows={2} value={record.acoes} onChange={e => onUpdate({ acoes: e.target.value })} />
              </div>
              <div>
                <div className="modal-field-label">Resultado Esperado</div>
                <textarea className="modal-textarea" rows={2} value={record.resultado} onChange={e => onUpdate({ resultado: e.target.value })} />
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
                  value={record.esforco ?? ''}
                  onChange={e => onUpdate({ esforco: numOrNull(e.target.value) })}
                />
              </div>
              <div>
                <div className="modal-field-label">Impacto (0-5)</div>
                <input
                  className="modal-input" type="number" min={0} max={5} step={0.5}
                  value={record.impacto2 ?? ''}
                  onChange={e => onUpdate({ impacto2: numOrNull(e.target.value) })}
                />
              </div>
              <div>
                <div className="modal-field-label">Gravidade (0-5)</div>
                <input
                  className="modal-input" type="number" min={0} max={5} step={0.5}
                  value={record.gravidade ?? ''}
                  onChange={e => onUpdate({ gravidade: numOrNull(e.target.value) })}
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
                <input className="modal-input" list="dl-recurso" value={record.recurso} onChange={e => onUpdate({ recurso: e.target.value })} />
              </div>
              <div>
                <div className="modal-field-label">Responsável</div>
                <input className="modal-input" list="dl-responsavel" value={record.responsavel} onChange={e => onUpdate({ responsavel: e.target.value })} />
              </div>
              <div>
                <div className="modal-field-label">Status</div>
                <select className="modal-input" value={record.status} onChange={e => onUpdate({ status: e.target.value })}>
                  {STATUS_SELECT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="modal-field-label">Observação</div>
              <textarea className="modal-textarea" rows={2} value={record.obs} onChange={e => onUpdate({ obs: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="modal-btn-delete" onClick={onDelete}>Excluir registro</button>
          <button className="modal-btn-done" onClick={onClose}>Concluído</button>
        </div>
      </div>
    </div>
  );
}
