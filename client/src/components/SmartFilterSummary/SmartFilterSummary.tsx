/**
 * SmartFilterSummary Component
 *
 * Displays a human-readable summary of a smart collection's filter criteria.
 */

import { useMemo } from 'react';
import {
  type SmartFilter,
  type SmartFilterCondition,
  type SmartFilterGroup,
} from '../../services/api/series';
import './SmartFilterSummary.css';

export interface SmartFilterSummaryProps {
  /** JSON string of the filter definition */
  filterDefinition: string | null;
  /** Scope of the smart filter */
  smartScope: 'series' | 'files' | null;
  /** Additional CSS class */
  className?: string;
}

// Human-readable field names
const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  publisher: 'Publisher',
  startYear: 'Start Year',
  endYear: 'End Year',
  genres: 'Genres',
  tags: 'Tags',
  type: 'Type',
  readStatus: 'Read Status',
  issueCount: 'Issue Count',
  rating: 'Rating',
  createdAt: 'Date Added',
  lastReadAt: 'Last Read',
  pageCount: 'Page Count',
};

// Human-readable comparison labels
const COMPARISON_LABELS: Record<string, string> = {
  contains: 'contains',
  notContains: 'does not contain',
  equals: 'is',
  notEquals: 'is not',
  startsWith: 'starts with',
  endsWith: 'ends with',
  isEmpty: 'is empty',
  isNotEmpty: 'is not empty',
  greaterThan: '>',
  lessThan: '<',
  greaterOrEqual: '>=',
  lessOrEqual: '<=',
  between: 'between',
  before: 'before',
  after: 'after',
  withinLast: 'within last',
};

function formatCondition(condition: SmartFilterCondition): string {
  const field = FIELD_LABELS[condition.field] || condition.field;
  const comparison = COMPARISON_LABELS[condition.comparison] || condition.comparison;

  // Special cases
  if (condition.comparison === 'isEmpty' || condition.comparison === 'isNotEmpty') {
    return `${field} ${comparison}`;
  }

  if (condition.comparison === 'between' && condition.value2) {
    return `${field} ${comparison} ${condition.value} and ${condition.value2}`;
  }

  if (condition.comparison === 'withinLast' && condition.value2) {
    return `${field} ${comparison} ${condition.value} ${condition.value2}`;
  }

  return `${field} ${comparison} "${condition.value}"`;
}

function formatGroup(group: SmartFilterGroup): string {
  if (group.conditions.length === 0) return '';

  const conditions = group.conditions
    .map(formatCondition)
    .join(` ${group.operator} `);

  return group.conditions.length > 1 ? `(${conditions})` : conditions;
}

function parseFilter(filterDefinition: string | null): SmartFilter | null {
  if (!filterDefinition) return null;

  try {
    return JSON.parse(filterDefinition) as SmartFilter;
  } catch {
    return null;
  }
}

export function SmartFilterSummary({
  filterDefinition,
  smartScope,
  className = '',
}: SmartFilterSummaryProps) {
  const filter = useMemo(() => parseFilter(filterDefinition), [filterDefinition]);

  const summary = useMemo(() => {
    if (!filter || filter.groups.length === 0) {
      return null;
    }

    const groupSummaries = filter.groups
      .map(formatGroup)
      .filter(Boolean);

    if (groupSummaries.length === 0) return null;

    return groupSummaries.join(` ${filter.rootOperator} `);
  }, [filter]);

  if (!filter || !summary) {
    return (
      <div className={`smart-filter-summary smart-filter-summary--empty ${className}`}>
        <svg className="smart-filter-summary__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        <span className="smart-filter-summary__label">No filter criteria defined</span>
      </div>
    );
  }

  const scopeLabel = smartScope === 'files' ? 'issues' : 'series';

  return (
    <div className={`smart-filter-summary ${className}`}>
      <div className="smart-filter-summary__header">
        <svg className="smart-filter-summary__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        <span className="smart-filter-summary__label">
          Filters matching {scopeLabel}:
        </span>
      </div>
      <p className="smart-filter-summary__criteria">{summary}</p>
    </div>
  );
}
