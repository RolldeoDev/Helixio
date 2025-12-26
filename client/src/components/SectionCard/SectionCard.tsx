import React, { useState, useId } from 'react';
import './SectionCard.css';

export interface SectionCardProps {
  /** Section title displayed in header */
  title?: string;
  /** Description text displayed below title */
  description?: string;
  /** Actions slot rendered on the right side of header */
  actions?: React.ReactNode;
  /** Visual variant - 'danger' adds red styling for destructive sections */
  variant?: 'default' | 'danger';
  /** Card content */
  children: React.ReactNode;
  /** Additional CSS class */
  className?: string;
  /** Whether the card can be collapsed */
  collapsible?: boolean;
  /** Initial collapsed state (only used if collapsible is true) */
  defaultCollapsed?: boolean;
}

/**
 * SectionCard - Organizes settings into visual groups
 *
 * Provides consistent card styling with optional header, description,
 * actions slot, and collapsible behavior.
 */
export function SectionCard({
  title,
  description,
  actions,
  variant = 'default',
  children,
  className = '',
  collapsible = false,
  defaultCollapsed = false,
}: SectionCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const contentId = useId();

  const hasHeader = title || description || actions;
  const hasContent = React.Children.count(children) > 0;

  const handleHeaderClick = () => {
    if (collapsible) {
      setIsCollapsed(!isCollapsed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (collapsible && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setIsCollapsed(!isCollapsed);
    }
  };

  const cardClasses = [
    'section-card',
    `section-card--${variant}`,
    collapsible && 'section-card--collapsible',
    collapsible && isCollapsed && 'section-card--collapsed',
    hasContent && 'section-card--has-content',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  // Chevron icon for collapsible cards
  const ChevronIcon = () => (
    <svg
      className="section-card__chevron"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );

  return (
    <div className={cardClasses}>
      {hasHeader && (
        <div
          className="section-card__header"
          onClick={handleHeaderClick}
          onKeyDown={handleKeyDown}
          role={collapsible ? 'button' : undefined}
          tabIndex={collapsible ? 0 : undefined}
          aria-expanded={collapsible ? !isCollapsed : undefined}
          aria-controls={collapsible ? contentId : undefined}
        >
          <div className="section-card__title-group">
            {title && <h3 className="section-card__title">{title}</h3>}
            {description && (
              <p className="section-card__description">{description}</p>
            )}
          </div>

          <div className="section-card__actions">
            {actions}
            {collapsible && <ChevronIcon />}
          </div>
        </div>
      )}

      {hasContent && (
        <>
          {collapsible ? (
            <div className="section-card__collapse-wrapper">
              <div className="section-card__collapse-inner">
                <div id={contentId} className="section-card__content">
                  {children}
                </div>
              </div>
            </div>
          ) : (
            <div className="section-card__content">{children}</div>
          )}
        </>
      )}
    </div>
  );
}

export default SectionCard;
