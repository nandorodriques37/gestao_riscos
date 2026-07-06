interface EmptyStateProps {
  message: string;
  hint?: string;
  icon?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ message, hint, icon = '⌕', action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
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
