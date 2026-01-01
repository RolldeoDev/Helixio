/**
 * SeriesToolbar Component
 *
 * Filter controls for the series grid.
 * Includes search, dropdowns, sort options, and card size slider.
 *
 * Features:
 * - Debounced search (300ms)
 * - Active filter chips with remove buttons
 * - Preset mode indicator
 * - Card size slider
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSeriesPublishers } from '../../../services/api/series';
import { SmartSeriesFilterPanel } from '../../../components/SmartSeriesFilter';
import {
  SeriesFilterState,
  SortByOption,
  SeriesType,
} from '../utils/filterUtils';
import './SeriesToolbar.css';

// =============================================================================
// Types
// =============================================================================

export interface SeriesToolbarProps {
  /** Current filter state */
  filters: SeriesFilterState;
  /** Update a single filter */
  onFilterChange: <K extends keyof SeriesFilterState>(
    key: K,
    value: SeriesFilterState[K]
  ) => void;
  /** Clear all filters */
  onClearFilters: () => void;
  /** Clear preset */
  onClearPreset: () => void;
  /** Whether filters are active */
  hasActiveFilters: boolean;
  /** Whether using a preset */
  isUsingPreset: boolean;
  /** Total item count for display */
  totalCount: number;
  /** Whether data is loading */
  isLoading: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const SORT_OPTIONS: { value: SortByOption; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'startYear', label: 'Year' },
  { value: 'updatedAt', label: 'Recently Updated' },
  { value: 'issueCount', label: 'Issue Count' },
];

const TYPE_OPTIONS: { value: SeriesType | ''; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'western', label: 'Western' },
  { value: 'manga', label: 'Manga' },
];

const UNREAD_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'true', label: 'Has Unread' },
  { value: 'false', label: 'All Read' },
];

const DEBOUNCE_MS = 300;

// =============================================================================
// Component
// =============================================================================

