import type { VinculoDaLinha } from '../../lib/taskRows';

interface VinculoChipProps {
  vinculo: VinculoDaLinha;
  /** Some com o nome do risco onde não há largura — o card do Kanban. */
  compacto?: boolean;
}

/**
 * De onde a linha veio. Só aparece em mitigação: tarefa livre não ganha selo
 * de "livre", porque ausência de vínculo é o caso comum e rotular o comum é
 * ruído.
 *
 * O acento é a criticidade do risco de origem — mesma escala do resto do app —
 * mas o nome do risco vem junto. Identidade nunca por cor sozinha.
 */
export function VinculoChip({ vinculo, compacto = false }: VinculoChipProps) {
  // Sem nome e sem ser órfã = os riscos ainda não chegaram; o chip espera calado.
  const nome = vinculo.risco || (vinculo.orfa ? 'risco excluído' : '');
  const titulo = [
    nome ? `Mitigação do risco: ${nome}` : 'Mitigação de risco',
    vinculo.iniciativa ? `Executada na iniciativa: ${vinculo.iniciativa}` : null,
    vinculo.rotina ? 'Controle contínuo — sem prazo' : null,
  ].filter(Boolean).join(' · ');

  return (
    <span className="vinculo-chip" data-tier={vinculo.tier} title={titulo}>
      <span className="vinculo-chip-marca" aria-hidden="true" />
      <span className="vinculo-chip-rotulo">
        {vinculo.rotina ? 'Rotina' : 'Risco'}
      </span>
      {!compacto && nome && <span className="vinculo-chip-nome">{nome}</span>}
      {vinculo.iniciativa && (
        <span className="vinculo-chip-ini" title={`Iniciativa: ${vinculo.iniciativa}`}>
          ▲ {compacto ? '' : vinculo.iniciativa}
        </span>
      )}
    </span>
  );
}
