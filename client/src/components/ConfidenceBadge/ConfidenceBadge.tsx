/**
 * ConfidenceBadge Component
 *
 * Displays a similarity confidence score as a colored badge.
 * Color ranges: Green (>= 60%), Yellow (40-59%), Red (< 40%).
 * For genre fallbacks, displays "Similar Genre" with distinct styling.
 */

import { useMemo } from 'react';
import { useTheme } from '../../themes/ThemeContext';
import { getConfidenceColors } from '../../utils/confidenceColors';
import './ConfidenceBadge.css';

export interface ConfidenceBadgeProps {
  /** Similarity score on 0-1 scale (will be converted to percentage) */
  score: number;
  /** Whether this is a genre fallback match (shows different label) */
  isFallback?: boolean;
  /** Size variant */
  size?: 'small' | 'default';
  /** Optional custom class name */
  className?: string;
}

/**
 * Colored badge displaying a confidence/similarity score.
 * For similarity matches: shows percentage with color indicating confidence.
 * For fallback matches: shows "Similar Genre" with muted styling.
 */
export function ConfidenceBadge({
  score,
  isFallback = false,
  size = 'default',
  className = '',
}: ConfidenceBadgeProps) {
  const { colorScheme } = useTheme();

  const percentage = Math.round(score * 100);

  const colors = useMemo(
    () => (isFallback ? null : getConfidenceColors(percentage, colorScheme)),
    [percentage, colorScheme, isFallback]
  );

  const label = isFallback ? 'Similar Genre' : `${percentage}%`;
  const title = isFallback
    ? 'Recommended based on similar genres'
    : `${percentage}% similarity confidence`;

  return (
    <span
      className={`confidence-badge confidence-badge--${size} ${isFallback ? 'confidence-badge--fallback' : ''} ${className}`.trim()}
      style={colors || undefined}
      title={title}
    >
      {label}
    </span>
  );
}

export default ConfidenceBadge;
