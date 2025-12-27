/**
 * RelationshipTypeBadge Component
 *
 * Displays a colored badge indicating the type of series relationship
 * (spinoff, prequel, sequel, bonus, related).
 *
 * When isParent is true, shows contextual labels from the child's perspective
 * (e.g., "Parent" instead of "Spinoff").
 */

import type { RelationshipType } from '../../services/api/series';
import './RelationshipTypeBadge.css';

interface RelationshipTypeBadgeProps {
  type: RelationshipType;
  size?: 'small' | 'medium';
  className?: string;
  /** If true, this series is a parent of the viewing series - show parent-oriented labels */
  isParent?: boolean;
}

// Labels when viewing from child's perspective (this card is a parent)
const PARENT_LABELS: Record<RelationshipType, string> = {
  related: 'Parent',
  spinoff: 'Parent',      // This series is the main series we spun off from
  prequel: 'Prequel',     // This series is a prequel to us (comes before)
  sequel: 'Sequel',       // This series is a sequel to us (comes after)
  bonus: 'Main Series',   // This is the main series our bonus content belongs to
};

// Labels when viewing from parent's perspective (this card is a child)
const CHILD_LABELS: Record<RelationshipType, string> = {
  related: 'Related',
  spinoff: 'Spinoff',
  prequel: 'Prequel',
  sequel: 'Sequel',
  bonus: 'Bonus',
};

export function RelationshipTypeBadge({
  type,
  size = 'small',
  className = '',
  isParent = false,
}: RelationshipTypeBadgeProps) {
  // Don't render badge for default 'related' type unless it's a parent relationship
  if (type === 'related' && !isParent) {
    return null;
  }

  const label = isParent ? PARENT_LABELS[type] : CHILD_LABELS[type];

  return (
    <span
      className={`relationship-type-badge relationship-type-badge--${type} relationship-type-badge--${size} ${className}`}
    >
      {label}
    </span>
  );
}
