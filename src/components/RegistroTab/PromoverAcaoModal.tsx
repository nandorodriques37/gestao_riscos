import { useRef, useState } from 'react';
import type { AcaoRisco, Iniciativa, Objetivo, StoredRiskRecord } from '../../types';
import { VETORES } from '../../types';
import type { UsePortfolio } from '../../hooks/usePortfolio';
import { useDraftGuard } from '../../hooks/useDraftGuard';
import { nomeRisco, ROTULO_VETOR } from '../../lib/portfolioLabels';
import { ModalShell } from '../common/ModalShell';
import { CampoTexto, CampoArea, CampoRef, CampoSelect } from '../common/Campo';
import { IniciativaPicker } from '../common/IniciativaPicker';
interface Props {
  acao: AcaoRisco; risco: StoredRiskRecord | null; objetivos: Objetivo[]; pf: UsePortfolio;
  onClose: () => void; onPromovida: (id: string) => void;
}
export function PromoverAcaoModal({ acao, risco, objetivos, pf, onClose, onPromovida }: Props) {
  const [modo, setModo] = useState<'nova' | 'existente'>('nova');
  const [nome, setNome] = useState(acao.descricao.slice(0, 120)), [descricao, setDescricao] = useState('');
  const [objetivoId, setObjetivoId] = useState<string | null>(null), [iniciativaId, setIniciativaId] = useState<string | null>(null);
  const [donoId, setDonoId] = useState(acao.dono_id), [vetor, setVetor] = useState<Iniciativa['vetor']>('evitar_perda');
  const [salvando, setSalvando] = useState(false);
  const busy = useRef(false), request = useRef({ fingerprint: '', chave: '' });
  const fechar = useDraftGuard(nome !== acao.descricao.slice(0, 120) || !!objetivoId || !!descricao || !!iniciativaId || donoId !== acao.dono_id || vetor !== 'evitar_perda', salvando, onClose);
  async function confirmar() {
    if (busy.current) return;
    busy.current = true; setSalvando(true);
    try {
      if (modo === 'existente') {
        if (iniciativaId && await pf.patchEntidade('acoes-risco', acao.id, { iniciativa_id: iniciativaId, triagem: 'iniciativa' }, acao.version)) onPromovida(iniciativaId);
        return;
      }
      const dados = { objetivo_id: objetivoId, nome: nome.trim(), descricao, dono_id: donoId, vetor,
        esforco: risco?.esforco ?? null, impacto2: risco?.impacto2 ?? null, gravidade: risco?.gravidade ?? null,
        recurso: risco?.recurso ?? '', resultado: risco?.resultado ?? '' };
      const fingerprint = JSON.stringify(dados);
      if (request.current.fingerprint !== fingerprint) request.current = { fingerprint, chave: crypto.randomUUID() };
      const criada = await pf.criarIniciativaDaAcao({ chave: request.current.chave, acaoId: acao.id, expectedVersion: acao.version, dados });
      if (criada) onPromovida(criada.id);
    } finally { busy.current = false; setSalvando(false); }
  }
  return <ModalShell titulo="Vincular iniciativa" subtitulo="Escolha onde esta ação será executada."
    onClose={fechar} busy={salvando} error={pf.error} rodape={<div className="modal-footer-actions">
      <button className="btn btn-ghost" onClick={fechar}>Cancelar</button>
      <button className="btn modal-btn-save" disabled={salvando || (modo === 'nova' ? !objetivoId || !nome.trim() : !iniciativaId)}
        onClick={() => { void confirmar(); }}>{salvando ? 'Salvando…' : modo === 'nova' ? 'Criar e vincular' : 'Confirmar vínculo'}</button>
    </div>}>
    {risco && <div className="detail-context"><strong>{nomeRisco(risco)}</strong><span>Ação: {acao.descricao}</span></div>}
    <div className="detail-tabs" role="group" aria-label="Destino da ação">
      <button aria-pressed={modo === 'existente'} onClick={() => setModo('existente')}>Iniciativa existente</button>
      <button aria-pressed={modo === 'nova'} onClick={() => setModo('nova')}>Nova iniciativa</button>
    </div>
    {modo === 'existente' ? <IniciativaPicker iniciativas={pf.portfolio.iniciativas} objetivos={objetivos} pessoas={pf.portfolio.pessoas} value={iniciativaId} onChange={setIniciativaId} /> : <>
      <CampoTexto label="Nome da iniciativa" valor={nome} onChange={setNome} />
      <CampoRef label="Objetivo" valor={objetivoId} onChange={setObjetivoId} opcoes={objetivos.map(o => ({ id: o.id, nome: o.descricao || 'Objetivo sem descrição' }))} vazio="Escolha um objetivo" />
      {!objetivos.length && <p className="form-aviso">Cadastre um objetivo na seção Objetivos para criar esta iniciativa.</p>}
      <CampoRef label="Responsável" valor={donoId} onChange={setDonoId} opcoes={pf.portfolio.pessoas.map(p => ({ id: p.id, nome: p.nome }))} vazio="Sem responsável" />
      <CampoSelect label="Tipo de benefício" valor={vetor} onChange={setVetor} opcoes={VETORES} rotulo={v => ROTULO_VETOR[v]} />
      <CampoArea label="Descrição" valor={descricao} onChange={setDescricao} linhas={2} />
      <p className="campo-ajuda">A iniciativa começa no planejamento. A ação permanece no plano do risco, com o vínculo registrado.</p>
    </>}
  </ModalShell>;
}
