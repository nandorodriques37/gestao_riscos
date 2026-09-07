import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  AcaoRisco, Iniciativa, Objetivo, Pessoa, RiskRecord, SituacaoRisco, StoredRiskRecord,
} from '../../types';
import { SITUACOES_RISCO } from '../../types';
import type { SaveStatus } from '../../hooks/useRecords';
import { computeScore, computePrioriz, round1, round2, scoreTier, priorizTier } from '../../lib/calculations';
import { estadoTratamento } from '../../lib/portfolioMetrics';
import { ROTULO_SITUACAO, AJUDA_SITUACAO, formatarDataLonga } from '../../lib/portfolioLabels';
import { ROTULO_TRATAMENTO, BADGE_TRATAMENTO, AJUDA_TRATAMENTO } from '../../lib/portfolioUi';
import {
  paraLinhas, linhasDeLegado, type LinhaPlano,
} from '../../lib/planoDeAcao';
import { AcoesEditor } from './AcoesEditor';
import { useBloqueioDeRolagem } from '../../hooks/useBloqueioDeRolagem';
import { Historico } from '../common/Historico';

import { useDraftGuard } from '../../hooks/useDraftGuard';
import type { RiscoSalvo, SalvarRiscoPedido } from '../../lib/portfolioApi';

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

const SAVE_STATUS_TEXT: Record<SaveStatus, string> = {
  saving: 'Salvando…',
  saved: 'Alterações salvas',
  error: 'Falha ao salvar — tente novamente',
  conflict: 'Alterado por outra pessoa — dados atualizados',
};

