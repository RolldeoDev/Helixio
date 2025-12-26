import React, { useState, useId, useCallback } from 'react';
import './Accordion.css';

export interface AccordionSection {
  /** Unique identifier for the section */
  id: string;
  /** Section title displayed in header */
  title: string;
  /** Optional icon displayed before title */
  icon?: React.ReactNode;
  /** Optional badge (count or label) displayed after title */
  badge?: string | number;
  /** Section content */
  children: React.ReactNode;
  /** Whether section is expanded by default */
  defaultExpanded?: boolean;
}

export interface AccordionProps {
  /** Array of accordion sections */
  sections: AccordionSection[];
  /** Allow multiple sections to be expanded simultaneously */
  allowMultiple?: boolean;
  /** Additional CSS class */
  className?: string;
}

/**
 * Accordion - Collapsible sections for organizing content
 *
 * Used in Account settings to organize Profile, Trackers, and Sync sections.
 * Features smooth CSS grid-based animations and proper accessibility.
 */
export function Accordion({
  sections,
  allowMultiple = false,
  className = '',
}: AccordionProps) {
  // Initialize expanded state from defaultExpanded props
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    sections.forEach((section) => {
      if (section.defaultExpanded) {
        initial.add(section.id);
      }
    });
    // If none are default expanded and allowMultiple is false, expand first
    if (initial.size === 0 && sections.length > 0 && !allowMultiple && sections[0]) {
      initial.add(sections[0].id);
    }
    return initial;
  });

  const baseId = useId();

  const toggleSection = useCallback(
    (sectionId: string) => {
      setExpandedIds((prev) => {
        const next = new Set(prev);

        if (next.has(sectionId)) {
          // Collapse this section
          next.delete(sectionId);
        } else {
          // Expand this section
          if (!allowMultiple) {
            // If single mode, close all others first
            next.clear();
          }
          next.add(sectionId);
        }

        return next;
      });
    },
    [allowMultiple]
  );

  const handleKeyDown = (e: React.KeyboardEvent, sectionId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleSection(sectionId);
    }
  };

  // Chevron icon component
  const ChevronIcon = () => (
    <span className="accordion-chevron">
      <svg viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </span>
  );

  return (
    <div className={`accordion ${className}`.trim()}>
      {sections.map((section) => {
        const isExpanded = expandedIds.has(section.id);
        const headerId = `${baseId}-header-${section.id}`;
        const contentId = `${baseId}-content-${section.id}`;

        return (
          <div
            key={section.id}
            className={`accordion-section ${isExpanded ? 'accordion-section--expanded' : ''}`}
          >
            <button
              id={headerId}
              className="accordion-header"
              onClick={() => toggleSection(section.id)}
              onKeyDown={(e) => handleKeyDown(e, section.id)}
              aria-expanded={isExpanded}
              aria-controls={contentId}
            >
              {section.icon && (
                <span className="accordion-icon">{section.icon}</span>
              )}
              <span className="accordion-title">{section.title}</span>
              {section.badge !== undefined && section.badge !== '' && (
                <span className="accordion-badge">{section.badge}</span>
              )}
              <ChevronIcon />
            </button>

            <div className="accordion-content-wrapper">
              <div className="accordion-content-inner">
                <div
                  id={contentId}
                  className="accordion-content"
                  role="region"
                  aria-labelledby={headerId}
                >
                  {section.children}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default Accordion;
