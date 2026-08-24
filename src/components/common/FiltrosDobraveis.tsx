import { useState, type ReactNode } from 'react';

interface FiltrosDobraveisProps {
  /** Fica sempre à vista: é o filtro que se usa primeiro. */
  busca: ReactNode;
  /** Recolhidos atrás do botão no celular; à vista em tela larga. */
  children: ReactNode;
  /** Quantos recortes estão ativos agora — vira selo no botão. */
  ativos: number;
  /** Linha de contagem ("42 de 62 registros"). Sempre visível. */
  contagem?: ReactNode;
}

/**
 * A barra de filtros das listas.
 *
 * Em tela larga é exatamente o que sempre foi: uma `.filter-row` com tudo lado
 * a lado. No celular os controles secundários se dobram atrás de um botão
 * "Filtros", e só a busca fica de fora.
 *
 * O motivo é altura. Empilhada, a barra da aba Tarefas ocupava ~200px — busca,
 * quatro pílulas de status, dois selects e o alternador de modo, cada um numa
 * fileira de 44px. Somada ao título, aos botões de ação e à faixa de KPIs, ela
 * empurrava o primeiro cartão para 850px: num telefone, ninguém via uma tarefa
 * sem rolar duas telas. Filtro é ferramenta, não conteúdo; ele se abre quando
 * se precisa dele.
 *
 * O selo com o número de recortes ativos é o que impede o outro erro: filtro
 * escondido que continua filtrando, e a lista parecendo curta sem explicação.
 * O número vem de quem chama, porque só a aba sabe o que conta como recorte.
 */
export function FiltrosDobraveis({ busca, children, ativos, contagem }: FiltrosDobraveisProps) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="filter-row" data-aberto={aberto || undefined}>
      {busca}

      <button
        className="filtros-toggle"
        onClick={() => setAberto(v => !v)}
        aria-expanded={aberto}
      >
        Filtros
        {ativos > 0 && (
          <span className="filtros-toggle-count tabular" aria-label={`${ativos} recortes ativos`}>
            {ativos}
          </span>
        )}
        <span className="filtros-toggle-seta" aria-hidden="true">{aberto ? '▲' : '▼'}</span>
      </button>

      <div className="filtros-dobra">{children}</div>

      {contagem}
    </div>
  );
}
