import type { ModoRisco } from '../../types';

/**
 * Alterna as três leituras do registro de risco: a tabela (o cadastro), o
 * rastro (o tratamento) e a análise (a distribuição).
 *
 * Não é destino de menu porque é a mesma seção — pôr "Rastro" e "Gráficos" no
 * rail sugeriria três registros diferentes. A análise chegou aqui vinda de uma
 * aba própria: ela lê exatamente os mesmos riscos da tabela ao lado, e como
 * seção separada interrompia a jornada entre o risco e a tarefa.
 */

const MODOS: { modo: ModoRisco; label: string; ajuda: string }[] = [
  { modo: 'tabela', label: 'Tabela', ajuda: 'O cadastro: uma linha por risco, editável.' },
  { modo: 'rastro', label: 'Rastro', ajuda: 'O tratamento: o que foi feito e o que já pode ser fechado.' },
  { modo: 'analise', label: 'Análise', ajuda: 'A distribuição: heatmap, criticidade, área, rotina e recurso.' },
];

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
      {MODOS.map(m => (
        <button
          key={m.modo}
          className={modo === m.modo ? 'active' : ''}
          onClick={() => onChange(m.modo)}
          aria-pressed={modo === m.modo}
          title={m.ajuda}
        >
          {m.label}
          {m.modo === 'rastro' && pendentes > 0 ? ` · ${pendentes}` : ''}
        </button>
      ))}
    </div>
  );
}
