/**
 * SmartSeriesFilterModal Component
 *
 * Modal for building complex series filters with AND/OR logic.
 * Replaces the inline expanding panel for better UX.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  useSmartSeriesFilter,
  SeriesFilterCondition,
  SeriesFilterGroup,
  SeriesFilterOperator,
  SeriesSortField,
  SERIES_FILTER_FIELDS,
  SERIES_STRING_COMPARISONS,
  SERIES_NUMBER_COMPARISONS,
  SERIES_BOOLEAN_COMPARISONS,
  SERIES_DATE_COMPARISONS,
  SERIES_SORT_FIELDS,
} from '../../contexts/SmartSeriesFilterContext';
import './SmartSeriesFilterModal.css';

// =============================================================================
// Sub-components
// =============================================================================

interface FilterConditionRowProps {
  condition: SeriesFilterCondition;
  isOnly: boolean;
  onUpdate: (updates: Partial<SeriesFilterCondition>) => void;
  onRemove: () => void;
}

function FilterConditionRow({
  condition,
  isOnly,
  onUpdate,
  onRemove,
}: FilterConditionRowProps) {
  const fieldConfig = SERIES_FILTER_FIELDS.find(f => f.value === condition.field);
  const isNumberField = fieldConfig?.type === 'number';
  const isDateField = fieldConfig?.type === 'date';
  const isBooleanField = fieldConfig?.type === 'boolean';

  const comparisons = isBooleanField
    ? SERIES_BOOLEAN_COMPARISONS
    : isDateField
      ? SERIES_DATE_COMPARISONS
      : isNumberField
        ? SERIES_NUMBER_COMPARISONS
        : SERIES_STRING_COMPARISONS;

  const needsValue =
    condition.comparison !== 'is_empty' &&
    condition.comparison !== 'is_not_empty' &&
    condition.comparison !== 'is_true' &&
    condition.comparison !== 'is_false';
  const needsSecondValue = condition.comparison === 'between';
  const isWithinDays = condition.comparison === 'within_days';
  const isDateComparison = condition.comparison === 'before' || condition.comparison === 'after';

  return (
    <div className="smart-filter-modal-condition">
      <select
        className="smart-filter-modal-field-select"
        value={condition.field}
        onChange={(e) => onUpdate({ field: e.target.value as SeriesFilterCondition['field'] })}
        aria-label="Filter field"
      >
        {SERIES_FILTER_FIELDS.map(field => (
          <option key={field.value} value={field.value}>
            {field.label}
          </option>
        ))}
      </select>

      <select
        className="smart-filter-modal-comparison-select"
        value={condition.comparison}
        onChange={(e) => onUpdate({ comparison: e.target.value as SeriesFilterCondition['comparison'] })}
        aria-label="Filter comparison"
      >
        {comparisons.map(comp => (
          <option key={comp.value} value={comp.value}>
            {comp.label}
          </option>
        ))}
      </select>

      {needsValue && (
        isDateField && isDateComparison ? (
          <input
            type="date"
            className="smart-filter-modal-value-input"
            value={condition.value}
            onChange={(e) => onUpdate({ value: e.target.value })}
            aria-label="Filter date value"
          />
        ) : (
          <input
            type={isNumberField || isWithinDays ? 'number' : 'text'}
            className="smart-filter-modal-value-input"
            value={condition.value}
            onChange={(e) => onUpdate({ value: e.target.value })}
            placeholder={isWithinDays ? 'days' : isNumberField ? '0' : 'Value...'}
            aria-label="Filter value"
          />
        )
      )}

      {needsSecondValue && (
        <>
          <span className="smart-filter-modal-between-label">and</span>
          <input
            type="number"
            className="smart-filter-modal-value-input"
            value={condition.value2 || ''}
            onChange={(e) => onUpdate({ value2: e.target.value })}
            placeholder="0"
            aria-label="Filter second value"
          />
        </>
      )}

      {!isOnly && (
        <button
          type="button"
          className="smart-filter-modal-remove-btn"
          onClick={onRemove}
          title="Remove condition"
          aria-label="Remove condition"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

interface FilterGroupBoxProps {
  group: SeriesFilterGroup;
  groupIndex: number;
  isOnly: boolean;
  showRootOperator: boolean;
  rootOperator: SeriesFilterOperator;
}

function FilterGroupBox({
  group,
  groupIndex,
  isOnly,
  showRootOperator,
  rootOperator,
}: FilterGroupBoxProps) {
  const {
    addCondition,
    updateCondition,
    removeCondition,
    updateGroupOperator,
    removeGroup,
  } = useSmartSeriesFilter();

  return (
    <div className="smart-filter-modal-group">
      {showRootOperator && groupIndex > 0 && (
        <div className="smart-filter-modal-root-operator">
          <span className="smart-filter-modal-operator-label">{rootOperator}</span>
        </div>
      )}

      <div className="smart-filter-modal-group-box">
        <div className="smart-filter-modal-group-header">
          <span className="smart-filter-modal-group-title">Filter Group {groupIndex + 1}</span>

          <div className="smart-filter-modal-group-controls">
            <div className="smart-filter-modal-operator-toggle">
              <button
                type="button"
                className={`smart-filter-modal-operator-btn ${group.operator === 'AND' ? 'active' : ''}`}
                onClick={() => updateGroupOperator(group.id, 'AND')}
              >
                AND
              </button>
              <button
                type="button"
                className={`smart-filter-modal-operator-btn ${group.operator === 'OR' ? 'active' : ''}`}
                onClick={() => updateGroupOperator(group.id, 'OR')}
              >
                OR
              </button>
            </div>

            {!isOnly && (
              <button
                type="button"
                className="smart-filter-modal-remove-group-btn"
                onClick={() => removeGroup(group.id)}
                title="Remove group"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="smart-filter-modal-conditions">
          {group.conditions.map((condition, conditionIndex) => (
            <div key={condition.id} className="smart-filter-modal-condition-wrapper">
              {conditionIndex > 0 && (
                <div className="smart-filter-modal-condition-operator">
                  <span className="smart-filter-modal-operator-badge">{group.operator}</span>
                </div>
              )}
              <FilterConditionRow
                condition={condition}
                isOnly={group.conditions.length === 1}
                onUpdate={(updates) => updateCondition(group.id, condition.id, updates)}
                onRemove={() => removeCondition(group.id, condition.id)}
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          className="smart-filter-modal-add-condition-btn"
          onClick={() => addCondition(group.id)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Condition
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Main Modal Component
// =============================================================================

export interface SmartSeriesFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SmartSeriesFilterModal({ isOpen, onClose }: SmartSeriesFilterModalProps) {
  const {
    activeFilter,
    isFilterActive,
    savedFilters,
    clearFilter,
    addGroup,
    setRootOperator,
    setSortBy,
    setSortOrder,
    saveFilter,
    loadFilter,
    deleteFilter,
  } = useSmartSeriesFilter();

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [presetsOpen, setPresetsOpen] = useState(false);

  // Count active conditions for display
  const activeConditionCount = useMemo(() => {
    if (!activeFilter) return 0;
    return activeFilter.groups.reduce((count, group) =>
      count + group.conditions.filter(c =>
        c.comparison === 'is_empty' ||
        c.comparison === 'is_not_empty' ||
        c.comparison === 'is_true' ||
        c.comparison === 'is_false' ||
        c.value.trim() !== ''
      ).length, 0);
  }, [activeFilter]);

  const handleSave = useCallback(() => {
    if (filterName.trim()) {
      saveFilter(filterName.trim());
      setFilterName('');
      setSaveDialogOpen(false);
    }
  }, [filterName, saveFilter]);

  const handleLoadPreset = useCallback((filterId: string) => {
    loadFilter(filterId);
    setPresetsOpen(false);
  }, [loadFilter]);

  const handleDeletePreset = useCallback((filterId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteFilter(filterId);
  }, [deleteFilter]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (saveDialogOpen) {
          setSaveDialogOpen(false);
        } else if (presetsOpen) {
          setPresetsOpen(false);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, saveDialogOpen, presetsOpen]);

  // Close presets dropdown when clicking outside
  useEffect(() => {
    if (!presetsOpen) return;

    const handleClickOutside = () => setPresetsOpen(false);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [presetsOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="smart-filter-modal-overlay" onClick={onClose}>
      <div
        className="smart-filter-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="smart-filter-modal-title"
      >
        {/* Header */}
        <div className="smart-filter-modal-header">
          <div className="smart-filter-modal-title-section">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <h2 id="smart-filter-modal-title">Smart Series Filters</h2>
            {activeConditionCount > 0 && (
              <span className="smart-filter-modal-badge">{activeConditionCount} active</span>
            )}
          </div>
          <button
            type="button"
            className="smart-filter-modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="smart-filter-modal-content">
          {activeFilter && (
            <>
              {/* Sorting controls */}
              <div className="smart-filter-modal-sort-controls">
                <label className="smart-filter-modal-sort-label">Sort by:</label>
                <select
                  className="smart-filter-modal-sort-select"
                  value={activeFilter.sortBy || ''}
                  onChange={(e) => setSortBy((e.target.value || undefined) as SeriesSortField | undefined)}
                  aria-label="Sort field"
                >
                  <option value="">Default Order</option>
                  {SERIES_SORT_FIELDS.map(field => (
                    <option key={field.value} value={field.value}>
                      {field.label}
                    </option>
                  ))}
                </select>

                {activeFilter.sortBy && (
                  <div className="smart-filter-modal-sort-order">
                    <button
                      type="button"
                      className={`smart-filter-modal-sort-btn ${activeFilter.sortOrder !== 'desc' ? 'active' : ''}`}
                      onClick={() => setSortOrder('asc')}
                      title="Ascending"
                    >
                      A-Z
                    </button>
                    <button
                      type="button"
                      className={`smart-filter-modal-sort-btn ${activeFilter.sortOrder === 'desc' ? 'active' : ''}`}
                      onClick={() => setSortOrder('desc')}
                      title="Descending"
                    >
                      Z-A
                    </button>
                  </div>
                )}
              </div>

              {/* Root operator toggle */}
              {activeFilter.groups.length > 1 && (
                <div className="smart-filter-modal-root-toggle">
                  <span className="smart-filter-modal-root-label">Match:</span>
                  <div className="smart-filter-modal-operator-toggle root">
                    <button
                      type="button"
                      className={`smart-filter-modal-operator-btn ${activeFilter.rootOperator === 'AND' ? 'active' : ''}`}
                      onClick={() => setRootOperator('AND')}
                    >
                      ALL groups
                    </button>
                    <button
                      type="button"
                      className={`smart-filter-modal-operator-btn ${activeFilter.rootOperator === 'OR' ? 'active' : ''}`}
                      onClick={() => setRootOperator('OR')}
                    >
                      ANY group
                    </button>
                  </div>
                </div>
              )}

              {/* Filter groups */}
              <div className="smart-filter-modal-groups">
                {activeFilter.groups.map((group, index) => (
                  <FilterGroupBox
                    key={group.id}
                    group={group}
                    groupIndex={index}
                    isOnly={activeFilter.groups.length === 1}
                    showRootOperator={activeFilter.groups.length > 1}
                    rootOperator={activeFilter.rootOperator}
                  />
                ))}
              </div>

              {/* Add group button */}
              <button
                type="button"
                className="smart-filter-modal-add-group-btn"
                onClick={addGroup}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add Filter Group
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="smart-filter-modal-footer">
          <div className="smart-filter-modal-footer-left">
            {/* Presets dropdown */}
            <div className="smart-filter-modal-presets-dropdown">
              <button
                type="button"
                className="smart-filter-modal-presets-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setPresetsOpen(!presetsOpen);
                }}
                title="Load saved filter"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
                Presets
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {presetsOpen && (
                <div className="smart-filter-modal-presets-menu" onClick={(e) => e.stopPropagation()}>
                  {savedFilters.length === 0 ? (
                    <div className="smart-filter-modal-presets-empty">No saved filters</div>
                  ) : (
                    savedFilters.map(filter => (
                      <div
                        key={filter.id}
                        className="smart-filter-modal-preset-item"
                        onClick={() => handleLoadPreset(filter.id)}
                      >
                        <span className="smart-filter-modal-preset-name">{filter.name}</span>
                        <button
                          type="button"
                          className="smart-filter-modal-preset-delete-btn"
                          onClick={(e) => handleDeletePreset(filter.id, e)}
                          title="Delete preset"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Save button */}
            {isFilterActive && (
              <button
                type="button"
                className="smart-filter-modal-save-btn"
                onClick={() => {
                  setFilterName('');
                  setSaveDialogOpen(true);
                }}
                title="Save filter as preset"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                Save
              </button>
            )}

            {/* Clear button */}
            {isFilterActive && (
              <button
                type="button"
                className="smart-filter-modal-clear-btn"
                onClick={clearFilter}
                title="Clear all filters"
              >
                Clear
              </button>
            )}
          </div>

          <div className="smart-filter-modal-footer-right">
            <button
              type="button"
              className="smart-filter-modal-done-btn"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        </div>

        {/* Save dialog */}
        {saveDialogOpen && (
          <div
            className="smart-filter-modal-save-dialog-overlay"
            onClick={() => setSaveDialogOpen(false)}
          >
            <div
              className="smart-filter-modal-save-dialog"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <h4>Save Filter Preset</h4>
              <input
                type="text"
                value={filterName}
                onChange={(e) => setFilterName(e.target.value)}
                placeholder="Enter preset name..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') setSaveDialogOpen(false);
                }}
              />
              <div className="smart-filter-modal-save-dialog-actions">
                <button type="button" onClick={() => setSaveDialogOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSave}
                  disabled={!filterName.trim()}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
