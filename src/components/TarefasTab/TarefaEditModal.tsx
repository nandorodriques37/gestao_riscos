import { useEffect, useRef, useState } from 'react';
import type { Task, TaskAttachment } from '../../types';
import type { VinculoDaLinha } from '../../lib/taskRows';
import type { TaskSaveStatus } from '../../hooks/useTasks';
import { computeGUT, gutTier, prioridadeLabel } from '../../lib/taskCalculations';
import { AnexosEditor } from './AnexosEditor';

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

const SAVE_STATUS_TEXT: Record<TaskSaveStatus, string> = {
  saving: 'Salvando…',
  saved: 'Alterações salvas',
  error: 'Falha ao salvar — tentando novamente…',
  conflict: 'Alterado por outra pessoa — dados atualizados',
};

interface TarefaEditModalProps {
  task: Task;
  /** Id da tarefa no banco — os anexos são gravados por endpoint próprio. */
  taskId: string;
  anexos: TaskAttachment[];
  saveStatus?: TaskSaveStatus;
  /**
   * Grava o rascunho. O nome do dono vai JUNTO, e não por uma chamada própria:
   * duas gravações na mesma ação viram dois PATCH com a mesma versão esperada,
   * e o segundo volta 409 — o dono se perdia calado ao salvar campo e
   * responsável de uma vez.
   */
  onCommit: (patch: Partial<Task>, donoNome?: string) => void;
  onClose: () => void;
  onDelete: () => void;
  onAddAnexo: (file: File) => Promise<void>;
  onRemoveAnexo: (anexoId: string) => Promise<void>;
  tipoOptions: string[];
  responsavelOptions: string[];
  /** Preenchido quando esta linha é mitigação de um risco. */
  vinculo?: VinculoDaLinha | null;
  /** Nome de quem responde hoje — vem da pessoa vinculada. */
  dono?: string;
}

const STATUS_SELECT_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'A fazer' },
  { value: 'Em andamento', label: 'Em andamento' },
  { value: 'Concluída', label: 'Concluída' },
  // Entrou com a unificação: a mitigação sempre teve esse estado.
  { value: 'Cancelada', label: 'Cancelada' },
];

function numOrNull(value: string): number | null {
  return value === '' ? null : parseFloat(value);
}

