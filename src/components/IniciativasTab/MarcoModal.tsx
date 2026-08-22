import { useState } from 'react';
import type { Marco } from '../../types';
import { STATUS_MARCO } from '../../types';
import { ROTULO_STATUS_MARCO, formatarDataLonga } from '../../lib/portfolioLabels';
import { ModalShell } from '../common/ModalShell';
import { CampoTexto, CampoArea, CampoSelect } from '../common/Campo';

interface MarcoModalProps {
  /** Ausente = criação. */
  marco?: Marco;
  iniciativaId: string;
  iniciativaNome: string;
  onSalvar: (dados: Record<string, unknown>) => Promise<boolean>;
  onExcluir?: () => void;
  onClose: () => void;
}

export function MarcoModal({
  marco, iniciativaId, iniciativaNome, onSalvar, onExcluir, onClose,
}: MarcoModalProps) {
  const [d, setD] = useState(() => ({
    nome: marco?.nome ?? '',
    criterio_aceite: marco?.criterio_aceite ?? '',
    data_plano_original: marco?.data_plano_original ?? '',
    data_plano_atual: marco?.data_plano_atual ?? '',
    data_real: marco?.data_real ?? '',
    status: marco?.status ?? ('previsto' as Marco['status']),
    motivo_replanejamento: '',
  }));
  const [salvando, setSalvando] = useState(false);

  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD(p => ({ ...p, [k]: v }));

  // Regra 3: a data original é a régua do atraso. Depois de gravada, não muda —
  // nem aqui nem no servidor, que devolve 400.
  const originalTravada = Boolean(marco?.data_plano_original);
  // Regra 4: só é replanejamento quando já havia uma data. Preencher pela
  // primeira vez não exige justificativa.
  const replanejando = Boolean(marco?.data_plano_atual)
    && d.data_plano_atual !== marco?.data_plano_atual;
  const faltaMotivo = replanejando && d.motivo_replanejamento.trim().length === 0;

  async function salvar() {
    setSalvando(true);
    const dados: Record<string, unknown> = {
      iniciativa_id: iniciativaId,
      nome: d.nome,
      criterio_aceite: d.criterio_aceite,
      data_plano_atual: d.data_plano_atual || null,
      data_real: d.data_real || null,
      status: d.status,
    };
    // Só manda a data original quando ela ainda pode ser gravada; reenviar o
    // mesmo valor numa data travada faria o servidor recusar por regra 3.
    if (!originalTravada) dados.data_plano_original = d.data_plano_original || null;
    if (replanejando) dados.motivo_replanejamento = d.motivo_replanejamento;

    const ok = await onSalvar(dados);
    setSalvando(false);
    if (ok) onClose();
  }

  const podeSalvar = d.nome.trim().length > 0 && !faltaMotivo && !salvando;

  return (
    <ModalShell
      titulo={marco ? 'Editar marco' : 'Novo marco'}
      subtitulo={iniciativaNome}
      onClose={onClose}
      rodape={
        <>
          {onExcluir && <button className="btn modal-btn-delete" onClick={onExcluir}>Excluir</button>}
          <div className="modal-footer-actions">
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
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
      <CampoTexto
        label="Marco"
        valor={d.nome}
        onChange={v => set('nome', v)}
        placeholder="Um entregável, não uma atividade"
        ajuda="“Motor de previsão rodando em produção para 3 CDs”, não “trabalhar no motor”."
      />

      <CampoArea
        label="Critério de aceite"
        valor={d.criterio_aceite}
        onChange={v => set('criterio_aceite', v)}
        placeholder="Como se verifica que este marco caiu?"
        linhas={2}
        ajuda="Marco é binário: entregue ou não. Sem critério, vira percentual autodeclarado."
      />

      <div className="form-grid-3">
        {originalTravada ? (
          <div className="form-campo">
            <div className="modal-field-label">Plano original</div>
            <div className="modal-input" style={{ display: 'flex', alignItems: 'center', color: 'var(--ink-3)' }}>
              <span className="tabular">{formatarDataLonga(marco?.data_plano_original)}</span>
            </div>
            <div className="campo-ajuda">Congelada. É a régua contra a qual o atraso é medido.</div>
          </div>
        ) : (
          <CampoTexto
            label="Plano original"
            tipo="date"
            valor={d.data_plano_original}
            onChange={v => set('data_plano_original', v)}
            ajuda="Grava uma vez só e nunca mais muda."
          />
        )}
        <CampoTexto
          label="Plano atual"
          tipo="date"
          valor={d.data_plano_atual}
          onChange={v => set('data_plano_atual', v)}
        />
        <CampoTexto
          label="Entrega real"
          tipo="date"
          valor={d.data_real}
          onChange={v => set('data_real', v)}
        />
      </div>

      <CampoSelect
        label="Status"
        valor={d.status}
        onChange={v => set('status', v)}
        opcoes={STATUS_MARCO}
        rotulo={v => ROTULO_STATUS_MARCO[v]}
      />

      {replanejando && (
        <>
          <CampoArea
            label="Motivo do replanejamento"
            valor={d.motivo_replanejamento}
            onChange={v => set('motivo_replanejamento', v)}
            placeholder="Por que a data mudou?"
            linhas={2}
          />
          <div className="form-aviso">
            A data planejada saiu de {formatarDataLonga(marco?.data_plano_atual)} para{' '}
            {formatarDataLonga(d.data_plano_atual || null)}. Mover data exige motivo — é o que
            transforma o slip em informação em vez de silêncio.
          </div>
        </>
      )}
    </ModalShell>
  );
}
