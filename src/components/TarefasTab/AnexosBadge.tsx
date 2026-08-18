interface AnexosBadgeProps {
  /** Quantidade de imagens anexadas; nada é renderizado quando é zero. */
  quantidade: number;
}

/**
 * Marca de "esta tarefa tem imagem", na linha da tabela e no card do quadro.
 * O número acompanha o desenho — o glifo sozinho não conta quantas são. Ícone
 * em SVG inline porque o projeto não usa biblioteca de ícones nem emoji.
 */
export function AnexosBadge({ quantidade }: AnexosBadgeProps) {
  if (quantidade <= 0) return null;
  const rotulo = quantidade === 1 ? '1 imagem anexada' : `${quantidade} imagens anexadas`;
  return (
    <span className="anexos-badge" title={rotulo} aria-label={rotulo}>
      <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true" focusable="false">
        <rect x="1.25" y="2.25" width="11.5" height="9.5" rx="1.75" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="5" cy="5.6" r="1.05" fill="currentColor" />
        <path d="M2.2 10.4 5.5 7.4l2.2 2 1.8-1.6 2.3 2.6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {quantidade}
    </span>
  );
}