export function TarefaEditModal({
  task, taskId, anexos, saveStatus, onCommit, onClose, onDelete,
  onAddAnexo, onRemoveAnexo, tipoOptions, responsavelOptions,
  vinculo = null, dono = '',
}: TarefaEditModalProps) {
  // Rascunho local: digitar altera só este estado (instantâneo, sem re-render
  // global, sem rede). A gravação acontece por ação explícita — ver commit().
  const [draft, setDraft] = useState<Task>(task);
  const [donoNome, setDonoNome] = useState(dono);
  const [dirty, setDirty] = useState(false);
  const gut = computeGUT(draft);
  const prioridade = prioridadeLabel(gut);
  const cardRef = useRef<HTMLDivElement>(null);

  function setField(patch: Partial<Task>) {
    setDraft(d => ({ ...d, ...patch }));
    setDirty(true);
  }

  // Grava apenas os campos que mudaram em relação à tarefa salva.
  function commit() {
    const patch: Partial<Task> = {};
    (Object.keys(draft) as (keyof Task)[]).forEach(key => {
      // `dono_id` sai do nome digitado, não do rascunho — ver `onCommitDono`.
      if (key === 'dono_id') return;
      if (draft[key] !== task[key]) (patch as Record<string, unknown>)[key] = draft[key];
    });
    const mudouDono = donoNome.trim() !== dono.trim();
    if (Object.keys(patch).length === 0 && !mudouDono) return;
    onCommit(patch, mudouDono ? donoNome.trim() : undefined);
    setDirty(false);
  }

  function requestClose() {
    if (dirty) commit();
    onClose();
  }

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
        aria-label="Editar tarefa"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleTrapKeyDown}
      >
        <div className="modal-header">
          <div>
            <div className="modal-title">Editar tarefa</div>
            <div className={`modal-subtitle${saveStatus ? ` modal-subtitle-${saveStatus}` : ''}`} role="status" aria-live="polite">
              {saveStatus
                ? SAVE_STATUS_TEXT[saveStatus]
                : dirty ? 'Alterações não salvas' : 'Sem alterações pendentes'}
            </div>
          </div>
          <button className="modal-close" onClick={requestClose}>×</button>
        </div>

        <div className="modal-body">
          <datalist id="dl-tipo">{tipoOptions.map(o => <option key={o} value={o} />)}</datalist>
          <datalist id="dl-responsavel-tarefa">{responsavelOptions.map(o => <option key={o} value={o} />)}</datalist>

          {vinculo && (
            <div className="modal-vinculo" data-tier={vinculo.tier}>
              <span className="modal-vinculo-rotulo">
                {vinculo.rotina ? 'Controle contínuo do risco' : 'Mitiga o risco'}
              </span>
              <span className="modal-vinculo-nome">
                {vinculo.risco || (vinculo.orfa ? 'risco excluído' : '…')}
              </span>
              {vinculo.iniciativa && (
                <span className="modal-vinculo-ini">
                  executada na iniciativa <strong>{vinculo.iniciativa}</strong>
                </span>
              )}
            </div>
          )}

          <div>
            <div className="modal-section-title">Identificação</div>
            <div className="modal-grid-3">
              <div>
                <div className="modal-field-label">Tipo</div>
                <input className="modal-input" list="dl-tipo" value={draft.tipo} onChange={e => setField({ tipo: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="modal-field-label">Tarefa</div>
              <textarea className="modal-textarea" rows={2} value={draft.tarefa} onChange={e => setField({ tarefa: e.target.value })} />
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="modal-field-label">Detalhes</div>
              <textarea className="modal-textarea" rows={2} value={draft.detalhes} onChange={e => setField({ detalhes: e.target.value })} />
            </div>
          </div>

          <div>
            <div className="modal-section-title">Priorização GUT</div>
            <div className="modal-grid-4">
              <div>
                <div className="modal-field-label">Gravidade (1-5)</div>
                <input
                  className="modal-input" type="number" min={1} max={5} step={1}
                  value={draft.g ?? ''}
                  onChange={e => setField({ g: numOrNull(e.target.value) })}
                />
              </div>
              <div>
                <div className="modal-field-label">Urgência (1-5)</div>
                <input
                  className="modal-input" type="number" min={1} max={5} step={1}
                  value={draft.u ?? ''}
                  onChange={e => setField({ u: numOrNull(e.target.value) })}
                />
              </div>
              <div>
                <div className="modal-field-label">Tendência (1-5)</div>
                <input
                  className="modal-input" type="number" min={1} max={5} step={1}
                  value={draft.t ?? ''}
                  onChange={e => setField({ t: numOrNull(e.target.value) })}
                />
              </div>
              <div>
                <div className="modal-field-label">GUT</div>
                <div className="tier-chip-lg" data-tier={gutTier(gut)}>
                  <span className="tier-dot" />
                  {gut ?? '—'}{prioridade ? ` · ${prioridade}` : ''}
                </div>
              </div>
            </div>
          </div>

          <div>
            {/* Fora do rascunho local: imagem sobe na hora, não no "Salvar". */}
            <div className="modal-section-title">Imagens anexadas</div>
            <AnexosEditor
              taskId={taskId}
              anexos={anexos}
              onAdd={onAddAnexo}
              onRemove={onRemoveAnexo}
            />
          </div>

          <div>
            <div className="modal-section-title">Gestão e Acompanhamento</div>
            <div className="modal-grid-3">
              <div>
                <div className="modal-field-label">Responsável</div>
                {/* Nome que vira pessoa: casa com uma ficha existente ou
                    cadastra uma nova ao salvar. Vale para tarefa livre e para
                    mitigação — desde que dono virou um só, não há dois lugares
                    para editar a mesma coisa. */}
                <input
                  className="modal-input"
                  list="dl-responsavel-tarefa"
                  value={donoNome}
                  placeholder="Quem"
                  onChange={e => { setDonoNome(e.target.value); setDirty(true); }}
                />
              </div>
              <div>
                <div className="modal-field-label">Status</div>
                <select className="modal-input" value={draft.status} onChange={e => setField({ status: e.target.value })}>
                  {STATUS_SELECT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </div>
              <div>
                <div className="modal-field-label">Prazo</div>
                <input
                  type="date"
                  className="modal-input"
                  value={draft.prazo ?? ''}
                  onChange={e => setField({ prazo: e.target.value || null })}
                  disabled={!!vinculo?.rotina}
                  title={vinculo?.rotina ? 'Controle contínuo não tem prazo' : undefined}
                />
                {vinculo?.rotina && <div className="modal-field-hint">Controle contínuo — sem prazo.</div>}
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="modal-field-label">Observações</div>
              <textarea className="modal-textarea" rows={2} value={draft.obs} onChange={e => setField({ obs: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="modal-btn-delete" onClick={onDelete}>Excluir tarefa</button>
          <div className="modal-footer-actions">
            <button className="modal-btn-save" onClick={commit} disabled={!dirty}>Salvar</button>
            <button className="modal-btn-done" onClick={requestClose}>Concluído</button>
          </div>
        </div>
      </div>
    </div>
  );
}
