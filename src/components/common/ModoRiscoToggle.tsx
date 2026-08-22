import type { ModoRisco } from '../../types';

/**
 * Alterna as duas leituras do registro de risco: a tabela (o cadastro) e o
 * rastro (o tratamento). Não é destino de menu porque é a mesma seção — pôr
 * "Rastro" no rail sugeriria dois registros diferentes.
 */
export function ModoRiscoToggle({
  modo, onChange, pendentes,
}: {
  modo: ModoRisco;
  onChange: (m: ModoRisco) => void;
  /** Riscos com tratamento entregue esperando confirmação. */
  pendentes: number;
}) {
  return (
    <div className="view-toggle" role="group" aria-label="Modo de leitura dos riscos">
      <button
        className={modo === 'tabela' ? 'active' : ''}
        onClick={() => onChange('tabela')}
        aria-pressed={modo === 'tabela'}
      >
        Tabela
      </button>
      <button
        className={modo === 'rastro' ? 'active' : ''}
        onClick={() => onChange('rastro')}
        aria-pressed={modo === 'rastro'}
      >
        Rastro{pendentes > 0 ? ` · ${pendentes}` : ''}
      </button>
    </div>
  );
}
