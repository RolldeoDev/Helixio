/**
 * Sort & Group Panel Component
 *
 * Provides comprehensive sorting and grouping options for the library view.
 * Supports multiple sort fields, grouping by various metadata fields, and
 * persistent user preferences.
 */

import { useState, useCallback, useEffect } from 'react';
import './SortGroup.css';

// =============================================================================
// Types
// =============================================================================

// Sort fields that map to server-supported ComicFile columns
export type SortField =
  | 'filename'
  | 'size'
  | 'modifiedAt'
  | 'createdAt'
  | 'status';

export type SortOrder = 'asc' | 'desc';

export type GroupField =
  | 'none'
  | 'series'
  | 'publisher'
  | 'year'
  | 'genre'
  | 'firstLetter';

export interface SortConfig {
  field: SortField;
  order: SortOrder;
}

export interface GroupConfig {
  field: GroupField;
  collapsed: Set<string>;
}

export interface SortGroupState {
  sort: SortConfig;
  group: GroupConfig;
}

// =============================================================================
// Constants
// =============================================================================

export const SORT_FIELDS: { value: SortField; label: string }[] = [
  { value: 'filename', label: 'Filename' },
  { value: 'size', label: 'File Size' },
  { value: 'modifiedAt', label: 'Date Modified' },
  { value: 'createdAt', label: 'Date Added' },
  { value: 'status', label: 'Status' },
];

export const GROUP_FIELDS: { value: GroupField; label: string }[] = [
  { value: 'none', label: 'No Grouping' },
  { value: 'series', label: 'Series' },
  { value: 'publisher', label: 'Publisher' },
  { value: 'year', label: 'Year' },
  { value: 'genre', label: 'Genre' },
  { value: 'firstLetter', label: 'First Letter' },
];

const STORAGE_KEY = 'helixio-sort-group';

// =============================================================================
// Component
// =============================================================================

interface SortGroupPanelProps {
  onSortChange?: (sort: SortConfig) => void;
  onGroupChange?: (group: GroupField) => void;
}

export function SortGroupPanel({ onSortChange, onGroupChange }: SortGroupPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const [sortConfig, setSortConfig] = useState<SortConfig>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.sort ?? { field: 'filename', order: 'asc' };
      }
    } catch {
      // Ignore
    }
    return { field: 'filename', order: 'asc' };
  });

  const [groupField, setGroupField] = useState<GroupField>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed.group ?? 'none';
      }
    } catch {
      // Ignore
    }
    return 'none';
  });

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      sort: sortConfig,
      group: groupField,
    }));
  }, [sortConfig, groupField]);

  // Notify parent of changes
  useEffect(() => {
    onSortChange?.(sortConfig);
  }, [sortConfig, onSortChange]);

  useEffect(() => {
    onGroupChange?.(groupField);
  }, [groupField, onGroupChange]);

  const handleSortFieldChange = useCallback((field: SortField) => {
    setSortConfig(prev => ({
      ...prev,
      field,
    }));
  }, []);

  const handleSortOrderToggle = useCallback(() => {
    setSortConfig(prev => ({
      ...prev,
      order: prev.order === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  const handleGroupChange = useCallback((field: GroupField) => {
    setGroupField(field);
  }, []);

  const sortLabel = SORT_FIELDS.find(s => s.value === sortConfig.field)?.label || 'Sort';
  const groupLabel = GROUP_FIELDS.find(g => g.value === groupField)?.label || 'Group';

  return (
    <div className="sort-group-panel">
      <button
        type="button"
        className={`sort-group-toggle ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="4" y1="21" x2="4" y2="14" />
          <line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" />
          <line x1="20" y1="12" x2="20" y2="3" />
          <line x1="1" y1="14" x2="7" y2="14" />
          <line x1="9" y1="8" x2="15" y2="8" />
          <line x1="17" y1="16" x2="23" y2="16" />
        </svg>
        <span className="sort-label">{sortLabel}</span>
        <span className={`sort-order ${sortConfig.order}`}>
          {sortConfig.order === 'asc' ? '↑' : '↓'}
        </span>
        {groupField !== 'none' && (
          <span className="group-badge">{groupLabel}</span>
        )}
      </button>

      {isOpen && (
        <div className="sort-group-dropdown">
          {/* Sort Section */}
          <div className="dropdown-section">
            <div className="dropdown-section-header">
              <span>Sort by</span>
              <button
                type="button"
                className="sort-order-toggle"
                onClick={handleSortOrderToggle}
                title={sortConfig.order === 'asc' ? 'Ascending' : 'Descending'}
              >
                {sortConfig.order === 'asc' ? '↑ Asc' : '↓ Desc'}
              </button>
            </div>
            <div className="dropdown-options">
              {SORT_FIELDS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className={`dropdown-option ${sortConfig.field === option.value ? 'selected' : ''}`}
                  onClick={() => handleSortFieldChange(option.value)}
                >
                  {option.label}
                  {sortConfig.field === option.value && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Group Section */}
          <div className="dropdown-section">
            <div className="dropdown-section-header">
              <span>Group by</span>
            </div>
            <div className="dropdown-options">
              {GROUP_FIELDS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className={`dropdown-option ${groupField === option.value ? 'selected' : ''}`}
                  onClick={() => handleGroupChange(option.value)}
                >
                  {option.label}
                  {groupField === option.value && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
