import './ProgressBar.css';

export interface ProgressBarProps {
  /** Progress percentage (0-100) */
  progress: number;
  /** Height variant */
  height?: 'sm' | 'md';
  /** Color variant: primary uses theme color, auto changes based on progress % */
  variant?: 'primary' | 'auto';
  /** Additional CSS class */
  className?: string;
}

export function ProgressBar({
  progress,
  height = 'md',
  variant = 'primary',
  className = '',
}: ProgressBarProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress));

  // Auto color based on progress
  const getAutoColor = () => {
    if (clampedProgress >= 90) return 'var(--color-success, #22c55e)';
    if (clampedProgress >= 50) return 'var(--color-accent, #3b82f6)';
    return 'var(--color-warning, #f59e0b)';
  };

  const fillStyle = {
    width: `${clampedProgress}%`,
    ...(variant === 'auto' && { backgroundColor: getAutoColor() }),
  };

  return (
    <div
      className={`progress-bar progress-bar--${height} ${className}`}
      role="progressbar"
      aria-valuenow={clampedProgress}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="progress-bar__fill" style={fillStyle} />
    </div>
  );
}
