import { useDraftGuard } from '../../hooks/useDraftGuard';
import { useRef, useState } from 'react';
import type { Iniciativa, Objetivo, Pessoa } from '../../types';
import { CONFIANCAS, FONTES_INICIATIVA, STATUS_INICIATIVA, VETORES } from '../../types';
import {
  ROTULO_CONFIANCA, ROTULO_FONTE, ROTULO_STATUS_INICIATIVA, ROTULO_VETOR,
} from '../../lib/portfolioLabels';
import { computePrioriz, priorizTier, round2 } from '../../lib/calculations';
import { ModalShell } from '../common/ModalShell';
import { CampoTexto, CampoArea, CampoNumero, CampoSelect, CampoRef } from '../common/Campo';

interface IniciativaModalProps {
  iniciativa?: Iniciativa;
  objetivoInicial?: string | null;
  objetivos: Objetivo[];
  pessoas: Pessoa[];
  /** Segura a regra 2: a partir de "aprovada" o status exige pelo menos um marco. */
  qtdMarcos: number;
  onSalvar: (dados: Record<string, unknown>) => Promise<boolean>;
  onExcluir?: () => void;
  onClose: () => void;
  erro?: string | null;
}

/** Status que o servidor recusa sem nenhum marco cadastrado. */
const EXIGE_MARCO = new Set(['aprovada', 'em_execucao', 'pausada', 'concluida']);

