import { useRef, useState } from 'react';
import type { AcaoRisco, StoredRiskRecord } from '../../types';
import { nomeRisco, ROTULO_STATUS_ACAO } from '../../lib/portfolioLabels';
import { chaveDoNome } from '../../lib/nomes';
import { ModalShell } from '../common/ModalShell';
import { useDraftGuard } from '../../hooks/useDraftGuard';
interface Props {
  iniciativaNome: string; riscos: StoredRiskRecord[]; acoes: AcaoRisco[]; jaCobertos: Set<string>; error?: string | null;
  onAnexar: (id: string, version: number) => Promise<boolean>;
  onCriar: (riscoId: string, descricao: string) => Promise<boolean>; onClose: () => void;
}
export function VincularRiscoModal({ iniciativaNome, riscos, acoes, jaCobertos, error, onAnexar, onCriar, onClose }: Props) {
  const [busca, setBusca] = useState(''), [limit, setLimit] = useState(30), [descricao, setDescricao] = useState('');
  const [riscoId, setRiscoId] = useState<string | null>(null), [acao, setAcao] = useState<AcaoRisco | null>(null);
  const [salvando, setSalvando] = useState(false), [falha, setFalha] = useState('');
  const busy = useRef(false);
  const fechar = useDraftGuard(!!descricao || !!acao, salvando, onClose);
  const candidatos = riscos.filter(r => r.risco && chaveDoNome([r.risco, r.area, r.categoria, r.rotina].join(' ')).includes(chaveDoNome(busca)));
  const risco = riscos.find(r => r.id === riscoId);
  const soltas = acoes.filter(a => a.risco_id === riscoId && !a.iniciativa_id && a.status !== 'cancelada');
  async function confirmar() {
    if (busy.current || !riscoId) return;
    busy.current = true; setSalvando(true); setFalha('');
    try {
      const ok = acao ? await onAnexar(acao.id, acao.version) : await onCriar(riscoId, descricao.trim());
      if (ok) onClose(); else setFalha('Não foi possível salvar. Sua escolha foi mantida.');
    } finally { busy.current = false; setSalvando(false); }
  }
  return <ModalShell largo titulo="Vincular um risco" subtitulo={'Iniciativa: ' + iniciativaNome} onClose={fechar} busy={salvando} error={error || falha}
    rodape={<div className="modal-footer-actions">
      <button className="btn btn-ghost" onClick={fechar}>Cancelar</button>
      <button className="btn modal-btn-save" disabled={salvando || !risco || (!acao && !descricao.trim())} onClick={() => { void confirmar(); }}>{salvando ? 'Salvando…' : 'Confirmar vínculo'}</button>
    </div>}>
    {!risco ? <>
      <input className="modal-input" type="search" aria-label="Buscar risco" placeholder="Buscar por risco, área ou categoria…" value={busca} onChange={e => { setBusca(e.target.value); setLimit(30); }} />
      <p className="campo-ajuda">{candidatos.length} riscos encontrados. Um risco pode ter várias ações nesta iniciativa.</p>
      <div className="picker-lista">{candidatos.slice(0, limit).map(r => <button key={r.id} className="picker-opcao" onClick={() => { setRiscoId(r.id); setAcao(null); setDescricao(''); }}>
        <strong>{nomeRisco(r)}</strong><span>{r.area} · {jaCobertos.has(r.id) ? 'Já possui vínculo' : 'Sem vínculo com esta iniciativa'}</span>
      </button>)}</div>
      {candidatos.length > limit && <button className="btn btn-ghost" onClick={() => setLimit(l => l + 30)}>Mostrar mais</button>}
    </> : <>
      <button className="link-ini" onClick={() => { setRiscoId(null); setAcao(null); setDescricao(''); }}>‹ Escolher outro risco</button>
      <div className="detail-context"><strong>{nomeRisco(risco)}</strong><span>Será tratado em {iniciativaNome}</span></div>
      {soltas.length > 0 && <><div className="modal-section-title">Selecionar ação existente</div><div className="picker-lista">
        {soltas.map(a => <button key={a.id} className="picker-opcao" aria-pressed={acao?.id === a.id} onClick={() => { setAcao(a); setDescricao(''); }}>
          <strong>{a.descricao}</strong><span>{ROTULO_STATUS_ACAO[a.status]}</span>
        </button>)}</div></>}
      <div className="modal-section-title">Ou descrever uma nova ação</div>
      <textarea className="modal-textarea" rows={2} aria-label="Nova ação de mitigação" placeholder="O que esta iniciativa faz por este risco?" value={descricao} onChange={e => { setDescricao(e.target.value); setAcao(null); }} />
      <p className="campo-ajuda">A ação aparecerá no plano do risco e no quadro de tarefas, vinculada a esta iniciativa.</p>
    </>}
  </ModalShell>;
}