interface EditModalProps {
  /**
   * Vem do banco: o histórico precisa do `id` para filtrar a trilha, e da
   * `version` para saber que houve gravação e recarregar.
   */
  record: StoredRiskRecord;
  saveStatus?: SaveStatus;
  onCommit: (pedido: SalvarRiscoPedido) => Promise<RiscoSalvo | null>;
  error?: string | null;
  objetivos: Objetivo[];
  onClose: () => void;
  onDelete: () => void;
  areaOptions: string[];
  rotinaOptions: string[];
  categoriaOptions: string[];
  recursoOptions: string[];
  responsavelOptions: string[];
  /** O plano de ação deste risco, na sua única fonte: a tabela `acoes_risco`. */
  acoesVinculadas: AcaoRisco[];
  /** Quem já está cadastrado: dá o nome do dono de cada ação e o autocomplete. */
  pessoas: Pessoa[];
  iniciativas: Iniciativa[];
  onAbrirIniciativa: (id: string) => void;
  /**
   * Promover uma mitigação a iniciativa. Sobe para o `App` em vez de abrir um
   * modal daqui de dentro: dois diálogos empilhados brigariam pelo foco.
   */
  onPromoverAcao: (acaoId: string) => void;
  /**
   * Aplica o plano editado. Devolve o que de fato persistiu — é dele que sai o
   * resumo gravado em `acoes`, nunca do que a tela pretendia salvar.
   */
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

/** Hoje em 'YYYY-MM-DD', no fuso local — é a data que o usuário enxerga. */
function hojeParaCampo(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function EditModal({
  record, saveStatus, onCommit, onClose, onDelete, error, objetivos,
  areaOptions, rotinaOptions, categoriaOptions, recursoOptions, responsavelOptions,
  acoesVinculadas, pessoas, iniciativas,
  onAbrirIniciativa, onPromoverAcao,
}: EditModalProps) {
  // No celular o cartão é folha colada na base; sem a trava, chegar ao fim da
  // rolagem dele passa o gesto para a página de trás.
  useBloqueioDeRolagem();

  // Risco que ainda não teve o plano extraído: as linhas antigas entram como
  // rascunho novo, e só viram registro se alguém salvar. Abrir e fechar sem
  // mexer em nada não grava nada.
  const legado = acoesVinculadas.length === 0;
  // Plano como estava ao abrir. É a referência do diff.
  const [baseLinhas, setBaseLinhas] = useState<LinhaPlano[]>(
    () => (legado ? [] : paraLinhas(acoesVinculadas, pessoas)),
  );
  const [linhas, setLinhas] = useState<LinhaPlano[]>(
    () => (legado ? linhasDeLegado(record) : paraLinhas(acoesVinculadas, pessoas)),
  );
  // Rascunho local: digitar altera só este estado (instantâneo, sem re-render
  // global, sem rede). A gravação acontece por ação explícita — ver commit().
  const [draft, setDraft] = useState<RiskRecord>(() => ({ ...record }));
  const [baseRecord, setBaseRecord] = useState(record);
  const [aba, setAba] = useState('resumo');
  const savingRef = useRef(false);
  const requestRef = useRef({ fingerprint: '', chave: '' });
  const savedLines = useRef(linhas);
  const [dirty, setDirty] = useState(false);
  const [salvandoPlano, setSalvandoPlano] = useState(false);
  const [errosPlano, setErrosPlano] = useState<string[]>([]);
  const score = computeScore(draft);
  const prioriz = computePrioriz(draft);
  const cardRef = useRef<HTMLDivElement>(null);
  // Derivado, sempre do que está gravado — não do rascunho. Mudar a resposta no
  // formulário não pode mudar o estado de tratamento antes de salvar.
  const estado = estadoTratamento(record, acoesVinculadas, iniciativas);

  function setField(patch: Partial<RiskRecord>) {
    setDraft(d => ({ ...d, ...patch }));
    setDirty(true);
  }

  function setPlano(novas: LinhaPlano[]) {
    setLinhas(novas);
    setDirty(true);
  }

  async function commit(): Promise<boolean> {
    if (savingRef.current) return false;
    if (!dirty) return true;
    savingRef.current = true; setSalvandoPlano(true); setErrosPlano([]);
    try {
      const patch: Partial<RiskRecord> = {};
      (Object.keys(draft) as (keyof RiskRecord)[]).forEach(key => {
        if (key === 'acoes' || key === 'acoes_itens' || !(key in baseRecord)) return;
        if (draft[key] !== baseRecord[key]) (patch as Record<string, unknown>)[key] = draft[key];
      });
      const dados = { riscoId: record.id, expectedVersion: baseRecord.version, patch, base: baseLinhas, atual: linhas };
      const fingerprint = JSON.stringify(dados);
      if (requestRef.current.fingerprint !== fingerprint) requestRef.current = { fingerprint, chave: crypto.randomUUID() };
      const result = await onCommit({ ...dados, chave: requestRef.current.chave });
      if (!result) { setErrosPlano(['Não foi possível salvar. Seu rascunho foi mantido.']); return false; }
      setBaseRecord(result.record); setDraft(result.record);
      setBaseLinhas(result.plano.linhas); setLinhas(result.plano.linhas); savedLines.current = result.plano.linhas;
      setDirty(false); return true;
    } catch (err) { setErrosPlano([err instanceof Error ? err.message : 'Não foi possível salvar.']); return false; }
    finally { savingRef.current = false; setSalvandoPlano(false); }
  }
  const requestClose = useDraftGuard(dirty, salvandoPlano, onClose);
  async function abrirIniciativa(id: string) { if (await commit()) onAbrirIniciativa(id); }
  async function criarIniciativa(linha: LinhaPlano) {
    const index = linhas.filter(l => !l.nova || l.descricao.trim()).findIndex(l => l.id === linha.id);
    if (index >= 0 && await commit()) onPromoverAcao(savedLines.current[index]?.id ?? linha.id);
  }
  function recarregar() {
    if (dirty && !window.confirm('Descartar este rascunho e carregar a versão atual?')) return;
    setBaseRecord(record); setDraft(record);
    const atuais = paraLinhas(acoesVinculadas, pessoas);
    setBaseLinhas(atuais); setLinhas(atuais); savedLines.current = atuais;
    setDirty(false); setErrosPlano([]);
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
    if (e.key === 'Escape') { e.preventDefault(); void requestClose(); return; }
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
    <div className="modal-overlay" onClick={() => { void requestClose(); }}>
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
          <button className="modal-close" onClick={() => { void requestClose(); }}>×</button>
        </div>

        <div className="detail-context"><strong>{draft.risco || 'Risco sem descrição'}</strong><span>{draft.responsavel || 'Sem responsável'} · {ROTULO_SITUACAO[draft.situacao ?? ''] || 'Situação não definida'} · Criticidade {score ?? '—'}</span></div>
        <div className="detail-tabs" role="group" aria-label="Detalhes do risco">
          {(['resumo', 'tratamento', 'historico'] as const).map(a => <button key={a} type="button" aria-pressed={aba === a} onClick={() => setAba(a)}>
            {a === 'resumo' ? 'Resumo' : a === 'tratamento' ? 'Tratamento' : 'Histórico'}
          </button>)}
        </div>
        <div className="modal-body">
          {(error || errosPlano.length > 0) && <div className="form-aviso" role="alert">{error || errosPlano.join(' ')}
            <button type="button" className="btn btn-ghost" disabled={salvandoPlano} onClick={recarregar}>Recarregar versão atual</button>
          </div>}
          <fieldset className="modal-fields" disabled={salvandoPlano}>
          <datalist id="dl-area">{areaOptions.map(o => <option key={o} value={o} />)}</datalist>
          <datalist id="dl-rotina">{rotinaOptions.map(o => <option key={o} value={o} />)}</datalist>
          <datalist id="dl-categoria">{categoriaOptions.map(o => <option key={o} value={o} />)}</datalist>
          <datalist id="dl-recurso">{recursoOptions.map(o => <option key={o} value={o} />)}</datalist>
          <datalist id="dl-responsavel">{responsavelOptions.map(o => <option key={o} value={o} />)}</datalist>
          {/* Responsável de uma AÇÃO vira uma linha em `pessoas`, então o
              autocomplete junta quem já está cadastrado com a lista fixa —
              escolher um nome existente evita cadastrar a mesma pessoa duas vezes. */}
          <datalist id="dl-pessoas">
            {[...new Set([...pessoas.map(p => p.nome), ...responsavelOptions])]
              .map(o => <option key={o} value={o} />)}
          </datalist>

          <div hidden={aba !== 'resumo'}>
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

          <div hidden={aba !== 'resumo'}>
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
                <div className="tier-chip-lg" data-tier={scoreTier(score)}>
                  <span className="tier-dot" />
                  {score != null ? round1(score) : '—'}
                </div>
              </div>
            </div>
          </div>

          <div hidden={aba !== 'resumo'}>
            <div className="modal-section-title">Exposição e ciclo de vida</div>
            <div className="modal-grid-3">
              <div>
                <div className="modal-field-label">Exposição (R$)</div>
                <input
                  className="modal-input tabular" type="number" inputMode="decimal"
                  value={draft.exposicao_rs ?? ''}
                  onChange={e => setField({ exposicao_rs: numOrNull(e.target.value) })}
                />
                <div className="campo-ajuda">
                  Perda esperada em reais. Vazio e zero dizem coisas diferentes.
                </div>
              </div>
              <div>
                <div className="modal-field-label">Situação</div>
                <select
                  className="modal-input"
                  value={draft.situacao ?? ''}
                  onChange={e => {
                    const situacao = e.target.value as SituacaoRisco;
                    // A data é o que permite contar "mitigados no ano". Sem ela,
                    // a situação é um rótulo sem quando.
                    setField({
                      situacao,
                      data_situacao: situacao === '' ? null : hojeParaCampo(),
                    });
                  }}
                >
                  <option value="">—</option>
                  {SITUACOES_RISCO.map(s => (
                    <option key={s} value={s}>{ROTULO_SITUACAO[s]}</option>
                  ))}
                </select>
                <div className="campo-ajuda">
                  {AJUDA_SITUACAO[(draft.situacao ?? '') as SituacaoRisco]
                    || 'Mitigado, obsoleto e descartado são finais — e contam diferente.'}
                </div>
              </div>
              <div>
                <div className="modal-field-label">Desde</div>
                <div className="modal-input" style={{ display: 'flex', alignItems: 'center', color: 'var(--ink-3)' }}>
                  <span className="tabular">{formatarDataLonga(draft.data_situacao)}</span>
                </div>
                <div className="campo-ajuda">Gravada junto com a situação.</div>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="modal-field-label">Causa raiz</div>
              <textarea
                className="modal-textarea" rows={2}
                value={draft.causa_raiz ?? ''}
                onChange={e => setField({ causa_raiz: e.target.value })}
                placeholder="Por que esta ameaça existe? Tratar o sintoma não derruba o risco."
              />
            </div>
          </div>

          <div hidden={aba !== 'tratamento'}>
            <div className="modal-section-title">Plano de Ação</div>

            {/* O estado é derivado das linhas e das iniciativas que as executam.
                Fica junto do editor porque é ele que explica por que o risco
                está onde está. */}
            <div className="ini-meta" style={{ marginTop: 0, marginBottom: 'var(--sp-3)' }}>
              <span className="badge" data-badge={BADGE_TRATAMENTO[estado]}>
                {ROTULO_TRATAMENTO[estado]}
              </span>
              <span className="muted">{AJUDA_TRATAMENTO[estado]}</span>
            </div>

            {legado && linhas.length > 0 && (
              <div className="form-aviso" style={{ marginTop: 0, marginBottom: 'var(--sp-3)' }}>
                Este plano ainda está só dentro do registro. Salvar traz estas {linhas.length}{' '}
                {linhas.length === 1 ? 'ação' : 'ações'} para o rastro — até lá, o risco aparece
                como sem tratamento.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                {/* Sem rótulo "Ações": o título da seção e o cabeçalho de colunas já nomeiam a lista. */}
                <AcoesEditor
                  linhas={linhas}
                  onChange={setPlano}
                  responsavelListId="dl-pessoas"
                  iniciativas={iniciativas}
                  onAbrirIniciativa={id => { void abrirIniciativa(id); }}
                  onPromover={l => { void criarIniciativa(l); }} objetivos={objetivos} pessoas={pessoas}
                />
              </div>
              <div>
                <div className="modal-field-label">Resultado Esperado</div>
                <textarea className="modal-textarea" rows={2} value={draft.resultado} onChange={e => setField({ resultado: e.target.value })} />
              </div>
            </div>

            {errosPlano.length > 0 && (
              <div className="form-aviso" role="alert">
                {errosPlano.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}
          </div>

          <div hidden={aba !== 'tratamento'}>
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
                <div className="tier-chip-lg" data-tier={priorizTier(prioriz)}>
                  <span className="tier-dot" />
                  {prioriz != null ? round2(prioriz) : '—'}
                </div>
              </div>
            </div>
          </div>

          <div hidden={aba !== 'historico'}>
            <div className="modal-section-title">Histórico</div>
            <Historico
              registroId={record.id}
              chaveDeAtualizacao={record.version}
              vazio="Nada mudou neste risco desde que o histórico passou a existir."
            />
          </div>

          <div hidden={aba !== 'tratamento'}>
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
          </fieldset>
        </div>

        <div className="modal-footer">
          <button className="modal-btn-delete" disabled={salvandoPlano} onClick={onDelete}>Excluir registro</button>
          <div className="modal-footer-actions">
            <button className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
            <button
              className="modal-btn-save"
              onClick={() => { void commit(); }}
              disabled={!dirty || salvandoPlano}
            >
              {salvandoPlano ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              className="modal-btn-done"
              onClick={() => { void commit().then(ok => { if (ok) onClose(); }); }}
              disabled={salvandoPlano}
            >
              Salvar e fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}
