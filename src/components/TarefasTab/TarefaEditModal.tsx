import { useEffect, useRef } from 'react';
import type { Task } from '../../types';
import type { TaskSaveStatus } from '../../hooks/useTasks';
import { TIER_CHIP_COLORS } from '../../lib/calculations';
import { computeGUT, gutTier, prioridadeLabel } from '../../lib/taskCalculations';

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

const SAVE_STATUS_TEXT: Record<TaskSaveStatus, string> = {
  saving: 'Salvando…',
  saved: 'Alterações salvas',
  error: 'Falha ao salvar — tentando novamente…',
  conflict: 'Alterado por outra pessoa — dados atualizados',
};

interface TarefaEditModalProps {
  task: Task;
  saveStatus?: TaskSaveStatus;
  onUpdate: (patch: Partial<Task>) => void;
  onClose: () => void;
  onDelete: () => void;
  tipoOptions: string[];
  responsavelOptions: string[];
}

const STATUS_SELECT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'A fazer' },
  { value: 'Em andamento', label: 'Em andamento' },
  { value: 'Concluída', label: 'Concluída' },
];

function numOrNull(value: string): number | null {
  return value === '' ? null : parseFloat(value);
}

export function TarefaEditModal({
  task, saveStatus, onUpdate, onClose, onDelete, tipoOptions, responsavelOptions,
}: TarefaEditModalProps) {
  const gut = computeGUT(task);
  const prioridade = prioridadeLabel(gut);
  const gutChip = TIER_CHIP_COLORS[gutTier(gut)];
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const first = cardRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

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
        aria-label="Editar tarefa"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleTrapKeyDown}
      >
        <div className="modal-header">
          <div>
            <div className="modal-title">Editar tarefa</div>
            <div className={`modal-subtitle${saveStatus ? ` modal-subtitle-${saveStatus}` : ''}`} role="status" aria-live="polite">
              {saveStatus ? SAVE_STATUS_TEXT[saveStatus] : 'Alterações são salvas automaticamente'}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <datalist id="dl-tipo">{tipoOptions.map(o => <option key={o} value={o} />)}</datalist>
          <datalist id="dl-responsavel-tarefa">{responsavelOptions.map(o => <option key={o} value={o} />)}</datalist>

          <div>
            <div className="modal-section-title">Identificação</div>
            <div className="modal-grid-3">
              <div>
                <div className="modal-field-label">Tipo</div>
                <input className="modal-input" list="dl-tipo" value={task.tipo} onChange={e => onUpdate({ tipo: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="modal-field-label">Tarefa</div>
              <textarea className="modal-textarea" rows={2} value={task.tarefa} onChange={e => onUpdate({ tarefa: e.target.value })} />
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="modal-field-label">Detalhes</div>
              <textarea className="modal-textarea" rows={2} value={task.detalhes} onChange={e => onUpdate({ detalhes: e.target.value })} />
            </div>
          </div>

          <div>
            <div className="modal-section-title">Priorização GUT</div>
            <div className="modal-grid-4">
              <div>
                <div className="modal-field-label">Gravidade (1-5)</div>
                <input
                  className="modal-input" type="number" min={1} max={5} step={1}
                  value={task.g ?? ''}
                  onChange={e => onUpdate({ g: numOrNull(e.target.value) })}
                />
              </div>
              <div>
                <div className="modal-field-label">Urgência (1-5)</div>
                <input
                  className="modal-input" type="number" min={1} max={5} step={1}
                  value={task.u ?? ''}
                  onChange={e => onUpdate({ u: numOrNull(e.target.value) })}
                />
              </div>
              <div>
                <div className="modal-field-label">Tendência (1-5)</div>
                <input
                  className="modal-input" type="number" min={1} max={5} step={1}
                  value={task.t ?? ''}
                  onChange={e => onUpdate({ t: numOrNull(e.target.value) })}
                />
              </div>
              <div>
                <div className="modal-field-label">GUT</div>
                <div className="tier-chip-lg" style={{ background: gutChip.bg, color: gutChip.fg }}>
                  <span className="tier-dot" style={{ background: gutChip.dot }} />
                  {gut ?? '—'}{prioridade ? ` · ${prioridade}` : ''}
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="modal-section-title">Gestão e Acompanhamento</div>
            <div className="modal-grid-3">
              <div>
                <div className="modal-field-label">Responsável</div>
                <input className="modal-input" list="dl-responsavel-tarefa" value={task.responsavel} onChange={e => onUpdate({ responsavel: e.target.value })} />
              </div>
              <div>
                <div className="modal-field-label">Status</div>
                <select className="modal-input" value={task.status} onChange={e => onUpdate({ status: e.target.value })}>
                  {STATUS_SELECT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="modal-field-label">Observações</div>
              <textarea className="modal-textarea" rows={2} value={task.obs} onChange={e => onUpdate({ obs: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="modal-btn-delete" onClick={onDelete}>Excluir tarefa</button>
          <button className="modal-btn-done" onClick={onClose}>Concluído</button>
        </div>
      </div>
    </div>
  );
}
