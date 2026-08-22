import { useState } from 'react';
import type { AcaoRisco, Iniciativa, Objetivo, StoredRiskRecord } from '../../types';
import { VETORES } from '../../types';
import type { UsePortfolio } from '../../hooks/usePortfolio';
import { ROTULO_VETOR, nomeRisco } from '../../lib/portfolioLabels';
import { ModalShell } from '../common/ModalShell';
import { CampoTexto, CampoArea, CampoSelect, CampoRef } from '../common/Campo';

interface PromoverAcaoModalProps {
  acao: AcaoRisco;
  risco: StoredRiskRecord | null;
  objetivos: Objetivo[];
  pf: UsePortfolio;
  onClose: () => void;
  onPromovida: (iniciativaId: string) => void;
}

/**
 * Lado (a) do vínculo bidirecional: promover uma mitigação a iniciativa.
 *
 * A iniciativa nasce com `fonte = 'risco'` — ela de fato veio de uma ameaça
 * mapeada, e isso é histórico que não muda depois. Nasce também em `backlog`,
 * mesmo que a ação já estivesse em andamento: a partir de "aprovada" a regra
 * exige pelo menos um marco, e uma iniciativa recém-criada não tem nenhum.
 *
 * A ação NÃO é apagada. Ela passa a apontar para a iniciativa, e é isso que faz
 * o risco só contar como tratado quando a iniciativa concluir.
 */
export function PromoverAcaoModal({
  acao, risco, objetivos, pf, onClose, onPromovida,
}: PromoverAcaoModalProps) {
  const [nome, setNome] = useState(acao.descricao.slice(0, 120));
  const [objetivoId, setObjetivoId] = useState<string | null>(objetivos[0]?.id ?? null);
  const [vetor, setVetor] = useState<Iniciativa['vetor']>('evitar_perda');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function promover() {
    if (!objetivoId) return;
    setSalvando(true);
    const criada = await pf.criarERetornar<Iniciativa>('iniciativas', {
      objetivo_id: objetivoId,
      nome,
      descricao,
      vetor,
      fonte: 'risco',
      status: 'backlog',
      // Herda do risco de origem: os três campos sempre descreveram a ação.
      esforco: risco?.esforco ?? null,
      impacto2: risco?.impacto2 ?? null,
      gravidade: risco?.gravidade ?? null,
      recurso: risco?.recurso ?? '',
      resultado: risco?.resultado ?? '',
    });
    if (!criada) { setSalvando(false); return; }

    const ok = await pf.patchEntidade('acoes-risco', acao.id, {
      iniciativa_id: criada.id,
      triagem: 'iniciativa',
    });
    setSalvando(false);
    if (ok) onPromovida(criada.id);
  }

  return (
    <ModalShell
      titulo="Promover a iniciativa"
      subtitulo="Esta mitigação passa a ser executada como iniciativa, com marcos próprios."
      onClose={onClose}
      rodape={
        <div className="modal-footer-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn modal-btn-save"
            onClick={() => { void promover(); }}
            disabled={salvando || objetivoId == null || nome.trim().length === 0}
          >
            {salvando ? 'Promovendo…' : 'Promover'}
          </button>
        </div>
      }
    >
      {risco && (
        <>
          <div className="fato-label">Risco de origem</div>
          <div className="rastro-risco" style={{ marginBottom: 'var(--sp-3)' }}>{nomeRisco(risco)}</div>
        </>
      )}

      <div className="fato-label">Mitigação</div>
      <div className="mitigacao-card" style={{ marginBottom: 'var(--sp-4)' }}>{acao.descricao}</div>

      {objetivos.length === 0 ? (
        <div className="form-aviso">
          Não há nenhum objetivo cadastrado. Iniciativa sem objetivo não é salva — crie um
          objetivo antes de promover.
        </div>
      ) : (
        <>
          <CampoTexto
            label="Nome da iniciativa"
            valor={nome}
            onChange={setNome}
            ajuda="Veio da descrição da ação. Vale reescrever como entregável."
          />

          <div className="form-grid-2">
            <CampoRef
              label="Objetivo"
              valor={objetivoId}
              onChange={setObjetivoId}
              opcoes={objetivos.map(o => ({ id: o.id, nome: o.descricao || 'Objetivo sem descrição' }))}
              vazio="Escolha um objetivo"
            />
            <CampoSelect
              label="Vetor"
              valor={vetor}
              onChange={setVetor}
              opcoes={VETORES}
              rotulo={v => ROTULO_VETOR[v]}
              vazio="Sem vetor"
              ajuda="Nasceu de risco, mas o vetor é escolha sua."
            />
          </div>

          <CampoArea
            label="Descrição"
            valor={descricao}
            onChange={setDescricao}
            linhas={2}
            placeholder="Opcional — o que a iniciativa vai construir"
          />

          <div className="form-aviso">
            A iniciativa nasce em <strong>backlog</strong> e com origem <strong>risco</strong>.
            A ação continua onde está e passa a apontar para ela: o risco só conta como tratado
            quando a iniciativa concluir. O plano de ação dentro do registro não é alterado.
          </div>
        </>
      )}
    </ModalShell>
  );
}
