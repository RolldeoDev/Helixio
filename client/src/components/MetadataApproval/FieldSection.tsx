/**
 * FieldSection Component
 *
 * A collapsible accordion section for organizing form fields.
 * Used in IssueEditDrawer to group related metadata fields.
 */

import { useState } from 'react';

interface FieldSectionProps {
  title: string;
  icon: string;
  defaultExpanded?: boolean;
  changeCount?: number;
  children: React.ReactNode;
}

export function FieldSection({
  title,
  icon,
  defaultExpanded = false,
  changeCount = 0,
  children,
}: FieldSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className={`field-section ${isExpanded ? 'expanded' : 'collapsed'}`}>
      <button
        type="button"
        className="field-section-header"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        <span className="field-section-icon">{icon}</span>
        <span className="field-section-title">{title}</span>
        {changeCount > 0 && (
          <span className="field-section-badge">{changeCount} changes</span>
        )}
        <span className={`field-section-chevron ${isExpanded ? 'rotated' : ''}`}>
          &#9660;
        </span>
      </button>
      {isExpanded && (
        <div className="field-section-content">
          {children}
        </div>
      )}
    </div>
  );
}

export default FieldSection;
