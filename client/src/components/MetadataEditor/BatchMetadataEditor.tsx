/**
 * BatchMetadataEditor Component
 *
 * A redesigned batch editing experience for comic metadata.
 * Organized into collapsible categories with intuitive field selection.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  updateComicInfo,
  ComicInfo,
  REMOVE_FIELD,
  type TagFieldType,
} from '../../services/api.service';
import { SimpleTagInput } from './SimpleTagInput';
import './BatchMetadataEditor.css';

interface BatchMetadataEditorProps {
  fileIds: string[];
  onClose?: () => void;
  onSave?: () => void;
}

type EditableField = keyof ComicInfo;

interface FieldConfig {
  key: EditableField;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'tag';
  autocompleteField?: TagFieldType;
}

interface FieldCategory {
  id: string;
  label: string;
  icon: string;
  description: string;
  fields: FieldConfig[];
}

const FIELD_CATEGORIES: FieldCategory[] = [
  {
    id: 'issue',
    label: 'Issue Info',
    icon: '📖',
    description: 'Basic issue identification',
    fields: [
      { key: 'Series', label: 'Series', type: 'text' },
      { key: 'Number', label: 'Issue #', type: 'text' },
      { key: 'Title', label: 'Title', type: 'text' },
      { key: 'Volume', label: 'Volume', type: 'number' },
    ],
  },
  {
    id: 'publication',
    label: 'Publication',
    icon: '📅',
    description: 'Release date information',
    fields: [
      { key: 'Year', label: 'Year', type: 'number' },
      { key: 'Month', label: 'Month', type: 'number' },
      { key: 'Day', label: 'Day', type: 'number' },
      { key: 'Publisher', label: 'Publisher', type: 'tag', autocompleteField: 'publishers' },
    ],
  },
  {
    id: 'credits',
    label: 'Credits',
    icon: '✒️',
    description: 'Creative team',
    fields: [
      { key: 'Writer', label: 'Writer', type: 'tag', autocompleteField: 'writers' },
      { key: 'Penciller', label: 'Penciller', type: 'tag', autocompleteField: 'pencillers' },
      { key: 'Inker', label: 'Inker', type: 'tag', autocompleteField: 'inkers' },
      { key: 'Colorist', label: 'Colorist', type: 'tag', autocompleteField: 'colorists' },
      { key: 'Letterer', label: 'Letterer', type: 'tag', autocompleteField: 'letterers' },
      { key: 'CoverArtist', label: 'Cover Artist', type: 'tag', autocompleteField: 'coverArtists' },
    ],
  },
  {
    id: 'content',
    label: 'Content',
    icon: '🏷️',
    description: 'Tags and classifications',
    fields: [
      { key: 'Genre', label: 'Genre', type: 'tag', autocompleteField: 'genres' },
      { key: 'Tags', label: 'Tags', type: 'tag', autocompleteField: 'tags' },
      { key: 'Characters', label: 'Characters', type: 'tag', autocompleteField: 'characters' },
      { key: 'Teams', label: 'Teams', type: 'tag', autocompleteField: 'teams' },
      { key: 'Locations', label: 'Locations', type: 'tag', autocompleteField: 'locations' },
      { key: 'StoryArc', label: 'Story Arc', type: 'tag', autocompleteField: 'storyArcs' },
      { key: 'AgeRating', label: 'Age Rating', type: 'text' },
    ],
  },
  {
    id: 'description',
    label: 'Description',
    icon: '📝',
    description: 'Summary and notes',
    fields: [
      { key: 'Summary', label: 'Summary', type: 'textarea' },
      { key: 'Notes', label: 'Notes', type: 'textarea' },
    ],
  },
];

export function BatchMetadataEditor({ fileIds, onClose, onSave }: BatchMetadataEditorProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ComicInfo>({});
  const [selectedFields, setSelectedFields] = useState<Set<EditableField>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['issue', 'credits']) // Start with common categories expanded
  );
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    failed: string[];
  } | null>(null);

  const handleFieldChange = (field: EditableField, value: string | number | undefined) => {
    setMetadata((prev) => ({
      ...prev,
      // Use REMOVE_FIELD sentinel for empty values so it survives JSON.stringify
      // and signals to the backend that this field should be removed from ComicInfo.xml
      [field]: value === '' || value === undefined ? REMOVE_FIELD : value,
    }));
  };

  const toggleField = useCallback((field: EditableField) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  }, []);

  const toggleCategory = useCallback((categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }, []);

  const selectAllInCategory = useCallback((category: FieldCategory) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      category.fields.forEach((f) => next.add(f.key));
      return next;
    });
    setExpandedCategories((prev) => new Set([...prev, category.id]));
  }, []);

  const clearAllInCategory = useCallback((category: FieldCategory) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      category.fields.forEach((f) => next.delete(f.key));
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setSelectedFields(new Set());
    setMetadata({});
  }, []);

  const getCategorySelectionCount = useCallback(
    (category: FieldCategory) => {
      return category.fields.filter((f) => selectedFields.has(f.key)).length;
    },
    [selectedFields]
  );

  const hasChanges = selectedFields.size > 0;

  // Get summary of changes for preview
  const changesSummary = useMemo(() => {
    const changes: { field: string; value: string }[] = [];
    selectedFields.forEach((field) => {
      const value = metadata[field];
      // Treat REMOVE_FIELD sentinel as empty for display
      const displayValue = value !== undefined && value !== '' && value !== REMOVE_FIELD
        ? String(value)
        : '(clear field)';
      const config = FIELD_CATEGORIES.flatMap((c) => c.fields).find((f) => f.key === field);
      changes.push({
        field: config?.label || field,
        value: displayValue.length > 50 ? displayValue.substring(0, 50) + '...' : displayValue,
      });
    });
    return changes;
  }, [selectedFields, metadata]);

  const handleSave = async () => {
    if (!hasChanges) return;

    setSaving(true);
    setError(null);

    try {
      const updates: Partial<ComicInfo> = {};
      selectedFields.forEach((field) => {
        // Include the field value, using REMOVE_FIELD for undefined/empty values
        const value = metadata[field];
        (updates as Record<string, unknown>)[field] = value ?? REMOVE_FIELD;
      });

      const failed: string[] = [];
      for (let i = 0; i < fileIds.length; i++) {
        const fileId = fileIds[i]!;
        setBatchProgress({ current: i + 1, total: fileIds.length, failed: [...failed] });
        try {
          await updateComicInfo(fileId, updates);
        } catch {
          failed.push(fileId);
        }
      }
      setBatchProgress(null);

      if (failed.length > 0) {
        setError(`Failed to update ${failed.length} of ${fileIds.length} files`);
        setSaving(false);
        return;
      }

      onSave?.();
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save metadata');
    } finally {
      setSaving(false);
    }
  };

  const renderFieldInput = (field: FieldConfig) => {
    const { key, label, type, autocompleteField } = field;
    const isSelected = selectedFields.has(key);

    if (!isSelected) {
      return (
        <button
          key={key}
          className="batch-field-chip"
          onClick={() => toggleField(key)}
          type="button"
        >
          <span className="batch-field-chip-icon">+</span>
          {label}
        </button>
      );
    }

    // Get display value - treat REMOVE_FIELD sentinel as empty
    const rawValue = metadata[key];
    const displayValue = rawValue === REMOVE_FIELD ? '' : rawValue;

    return (
      <div key={key} className="batch-field-active">
        <div className="batch-field-header">
          <label htmlFor={`field-${key}`}>{label}</label>
          <button
            className="batch-field-remove"
            onClick={() => toggleField(key)}
            type="button"
            title="Remove field"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="batch-field-input">
          {type === 'textarea' ? (
            <textarea
              id={`field-${key}`}
              value={(displayValue as string) || ''}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              rows={3}
              placeholder={`Enter ${label.toLowerCase()}...`}
            />
          ) : type === 'number' ? (
            <input
              id={`field-${key}`}
              type="number"
              value={(displayValue as number) ?? ''}
              onChange={(e) =>
                handleFieldChange(key, e.target.value ? parseInt(e.target.value, 10) : undefined)
              }
              placeholder={`Enter ${label.toLowerCase()}...`}
            />
          ) : type === 'tag' ? (
            <SimpleTagInput
              id={`field-${key}`}
              value={(displayValue as string) || ''}
              onChange={(value) => handleFieldChange(key, value || undefined)}
              autocompleteField={autocompleteField}
              placeholder={`Add ${label.toLowerCase()}...`}
            />
          ) : (
            <input
              id={`field-${key}`}
              type="text"
              value={(displayValue as string) || ''}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              placeholder={`Enter ${label.toLowerCase()}...`}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="batch-editor">
      {/* Header */}
      <header className="batch-editor-header">
        <div className="batch-editor-title">
          <div className="batch-editor-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </div>
          <div>
            <h2>Batch Edit</h2>
            <p className="batch-editor-subtitle">
              <span className="file-count">{fileIds.length}</span> files selected
            </p>
          </div>
        </div>
        {onClose && (
          <button className="batch-editor-close" onClick={onClose} title="Close">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </header>

      {error && (
        <div className="batch-editor-error">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 4.5V8.5M8 11V11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {error}
        </div>
      )}

      {/* Progress Overlay */}
      {batchProgress && (
        <div className="batch-editor-progress-overlay">
          <div className="batch-editor-progress-content">
            <div className="batch-editor-progress-spinner" />
            <div className="batch-editor-progress-text">
              Updating file {batchProgress.current} of {batchProgress.total}
            </div>
            <div className="batch-editor-progress-bar">
              <div
                className="batch-editor-progress-fill"
                style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
              />
            </div>
            {batchProgress.failed.length > 0 && (
              <div className="batch-editor-progress-failed">
                {batchProgress.failed.length} failed
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="batch-editor-body">
        {/* Left: Field Selection */}
        <div className="batch-editor-fields">
          <div className="batch-editor-fields-header">
            <span>Select fields to update</span>
            {selectedFields.size > 0 && (
              <button className="batch-clear-all" onClick={clearAll} type="button">
                Clear all
              </button>
            )}
          </div>

          <div className="batch-categories">
            {FIELD_CATEGORIES.map((category) => {
              const isExpanded = expandedCategories.has(category.id);
              const selectionCount = getCategorySelectionCount(category);
              const allSelected = selectionCount === category.fields.length;

              return (
                <div
                  key={category.id}
                  className={`batch-category ${isExpanded ? 'expanded' : ''} ${selectionCount > 0 ? 'has-selection' : ''}`}
                >
                  <div className="batch-category-header">
                    <button
                      className="batch-category-toggle"
                      onClick={() => toggleCategory(category.id)}
                      type="button"
                    >
                      <span className="batch-category-icon">{category.icon}</span>
                      <span className="batch-category-label">{category.label}</span>
                      {selectionCount > 0 && (
                        <span className="batch-category-count">{selectionCount}</span>
                      )}
                      <svg
                        className="batch-category-chevron"
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                      >
                        <path
                          d="M3 4.5L6 7.5L9 4.5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    <div className="batch-category-actions">
                      {!allSelected ? (
                        <button
                          className="batch-category-action"
                          onClick={() => selectAllInCategory(category)}
                          type="button"
                          title="Select all"
                        >
                          All
                        </button>
                      ) : (
                        <button
                          className="batch-category-action"
                          onClick={() => clearAllInCategory(category)}
                          type="button"
                          title="Clear all"
                        >
                          None
                        </button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="batch-category-content">
                      <div className="batch-category-description">{category.description}</div>
                      <div className="batch-fields-grid">
                        {category.fields.map((field) => renderFieldInput(field))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Changes Summary */}
        <div className="batch-editor-summary">
          <div className="batch-summary-header">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M13.5 4.5L6 12L2.5 8.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Changes Preview
          </div>

          {changesSummary.length === 0 ? (
            <div className="batch-summary-empty">
              <div className="batch-summary-empty-icon">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                  <rect x="4" y="8" width="24" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M4 12H28" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="8" cy="10" r="1" fill="currentColor" />
                  <circle cx="12" cy="10" r="1" fill="currentColor" />
                </svg>
              </div>
              <p>Select fields from the left panel to begin editing</p>
            </div>
          ) : (
            <div className="batch-summary-list">
              {changesSummary.map(({ field, value }) => (
                <div key={field} className="batch-summary-item">
                  <span className="batch-summary-field">{field}</span>
                  <span className="batch-summary-arrow">→</span>
                  <span className={`batch-summary-value ${value === '(clear field)' ? 'empty' : ''}`}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="batch-summary-footer">
            <div className="batch-summary-stats">
              <span className="batch-summary-stat">
                <strong>{selectedFields.size}</strong> fields
              </span>
              <span className="batch-summary-stat-divider">•</span>
              <span className="batch-summary-stat">
                <strong>{fileIds.length}</strong> files
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="batch-editor-footer">
        {onClose && (
          <button className="batch-btn batch-btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        )}
        <button
          className="batch-btn batch-btn-primary"
          onClick={handleSave}
          disabled={saving || !hasChanges}
        >
          {saving ? (
            <>
              <span className="batch-btn-spinner" />
              Updating...
            </>
          ) : (
            <>
              Apply to {fileIds.length} Files
            </>
          )}
        </button>
      </footer>
    </div>
  );
}
