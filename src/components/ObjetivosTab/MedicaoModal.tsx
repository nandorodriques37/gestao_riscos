import { useState } from 'react';
import type { Medicao, Objetivo } from '../../types';
import type { UsePortfolio } from '../../hooks/usePortfolio';
import { progressoObjetivo, hojeISO } from '../../lib/portfolioMetrics';
import { formatarData, formatarNumero } from '../../lib/portfolioLabels';
import { ModalShell } from '../common/ModalShell';
import { CampoTexto, CampoNumero } from '../common/Campo';

interface MedicaoModalProps {
  objetivo: Objetivo;
  medicoes: Medicao[];
  pf: UsePortfolio;
  onClose: () => void;
}

/**
 * Registro de leituras do indicador. É a tela que tira o "atingido" do campo da
 * fé: sem série, marcar um objetivo como alcançado é opinião.
 *
 * O histórico fica visível e apagável aqui mesmo — uma leitura errada precisa
 * poder sair, senão ela distorce a tendência para sempre.
 */
export function MedicaoModal({ objetivo, medicoes, pf, onClose }: MedicaoModalProps) {
  const [data, setData] = useState(hojeISO());
  const [valor, setValor] = useState<number | null>(null);
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);

  const progresso = progressoObjetivo(objetivo, medicoes);
  const serie = [...progresso.serie].reverse();
  const unidade = objetivo.unidade ? ` ${objetivo.unidade}` : '';

  const daqui = medicoes
    .filter(m => m.objetivo_id === objetivo.id)
    .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? ''));

  async function registrar() {
    if (valor == null || !data) return;
    setSalvando(true);
    const ok = await pf.createEntidade('medicoes', {
      objetivo_id: objetivo.id, data, valor, obs,
    });
    setSalvando(false);
    if (ok) { setValor(null); setObs(''); }
  }

  async function apagar(m: Medicao) {
    if (!window.confirm(
      `Apagar a leitura de ${formatarData(m.data)}? A tendência é recalculada sem ela.`,
    )) return;
    await pf.deleteEntidade('medicoes', m.id);
  }

  return (
    <ModalShell
      largo
      titulo={objetivo.indicador || 'Medições do objetivo'}
      subtitulo={objetivo.descricao}
      onClose={onClose}
      rodape={
        <div className="modal-footer-actions">
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
        </div>
      }
    >
      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Baseline</div>
          <div className="stat-valor tabular">{formatarNumero(objetivo.baseline, 1)}{unidade}</div>
        </div>
        <div className="stat" data-destaque={progresso.atual != null}>
          <div className="stat-label">Hoje</div>
          <div className="stat-valor tabular">
            {progresso.atual == null ? '—' : `${formatarNumero(progresso.atual, 1)}${unidade}`}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Meta</div>
          <div className="stat-valor tabular">{formatarNumero(objetivo.meta, 1)}{unidade}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Leituras</div>
          <div className="stat-valor tabular">{serie.length}</div>
        </div>
      </div>

      <div className="modal-section-title">Nova leitura</div>
      <div className="form-grid-3">
        <CampoTexto label="Data" tipo="date" valor={data} onChange={setData} />
        <CampoNumero
          label="Valor"
          valor={valor}
          onChange={setValor}
          sufixo={objetivo.unidade || undefined}
        />
        <CampoTexto
          label="Observação"
          valor={obs}
          onChange={setObs}
          placeholder="De onde saiu o número"
        />
      </div>
      <div className="actions-row" style={{ marginTop: 'var(--sp-3)' }}>
        <button
          className="btn btn-navy"
          onClick={() => { void registrar(); }}
          disabled={salvando || valor == null || !data}
        >
          {salvando ? 'Registrando…' : 'Registrar leitura'}
        </button>
      </div>

      {(!objetivo.baseline && objetivo.baseline !== 0) || (!objetivo.meta && objetivo.meta !== 0) ? (
        <div className="form-aviso">
          Este objetivo está sem baseline ou sem meta. As leituras são gravadas do mesmo jeito,
          mas sem os dois extremos não há caminho para medir — a barra de progresso fica vazia.
        </div>
      ) : null}

      <div className="modal-section-title">Histórico</div>
      {daqui.length === 0 ? (
        <div className="campo-ajuda">
          Nenhuma leitura ainda. A primeira já vale: com ela o objetivo deixa de ser uma
          intenção com número no fim.
        </div>
      ) : (
        <table className="marcos-tabela">
          <thead>
            <tr>
              <th>Data</th>
              <th className="num">Valor</th>
              <th>Observação</th>
              <th style={{ width: 64 }} />
            </tr>
          </thead>
          <tbody>
            {daqui.map(m => (
              <tr key={m.id}>
                <td className="num">{formatarData(m.data)}</td>
                <td className="num" data-rotulo="Valor">{formatarNumero(m.valor, 1)}{unidade}</td>
                <td data-rotulo="Observação">{m.obs || '—'}</td>
                <td>
                  <button className="link-ini" onClick={() => { void apagar(m); }}>Apagar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ModalShell>
  );
}
