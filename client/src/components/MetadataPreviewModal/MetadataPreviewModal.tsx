/**
 * MetadataPreviewModal Component
 *
 * Shows a side-by-side preview of current vs API values for series metadata.
 * Users can select which fields to apply, with locked fields shown but disabled.
 *
 * Uses the shared FieldComparisonRow component for consistent field display.
 */

import { useState, useCallback, useMemo } from 'react';
import type {
  MetadataPreviewField,
  MetadataSource,
} from '../../services/api.service';
import { FieldComparisonRow, type FieldDiffStatus } from '../FieldComparison';
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

// Map MetadataPreviewField.diff to FieldDiffStatus
function mapDiffStatus(diff: MetadataPreviewField['diff']): FieldDiffStatus {
  switch (diff) {
    case 'new':
      return 'new';
    case 'diff':
      return 'changed';
    case 'removed':
      return 'removed';
    default:
      return 'same';
  }
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
  const toggleField = useCallback((fieldName: string, selected: boolean) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(fieldName);
      } else {
        next.delete(fieldName);
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

  // Format source name
  const formatSource = (s: MetadataSource): string => {
    switch (s) {
      case 'comicvine':
        return 'ComicVine';
      case 'metron':
        return 'Metron';
      case 'gcd':
        return 'GCD';
      case 'anilist':
        return 'AniList';
      case 'mal':
        return 'MAL';
      default:
        return s;
    }
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
                <div className="field-comparison-locked-warning">
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
                    {lockedFieldsWithChanges.length} field{lockedFieldsWithChanges.length !== 1 ? 's' : ''} have changes but {lockedFieldsWithChanges.length !== 1 ? 'are' : 'is'} locked
                  </span>
                </div>
              )}

              <div className="field-comparison-rows">
                {fields.map((field) => {
                  // Only show fields with differences
                  if (field.diff === 'same') return null;

                  const isCoverField = field.field === 'coverUrl';
                  const isSelected = selectedFields.has(field.field);

                  return (
                    <FieldComparisonRow
                      key={field.field}
                      fieldName={field.field}
                      label={field.label}
                      currentValue={field.currentValue}
                      proposedValue={field.apiValue}
                      isSelected={isSelected}
                      isLocked={field.isLocked}
                      status={mapDiffStatus(field.diff)}
                      onToggle={(selected) => toggleField(field.field, selected)}
                      disabled={isApplying}
                      coverPreview={isCoverField && coverPreviewUrls ? {
                        currentUrl: coverPreviewUrls.current,
                        proposedUrl: coverPreviewUrls.api,
                      } : undefined}
                    />
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
