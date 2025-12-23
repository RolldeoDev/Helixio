/**
 * ExpandablePillSection Component
 *
 * A compact section of pills that shows a limited number initially,
 * with an inline "+X more" button that expands to show all.
 */

import { useState, useCallback, useMemo, useId } from 'react';
import './ExpandablePillSection.css';

export type PillVariant = 'character' | 'team' | 'location' | 'arc' | 'creator' | 'genre' | 'tag' | 'default';

interface ExpandablePillSectionProps {
  /** Section title (optional) */
  title?: string;
  /** Array of items to display as pills */
  items: string[];
  /** Maximum number of pills to show before truncation */
  maxVisible?: number;
  /** Visual variant for the pills */
  variant?: PillVariant;
  /** Whether to show the section title */
  showTitle?: boolean;
  /** Custom class name for the container */
  className?: string;
  /** Callback when a pill is clicked */
  onPillClick?: (item: string) => void;
}

export function ExpandablePillSection({
  title,
  items,
  maxVisible = 8,
  variant = 'default',
  showTitle = true,
  className = '',
  onPillClick,
}: ExpandablePillSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const sectionId = useId();

  const visibleItems = useMemo(() => {
    if (isExpanded) return items;
    return items.slice(0, maxVisible);
  }, [items, maxVisible, isExpanded]);

  const hiddenCount = items.length - maxVisible;
  const needsExpansion = hiddenCount > 0;

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handlePillClick = useCallback(
    (item: string) => {
      if (onPillClick) {
        onPillClick(item);
      }
    },
    [onPillClick]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, item: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handlePillClick(item);
      }
    },
    [handlePillClick]
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <div className={`expandable-pills ${className}`}>
      {showTitle && title && (
        <h3 className="expandable-pills__title" id={`${sectionId}-title`}>
          {title}
        </h3>
      )}
      <div
        className={`expandable-pills__list expandable-pills__list--${variant} ${isExpanded ? 'expandable-pills__list--expanded' : ''}`}
        role="list"
        aria-labelledby={showTitle && title ? `${sectionId}-title` : undefined}
      >
        {visibleItems.map((item, idx) => (
          <span
            key={`${item}-${idx}`}
            className={`expandable-pills__item expandable-pills__item--${variant}`}
            role="listitem"
            tabIndex={onPillClick ? 0 : undefined}
            onClick={onPillClick ? () => handlePillClick(item) : undefined}
            onKeyDown={onPillClick ? (e) => handleKeyDown(e, item) : undefined}
            style={{ animationDelay: isExpanded && idx >= maxVisible ? `${(idx - maxVisible) * 30}ms` : undefined }}
          >
            {item}
          </span>
        ))}
        {needsExpansion && (
          <button
            className={`expandable-pills__toggle expandable-pills__toggle--${variant}`}
            onClick={toggleExpanded}
            aria-expanded={isExpanded}
            aria-controls={`${sectionId}-list`}
          >
            {isExpanded ? (
              <>
                <svg className="expandable-pills__toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 15l-6-6-6 6" />
                </svg>
                Show less
              </>
            ) : (
              <>
                +{hiddenCount} more
                <svg className="expandable-pills__toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default ExpandablePillSection;