export function IniciativaModal({
  iniciativa, objetivos, pessoas, qtdMarcos, objetivoInicial, onSalvar, onExcluir, onClose, erro,
}: IniciativaModalProps) {
  const [d, setD] = useState(() => ({
    objetivo_id: iniciativa?.objetivo_id ?? objetivoInicial ?? null,
    nome: iniciativa?.nome ?? '',
    descricao: iniciativa?.descricao ?? '',
    vetor: iniciativa?.vetor ?? ('' as Iniciativa['vetor']),
    fonte: iniciativa?.fonte ?? ('' as Iniciativa['fonte']),
    dono_id: iniciativa?.dono_id ?? null,
    recurso: iniciativa?.recurso ?? '',
    esforco: iniciativa?.esforco ?? null,
    impacto2: iniciativa?.impacto2 ?? null,
    gravidade: iniciativa?.gravidade ?? null,
    esforco_dias: iniciativa?.esforco_dias ?? null,
    impacto_rs: iniciativa?.impacto_rs ?? null,
    confianca_impacto: iniciativa?.confianca_impacto ?? ('' as Iniciativa['confianca_impacto']),
    inicio: iniciativa?.inicio ?? '',
    fim_plano_original: iniciativa?.fim_plano_original ?? '',
    fim_plano_atual: iniciativa?.fim_plano_atual ?? '',
    fim_real: iniciativa?.fim_real ?? '',
    status: iniciativa?.status ?? ('backlog' as Iniciativa['status']),
    resultado: iniciativa?.resultado ?? '',
    obs: iniciativa?.obs ?? '',
  }));
  const [salvando, setSalvando] = useState(false);
  const initial = useRef(JSON.stringify(d));
  const busy = useRef(false);
  const [falha, setFalha] = useState('');
  const fechar = useDraftGuard(JSON.stringify(d) !== initial.current, salvando, onClose);

  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD(p => ({ ...p, [k]: v }));

  const prioriz = computePrioriz(d);
  const semMarco = EXIGE_MARCO.has(d.status) && qtdMarcos === 0;

  async function salvar() {
    if (busy.current) return;
    busy.current = true; setFalha('');
    setSalvando(true);
    let ok = false;
    try { ok = await onSalvar({
      ...d,
      inicio: d.inicio || null,
      fim_plano_original: d.fim_plano_original || null,
      fim_plano_atual: d.fim_plano_atual || null,
      fim_real: d.fim_real || null,
    });
    } catch { setFalha('Não foi possível salvar. Seu rascunho foi mantido.'); }
    finally { busy.current = false; setSalvando(false); }
    if (ok) onClose(); else setFalha('Não foi possível salvar. Revise os campos e tente novamente.');
  }

  const podeSalvar = d.nome.trim().length > 0 && d.objetivo_id != null && !semMarco && !salvando;

  return (
    <ModalShell
      largo
      titulo={iniciativa ? 'Editar iniciativa' : 'Nova iniciativa'}
      subtitulo="O quê: esforço com início, fim e dono, que move um objetivo."
      onClose={fechar} busy={salvando} error={erro || falha}
      rodape={
        <>
          {onExcluir && <button className="btn modal-btn-delete" disabled={salvando} onClick={onExcluir}>Excluir</button>}
          <div className="modal-footer-actions">
            {prioriz != null && (
              <span className="tier-chip" data-tier={priorizTier(prioriz)}>
                <span className="tier-dot" aria-hidden="true" />
                Priorização {String(round2(prioriz)).replace('.', ',')}
              </span>
            )}
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
      <CampoTexto
        label="Nome"
        valor={d.nome}
        onChange={v => set('nome', v)}
        placeholder="O que será construído ou mudado"
      />

      <div className="form-grid-2">
        <CampoRef
          label="Objetivo"
          valor={d.objetivo_id}
          onChange={v => set('objetivo_id', v)}
          opcoes={objetivos.map(o => ({ id: o.id, nome: o.descricao || 'Objetivo sem descrição' }))}
          vazio="Escolha um objetivo"
          ajuda="Obrigatório. Iniciativa sem objetivo é trabalho sem destino — o servidor recusa."
        />
        <CampoRef
          label="Responsável"
          valor={d.dono_id}
          onChange={v => set('dono_id', v)}
          opcoes={pessoas.map(p => ({ id: p.id, nome: p.nome }))}
          vazio="Sem dono"
        />
      </div>

      <CampoArea
        label="Descrição"
        valor={d.descricao}
        onChange={v => set('descricao', v)}
        linhas={2}
      />

      <div className="modal-section-title">Origem, benefício e situação</div>

      <div className="form-grid-3">
        <CampoSelect
          label="Origem"
          valor={d.fonte}
          onChange={v => set('fonte', v)}
          opcoes={FONTES_INICIATIVA}
          rotulo={v => ROTULO_FONTE[v]}
          vazio="Sem origem"
          ajuda="Por que nasceu. É histórico: não mude para refletir o que ela cobre hoje."
        />
        <CampoSelect
          label="Tipo de benefício"
          valor={d.vetor}
          onChange={v => set('vetor', v)}
          opcoes={VETORES}
          rotulo={v => ROTULO_VETOR[v]}
          vazio="Sem vetor"
          ajuda="O que faz com o valor. Uma iniciativa de gap de KPI pode ser evitar perda."
        />
        <CampoSelect
          label="Status"
          valor={d.status}
          onChange={v => set('status', v)}
          opcoes={STATUS_INICIATIVA}
          rotulo={v => ROTULO_STATUS_INICIATIVA[v]}
        />
      </div>

      {semMarco && (
        <div className="form-aviso">
          Esta iniciativa não tem nenhum marco. A partir de <strong>aprovada</strong>, o status
          exige pelo menos um — sem marco não há entrega verificável, só intenção com data.
          Cadastre um marco e volte aqui.
        </div>
      )}

      <details className="form-details"><summary>Priorização e retorno</summary>

      <div className="form-grid-3">
        <CampoNumero
          label="Esforço"
          valor={d.esforco}
          onChange={v => set('esforco', v)}
          min={0}
          max={5}
          step={0.5}
          ajuda="Escala 0–5. Divisor da priorização."
        />
        <CampoNumero
          label="Impacto"
          valor={d.impacto2}
          onChange={v => set('impacto2', v)}
          min={0}
          max={5}
          step={0.5}
          ajuda="Escala 0–5."
        />
        <CampoNumero
          label="Gravidade"
          valor={d.gravidade}
          onChange={v => set('gravidade', v)}
          min={0}
          max={5}
          step={0.5}
          ajuda="Escala 0–5. Somada ao final."
        />
      </div>

      <div className="modal-section-title">Tamanho e retorno</div>

      <div className="form-grid-3">
        <CampoNumero
          label="Esforço estimado"
          valor={d.esforco_dias}
          onChange={v => set('esforco_dias', v)}
          min={0}
          sufixo="dias-pessoa"
          ajuda="Espalhado pela janela para calcular a carga do mês."
        />
        <CampoNumero
          label="Impacto financeiro"
          valor={d.impacto_rs}
          onChange={v => set('impacto_rs', v)}
          sufixo="R$"
          ajuda="Deixe vazio se não sabe — zero e vazio dizem coisas diferentes."
        />
        <CampoSelect
          label="Confiança no impacto"
          valor={d.confianca_impacto}
          onChange={v => set('confianca_impacto', v)}
          opcoes={CONFIANCAS}
          rotulo={v => ROTULO_CONFIANCA[v]}
          vazio="Não informada"
        />
      </div>

      </details><details className="form-details" open><summary>Prazos e resultado esperado</summary>

      <div className="form-grid-2">
        <CampoTexto label="Início" tipo="date" valor={d.inicio} onChange={v => set('inicio', v)} />
        <CampoTexto
          label="Fim planejado (original)"
          tipo="date"
          valor={d.fim_plano_original}
          onChange={v => set('fim_plano_original', v)}
          ajuda="Congele na aprovação — é contra ela que o atraso se mede."
        />
      </div>

      <div className="form-grid-2">
        <CampoTexto
          label="Fim planejado (atual)"
          tipo="date"
          valor={d.fim_plano_atual}
          onChange={v => set('fim_plano_atual', v)}
        />
        <CampoTexto
          label="Fim real"
          tipo="date"
          valor={d.fim_real}
          onChange={v => set('fim_real', v)}
        />
      </div>

      <CampoTexto
        label="Recurso"
        valor={d.recurso}
        onChange={v => set('recurso', v)}
        placeholder="Time, área ou fornecedor que executa"
      />

      <CampoArea
        label="Resultado esperado"
        valor={d.resultado}
        onChange={v => set('resultado', v)}
        linhas={2}
      />

      <CampoArea label="Observações" valor={d.obs} onChange={v => set('obs', v)} linhas={2} />
      </details>
    </ModalShell>
  );
}
