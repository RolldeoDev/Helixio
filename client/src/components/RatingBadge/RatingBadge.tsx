/**
 * RatingBadge Component
 *
 * Displays a rating value (0-10 scale) as a colored badge/pill.
 * Color ranges from red (low) through yellow (mid) to green (high).
 * Theme-aware: adapts colors for dark and light modes.
 */

import { useMemo } from 'react';
import { useTheme } from '../../themes/ThemeContext';
import { getRatingColors } from '../../utils/ratingColors';
import './RatingBadge.css';

export interface RatingBadgeProps {
  /** Rating value on 0-10 scale */
  value: number;
  /** Size variant */
  size?: 'small' | 'default';
  /** Optional custom class name */
  className?: string;
  /** Whether to show as "/10" suffix (default: true) */
  showScale?: boolean;
}

/**
 * Colored badge displaying a rating value with background color
 * that reflects the score (red→yellow→green).
 */
export function RatingBadge({
  value,
  size = 'default',
  className = '',
  showScale = true,
}: RatingBadgeProps) {
  const { colorScheme } = useTheme();

  const colors = useMemo(
    () => getRatingColors(value, colorScheme),
    [value, colorScheme]
  );

  const displayValue = value.toFixed(1);

  return (
    <span
      className={`rating-badge rating-badge--${size} ${className}`.trim()}
      style={colors}
      title={`${displayValue}/10`}
    >
      {displayValue}
      {showScale && <span className="rating-badge__scale">/10</span>}
    </span>
  );
}

export default RatingBadge;
