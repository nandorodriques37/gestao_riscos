import { useDraftGuard } from '../../hooks/useDraftGuard';
import { useRef, useState } from 'react';
import type { Pessoa } from '../../types';
import { ModalShell } from '../common/ModalShell';
import { CampoTexto, CampoNumero } from '../common/Campo';

interface PessoaModalProps {
  /** Ausente = cadastro novo. */
  pessoa?: Pessoa;
  onSalvar: (dados: Record<string, unknown>) => Promise<boolean>;
  onExcluir?: () => void;
  onClose: () => void;
  erro?: string | null;
}

export function PessoaModal({ pessoa, onSalvar, onExcluir, onClose, erro }: PessoaModalProps) {
  const [d, setD] = useState(() => ({
    nome: pessoa?.nome ?? '',
    papel: pessoa?.papel ?? '',
    area: pessoa?.area ?? '',
    dias_projeto_mes: pessoa?.dias_projeto_mes ?? null,
    ativo: pessoa?.ativo ?? true,
  }));
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
    try { ok = await onSalvar({ ...d, nome: d.nome.trim() });
    } catch { setFalha('Não foi possível salvar. Seu rascunho foi mantido.'); }
    finally { busy.current = false; setSalvando(false); }
    if (ok) onClose(); else setFalha('Não foi possível salvar. Revise os campos e tente novamente.');
  }

  return (
    <ModalShell
      titulo={pessoa ? 'Editar pessoa' : 'Nova pessoa'}
      subtitulo="Quem executa. É daqui que saem o dono do objetivo, da iniciativa e da ação."
      onClose={fechar} busy={salvando} error={erro || falha}
      rodape={
        <>
          {onExcluir && <button className="btn modal-btn-delete" disabled={salvando} onClick={onExcluir}>Excluir</button>}
          <div className="modal-footer-actions">
            <button className="btn btn-ghost" onClick={fechar}>Cancelar</button>
            <button
              className="btn modal-btn-save"
              onClick={() => { void salvar(); }}
              disabled={salvando || d.nome.trim().length === 0}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </>
      }
    >
      <CampoTexto label="Nome" valor={d.nome} onChange={v => set('nome', v)} />

      <div className="form-grid-2">
        <CampoTexto
          label="Papel"
          valor={d.papel}
          onChange={v => set('papel', v)}
          placeholder="Especialista de S&OP, Coordenador…"
        />
        <CampoTexto
          label="Área"
          valor={d.area}
          onChange={v => set('area', v)}
          placeholder="Abastecimento CD, Central de Pedidos…"
        />
      </div>

      <CampoNumero
        label="Capacidade de projeto"
        valor={d.dias_projeto_mes}
        onChange={v => set('dias_projeto_mes', v)}
        min={0}
        max={22}
        step={0.5}
        sufixo="dias por mês"
        ajuda={
          <>
            Quanto do mês desta pessoa cabe em projeto, fora a rotina. É contra este teto que
            o Painel acusa sobrecarga — deixado em branco, a carga dela aparece sem régua.
          </>
        }
      />

      <div className="form-campo">
        <label className="ini-meta" style={{ marginTop: 0, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={d.ativo}
            onChange={e => set('ativo', e.target.checked)}
          />
          Ativo
        </label>
        <div className="campo-ajuda">
          Quem saiu do time fica inativo, não excluído: o histórico de quem era dono do quê
          continua de pé.
        </div>
      </div>
    </ModalShell>
  );
}
