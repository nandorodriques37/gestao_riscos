import type { EnrichedTaskRow } from '../../lib/taskRows';
import { initials } from '../../lib/taskRows';
import { gutTier, taskStatusKind } from '../../lib/taskCalculations';
import { onActivateKey } from '../../lib/a11y';
import { AnexosBadge } from './AnexosBadge';
import { VinculoChip } from './VinculoChip';
import { PrazoCell } from './PrazoCell';

interface TarefaCardListProps {
  rows: EnrichedTaskRow[];
  onOpen: (idx: number) => void;
  onToggleConcluida: (idx: number) => void;
}

/**
 * Alternativa à tabela de 15 colunas para telas estreitas — o mesmo papel que
 * `RegistroTab/RiskCardList` cumpre para os riscos, e por isso no mesmo
 * vocabulário (`.risk-card`).
 *
 * A aba Registro ganhou cartões há tempos; a de Tarefas não, e a diferença
 * passou despercebida porque a regra em `styles/responsive.css` esconde
 * `.table-wrap` — que é a tabela do Registro. A de Tarefas é `.tarefas-table-wrap`
 * e continuava lá: no celular, a principal superfície de execução do app era
 * uma planilha de ~1480px rolando de lado.
 *
 * Visibilidade controlada por @media em `styles/responsive.css` — a tabela e os
 * cartões nunca aparecem juntos, e o modo salvo (lista ⇄ quadro) continua
 * valendo, porque nenhum dos dois monta condicionalmente por largura.
 *
 * O que o cartão mostra é o que se escaneia numa lista; G, U, T avulsos, rank e
 * detalhes ficam no modal, que abre ao toque como na tabela.
 */
export function TarefaCardList({ rows, onOpen, onToggleConcluida }: TarefaCardListProps) {
  return (
    <div className="tarefa-card-list">
      {rows.map(row => {
        const { task: t, gut, prioridade, prioridadeHerdada, normSt, idx, vinculo, dono, atrasada } = row;
        const concluida = normSt === 'Concluída';

        return (
          <div
            key={idx}
            className="risk-card"
            data-tier={gutTier(gut)}
            role="button"
            tabIndex={0}
            aria-label={`Editar tarefa: ${t.tarefa || 'sem título'}`}
            onClick={() => onOpen(idx)}
            onKeyDown={onActivateKey(() => onOpen(idx))}
          >
            <div className="risk-card-top">
              <span className="risk-card-combo">{t.tipo || 'Sem tipo'}</span>
              {/* Concluir sem abrir o modal: é a edição que mais se faz no
                  celular, e a que menos justifica um formulário inteiro. */}
              <button
                className="done-btn"
                aria-pressed={concluida}
                aria-label={concluida ? `Reabrir ${t.tarefa || 'tarefa'}` : `Concluir ${t.tarefa || 'tarefa'}`}
                title={concluida ? 'Reabrir' : 'Concluir'}
                onClick={e => { e.stopPropagation(); onToggleConcluida(idx); }}
                onKeyDown={e => e.stopPropagation()}
              >
                <span className="done-check" aria-hidden="true" />
              </button>
            </div>

            <div className="risk-card-risco" data-concluida={concluida || undefined}>
              {t.tarefa || '(sem título)'}
            </div>

            <div className="risk-card-badges">
              <span
                className="tier-chip"
                data-tier={prioridadeHerdada ? vinculo?.tier : gutTier(gut)}
                data-herdada={prioridadeHerdada}
                title={prioridadeHerdada
                  ? 'Faixa herdada da criticidade do risco — esta linha não tem nota GUT'
                  : undefined}
              >
                <span className="tier-dot" />
                {prioridade ?? 'Sem nota'}
                {prioridadeHerdada && <span className="tier-chip-herdada" aria-label="herdada do risco">*</span>}
              </span>
              {/* GUT numérico só quando existe: um "—" ao lado da faixa não
                  informa nada e rouba largura de quem informa. */}
              {gut != null && (
                <span className="tier-chip" data-tier={gutTier(gut)}>
                  <span className="tier-dot" />
                  GUT {gut}
                </span>
              )}
              <span className="badge" data-badge={taskStatusKind(normSt)}>{normSt}</span>
              <PrazoCell prazo={t.prazo} atrasada={atrasada} rotina={!!vinculo?.rotina} />
            </div>

            {vinculo && <VinculoChip vinculo={vinculo} />}

            <div className="risk-card-meta">
              {dono ? (
                <span className="owner-cell">
                  <span className="owner-avatar" aria-hidden="true">{initials(dono)}</span>
                  <span className="owner-name">{dono}</span>
                </span>
              ) : (
                <span className="muted">Sem dono</span>
              )}
              <AnexosBadge quantidade={t.anexos?.length ?? 0} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
