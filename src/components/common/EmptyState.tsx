interface EmptyStateProps {
  message: string;
  hint?: string;
}

export function EmptyState({ message, hint }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-message">{message}</div>
      {hint && <div className="empty-state-hint">{hint}</div>}
    </div>
  );
}
