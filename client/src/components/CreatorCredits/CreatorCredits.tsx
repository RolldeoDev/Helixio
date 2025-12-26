/**
 * CreatorCredits Component
 *
 * Movie-credits style display of comic creators with roles.
 * Shows primary roles (Writer, Artist, Cover Artist) by default,
 * with expandable section for all contributors.
 */

import { useState, useCallback, useMemo } from 'react';
import './CreatorCredits.css';

// Primary roles to show by default (in display order)
const PRIMARY_ROLES = [
  'Writer',
  'Artist',
  'Penciller',
  'Inker',
  'Cover Artist',
  'Cover',
  'Colorist',
  'Letterer',
];

// Role display mappings (normalize various formats)
const ROLE_ALIASES: Record<string, string> = {
  'Penciler': 'Penciller',
  'Cover Artist': 'Cover',
  'Cover': 'Cover',
  'Colourist': 'Colorist',
  'Letters': 'Letterer',
  'Colors': 'Colorist',
  'Inks': 'Inker',
  'Pencils': 'Penciller',
};

interface ParsedCreator {
  name: string;
  role: string;
}

/** Structured creator data with role-specific arrays */
export interface CreatorsByRole {
  writer?: string[];
  penciller?: string[];
  inker?: string[];
  colorist?: string[];
  letterer?: string[];
  coverArtist?: string[];
  editor?: string[];
}

interface CreatorCreditsProps {
  /** Comma-separated string of creators, e.g., "John Smith (Writer), Jane Doe (Artist)" */
  creators: string | null;
  /** Structured creator data with role-specific arrays (preferred over creators string) */
  creatorsWithRoles?: CreatorsByRole;
  /** Whether the section is expandable (shows primary roles first) */
  expandable?: boolean;
  /** Whether to start expanded */
  defaultExpanded?: boolean;
  /** Maximum primary creators to show before expand */
  maxPrimary?: number;
  /** Maximum names to show per role before showing "x more" (default: 10) */
  maxNamesPerRole?: number;
  /** Custom class name */
  className?: string;
}

/**
 * Parse creator strings like "Name (Role)" or just "Name"
 */
function parseCreators(creatorsString: string | null): ParsedCreator[] {
  if (!creatorsString) return [];

  return creatorsString
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      // Try to match "Name (Role)" pattern
      const match = c.match(/^(.+?)\s*\(([^)]+)\)$/);
      if (match && match[1] && match[2]) {
        const roleRaw = match[2].trim();
        const role = ROLE_ALIASES[roleRaw] || roleRaw;
        return { name: match[1].trim(), role };
      }
      // No role specified
      return { name: c.trim(), role: 'Creator' };
    });
}

/**
 * Group creators by role
 */
function groupByRole(creators: ParsedCreator[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const creator of creators) {
    const existing = grouped.get(creator.role);
    if (existing) {
      if (!existing.includes(creator.name)) {
        existing.push(creator.name);
      }
    } else {
      grouped.set(creator.role, [creator.name]);
    }
  }

  return grouped;
}

/**
 * Convert CreatorsByRole to Map (for structured input)
 */
function creatorsWithRolesToMap(creatorsWithRoles: CreatorsByRole): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  // Map field names to display names
  const roleDisplayNames: Record<keyof CreatorsByRole, string> = {
    writer: 'Writer',
    penciller: 'Penciller',
    inker: 'Inker',
    colorist: 'Colorist',
    letterer: 'Letterer',
    coverArtist: 'Cover',
    editor: 'Editor',
  };

  for (const [field, displayName] of Object.entries(roleDisplayNames) as Array<[keyof CreatorsByRole, string]>) {
    const names = creatorsWithRoles[field];
    if (names && names.length > 0) {
      grouped.set(displayName, names);
    }
  }

  return grouped;
}

