/**
 * CollapsibleSection Component
 *
 * Reusable accordion component for organizing form fields in sections.
 */

import { useState, useCallback, ReactNode } from 'react';

interface CollapsibleSectionProps {
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  fullWidth?: boolean;
  className?: string;
  icon?: string;
  changeCount?: number;
}

export function CollapsibleSection({
  title,
  children,
  defaultExpanded = false,
  fullWidth = false,
  className = '',
  icon,
  changeCount,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleExpanded();
      }
    },
    [toggleExpanded]
  );

  return (
    <div
      className={`collapsible-section ${expanded ? 'expanded' : 'collapsed'} ${fullWidth ? 'full-width' : ''} ${className}`}
    >
      <div
        className="collapsible-section-header"
        onClick={toggleExpanded}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
      >
        {icon && <span className="collapsible-section-icon">{icon}</span>}
        <h3 className="collapsible-section-title">{title}</h3>
        {changeCount !== undefined && changeCount > 0 && (
          <span className="collapsible-section-badge">
            {changeCount} {changeCount === 1 ? 'change' : 'changes'}
          </span>
        )}
        <svg
          className="collapsible-section-chevron"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M4 6L8 10L12 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="collapsible-section-content">{children}</div>
    </div>
  );
}
