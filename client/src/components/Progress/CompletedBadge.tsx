import './CompletedBadge.css';

export interface CompletedBadgeProps {
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Tooltip text */
  title?: string;
  /** Additional CSS class */
  className?: string;
}

export function CompletedBadge({
  size = 'md',
  title = 'Completed',
  className = '',
}: CompletedBadgeProps) {
  return (
    <div
      className={`completed-badge completed-badge--${size} ${className}`}
      title={title}
      aria-label={title}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </div>
  );
}
