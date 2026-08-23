import { formatarData } from '../../lib/portfolioLabels';
import { diasDeAtraso } from '../../lib/taskRows';

interface PrazoCellProps {
  prazo: string | null;
  atrasada: boolean;
  /** Controle contínuo: a ausência de data é a regra, não uma falta. */
  rotina?: boolean;
}

/**
 * Prazo e, quando vencido, o tamanho do atraso. Dizer só "atrasada" faz uma
 * ação de dois dias parecer igual a uma de três meses.
 */
export function PrazoCell({ prazo, atrasada, rotina = false }: PrazoCellProps) {
  if (rotina) {
    return <span className="prazo-vazio" title="Controle contínuo — sem prazo">contínuo</span>;
  }
  if (!prazo) return <span className="prazo-vazio">—</span>;

  const dias = atrasada ? diasDeAtraso(prazo) : 0;

  return (
    <span className="prazo-cell tabular" data-atrasada={atrasada}>
      {formatarData(prazo)}
      {atrasada && (
        <span className="prazo-atraso" title={`Vencido há ${dias} ${dias === 1 ? 'dia' : 'dias'}`}>
          +{dias}d
        </span>
      )}
    </span>
  );
}
