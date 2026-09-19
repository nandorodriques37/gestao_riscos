/**
 * Estado vazio: o que é, por que está vazio e o que fazer. O glifo é sempre a
 * rede de decisão da marca — havia uma prop `icon` que oito chamadas passavam
 * e ninguém renderizava.
 */
interface EmptyStateProps {
  message: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ message, hint, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" aria-hidden="true">
        <svg className="decision-network" viewBox="0 0 112 40" fill="none">
          <path d="M14 20h24m12 0h24m12 0h12" />
          <circle cx="10" cy="20" r="6" />
          <circle cx="44" cy="20" r="6" />
          <circle cx="80" cy="20" r="6" />
          <circle cx="104" cy="20" r="6" />
        </svg>
      </div>
      <div className="empty-state-message">{message}</div>
      {hint && <div className="empty-state-hint">{hint}</div>}
      {action && (
        <button className="btn btn-navy empty-state-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
