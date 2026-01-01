/**
 * AdvancedSeriesFilterModal Component
 *
 * Modal for building complex series filters with AND/OR logic.
 * Replaces the inline expanding panel for better UX.
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  useAdvancedSeriesFilter,
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
} from '../../contexts/AdvancedSeriesFilterContext';
import './AdvancedSeriesFilterModal.css';

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
    <div className="advanced-filter-modal-condition">
      <select
        className="advanced-filter-modal-field-select"
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
        className="advanced-filter-modal-comparison-select"
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
            className="advanced-filter-modal-value-input"
            value={condition.value}
            onChange={(e) => onUpdate({ value: e.target.value })}
            aria-label="Filter date value"
          />
        ) : (
          <input
            type={isNumberField || isWithinDays ? 'number' : 'text'}
            className="advanced-filter-modal-value-input"
            value={condition.value}
            onChange={(e) => onUpdate({ value: e.target.value })}
            placeholder={isWithinDays ? 'days' : isNumberField ? '0' : 'Value...'}
            aria-label="Filter value"
          />
        )
      )}

      {needsSecondValue && (
        <>
          <span className="advanced-filter-modal-between-label">and</span>
          <input
            type="number"
            className="advanced-filter-modal-value-input"
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
          className="advanced-filter-modal-remove-btn"
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
  } = useAdvancedSeriesFilter();

  return (
    <div className="advanced-filter-modal-group">
      {showRootOperator && groupIndex > 0 && (
        <div className="advanced-filter-modal-root-operator">
          <span className="advanced-filter-modal-operator-label">{rootOperator}</span>
        </div>
      )}

      <div className="advanced-filter-modal-group-box">
        <div className="advanced-filter-modal-group-header">
          <span className="advanced-filter-modal-group-title">Filter Group {groupIndex + 1}</span>

          <div className="advanced-filter-modal-group-controls">
            <div className="advanced-filter-modal-operator-toggle">
              <button
                type="button"
                className={`advanced-filter-modal-operator-btn ${group.operator === 'AND' ? 'active' : ''}`}
                onClick={() => updateGroupOperator(group.id, 'AND')}
              >
                AND
              </button>
              <button
                type="button"
                className={`advanced-filter-modal-operator-btn ${group.operator === 'OR' ? 'active' : ''}`}
                onClick={() => updateGroupOperator(group.id, 'OR')}
              >
                OR
              </button>
            </div>

            {!isOnly && (
              <button
                type="button"
                className="advanced-filter-modal-remove-group-btn"
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

        <div className="advanced-filter-modal-conditions">
          {group.conditions.map((condition, conditionIndex) => (
            <div key={condition.id} className="advanced-filter-modal-condition-wrapper">
              {conditionIndex > 0 && (
                <div className="advanced-filter-modal-condition-operator">
                  <span className="advanced-filter-modal-operator-badge">{group.operator}</span>
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
          className="advanced-filter-modal-add-condition-btn"
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

export interface AdvancedSeriesFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdvancedSeriesFilterModal({ isOpen, onClose }: AdvancedSeriesFilterModalProps) {
  const {
    activeFilter,
    isFilterActive,
    savedFilters,
    activePresetId,
    clearFilter,
    addGroup,
    setRootOperator,
    setSortBy,
    setSortOrder,
    saveFilter,
    updateFilter,
    renameFilter,
    loadFilter,
    deleteFilter,
  } = useAdvancedSeriesFilter();

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renamingPresetId, setRenamingPresetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

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

  const handleSave = useCallback(async () => {
    if (filterName.trim()) {
      try {
        await saveFilter(filterName.trim());
        setFilterName('');
        setSaveDialogOpen(false);
      } catch (error) {
        // Keep dialog open on error so user can retry
        console.error('Failed to save filter:', error);
      }
    }
  }, [filterName, saveFilter]);

  const handleLoadPreset = useCallback((filterId: string) => {
    loadFilter(filterId);
    setPresetsOpen(false);
  }, [loadFilter]);

  const handleDeletePreset = useCallback(async (filterId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteFilter(filterId);
    } catch (error) {
      console.error('Failed to delete filter:', error);
    }
  }, [deleteFilter]);

  const handleUpdate = useCallback(async () => {
    try {
      await updateFilter();
    } catch (error) {
      console.error('Failed to update filter:', error);
    }
  }, [updateFilter]);

  const handleSaveAs = useCallback(() => {
    setFilterName('');
    setSaveDialogOpen(true);
  }, []);

  const handleRenameClick = useCallback((filterId: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingPresetId(filterId);
    setRenameValue(currentName);
    setRenameDialogOpen(true);
    setPresetsOpen(false);
  }, []);

  const handleRenameSubmit = useCallback(async () => {
    if (renamingPresetId && renameValue.trim()) {
      try {
        await renameFilter(renamingPresetId, renameValue.trim());
        setRenameDialogOpen(false);
        setRenamingPresetId(null);
        setRenameValue('');
      } catch (error) {
        // Keep dialog open on error so user can retry
        console.error('Failed to rename filter:', error);
      }
    }
  }, [renamingPresetId, renameValue, renameFilter]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (saveDialogOpen) {
          setSaveDialogOpen(false);
        } else if (renameDialogOpen) {
          setRenameDialogOpen(false);
          setRenamingPresetId(null);
          setRenameValue('');
        } else if (presetsOpen) {
          setPresetsOpen(false);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, saveDialogOpen, renameDialogOpen, presetsOpen]);

  // Close presets dropdown when clicking outside
  useEffect(() => {
    if (!presetsOpen) return;

    const handleClickOutside = () => setPresetsOpen(false);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [presetsOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="advanced-filter-modal-overlay" onClick={onClose}>
      <div
        className="advanced-filter-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="advanced-filter-modal-title"
      >
        {/* Header */}
        <div className="advanced-filter-modal-header">
          <div className="advanced-filter-modal-title-section">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <h2 id="advanced-filter-modal-title">Advanced Series Filters</h2>
            {activeConditionCount > 0 && (
              <span className="advanced-filter-modal-badge">{activeConditionCount} active</span>
            )}
          </div>
          <button
            type="button"
            className="advanced-filter-modal-close-btn"
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
        <div className="advanced-filter-modal-content">
          {activeFilter && (
            <>
              {/* Sorting controls */}
              <div className="advanced-filter-modal-sort-controls">
                <label className="advanced-filter-modal-sort-label">Sort by:</label>
                <select
                  className="advanced-filter-modal-sort-select"
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
                  <div className="advanced-filter-modal-sort-order">
                    <button
                      type="button"
                      className={`advanced-filter-modal-sort-btn ${activeFilter.sortOrder !== 'desc' ? 'active' : ''}`}
                      onClick={() => setSortOrder('asc')}
                      title="Ascending"
                    >
                      A-Z
                    </button>
                    <button
                      type="button"
                      className={`advanced-filter-modal-sort-btn ${activeFilter.sortOrder === 'desc' ? 'active' : ''}`}
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
                <div className="advanced-filter-modal-root-toggle">
                  <span className="advanced-filter-modal-root-label">Match:</span>
                  <div className="advanced-filter-modal-operator-toggle root">
                    <button
                      type="button"
                      className={`advanced-filter-modal-operator-btn ${activeFilter.rootOperator === 'AND' ? 'active' : ''}`}
                      onClick={() => setRootOperator('AND')}
                    >
                      ALL groups
                    </button>
                    <button
                      type="button"
                      className={`advanced-filter-modal-operator-btn ${activeFilter.rootOperator === 'OR' ? 'active' : ''}`}
                      onClick={() => setRootOperator('OR')}
                    >
                      ANY group
                    </button>
                  </div>
                </div>
              )}

              {/* Filter groups */}
              <div className="advanced-filter-modal-groups">
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
                className="advanced-filter-modal-add-group-btn"
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
        <div className="advanced-filter-modal-footer">
          <div className="advanced-filter-modal-footer-left">
            {/* Presets dropdown */}
            <div className="advanced-filter-modal-presets-dropdown">
              <button
                type="button"
                className="advanced-filter-modal-presets-btn"
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
                <div className="advanced-filter-modal-presets-menu" onClick={(e) => e.stopPropagation()}>
                  {savedFilters.length === 0 ? (
                    <div className="advanced-filter-modal-presets-empty">No saved filters</div>
                  ) : (
                    savedFilters.map(filter => (
                      <div
                        key={filter.id}
                        className="advanced-filter-modal-preset-item"
                        onClick={() => handleLoadPreset(filter.id)}
                      >
                        <span className="advanced-filter-modal-preset-name">{filter.name}</span>
                        <div className="advanced-filter-modal-preset-actions">
                          <button
                            type="button"
                            className="advanced-filter-modal-preset-rename-btn"
                            onClick={(e) => handleRenameClick(filter.id, filter.name, e)}
                            title="Rename preset"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className="advanced-filter-modal-preset-delete-btn"
                            onClick={(e) => handleDeletePreset(filter.id, e)}
                            title="Delete preset"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Save/Update buttons */}
            {isFilterActive && (
              activePresetId ? (
                /* Editing existing preset - show Update and Save As */
                <>
                  <button
                    type="button"
                    className="advanced-filter-modal-update-btn"
                    onClick={handleUpdate}
                    title="Update this preset with current changes"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                    Update Preset
                  </button>
                  <button
                    type="button"
                    className="advanced-filter-modal-save-as-btn"
                    onClick={handleSaveAs}
                    title="Save as new preset"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    Save As
                  </button>
                </>
              ) : (
                /* Creating new filter - show Save */
                <button
                  type="button"
                  className="advanced-filter-modal-save-btn"
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
              )
            )}

            {/* Clear button */}
            {isFilterActive && (
              <button
                type="button"
                className="advanced-filter-modal-clear-btn"
                onClick={clearFilter}
                title="Clear all filters"
              >
                Clear
              </button>
            )}
          </div>

          <div className="advanced-filter-modal-footer-right">
            <button
              type="button"
              className="advanced-filter-modal-done-btn"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        </div>

        {/* Save dialog */}
        {saveDialogOpen && (
          <div
            className="advanced-filter-modal-save-dialog-overlay"
            onClick={() => setSaveDialogOpen(false)}
          >
            <div
              className="advanced-filter-modal-save-dialog"
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
              <div className="advanced-filter-modal-save-dialog-actions">
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

        {/* Rename dialog */}
        {renameDialogOpen && (
          <div
            className="advanced-filter-modal-save-dialog-overlay"
            onClick={() => {
              setRenameDialogOpen(false);
              setRenamingPresetId(null);
              setRenameValue('');
            }}
          >
            <div
              className="advanced-filter-modal-save-dialog"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <h4>Rename Preset</h4>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Enter new name..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit();
                  if (e.key === 'Escape') {
                    setRenameDialogOpen(false);
                    setRenamingPresetId(null);
                    setRenameValue('');
                  }
                }}
              />
              <div className="advanced-filter-modal-save-dialog-actions">
                <button
                  type="button"
                  onClick={() => {
                    setRenameDialogOpen(false);
                    setRenamingPresetId(null);
                    setRenameValue('');
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleRenameSubmit}
                  disabled={!renameValue.trim()}
                >
                  Rename
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
