/**
 * LoadingState Component
 *
 * Unified loading state component with multiple variants:
 * - skeleton-cards: Card placeholders with shimmer animation (for grids)
 * - skeleton-list: List row placeholders with shimmer animation
 * - overlay: Full overlay with HelixioLoader (for operations)
 * - inline: Inline spinner with optional message
 *
 * Also exports individual components for custom layouts:
 * - SkeletonCard: Single card placeholder
 * - SkeletonRow: Single list row placeholder
 * - Spinner: Inline spinner
 */

import './LoadingState.css';
import { HelixioLoader } from '../HelixioLoader';

export type LoadingVariant = 'skeleton-cards' | 'skeleton-list' | 'overlay' | 'inline';
export type CardSize = 'sm' | 'md' | 'lg';

// =============================================================================
// Individual Components (for custom layouts)
// =============================================================================

interface SkeletonCardProps {
  size?: CardSize;
  className?: string;
}

export function SkeletonCard({ size = 'md', className = '' }: SkeletonCardProps) {
  return (
    <div
      className={`loading-skeleton loading-skeleton--card loading-skeleton--card-${size} ${className}`}
    />
  );
}

interface SkeletonRowProps {
  className?: string;
}

export function SkeletonRow({ className = '' }: SkeletonRowProps) {
  return (
    <div className={`loading-skeleton loading-skeleton--row ${className}`}>
      <div className="loading-skeleton loading-skeleton--thumbnail" />
      <div className="loading-skeleton--row-content">
        <div className="loading-skeleton loading-skeleton--text loading-skeleton--text-title" />
        <div className="loading-skeleton loading-skeleton--text loading-skeleton--text-subtitle" />
      </div>
    </div>
  );
}

interface SpinnerProps {
  message?: string;
  className?: string;
}

export function Spinner({ message, className = '' }: SpinnerProps) {
  return (
    <div className={`loading-state loading-state--inline ${className}`}>
      <div className="loading-spinner" />
      {message && <span className="loading-message">{message}</span>}
    </div>
  );
}

// =============================================================================
// Main LoadingState Component
// =============================================================================

interface LoadingStateProps {
  /** Loading variant to display */
  variant: LoadingVariant;
  /** Number of skeleton items to show (for skeleton variants) */
  count?: number;
  /** Optional loading message */
  message?: string;
  /** Size variant for skeleton cards */
  cardSize?: CardSize;
  /** Additional CSS class */
  className?: string;
}

export function LoadingState({
  variant,
  count = 5,
  message,
  cardSize = 'md',
  className = '',
}: LoadingStateProps) {
  switch (variant) {
    case 'skeleton-cards':
      return (
        <div className={`loading-state loading-state--skeleton-cards ${className}`}>
          {Array.from({ length: count }, (_, i) => (
            <SkeletonCard key={i} size={cardSize} />
          ))}
        </div>
      );

    case 'skeleton-list':
      return (
        <div className={`loading-state loading-state--skeleton-list ${className}`}>
          {Array.from({ length: count }, (_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      );

    case 'overlay':
      return (
        <div className={`loading-state loading-state--overlay ${className}`}>
          <HelixioLoader size="md" message={message} />
        </div>
      );

    case 'inline':
      return <Spinner message={message} className={className} />;

    default:
      return null;
  }
}

export default LoadingState;
