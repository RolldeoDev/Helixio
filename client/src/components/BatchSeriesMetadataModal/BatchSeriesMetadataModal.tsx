/**
 * BatchSeriesMetadataModal Component
 *
 * Modal for batch editing metadata across multiple series.
 * Uses checkbox-based field selection pattern - only checked fields are applied.
 */

import { useState, useCallback, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { bulkUpdateSeries, BulkSeriesUpdateInput } from '../../services/api.service';
import './BatchSeriesMetadataModal.css';

// =============================================================================
// Types
// =============================================================================

export interface BatchSeriesMetadataModalProps {
  /** Whether the modal is open */
  isOpen: boolean;
  /** Called when modal should close */
  onClose: () => void;
  /** Array of series IDs to update */
  seriesIds: string[];
  /** Called after successful update with count of updated series */
  onComplete: (updatedCount: number) => void;
}

type SeriesType = 'western' | 'manga';

interface FieldState {
  enabled: boolean;
  value: string;
}

// =============================================================================
// Simple Tag Input Component (for this modal only)
// =============================================================================

interface SimpleTagInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

function SimpleTagInput({ id, value, onChange, placeholder, disabled }: SimpleTagInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');

  // Parse comma-separated string to array
  const tags = value
    ? value.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  const addTag = useCallback((tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      const newTags = [...tags, trimmed];
      onChange(newTags.join(', '));
    }
    setInputValue('');
  }, [tags, onChange]);

  const removeTag = useCallback((tagToRemove: string) => {
    const newTags = tags.filter((t) => t !== tagToRemove);
    onChange(newTags.length > 0 ? newTags.join(', ') : '');
  }, [tags, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (inputValue.trim()) {
        addTag(inputValue);
      }
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      const lastTag = tags[tags.length - 1];
      if (lastTag) removeTag(lastTag);
    }
  }, [inputValue, addTag, removeTag, tags]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.includes(',')) {
      const parts = val.split(',');
      const lastPart = parts.pop() || '';
      parts.forEach((part) => {
        const trimmed = part.trim();
        if (trimmed && !tags.includes(trimmed)) {
          addTag(trimmed);
        }
      });
      setInputValue(lastPart);
    } else {
      setInputValue(val);
    }
  }, [addTag, tags]);

  const handleBlur = useCallback(() => {
    if (inputValue.trim()) {
      addTag(inputValue);
    }
  }, [inputValue, addTag]);

  return (
    <div
      className={`batch-tag-input-container ${disabled ? 'disabled' : ''}`}
      onClick={() => inputRef.current?.focus()}
    >
      {tags.map((tag) => (
        <span key={tag} className="batch-tag-chip">
          {tag}
          {!disabled && (
            <button
              type="button"
              className="batch-tag-remove"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={tags.length === 0 ? placeholder : ''}
        disabled={disabled}
        className="batch-tag-input-inner"
        autoComplete="off"
      />
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function BatchSeriesMetadataModal({
  isOpen,
  onClose,
  seriesIds,
  onComplete,
}: BatchSeriesMetadataModalProps) {
  const publisherId = useId();
  const typeId = useId();
  const genresId = useId();
  const tagsId = useId();

  // Field states
  const [publisher, setPublisher] = useState<FieldState>({ enabled: false, value: '' });
  const [seriesType, setSeriesType] = useState<FieldState>({ enabled: false, value: 'western' });
  const [genres, setGenres] = useState<FieldState>({ enabled: false, value: '' });
  const [tags, setTags] = useState<FieldState>({ enabled: false, value: '' });

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ updated: number; total: number } | null>(null);

  const handleClose = useCallback(() => {
    if (saving) return;
    // Reset state
    setPublisher({ enabled: false, value: '' });
    setSeriesType({ enabled: false, value: 'western' });
    setGenres({ enabled: false, value: '' });
    setTags({ enabled: false, value: '' });
    setError(null);
    setProgress(null);
    onClose();
  }, [saving, onClose]);

  const handleApply = useCallback(async () => {
    // Check if at least one field is enabled
    const enabledFields = [publisher, seriesType, genres, tags].filter(f => f.enabled);
    if (enabledFields.length === 0) {
      setError('Please select at least one field to update');
      return;
    }

    setSaving(true);
    setError(null);
    setProgress({ updated: 0, total: seriesIds.length });

    try {
      // Build update payload with only enabled fields
      const updates: BulkSeriesUpdateInput = {};

      if (publisher.enabled) {
        updates.publisher = publisher.value || null;
      }
      if (seriesType.enabled) {
        updates.type = seriesType.value as SeriesType;
      }
      if (genres.enabled) {
        updates.genres = genres.value || null;
      }
      if (tags.enabled) {
        updates.tags = tags.value || null;
      }

      const result = await bulkUpdateSeries(seriesIds, updates);

      setProgress({ updated: result.successful, total: seriesIds.length });

      // Short delay to show completion
      setTimeout(() => {
        onComplete(result.successful);
        handleClose();
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update series');
      setSaving(false);
    }
  }, [seriesIds, publisher, seriesType, genres, tags, onComplete, handleClose]);

  // Handle escape key
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !saving) {
      handleClose();
    }
  }, [saving, handleClose]);

  if (!isOpen) return null;

  const enabledCount = [publisher, seriesType, genres, tags].filter(f => f.enabled).length;

  return createPortal(
    <div className="batch-metadata-modal-overlay" onClick={handleClose} onKeyDown={handleKeyDown}>
      <div className="batch-metadata-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="batch-metadata-modal-header">
          <h2>Batch Edit Series</h2>
          <span className="batch-metadata-count">{seriesIds.length} series selected</span>
          <button className="batch-metadata-close" onClick={handleClose} disabled={saving}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="batch-metadata-modal-content">
          <p className="batch-metadata-instructions">
            Select the fields you want to update. Only checked fields will be applied to all selected series.
          </p>

          {/* Publisher Field */}
          <div className="batch-field">
            <div className="batch-field-header">
              <label className="batch-field-checkbox">
                <input
                  type="checkbox"
                  checked={publisher.enabled}
                  onChange={(e) => setPublisher(prev => ({ ...prev, enabled: e.target.checked }))}
                  disabled={saving}
                />
                <span>Publisher</span>
              </label>
            </div>
            <input
              id={publisherId}
              type="text"
              value={publisher.value}
              onChange={(e) => setPublisher(prev => ({ ...prev, value: e.target.value }))}
              placeholder="Enter publisher name..."
              disabled={!publisher.enabled || saving}
              className="batch-field-input"
            />
          </div>

          {/* Type Field */}
          <div className="batch-field">
            <div className="batch-field-header">
              <label className="batch-field-checkbox">
                <input
                  type="checkbox"
                  checked={seriesType.enabled}
                  onChange={(e) => setSeriesType(prev => ({ ...prev, enabled: e.target.checked }))}
                  disabled={saving}
                />
                <span>Type</span>
              </label>
            </div>
            <select
              id={typeId}
              value={seriesType.value}
              onChange={(e) => setSeriesType(prev => ({ ...prev, value: e.target.value }))}
              disabled={!seriesType.enabled || saving}
              className="batch-field-select"
            >
              <option value="western">Western</option>
              <option value="manga">Manga</option>
            </select>
          </div>

          {/* Genres Field */}
          <div className="batch-field">
            <div className="batch-field-header">
              <label className="batch-field-checkbox">
                <input
                  type="checkbox"
                  checked={genres.enabled}
                  onChange={(e) => setGenres(prev => ({ ...prev, enabled: e.target.checked }))}
                  disabled={saving}
                />
                <span>Genres</span>
              </label>
            </div>
            <SimpleTagInput
              id={genresId}
              value={genres.value}
              onChange={(value) => setGenres(prev => ({ ...prev, value }))}
              placeholder="Add genres..."
              disabled={!genres.enabled || saving}
            />
            <span className="batch-field-hint">Press Enter or comma to add</span>
          </div>

          {/* Tags Field */}
          <div className="batch-field">
            <div className="batch-field-header">
              <label className="batch-field-checkbox">
                <input
                  type="checkbox"
                  checked={tags.enabled}
                  onChange={(e) => setTags(prev => ({ ...prev, enabled: e.target.checked }))}
                  disabled={saving}
                />
                <span>Tags</span>
              </label>
            </div>
            <SimpleTagInput
              id={tagsId}
              value={tags.value}
              onChange={(value) => setTags(prev => ({ ...prev, value }))}
              placeholder="Add tags..."
              disabled={!tags.enabled || saving}
            />
            <span className="batch-field-hint">Press Enter or comma to add</span>
          </div>

          {/* Error message */}
          {error && (
            <div className="batch-metadata-error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Progress indicator */}
          {progress && (
            <div className="batch-metadata-progress">
              <div className="batch-progress-bar">
                <div
                  className="batch-progress-fill"
                  style={{ width: `${(progress.updated / progress.total) * 100}%` }}
                />
              </div>
              <span className="batch-progress-text">
                Updated {progress.updated} of {progress.total} series
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="batch-metadata-modal-footer">
          <button
            className="batch-metadata-cancel"
            onClick={handleClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="batch-metadata-apply"
            onClick={handleApply}
            disabled={saving || enabledCount === 0}
          >
            {saving ? (
              <>
                <svg className="spinner" viewBox="0 0 24 24" width="16" height="16">
                  <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeLinecap="round" />
                </svg>
                Updating...
              </>
            ) : (
              `Apply to ${seriesIds.length} Series`
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