export function CreatorCredits({
  creators,
  creatorsWithRoles,
  expandable = true,
  defaultExpanded = false,
  // maxPrimary is reserved for future use
  maxPrimary: _maxPrimary = 6,
  maxNamesPerRole = 10,
  className = '',
}: CreatorCreditsProps) {
  void _maxPrimary; // Suppress unused warning
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  // Track which roles have their names expanded (by role name)
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());

  // Use structured input if available, otherwise fall back to parsing string
  const parsedCreators = useMemo(() => {
    if (creatorsWithRoles) return []; // Not needed when using structured input
    return parseCreators(creators);
  }, [creators, creatorsWithRoles]);

  const groupedByRole = useMemo(() => {
    // Prefer structured input (creatorsWithRoles) over parsed string
    if (creatorsWithRoles) {
      return creatorsWithRolesToMap(creatorsWithRoles);
    }
    return groupByRole(parsedCreators);
  }, [creatorsWithRoles, parsedCreators]);

  // Check if we have any creators to display
  const hasCreators = useMemo(() => {
    if (creatorsWithRoles) {
      return Object.values(creatorsWithRoles).some((arr) => arr && arr.length > 0);
    }
    return parsedCreators.length > 0;
  }, [creatorsWithRoles, parsedCreators]);

  // Separate primary and secondary roles
  const { primaryRoles, secondaryRoles, secondaryCount } = useMemo(() => {
    const primary: Array<{ role: string; names: string[] }> = [];
    const secondary: Array<{ role: string; names: string[] }> = [];
    let sCount = 0;

    // First, add primary roles in order
    for (const role of PRIMARY_ROLES) {
      const names = groupedByRole.get(role);
      if (names && names.length > 0) {
        primary.push({ role, names });
      }
    }

    // Then, add any remaining roles as secondary
    for (const [role, names] of groupedByRole) {
      if (!PRIMARY_ROLES.includes(role)) {
        secondary.push({ role, names });
        sCount += names.length;
      }
    }

    return {
      primaryRoles: primary,
      secondaryRoles: secondary,
      secondaryCount: sCount,
    };
  }, [groupedByRole]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const toggleRoleExpanded = useCallback((role: string) => {
    setExpandedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) {
        next.delete(role);
      } else {
        next.add(role);
      }
      return next;
    });
  }, []);

  if (!hasCreators) {
    return null;
  }

  // Determine what to show
  const showPrimary = primaryRoles.slice(0, expandable && !isExpanded ? Math.min(primaryRoles.length, 4) : undefined);
  const hiddenPrimaryCount = expandable && !isExpanded ? Math.max(0, primaryRoles.length - 4) : 0;
  const totalHidden = hiddenPrimaryCount + (expandable && !isExpanded ? secondaryCount : 0);

  return (
    <div className={`creator-credits ${isExpanded ? 'creator-credits--expanded' : ''} ${className}`}>
      <h3 className="creator-credits__title">Credits</h3>

      <div className="creator-credits__grid">
        {/* Primary roles */}
        {showPrimary.map(({ role, names }, idx) => {
          const isRoleExpanded = expandedRoles.has(role);
          const hasMoreNames = names.length > maxNamesPerRole;
          const visibleNames = hasMoreNames && !isRoleExpanded
            ? names.slice(0, maxNamesPerRole)
            : names;
          const hiddenCount = names.length - maxNamesPerRole;

          return (
            <div
              key={role}
              className="creator-credits__entry"
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              <span className="creator-credits__role">{role}</span>
              <span className="creator-credits__names">
                {visibleNames.map((name, nameIdx) => (
                  <span key={name} className="creator-credits__name">
                    {name}
                    {nameIdx < visibleNames.length - 1 && (
                      <span className="creator-credits__separator">, </span>
                    )}
                  </span>
                ))}
                {hasMoreNames && !isRoleExpanded && (
                  <button
                    className="creator-credits__inline-toggle"
                    onClick={() => toggleRoleExpanded(role)}
                    aria-expanded={false}
                  >
                    +{hiddenCount} more
                  </button>
                )}
                {hasMoreNames && isRoleExpanded && (
                  <button
                    className="creator-credits__inline-toggle"
                    onClick={() => toggleRoleExpanded(role)}
                    aria-expanded={true}
                  >
                    show less
                  </button>
                )}
              </span>
            </div>
          );
        })}

        {/* Secondary roles (when expanded) */}
        {isExpanded &&
          secondaryRoles.map(({ role, names }, idx) => {
            const isRoleExpanded = expandedRoles.has(role);
            const hasMoreNames = names.length > maxNamesPerRole;
            const visibleNames = hasMoreNames && !isRoleExpanded
              ? names.slice(0, maxNamesPerRole)
              : names;
            const hiddenCount = names.length - maxNamesPerRole;

            return (
              <div
                key={role}
                className="creator-credits__entry creator-credits__entry--secondary"
                style={{ animationDelay: `${(showPrimary.length + idx) * 50}ms` }}
              >
                <span className="creator-credits__role">{role}</span>
                <span className="creator-credits__names">
                  {visibleNames.map((name, nameIdx) => (
                    <span key={name} className="creator-credits__name">
                      {name}
                      {nameIdx < visibleNames.length - 1 && (
                        <span className="creator-credits__separator">, </span>
                      )}
                    </span>
                  ))}
                  {hasMoreNames && !isRoleExpanded && (
                    <button
                      className="creator-credits__inline-toggle"
                      onClick={() => toggleRoleExpanded(role)}
                      aria-expanded={false}
                    >
                      +{hiddenCount} more
                    </button>
                  )}
                  {hasMoreNames && isRoleExpanded && (
                    <button
                      className="creator-credits__inline-toggle"
                      onClick={() => toggleRoleExpanded(role)}
                      aria-expanded={true}
                    >
                      show less
                    </button>
                  )}
                </span>
              </div>
            );
          })}
      </div>

      {/* Expand/collapse button */}
      {expandable && totalHidden > 0 && (
        <button
          className="creator-credits__toggle"
          onClick={toggleExpanded}
          aria-expanded={isExpanded}
        >
          {isExpanded ? (
            <>
              <svg className="creator-credits__toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 15l-6-6-6 6" />
              </svg>
              Show less
            </>
          ) : (
            <>
              +{totalHidden} more credits
              <svg className="creator-credits__toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </>
          )}
        </button>
      )}

      {/* Collapse button when fully expanded */}
      {expandable && isExpanded && totalHidden === 0 && secondaryRoles.length > 0 && (
        <button
          className="creator-credits__toggle"
          onClick={toggleExpanded}
          aria-expanded={isExpanded}
        >
          <svg className="creator-credits__toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 15l-6-6-6 6" />
          </svg>
          Show less
        </button>
      )}
    </div>
  );
}

export default CreatorCredits;
