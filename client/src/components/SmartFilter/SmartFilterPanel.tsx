/**
 * Smart Filter Panel Component
 *
 * A collapsible panel for building complex filters with AND/OR logic.
 * Supports multiple filter groups, saved presets, and various field comparisons.
 */

import { useState, useCallback } from 'react';
import {
  useSmartFilter,
  FilterCondition,
  FilterGroup,
  FilterOperator,
  SortField,
  FILTER_FIELDS,
  STRING_COMPARISONS,
  NUMBER_COMPARISONS,
  DATE_COMPARISONS,
  SORT_FIELDS,
} from '../../contexts/SmartFilterContext';
import { useFilterPresets } from '../../contexts/FilterPresetContext';
import './SmartFilter.css';

// =============================================================================
// Sub-components
// =============================================================================

interface FilterConditionRowProps {
  condition: FilterCondition;
  isOnly: boolean;
  onUpdate: (updates: Partial<FilterCondition>) => void;
  onRemove: () => void;
}

function FilterConditionRow({
  condition,
  isOnly,
  onUpdate,
  onRemove,
}: FilterConditionRowProps) {
  const fieldConfig = FILTER_FIELDS.find(f => f.value === condition.field);
  const isNumberField = fieldConfig?.type === 'number';
  const isDateField = fieldConfig?.type === 'date';

  // Select appropriate comparisons based on field type
  const comparisons = isDateField
    ? DATE_COMPARISONS
    : isNumberField
      ? NUMBER_COMPARISONS
      : STRING_COMPARISONS;

  const needsValue = condition.comparison !== 'is_empty' && condition.comparison !== 'is_not_empty';
  const needsSecondValue = condition.comparison === 'between';
  const isWithinDays = condition.comparison === 'within_days';
  const isDateComparison = condition.comparison === 'before' || condition.comparison === 'after';

  return (
    <div className="filter-condition">
      {/* Field selector */}
      <select
        className="filter-field-select"
        value={condition.field}
        onChange={(e) => onUpdate({ field: e.target.value as FilterCondition['field'] })}
        aria-label="Filter field"
      >
        {FILTER_FIELDS.map(field => (
          <option key={field.value} value={field.value}>
            {field.label}
          </option>
        ))}
      </select>

      {/* Comparison selector */}
      <select
        className="filter-comparison-select"
        value={condition.comparison}
        onChange={(e) => onUpdate({ comparison: e.target.value as FilterCondition['comparison'] })}
        aria-label="Filter comparison"
      >
        {comparisons.map(comp => (
          <option key={comp.value} value={comp.value}>
            {comp.label}
          </option>
        ))}
      </select>

      {/* Value input - different types based on field */}
      {needsValue && (
        isDateField && isDateComparison ? (
          <input
            type="date"
            className="filter-value-input"
            value={condition.value}
            onChange={(e) => onUpdate({ value: e.target.value })}
            aria-label="Filter date value"
          />
        ) : (
          <input
            type={isNumberField || isWithinDays ? 'number' : 'text'}
            className="filter-value-input"
            value={condition.value}
            onChange={(e) => onUpdate({ value: e.target.value })}
            placeholder={isWithinDays ? 'days' : isNumberField ? '0' : 'Value...'}
            aria-label="Filter value"
          />
        )
      )}

      {/* Second value for 'between' */}
      {needsSecondValue && (
        <>
          <span className="filter-between-label">and</span>
          <input
            type="number"
            className="filter-value-input"
            value={condition.value2 || ''}
            onChange={(e) => onUpdate({ value2: e.target.value })}
            placeholder="0"
            aria-label="Filter second value"
          />
        </>
      )}

      {/* Remove button */}
      {!isOnly && (
        <button
          type="button"
          className="filter-remove-btn"
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
  group: FilterGroup;
  groupIndex: number;
  isOnly: boolean;
  showRootOperator: boolean;
  rootOperator: FilterOperator;
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
  } = useSmartFilter();

  return (
    <div className="filter-group">
      {/* Root operator between groups */}
      {showRootOperator && groupIndex > 0 && (
        <div className="filter-root-operator">
          <span className="operator-label">{rootOperator}</span>
        </div>
      )}

      <div className="filter-group-box">
        {/* Group header */}
        <div className="filter-group-header">
          <span className="filter-group-title">Filter Group {groupIndex + 1}</span>

          <div className="filter-group-controls">
            {/* Group operator toggle */}
            <div className="operator-toggle">
              <button
                type="button"
                className={`operator-btn ${group.operator === 'AND' ? 'active' : ''}`}
                onClick={() => updateGroupOperator(group.id, 'AND')}
              >
                AND
              </button>
              <button
                type="button"
                className={`operator-btn ${group.operator === 'OR' ? 'active' : ''}`}
                onClick={() => updateGroupOperator(group.id, 'OR')}
              >
                OR
              </button>
            </div>

            {/* Remove group */}
            {!isOnly && (
              <button
                type="button"
                className="filter-remove-group-btn"
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

        {/* Conditions */}
        <div className="filter-conditions">
          {group.conditions.map((condition, conditionIndex) => (
            <div key={condition.id} className="filter-condition-wrapper">
              {conditionIndex > 0 && (
                <div className="filter-condition-operator">
                  <span className="operator-badge">{group.operator}</span>
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

        {/* Add condition button */}
        <button
          type="button"
          className="filter-add-condition-btn"
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
// Main Component
// =============================================================================

export function SmartFilterPanel() {
  const {
    activeFilter,
    isFilterActive,
    savedFilters,
    isFilterPanelOpen,
    clearFilter,
    addGroup,
    setRootOperator,
    setSortBy,
    setSortOrder,
    saveFilter,
    loadFilter,
    deleteFilter,
    openFilterPanel,
    closeFilterPanel,
  } = useSmartFilter();

  const { presets, isLoading: presetsLoading } = useFilterPresets();

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    if (filterName.trim()) {
      setIsSaving(true);
      setSaveError(null);
      try {
        await saveFilter(filterName.trim());
        setFilterName('');
        setSaveDialogOpen(false);
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Failed to save filter');
      } finally {
        setIsSaving(false);
      }
    }
  }, [filterName, saveFilter]);

  const handleLoadPreset = useCallback((filterId: string) => {
    loadFilter(filterId);
    setPresetsOpen(false);
  }, [loadFilter]);

  const handleDeletePreset = useCallback(async (filterId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingId) return; // Prevent multiple concurrent deletes

    setDeletingId(filterId);
    try {
      await deleteFilter(filterId);
    } catch (error) {
      console.error('Failed to delete preset:', error);
    } finally {
      setDeletingId(null);
    }
  }, [deleteFilter, deletingId]);

  // Find preset info to check if it's global
  const getPresetById = useCallback((filterId: string) => {
    return presets.find(p => p.id === filterId);
  }, [presets]);

  // Collapsed view - just a toggle button
  if (!isFilterPanelOpen) {
    return (
      <div className="smart-filter-collapsed">
        <button
          type="button"
          className={`filter-toggle-btn ${isFilterActive ? 'active' : ''}`}
          onClick={openFilterPanel}
          title="Open advanced filters"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          {isFilterActive ? 'Filter Active' : 'Filters'}
        </button>
        {isFilterActive && (
          <button
            type="button"
            className="filter-clear-btn-small"
            onClick={clearFilter}
            title="Clear filter"
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

  return (
    <div className="smart-filter-panel">
      {/* Header */}
      <div className="smart-filter-header">
        <div className="smart-filter-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <span>Advanced Filters</span>
        </div>

        <div className="smart-filter-actions">
          {/* Presets dropdown */}
          <div className="filter-presets-dropdown">
            <button
              type="button"
              className="filter-presets-btn"
              onClick={() => setPresetsOpen(!presetsOpen)}
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
              <div className="filter-presets-menu">
                {presetsLoading ? (
                  <div className="filter-presets-empty">Loading...</div>
                ) : savedFilters.length === 0 ? (
                  <div className="filter-presets-empty">No saved filters</div>
                ) : (
                  savedFilters.map(filter => {
                    const preset = getPresetById(filter.id);
                    const isGlobal = preset?.isGlobal ?? false;
                    return (
                      <div
                        key={filter.id}
                        className="filter-preset-item"
                        onClick={() => handleLoadPreset(filter.id)}
                      >
                        <span className="preset-name">
                          {filter.name}
                          {isGlobal && <span className="preset-global-badge">Global</span>}
                        </span>
                        {!isGlobal && (
                          <button
                            type="button"
                            className={`preset-delete-btn ${deletingId === filter.id ? 'deleting' : ''}`}
                            onClick={(e) => handleDeletePreset(filter.id, e)}
                            disabled={deletingId !== null}
                            title={deletingId === filter.id ? 'Deleting...' : 'Delete preset'}
                            aria-busy={deletingId === filter.id}
                          >
                            {deletingId === filter.id ? (
                              <span className="preset-delete-spinner" />
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* Save button */}
          {isFilterActive && (
            <button
              type="button"
              className="filter-save-btn"
              onClick={() => {
                setFilterName('');
                setSaveError(null);
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
              className="filter-clear-btn"
              onClick={clearFilter}
              title="Clear all filters"
            >
              Clear
            </button>
          )}

          {/* Close button */}
          <button
            type="button"
            className="filter-close-btn"
            onClick={closeFilterPanel}
            title="Close filter panel"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Filter content */}
      <div className="smart-filter-content">
        {activeFilter && (
          <>
            {/* Sorting controls */}
            <div className="filter-sort-controls">
              <label className="filter-sort-label">Sort by:</label>
              <select
                className="filter-sort-select"
                value={activeFilter.sortBy || ''}
                onChange={(e) => setSortBy((e.target.value || undefined) as SortField | undefined)}
                aria-label="Sort field"
              >
                <option value="">Default Order</option>
                {SORT_FIELDS.map(field => (
                  <option key={field.value} value={field.value}>
                    {field.label}
                  </option>
                ))}
              </select>

              {activeFilter.sortBy && (
                <div className="filter-sort-order">
                  <button
                    type="button"
                    className={`sort-order-btn ${activeFilter.sortOrder !== 'desc' ? 'active' : ''}`}
                    onClick={() => setSortOrder('asc')}
                    title="Ascending"
                  >
                    A-Z ↑
                  </button>
                  <button
                    type="button"
                    className={`sort-order-btn ${activeFilter.sortOrder === 'desc' ? 'active' : ''}`}
                    onClick={() => setSortOrder('desc')}
                    title="Descending"
                  >
                    Z-A ↓
                  </button>
                </div>
              )}
            </div>

            {/* Root operator toggle (only show if multiple groups) */}
            {activeFilter.groups.length > 1 && (
              <div className="filter-root-toggle">
                <span className="filter-root-label">Match:</span>
                <div className="operator-toggle root">
                  <button
                    type="button"
                    className={`operator-btn ${activeFilter.rootOperator === 'AND' ? 'active' : ''}`}
                    onClick={() => setRootOperator('AND')}
                  >
                    ALL groups
                  </button>
                  <button
                    type="button"
                    className={`operator-btn ${activeFilter.rootOperator === 'OR' ? 'active' : ''}`}
                    onClick={() => setRootOperator('OR')}
                  >
                    ANY group
                  </button>
                </div>
              </div>
            )}

            {/* Filter groups */}
            <div className="filter-groups">
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
              className="filter-add-group-btn"
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

      {/* Save dialog */}
      {saveDialogOpen && (
        <div
          className="filter-save-dialog-overlay"
          onClick={() => !isSaving && setSaveDialogOpen(false)}
          role="presentation"
        >
          <div
            className="filter-save-dialog"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="save-dialog-title"
          >
            <h4 id="save-dialog-title">Save Filter Preset</h4>
            <input
              type="text"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              placeholder="Enter preset name..."
              autoFocus
              disabled={isSaving}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isSaving) handleSave();
                if (e.key === 'Escape' && !isSaving) setSaveDialogOpen(false);
              }}
            />
            {saveError && (
              <div className="filter-save-error">{saveError}</div>
            )}
            <div className="filter-save-dialog-actions">
              <button type="button" onClick={() => setSaveDialogOpen(false)} disabled={isSaving}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSave}
                disabled={!filterName.trim() || isSaving}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
