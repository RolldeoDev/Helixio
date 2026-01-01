/**
 * Advanced Series Filter Panel Component
 *
 * A toggle button that opens the Advanced Series Filter modal.
 * Shows active state and condition count when filters are applied.
 *
 * Optimized for performance.
 */

import { useMemo } from 'react';
import { useAdvancedSeriesFilter } from '../../contexts/AdvancedSeriesFilterContext';
import './AdvancedSeriesFilter.css';

// =============================================================================
// Main Component
// =============================================================================

export function AdvancedSeriesFilterPanel() {
  const {
    activeFilter,
    isFilterActive,
    clearFilter,
    openFilterPanel,
  } = useAdvancedSeriesFilter();

  // Count total active conditions across all groups
  const conditionCount = useMemo(() => {
    if (!activeFilter?.groups) return 0;
    return activeFilter.groups.reduce(
      (total, group) => total + group.conditions.length,
      0
    );
  }, [activeFilter?.groups]);

  return (
    <div className="advanced-series-filter-collapsed">
      <button
        type="button"
        className={`series-filter-toggle-btn ${isFilterActive ? 'active' : ''}`}
        onClick={openFilterPanel}
        title="Open advanced filters"
        aria-label={isFilterActive ? `Advanced Filters (${conditionCount} active)` : 'Advanced Filters'}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        <span className="series-filter-toggle-text">Advanced Filters</span>
        {isFilterActive && conditionCount > 0 && (
          <span className="series-filter-badge">{conditionCount}</span>
        )}
      </button>
      {isFilterActive && (
        <button
          type="button"
          className="series-filter-clear-btn-small"
          onClick={clearFilter}
          title="Clear filter"
          aria-label="Clear advanced filters"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}
