import { useDraftGuard } from '../../hooks/useDraftGuard';
import { useRef, useState } from 'react';
import type { Objetivo, Pessoa } from '../../types';
import { HORIZONTES, STATUS_OBJETIVO } from '../../types';
import { ROTULO_HORIZONTE, ROTULO_STATUS_OBJETIVO } from '../../lib/portfolioLabels';
import { ModalShell } from '../common/ModalShell';
import { CampoTexto, CampoArea, CampoNumero, CampoSelect, CampoRef } from '../common/Campo';

interface ObjetivoModalProps {
  /** Ausente = criação. */
  objetivo?: Objetivo;
  pessoas: Pessoa[];
  onSalvar: (dados: Record<string, unknown>) => Promise<boolean>;
  onExcluir?: () => void;
  onClose: () => void;
  erro?: string | null;
}

const NOVO = {
  descricao: '', horizonte: '' as Objetivo['horizonte'], indicador: '', unidade: '',
  baseline: null as number | null, meta: null as number | null,
  prazo: '', dono_id: null as string | null, status: 'ativo' as Objetivo['status'],
};

/**
 * Formulário de objetivo. Diferente do `EditModal` de risco, aqui o rascunho só
 * vai ao servidor no salvar: objetivo é entidade de poucos itens, editada
 * raramente, e um PATCH por tecla não compra nada.
 */
export function ObjetivoModal({ objetivo, pessoas, onSalvar, onExcluir, onClose, erro }: ObjetivoModalProps) {
  const [d, setD] = useState(() => (objetivo
    ? {
        descricao: objetivo.descricao, horizonte: objetivo.horizonte,
        indicador: objetivo.indicador, unidade: objetivo.unidade,
        baseline: objetivo.baseline, meta: objetivo.meta,
        prazo: objetivo.prazo ?? '', dono_id: objetivo.dono_id, status: objetivo.status,
      }
    : NOVO));
  const [salvando, setSalvando] = useState(false);
  const initial = useRef(JSON.stringify(d));
  const busy = useRef(false);
  const [falha, setFalha] = useState('');
  const fechar = useDraftGuard(JSON.stringify(d) !== initial.current, salvando, onClose);

  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD(p => ({ ...p, [k]: v }));

  async function salvar() {
    if (busy.current) return;
    busy.current = true; setFalha('');
    setSalvando(true);
    let ok = false;
    try { ok = await onSalvar({ ...d, prazo: d.prazo || null });
    } catch { setFalha('Não foi possível salvar. Seu rascunho foi mantido.'); }
    finally { busy.current = false; setSalvando(false); }
    if (ok) onClose(); else setFalha('Não foi possível salvar. Revise os campos e tente novamente.');
  }

  const podeSalvar = d.descricao.trim().length > 0 && !salvando;

  return (
    <ModalShell
      titulo={objetivo ? 'Editar objetivo' : 'Novo objetivo'}
      subtitulo="O porquê do portfólio. Poucos e ativos — três a seis dão conta de um ano."
      onClose={fechar} busy={salvando} error={erro || falha}
      rodape={
        <>
          {onExcluir && (
            <button className="btn modal-btn-delete" disabled={salvando} onClick={onExcluir}>Excluir</button>
          )}
          <div className="modal-footer-actions">
            <button className="btn btn-ghost" onClick={fechar}>Cancelar</button>
            <button
              className="btn modal-btn-save"
              onClick={() => { void salvar(); }}
              disabled={!podeSalvar}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </>
      }
    >
      <CampoArea
        label="Objetivo"
        valor={d.descricao}
        onChange={v => set('descricao', v)}
        placeholder="Resultado de negócio buscado — não a atividade que leva até ele"
        linhas={2}
      />

      <div className="form-grid-3">
        <CampoSelect
          label="Horizonte"
          valor={d.horizonte}
          onChange={v => set('horizonte', v)}
          opcoes={HORIZONTES}
          rotulo={v => ROTULO_HORIZONTE[v]}
          vazio="Sem horizonte"
        />
        <CampoRef
          label="Dono"
          valor={d.dono_id}
          onChange={v => set('dono_id', v)}
          opcoes={pessoas.map(p => ({ id: p.id, nome: p.nome }))}
          vazio="Sem dono"
        />
        <CampoSelect
          label="Status"
          valor={d.status}
          onChange={v => set('status', v)}
          opcoes={STATUS_OBJETIVO}
          rotulo={v => ROTULO_STATUS_OBJETIVO[v]}
        />
      </div>

      <div className="modal-section-title">Indicador principal</div>

      <div className="form-grid-2">
        <CampoTexto
          label="Indicador"
          valor={d.indicador}
          onChange={v => set('indicador', v)}
          placeholder="Ruptura de gôndola, cobertura de estoque, acuracidade da previsão…"
        />
        <CampoTexto
          label="Unidade"
          valor={d.unidade}
          onChange={v => set('unidade', v)}
          placeholder="%, R$, dias"
        />
      </div>

      <div className="form-grid-3">
        <CampoNumero
          label="Baseline"
          valor={d.baseline}
          onChange={v => set('baseline', v)}
          ajuda="Onde o indicador está hoje."
        />
        <CampoNumero
          label="Meta"
          valor={d.meta}
          onChange={v => set('meta', v)}
          ajuda="Onde precisa chegar."
        />
        <CampoTexto
          label="Prazo"
          tipo="date"
          valor={d.prazo}
          onChange={v => set('prazo', v)}
        />
      </div>
    </ModalShell>
  );
}
