import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Task, TaskAttachment } from '../../types';
import type { VinculoDaLinha } from '../../lib/taskRows';
import type { TaskSaveStatus } from '../../hooks/useTasks';
import { computeGUT, gutTier, prioridadeLabel } from '../../lib/taskCalculations';
import { AnexosEditor } from './AnexosEditor';
import { useBloqueioDeRolagem } from '../../hooks/useBloqueioDeRolagem';

import { useDraftGuard } from '../../hooks/useDraftGuard';

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

const SAVE_STATUS_TEXT: Record<TaskSaveStatus, string> = {
  saving: 'Salvando…',
  saved: 'Alterações salvas',
  error: 'Falha ao salvar — tente novamente',
  conflict: 'Alterado por outra pessoa — dados atualizados',
};

interface TarefaEditModalProps {
  task: Task;
  /** Id da tarefa no banco — os anexos são gravados por endpoint próprio. */
  taskId: string;
  version: number;
  error?: string | null;
  anexos: TaskAttachment[];
  saveStatus?: TaskSaveStatus;
  /**
   * Grava o rascunho. O nome do dono vai JUNTO, e não por uma chamada própria:
   * duas gravações na mesma ação viram dois PATCH com a mesma versão esperada,
   * e o segundo volta 409 — o dono se perdia calado ao salvar campo e
   * responsável de uma vez.
   */
  onCommit: (patch: Partial<Task>, donoNome?: string, version?: number) => Promise<boolean>;
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
  task, taskId, version, error, anexos, saveStatus, onCommit, onClose, onDelete,
  onAddAnexo, onRemoveAnexo, tipoOptions, responsavelOptions,
  vinculo = null, dono = '',
}: TarefaEditModalProps) {
  // No celular o cartão é folha colada na base; sem a trava, chegar ao fim da
  // rolagem dele passa o gesto para a página de trás.
  useBloqueioDeRolagem();

  // Rascunho local: digitar altera só este estado (instantâneo, sem re-render
  // global, sem rede). A gravação acontece por ação explícita — ver commit().
  const [draft, setDraft] = useState<Task>(task);
  const [donoNome, setDonoNome] = useState(dono);
  const [baseTask, setBaseTask] = useState(task);
  const [baseDono, setBaseDono] = useState(dono);
  const [baseVersion, setBaseVersion] = useState(version);
  const [salvando, setSalvando] = useState(false);
  const busy = useRef(false);
  const [falha, setFalha] = useState('');
  const [dirty, setDirty] = useState(false);
  const gut = computeGUT(draft);
  const prioridade = prioridadeLabel(gut);
  const cardRef = useRef<HTMLDivElement>(null);

  function setField(patch: Partial<Task>) {
    setDraft(d => ({ ...d, ...patch }));
    setDirty(true);
  }

  async function commit(): Promise<boolean> {
    if (busy.current) return false;
    if (!dirty) return true;
    busy.current = true; setSalvando(true); setFalha('');
    try {
      const patch: Partial<Task> = {};
      (Object.keys(draft) as (keyof Task)[]).forEach(key => {
        if (key === 'dono_id') return;
        if (draft[key] !== baseTask[key]) (patch as Record<string, unknown>)[key] = draft[key];
      });
      const mudouDono = donoNome.trim() !== baseDono.trim();
      const ok = await onCommit(patch, mudouDono ? donoNome.trim() : undefined, baseVersion);
      if (!ok) { setFalha('Não foi possível salvar. Seu rascunho foi mantido.'); return false; }
      setBaseTask(draft); setBaseDono(donoNome); setBaseVersion(v => v + 1); setDirty(false); return true;
    } catch (err) { setFalha(err instanceof Error ? err.message : 'Falha ao salvar.'); return false; }
    finally { busy.current = false; setSalvando(false); }
  }
  const requestClose = useDraftGuard(dirty, salvando, onClose);
  function recarregar() {
    if (dirty && !window.confirm('Descartar este rascunho e carregar a versão atual?')) return;
    setDraft(task); setBaseTask(task); setDonoNome(dono); setBaseDono(dono); setBaseVersion(version); setDirty(false); setFalha('');
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

  // Fora da árvore da aba: `position: fixed` mede a viewport, mas qualquer
  // `transform`/`filter`/`contain` num ancestral o faz medir aquele ancestral —
  // e o diálogo nasce deslocado e cortado. Foi o que a animação de entrada de
  // `.tab-page` causava (a nota está em `styles/layout.css`). A causa foi
  // removida lá; o portal impede que a próxima propriedade de pintura que
  // alguém acrescentar a um contêiner de página reabra o mesmo buraco calado.
  return createPortal((
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
          {(error || falha) && <div className="form-aviso" role="alert">{error || falha}<button className="btn btn-ghost" onClick={recarregar} disabled={salvando}>Recarregar versão atual</button></div>}
          <fieldset className="modal-fields" disabled={salvando}>
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
          </fieldset>
        </div>

        <div className="modal-footer">
          <button className="modal-btn-delete" disabled={salvando} onClick={onDelete}>Excluir tarefa</button>
          <div className="modal-footer-actions">
            <button className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
            <button className="modal-btn-save" onClick={() => { void commit(); }} disabled={!dirty || salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            <button className="modal-btn-done" disabled={salvando} onClick={() => { void commit().then(ok => { if (ok) onClose(); }); }}>Salvar e fechar</button>
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}
