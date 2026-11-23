import type { EnrichedTaskRow } from '../../lib/taskRows';
import { initials } from '../../lib/taskRows';
import { gutTier, taskStatusKind } from '../../lib/taskCalculations';
import { onActivateKey } from '../../lib/a11y';
import { AnexosBadge } from './AnexosBadge';
import { VinculoChip } from './VinculoChip';
import { PrazoCell } from './PrazoCell';

interface TarefasTableRowProps {
  row: EnrichedTaskRow;
  onOpen: (idx: number) => void;
  onToggleConcluida: (idx: number) => void;
  onDelete: (idx: number) => void;
  /** Agrupada por responsável, a coluna sai: o cabeçalho do grupo já diz quem é. */
  semResponsavel?: boolean;
}

export function TarefasTableRow({ row, onOpen, onToggleConcluida, onDelete, semResponsavel = false }: TarefasTableRowProps) {
  const { task: t, gut, prioridade, prioridadeHerdada, normSt, idx, vinculo, dono, atrasada } = row;
  const concluida = normSt === 'Concluída';
  const titulo = t.tarefa || 'sem título';

  // Enter/Espaço num botão da linha dispara o clique do próprio botão; sem
  // barrar o keydown, o handler do <tr> abriria o modal logo em seguida.
  const stopKey = (e: React.KeyboardEvent) => e.stopPropagation();

  return (
    <tr
      onClick={() => onOpen(idx)}
      onKeyDown={onActivateKey(() => onOpen(idx))}
      tabIndex={0}
      role="button"
      aria-label={`Editar tarefa: ${t.tarefa || 'sem título'}`}
      data-tier={gutTier(gut)}
    >
      {/* Acento à esquerda colorido pela faixa de GUT — prioridade escaneável.
          A zebra saiu junto com a da aba Registro: hairline entre linhas lê
          mais limpo e não briga com o fundo dos chips. */}
      <td className="gut-accent" title={t.tipo}>
        {t.tipo ? <span className="type-tag">{t.tipo}</span> : '—'}
      </td>
      <td className="tarefa-cell" title={t.tarefa}>
        {/* Envelope próprio porque a <td> não pode virar flex: no Compacto o
            título, o selo e o chip do risco dividem UMA linha (table.css). */}
        <div className="tarefa-cell-corpo">
          <span className="clamp-2">{t.tarefa}</span>
          <AnexosBadge quantidade={t.anexos?.length ?? 0} />
          {vinculo && <VinculoChip vinculo={vinculo} />}
        </div>
      </td>
      <td className="center">
        {/* O tooltip mostra a conta: um "126" solto não diz de onde veio. */}
        <span
          className="tier-chip"
          data-tier={gutTier(gut)}
          title={gut != null ? `G ${t.g} × U ${t.u} × T ${t.t} = ${gut}` : 'Sem nota GUT'}
        >
          <span className="tier-dot" />
          {gut ?? '—'}
        </span>
      </td>
      <td className="center">
        <span
          className="tier-chip"
          data-tier={prioridadeHerdada ? vinculo?.tier : gutTier(gut)}
          data-herdada={prioridadeHerdada}
          title={prioridadeHerdada ? 'Faixa herdada da criticidade do risco — esta linha não tem nota GUT' : undefined}
        >
          <span className="tier-dot" />
          {prioridade ?? '—'}
          {prioridadeHerdada && <span className="tier-chip-herdada" aria-label="herdada do risco">*</span>}
        </span>
      </td>
      <td className="center">
        <span className="badge" data-badge={taskStatusKind(normSt)}>{normSt}</span>
      </td>
      <td className="center">
        <PrazoCell prazo={t.prazo} atrasada={atrasada} rotina={!!vinculo?.rotina} />
      </td>
      {!semResponsavel && (
        <td title={dono}>
          {dono ? (
            <div className="owner-cell">
              <span className="owner-avatar" aria-hidden="true">{initials(dono)}</span>
              <span className="owner-name">{dono}</span>
            </div>
          ) : '—'}
        </td>
      )}
      <td className="center">
        {/* Conclui direto da linha, sem abrir os detalhes. Clicar de novo reabre. */}
        <button
          className="done-btn"
          onClick={e => { e.stopPropagation(); onToggleConcluida(idx); }}
          onKeyDown={stopKey}
          aria-pressed={concluida}
          aria-label={concluida ? `Reabrir tarefa: ${titulo}` : `Concluir tarefa: ${titulo}`}
          title={concluida ? 'Reabrir tarefa' : 'Concluir tarefa'}
        >
          <span className="done-check" aria-hidden="true" />
        </button>
      </td>
      <td className="center">
        <button
          className="delete-btn"
          onClick={e => { e.stopPropagation(); onDelete(idx); }}
          onKeyDown={stopKey}
          aria-label={`Excluir tarefa: ${titulo}`}
        >
          ×
        </button>
      </td>
    </tr>
  );
}