export function SeriesToolbar({
  filters,
  onFilterChange,
  onClearFilters,
  onClearPreset,
  isUsingPreset,
  totalCount,
  isLoading,
}: SeriesToolbarProps) {
  // Local search input state (for debouncing)
  const [searchInput, setSearchInput] = useState(filters.search);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Fetch publishers for dropdown
  const { data: publishersData } = useQuery({
    queryKey: ['series', 'publishers'],
    queryFn: getSeriesPublishers,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  const publishers = publishersData?.publishers ?? [];

  // Sync local search with filter state (for external changes)
  useEffect(() => {
    if (filters.search !== searchInput) {
      setSearchInput(filters.search);
    }
    // Only sync when filters.search changes externally
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.search]);

  // Debounced search handler
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchInput(value);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        onFilterChange('search', value);
      }, DEBOUNCE_MS);
    },
    [onFilterChange]
  );

  // Clear search on Escape
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchInput('');
        onFilterChange('search', '');
        searchInputRef.current?.blur();
      }
    },
    [onFilterChange]
  );

  // Clear search button
  const handleClearSearch = useCallback(() => {
    setSearchInput('');
    onFilterChange('search', '');
    searchInputRef.current?.focus();
  }, [onFilterChange]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Build active filter chips
  const activeChips: { key: string; label: string; onRemove: () => void }[] = [];

  if (filters.search) {
    activeChips.push({
      key: 'search',
      label: `"${filters.search}"`,
      onRemove: () => {
        setSearchInput('');
        onFilterChange('search', '');
      },
    });
  }

  if (filters.publisher) {
    activeChips.push({
      key: 'publisher',
      label: filters.publisher,
      onRemove: () => onFilterChange('publisher', null),
    });
  }

  if (filters.type) {
    activeChips.push({
      key: 'type',
      label: filters.type === 'western' ? 'Western' : 'Manga',
      onRemove: () => onFilterChange('type', null),
    });
  }

  if (filters.hasUnread !== null) {
    activeChips.push({
      key: 'hasUnread',
      label: filters.hasUnread ? 'Has Unread' : 'All Read',
      onRemove: () => onFilterChange('hasUnread', null),
    });
  }

  if (filters.showHidden) {
    activeChips.push({
      key: 'showHidden',
      label: 'Show Hidden',
      onRemove: () => onFilterChange('showHidden', false),
    });
  }

  return (
    <div className="series-toolbar">
      {/* Preset mode indicator */}
      {isUsingPreset && (
        <div className="series-toolbar__preset-bar">
          <span className="series-toolbar__preset-icon">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4Zm0 6a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2Zm1 5a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H4Z" />
            </svg>
          </span>
          <span className="series-toolbar__preset-label">Using preset</span>
          <button
            className="series-toolbar__preset-clear"
            onClick={onClearPreset}
            aria-label="Clear preset"
          >
            Clear
          </button>
        </div>
      )}

      {/* Main toolbar row */}
      <div className="series-toolbar__row">
        {/* Search */}
        <div className="series-toolbar__search">
          <svg
            className="series-toolbar__search-icon"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
              clipRule="evenodd"
            />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            className="series-toolbar__search-input"
            placeholder="Search series..."
            value={searchInput}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            aria-label="Search series"
          />
          {searchInput && (
            <button
              className="series-toolbar__search-clear"
              onClick={handleClearSearch}
              aria-label="Clear search"
            >
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          )}
          {isLoading && searchInput && (
            <span className="series-toolbar__search-spinner" aria-hidden="true" />
          )}
        </div>

        {/* Filter dropdowns (hidden in preset mode) */}
        {!isUsingPreset && (
          <div className="series-toolbar__filters">
            {/* Publisher */}
            <select
              className="series-toolbar__select"
              value={filters.publisher ?? ''}
              onChange={(e) =>
                onFilterChange('publisher', e.target.value || null)
              }
              aria-label="Filter by publisher"
            >
              <option value="">All Publishers</option>
              {publishers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            {/* Type */}
            <select
              className="series-toolbar__select"
              value={filters.type ?? ''}
              onChange={(e) =>
                onFilterChange('type', (e.target.value as SeriesType) || null)
              }
              aria-label="Filter by type"
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Unread */}
            <select
              className="series-toolbar__select"
              value={
                filters.hasUnread === null ? '' : String(filters.hasUnread)
              }
              onChange={(e) => {
                const val = e.target.value;
                onFilterChange(
                  'hasUnread',
                  val === '' ? null : val === 'true'
                );
              }}
              aria-label="Filter by read status"
            >
              {UNREAD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Show Hidden toggle */}
            <label className="series-toolbar__checkbox">
              <input
                type="checkbox"
                checked={filters.showHidden}
                onChange={(e) => onFilterChange('showHidden', e.target.checked)}
              />
              <span>Show Hidden</span>
            </label>
          </div>
        )}

        {/* Smart Filters */}
        <SmartSeriesFilterPanel />

        {/* Sort controls */}
        <div className="series-toolbar__sort">
          <select
            className="series-toolbar__select"
            value={filters.sortBy}
            onChange={(e) =>
              onFilterChange('sortBy', e.target.value as SortByOption)
            }
            aria-label="Sort by"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <button
            className="series-toolbar__sort-order"
            onClick={() =>
              onFilterChange(
                'sortOrder',
                filters.sortOrder === 'asc' ? 'desc' : 'asc'
              )
            }
            aria-label={`Sort ${filters.sortOrder === 'asc' ? 'ascending' : 'descending'}`}
            title={filters.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`series-toolbar__sort-icon ${filters.sortOrder === 'desc' ? 'series-toolbar__sort-icon--desc' : ''}`}
            >
              <path
                fillRule="evenodd"
                d="M10 3a.75.75 0 0 1 .75.75v10.638l3.96-4.158a.75.75 0 1 1 1.08 1.04l-5.25 5.5a.75.75 0 0 1-1.08 0l-5.25-5.5a.75.75 0 1 1 1.08-1.04l3.96 4.158V3.75A.75.75 0 0 1 10 3Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Card size slider */}
        <div className="series-toolbar__size">
          <label className="series-toolbar__size-label">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.25 2A2.25 2.25 0 0 0 2 4.25v2.5A2.25 2.25 0 0 0 4.25 9h2.5A2.25 2.25 0 0 0 9 6.75v-2.5A2.25 2.25 0 0 0 6.75 2h-2.5Zm0 9A2.25 2.25 0 0 0 2 13.25v2.5A2.25 2.25 0 0 0 4.25 18h2.5A2.25 2.25 0 0 0 9 15.75v-2.5A2.25 2.25 0 0 0 6.75 11h-2.5Zm9-9A2.25 2.25 0 0 0 11 4.25v2.5A2.25 2.25 0 0 0 13.25 9h2.5A2.25 2.25 0 0 0 18 6.75v-2.5A2.25 2.25 0 0 0 15.75 2h-2.5Zm0 9A2.25 2.25 0 0 0 11 13.25v2.5A2.25 2.25 0 0 0 13.25 18h2.5A2.25 2.25 0 0 0 18 15.75v-2.5A2.25 2.25 0 0 0 15.75 11h-2.5Z"
                clipRule="evenodd"
              />
            </svg>
          </label>
          <input
            type="range"
            min="1"
            max="10"
            value={filters.cardSize}
            onChange={(e) => onFilterChange('cardSize', parseInt(e.target.value, 10))}
            className="series-toolbar__size-slider"
            aria-label="Card size"
          />
        </div>
      </div>

      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <div className="series-toolbar__chips">
          {activeChips.map((chip) => (
            <span key={chip.key} className="series-toolbar__chip">
              {chip.label}
              <button
                className="series-toolbar__chip-remove"
                onClick={chip.onRemove}
                aria-label={`Remove ${chip.label} filter`}
              >
                <svg viewBox="0 0 16 16" fill="currentColor">
                  <path d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z" />
                </svg>
              </button>
            </span>
          ))}
          <button
            className="series-toolbar__clear-all"
            onClick={onClearFilters}
            aria-label="Clear all filters"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Result count */}
      <div className="series-toolbar__count">
        {isLoading ? (
          <span className="series-toolbar__count-loading">Loading...</span>
        ) : (
          <span>
            {totalCount} {totalCount === 1 ? 'series' : 'series'}
          </span>
        )}
      </div>
    </div>
  );
}
