/**
 * Library Toolbar Component
 *
 * A unified, compact control bar that consolidates view toggles, filters,
 * sorting, pagination and actions into a single efficient header.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../../contexts/AppContext';
import { useAdvancedFilter } from '../../contexts/AdvancedFilterContext';
import {
  SORT_FIELDS,
  GROUP_FIELDS,
  type SortField,
  type GroupField,
} from '../SortGroup/SortGroupPanel';
import './LibraryToolbar.css';

type ViewMode = 'grid' | 'list' | 'compact';

interface LibraryToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  filteredCount: number;
  totalCount: number;
  onEditMetadata?: () => void;
  onEditPages?: () => void;
  groupField: GroupField;
  onGroupChange: (field: GroupField) => void;
}

const PAGE_SIZES = [25, 50, 100] as const;

export function LibraryToolbar({
  viewMode,
  onViewModeChange,
  filteredCount,
  totalCount,
  onEditMetadata,
  onEditPages,
  groupField,
  onGroupChange,
}: LibraryToolbarProps) {
  const { pagination, selectedFiles, clearSelection, setPage, setPageSize, sortField, sortOrder, setSort } = useApp();
  const { isFilterActive, openFilterPanel, clearFilter, isFilterPanelOpen } = useAdvancedFilter();

  // Sort dropdown state
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  // Group dropdown state
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const groupDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setSortDropdownOpen(false);
      }
      if (groupDropdownRef.current && !groupDropdownRef.current.contains(e.target as Node)) {
        setGroupDropdownOpen(false);
      }
    };
    if (sortDropdownOpen || groupDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [sortDropdownOpen, groupDropdownOpen]);

  const handleSortFieldChange = useCallback((field: SortField) => {
    setSort(field, sortOrder);
  }, [setSort, sortOrder]);

  const handleSortOrderToggle = useCallback(() => {
    setSort(sortField as SortField, sortOrder === 'asc' ? 'desc' : 'asc');
  }, [setSort, sortField, sortOrder]);

  const sortLabel = SORT_FIELDS.find((s) => s.value === sortField)?.label || 'Sort';
  const groupLabel = GROUP_FIELDS.find((g) => g.value === groupField)?.label || 'Group';

  const hasSelection = selectedFiles.size > 0;
  const isFiltered = isFilterActive && filteredCount !== totalCount;

  return (
    <div className="library-toolbar">
      {/* Left section: View toggle + count */}
      <div className="toolbar-section toolbar-left">
        <div className="view-mode-toggle">
          <button
            className={`view-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => onViewModeChange('grid')}
            title="Grid view"
            aria-pressed={viewMode === 'grid'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </button>
          <button
            className={`view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => onViewModeChange('list')}
            title="List view"
            aria-pressed={viewMode === 'list'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <circle cx="4" cy="6" r="1" fill="currentColor" />
              <circle cx="4" cy="12" r="1" fill="currentColor" />
              <circle cx="4" cy="18" r="1" fill="currentColor" />
            </svg>
          </button>
          <button
            className={`view-btn ${viewMode === 'compact' ? 'active' : ''}`}
            onClick={() => onViewModeChange('compact')}
            title="Compact view"
            aria-pressed={viewMode === 'compact'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <line x1="3" y1="14" x2="21" y2="14" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>

        <div className="comic-count">
          <span className="count-number">{filteredCount.toLocaleString()}</span>
          <span className="count-label">
            {filteredCount === 1 ? 'comic' : 'comics'}
            {isFiltered && (
              <span className="filtered-indicator"> of {totalCount.toLocaleString()}</span>
            )}
          </span>
        </div>
      </div>

      {/* Center section: Filter + Sort controls */}
      <div className="toolbar-section toolbar-center">
        {/* Filter button */}
        <button
          className={`toolbar-btn filter-btn ${isFilterActive ? 'active' : ''}`}
          onClick={isFilterPanelOpen ? clearFilter : openFilterPanel}
          title={isFilterActive ? 'Clear filters' : 'Open filters'}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <span className="btn-text">{isFilterActive ? 'Filtered' : 'Filter'}</span>
          {isFilterActive && (
            <span
              className="clear-indicator"
              onClick={(e) => {
                e.stopPropagation();
                clearFilter();
              }}
            >
              ×
            </span>
          )}
        </button>

        {/* Sort dropdown */}
        <div className="sort-dropdown-container" ref={sortDropdownRef}>
          <button
            className={`toolbar-btn sort-btn ${sortDropdownOpen ? 'open' : ''}`}
            onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M6 12h12M9 18h6" />
            </svg>
            <span className="btn-text">{sortLabel}</span>
            <span
              className={`sort-direction ${sortOrder}`}
              onClick={(e) => {
                e.stopPropagation();
                handleSortOrderToggle();
              }}
              title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </span>
          </button>

          {sortDropdownOpen && (
            <div className="sort-dropdown">
              <div className="dropdown-section">
                <div className="dropdown-header">Sort by</div>
                <div className="dropdown-grid">
                  {SORT_FIELDS.map((option) => (
                    <button
                      key={option.value}
                      className={`dropdown-item ${sortField === option.value ? 'selected' : ''}`}
                      onClick={() => {
                        handleSortFieldChange(option.value);
                        setSortDropdownOpen(false);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Group dropdown */}
        <div className="sort-dropdown-container" ref={groupDropdownRef}>
          <button
            className={`toolbar-btn group-btn ${groupDropdownOpen ? 'open' : ''} ${groupField !== 'none' ? 'active' : ''}`}
            onClick={() => setGroupDropdownOpen(!groupDropdownOpen)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <span className="btn-text">{groupField === 'none' ? 'Group' : groupLabel}</span>
          </button>

          {groupDropdownOpen && (
            <div className="sort-dropdown">
              <div className="dropdown-section">
                <div className="dropdown-header">Group by</div>
                <div className="dropdown-grid">
                  {GROUP_FIELDS.map((option) => (
                    <button
                      key={option.value}
                      className={`dropdown-item ${groupField === option.value ? 'selected' : ''}`}
                      onClick={() => {
                        onGroupChange(option.value);
                        setGroupDropdownOpen(false);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right section: Pagination + Selection actions */}
      <div className="toolbar-section toolbar-right">
        {/* Selection actions */}
        {hasSelection && (
          <div className="selection-bar">
            <span className="selection-count">{selectedFiles.size} selected</span>
            {onEditMetadata && (
              <button className="selection-action" onClick={onEditMetadata}>
                Metadata
              </button>
            )}
            {selectedFiles.size === 1 && onEditPages && (
              <button className="selection-action" onClick={onEditPages}>
                Pages
              </button>
            )}
            <button className="selection-clear" onClick={clearSelection} title="Clear selection">
              ×
            </button>
          </div>
        )}

        {/* Pagination controls */}
        {pagination.pages > 1 && !hasSelection && (
          <div className="pagination-compact">
            <button
              className="page-btn"
              onClick={() => setPage(pagination.page - 1)}
              disabled={pagination.page === 1}
              aria-label="Previous page"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            <span className="page-indicator">
              <span className="current-page">{pagination.page}</span>
              <span className="page-separator">/</span>
              <span className="total-pages">{pagination.pages}</span>
            </span>

            <button
              className="page-btn"
              onClick={() => setPage(pagination.page + 1)}
              disabled={pagination.page >= pagination.pages}
              aria-label="Next page"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>

            <select
              className="page-size-select"
              value={pagination.limit}
              onChange={(e) => setPageSize(Number(e.target.value))}
              aria-label="Items per page"
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
