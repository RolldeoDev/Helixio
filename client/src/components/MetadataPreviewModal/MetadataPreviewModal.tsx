/**
 * MetadataPreviewModal Component
 *
 * Shows a side-by-side preview of current vs API values for series metadata.
 * Users can select which fields to apply, with locked fields shown but disabled.
 */

import { useState, useCallback, useMemo } from 'react';
import type {
  MetadataPreviewField,
  MetadataSource,
} from '../../services/api.service';
import './MetadataPreviewModal.css';

interface MetadataPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (selectedFields: string[]) => Promise<void>;
  fields: MetadataPreviewField[];
  source: MetadataSource | null;
  currentSeries: { comicVineId?: string | null; metronId?: string | null } | null;
  isApplying: boolean;
  coverPreviewUrls?: {
    current: string | null;
    api: string | null;
  };
}

export function MetadataPreviewModal({
  isOpen,
  onClose,
  onApply,
  fields,
  source,
  currentSeries,
  isApplying,
  coverPreviewUrls,
}: MetadataPreviewModalProps) {
  // Get external ID from current series based on source
  const externalId = source === 'comicvine'
    ? currentSeries?.comicVineId
    : currentSeries?.metronId;
  // Track selected fields - default to all unlocked fields with changes
  const [selectedFields, setSelectedFields] = useState<Set<string>>(() => {
    const defaultSelected = new Set<string>();
    for (const field of fields) {
      if (!field.isLocked && field.diff !== 'same') {
        defaultSelected.add(field.field);
      }
    }
    return defaultSelected;
  });

  // Get unlocked fields that have changes
  const unlockedFieldsWithChanges = useMemo(
    () => fields.filter((f) => !f.isLocked && f.diff !== 'same'),
    [fields]
  );

  // Check if all unlocked fields with changes are selected
  const allUnlockedSelected = useMemo(
    () => unlockedFieldsWithChanges.every((f) => selectedFields.has(f.field)),
    [unlockedFieldsWithChanges, selectedFields]
  );

  // Toggle a single field
  const toggleField = useCallback((fieldName: string) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(fieldName)) {
        next.delete(fieldName);
      } else {
        next.add(fieldName);
      }
      return next;
    });
  }, []);

  // Toggle all unlocked fields with changes
  const toggleAllUnlocked = useCallback(() => {
    setSelectedFields(() => {
      if (allUnlockedSelected) {
        // Deselect all
        return new Set();
      } else {
        // Select all unlocked with changes
        const next = new Set<string>();
        for (const field of unlockedFieldsWithChanges) {
          next.add(field.field);
        }
        return next;
      }
    });
  }, [allUnlockedSelected, unlockedFieldsWithChanges]);

  // Handle apply
  const handleApply = useCallback(async () => {
    await onApply(Array.from(selectedFields));
  }, [onApply, selectedFields]);

  // Get diff badge class
  const getDiffBadgeClass = (diff: MetadataPreviewField['diff']): string => {
    switch (diff) {
      case 'new':
        return 'diff-badge diff-new';
      case 'diff':
        return 'diff-badge diff-changed';
      case 'removed':
        return 'diff-badge diff-removed';
      default:
        return 'diff-badge diff-same';
    }
  };

  // Get diff badge text
  const getDiffBadgeText = (diff: MetadataPreviewField['diff']): string => {
    switch (diff) {
      case 'new':
        return 'NEW';
      case 'diff':
        return 'CHANGED';
      case 'removed':
        return 'REMOVED';
      default:
        return 'SAME';
    }
  };

  // Format source name
  const formatSource = (s: MetadataSource): string => {
    return s === 'comicvine' ? 'ComicVine' : 'Metron';
  };

  if (!isOpen || !source) return null;

  const fieldsWithChanges = fields.filter((f) => f.diff !== 'same');
  const lockedFieldsWithChanges = fieldsWithChanges.filter((f) => f.isLocked);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="metadata-preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Preview Metadata Changes</h2>
          <button
            className="btn-icon btn-close"
            onClick={onClose}
            disabled={isApplying}
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M15 5L5 15M5 5L15 15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="modal-content">
          <div className="source-info">
            <span className="source-badge">{formatSource(source)}</span>
            <span className="external-id">ID: {externalId}</span>
          </div>

          {fieldsWithChanges.length === 0 ? (
            <div className="no-changes">
              <p>No changes found. The API data matches your current series data.</p>
            </div>
          ) : (
            <>
              {lockedFieldsWithChanges.length > 0 && (
                <div className="locked-warning">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M12 5.333V4a4 4 0 1 0-8 0v1.333M4.667 14.667h6.666a1.333 1.333 0 0 0 1.334-1.334V6.667a1.333 1.333 0 0 0-1.334-1.334H4.667a1.333 1.333 0 0 0-1.334 1.334v6.666a1.333 1.333 0 0 0 1.334 1.334Z"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>
                    {lockedFieldsWithChanges.length} field(s) have changes but are locked
                  </span>
                </div>
              )}

              <div className="fields-list">
                {fields.map((field) => {
                  // Only show fields with differences
                  if (field.diff === 'same') return null;

                  const isCoverField = field.field === 'coverUrl';
                  const isSelected = selectedFields.has(field.field);

                  return (
                    <div
                      key={field.field}
                      className={`field-row ${field.isLocked ? 'locked' : ''} ${isSelected ? 'selected' : ''}`}
                    >
                      <div className="field-checkbox">
                        <input
                          type="checkbox"
                          id={`field-${field.field}`}
                          checked={isSelected}
                          onChange={() => toggleField(field.field)}
                          disabled={field.isLocked || isApplying}
                        />
                        <label htmlFor={`field-${field.field}`}>
                          {field.isLocked && (
                            <svg
                              className="lock-icon"
                              width="14"
                              height="14"
                              viewBox="0 0 14 14"
                              fill="none"
                            >
                              <path
                                d="M10.5 6.417V4.667a3.5 3.5 0 1 0-7 0v1.75M4.083 12.833h5.834a1.167 1.167 0 0 0 1.166-1.166V7.583a1.167 1.167 0 0 0-1.166-1.166H4.083a1.167 1.167 0 0 0-1.166 1.166v4.084a1.167 1.167 0 0 0 1.166 1.166Z"
                                stroke="currentColor"
                                strokeWidth="1.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                          {field.label}
                        </label>
                      </div>

                      <div className={getDiffBadgeClass(field.diff)}>
                        {getDiffBadgeText(field.diff)}
                      </div>

                      <div className="field-values">
                        {isCoverField && coverPreviewUrls ? (
                          <div className="cover-comparison">
                            <div className="cover-preview current">
                              <span className="cover-label">Current</span>
                              {coverPreviewUrls.current ? (
                                <img
                                  src={coverPreviewUrls.current}
                                  alt="Current cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="no-cover">No cover</div>
                              )}
                            </div>
                            <div className="cover-arrow">
                              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <path
                                  d="M4 10H16M16 10L11 5M16 10L11 15"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </div>
                            <div className="cover-preview api">
                              <span className="cover-label">API</span>
                              {coverPreviewUrls.api ? (
                                <img
                                  src={coverPreviewUrls.api}
                                  alt="API cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <div className="no-cover">No cover</div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="value current">
                              <span className="value-label">Current:</span>
                              <span className="value-text">
                                {field.currentValue ?? <em className="empty">Empty</em>}
                              </span>
                            </div>
                            <div className="value api">
                              <span className="value-label">API:</span>
                              <span className="value-text">
                                {field.apiValue ?? <em className="empty">Empty</em>}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <div className="footer-left">
            {unlockedFieldsWithChanges.length > 0 && (
              <label className="select-all">
                <input
                  type="checkbox"
                  checked={allUnlockedSelected}
                  onChange={toggleAllUnlocked}
                  disabled={isApplying}
                />
                Select All Unlocked
              </label>
            )}
          </div>
          <div className="footer-right">
            <button
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isApplying}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleApply}
              disabled={selectedFields.size === 0 || isApplying}
            >
              {isApplying ? 'Applying...' : `Apply ${selectedFields.size} Changes`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
