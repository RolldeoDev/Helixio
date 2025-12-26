/**
 * MetadataEditor Component
 *
 * Edit ComicInfo.xml metadata for single or multiple files.
 * Uses BatchMetadataEditor for multi-file editing.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getComicInfo,
  updateComicInfo,
  ComicInfo,
  getCoverUrl,
  getFileCoverInfo,
  getApiCoverUrl,
  FileCoverInfo,
  REMOVE_FIELD,
  type TagFieldType,
} from '../../services/api.service';
import { IssueCoverPicker } from '../IssueCoverPicker';
import { DescriptionGenerator } from '../DescriptionGenerator';
import { IssueMetadataGrabber } from '../IssueMetadataGrabber';
import { SimpleTagInput } from './SimpleTagInput';
import { BatchMetadataEditor } from './BatchMetadataEditor';

interface MetadataEditorProps {
  fileIds: string[];
  onClose?: () => void;
  onSave?: () => void;
  onCoverChange?: (result: { source: 'auto' | 'page' | 'custom'; pageIndex?: number; coverHash?: string }) => void;
  onGrabMetadata?: () => void;
}

type EditableField = keyof ComicInfo;

interface FieldConfig {
  key: EditableField;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'tag';
  autocompleteField?: TagFieldType;
}

const EDITABLE_FIELDS: FieldConfig[] = [
  { key: 'Series', label: 'Series', type: 'text' },
  { key: 'Number', label: 'Issue Number', type: 'text' },
  { key: 'Title', label: 'Title', type: 'text' },
  { key: 'Volume', label: 'Volume', type: 'number' },
  { key: 'Year', label: 'Year', type: 'number' },
  { key: 'Month', label: 'Month', type: 'number' },
  { key: 'Day', label: 'Day', type: 'number' },
  { key: 'Writer', label: 'Writer', type: 'tag', autocompleteField: 'writers' },
  { key: 'Penciller', label: 'Penciller', type: 'tag', autocompleteField: 'pencillers' },
  { key: 'Inker', label: 'Inker', type: 'tag', autocompleteField: 'inkers' },
  { key: 'Colorist', label: 'Colorist', type: 'tag', autocompleteField: 'colorists' },
  { key: 'Letterer', label: 'Letterer', type: 'tag', autocompleteField: 'letterers' },
  { key: 'CoverArtist', label: 'Cover Artist', type: 'tag', autocompleteField: 'coverArtists' },
  { key: 'Publisher', label: 'Publisher', type: 'tag', autocompleteField: 'publishers' },
  { key: 'Genre', label: 'Genre', type: 'tag', autocompleteField: 'genres' },
  { key: 'Tags', label: 'Tags', type: 'tag', autocompleteField: 'tags' },
  { key: 'Summary', label: 'Summary', type: 'textarea' },
  { key: 'Notes', label: 'Notes', type: 'textarea' },
  { key: 'AgeRating', label: 'Age Rating', type: 'text' },
  { key: 'Characters', label: 'Characters', type: 'tag', autocompleteField: 'characters' },
  { key: 'Teams', label: 'Teams', type: 'tag', autocompleteField: 'teams' },
  { key: 'Locations', label: 'Locations', type: 'tag', autocompleteField: 'locations' },
  { key: 'StoryArc', label: 'Story Arc', type: 'tag', autocompleteField: 'storyArcs' },
];

/** Format hints for metadata fields */
const FIELD_HINTS: Partial<Record<keyof ComicInfo, string>> = {
  Number: 'e.g., 1, 1.5, Annual 1, 0',
  Volume: 'Volume number (integer)',
  Year: 'Publication year (e.g., 2024)',
  Month: 'Publication month (1-12)',
  Day: 'Publication day (1-31)',
  AgeRating: 'e.g., Everyone, Teen, Mature 17+',
};

export function MetadataEditor({ fileIds, onClose, onSave, onCoverChange, onGrabMetadata }: MetadataEditorProps) {
  // Use the redesigned BatchMetadataEditor for multiple files
  if (fileIds.length > 1) {
    return <BatchMetadataEditor fileIds={fileIds} onClose={onClose} onSave={onSave} />;
  }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ComicInfo>({});
  const [originalMetadata, setOriginalMetadata] = useState<ComicInfo>({});
  const [filename, setFilename] = useState<string>('');
  const [coverInfo, setCoverInfo] = useState<FileCoverInfo | null>(null);
  const [coverKey, setCoverKey] = useState(0);
  const [isEditingCover, setIsEditingCover] = useState(false);
  const [lockedFields, setLockedFields] = useState<string[]>([]);
  // Internal state for metadata grabbing (when onGrabMetadata is not provided)
  const [isInternalGrabbing, setIsInternalGrabbing] = useState(false);

  // Get the file ID - use first element for single file editing
  // This prevents useEffect from re-running when parent creates new array references
  const fileId = fileIds[0];

  // Load metadata and cover info
  useEffect(() => {
    if (fileId) {
      setLoading(true);
      setError(null);

      Promise.all([
        getComicInfo(fileId),
        getFileCoverInfo(fileId).catch(() => null),
      ])
        .then(([metadataResponse, coverInfoResponse]) => {
          setMetadata(metadataResponse.comicInfo || {});
          setOriginalMetadata(metadataResponse.comicInfo || {});
          setFilename(metadataResponse.filename);
          // Store locked fields from API response
          setLockedFields(metadataResponse.lockedFields || []);
          if (coverInfoResponse) {
            setCoverInfo(coverInfoResponse);
          }
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Failed to load metadata');
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [fileId]);

  const handleFieldChange = (field: EditableField, value: string | number | undefined) => {
    setMetadata((prev) => {
      const newValue = value === '' || value === undefined ? REMOVE_FIELD : value;
      return {
        ...prev,
        // Use REMOVE_FIELD sentinel for empty values so it survives JSON.stringify
        // and signals to the backend that this field should be removed from ComicInfo.xml
        [field]: newValue,
      };
    });
  };

  const hasChanges = () => {
    return JSON.stringify(metadata) !== JSON.stringify(originalMetadata);
  };

  const handleSave = async () => {
    if (!hasChanges()) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const changes: Partial<ComicInfo> = {};

      // Get all unique keys from both current and original metadata
      const allKeys = new Set([
        ...Object.keys(metadata),
        ...Object.keys(originalMetadata),
      ]) as Set<EditableField>;

      for (const key of allKeys) {
        const currentValue = metadata[key];
        const originalValue = originalMetadata[key];

        // Include if value changed (including changes to REMOVE_FIELD)
        if (currentValue !== originalValue) {
          (changes as Record<string, unknown>)[key] = currentValue ?? REMOVE_FIELD;
        }
      }

      await updateComicInfo(fileId!, changes);

      onSave?.();
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save metadata');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setMetadata(originalMetadata);
  };

  // Reload metadata from server (used after grabbing metadata from API)
  const reloadMetadata = useCallback(async () => {
    if (!fileId) return;

    try {
      const response = await getComicInfo(fileId);
      setMetadata(response.comicInfo || {});
      setOriginalMetadata(response.comicInfo || {});
      setFilename(response.filename);
      setLockedFields(response.lockedFields || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reload metadata');
    }
  }, [fileId]);

  // Handle "Grab from API" button click
  const handleGrabClick = useCallback(() => {
    if (onGrabMetadata) {
      // Use external handler if provided
      onGrabMetadata();
    } else {
      // Use internal grabber
      setIsInternalGrabbing(true);
    }
  }, [onGrabMetadata]);

  // Handle cover change from the picker
  const handleCoverUpdate = useCallback((result: { source: 'auto' | 'page' | 'custom'; pageIndex?: number; coverHash?: string }) => {
    setCoverInfo((prev) => ({
      id: prev?.id || '',
      coverSource: result.source,
      coverPageIndex: result.pageIndex ?? null,
      coverHash: result.coverHash ?? null,
      coverUrl: null,
    }));
    setCoverKey((k) => k + 1);
    setIsEditingCover(false);
    onCoverChange?.(result);
  }, [onCoverChange]);

  // Get cover URL based on cover info
  const getCoverDisplayUrl = useCallback(() => {
    if (!fileId) return '';
    if (coverInfo?.coverSource === 'custom' && coverInfo?.coverHash) {
      return getApiCoverUrl(coverInfo.coverHash);
    }
    return `${getCoverUrl(fileId)}?v=${coverKey}`;
  }, [fileId, coverInfo, coverKey]);

  if (loading) {
    return (
      <div className="metadata-editor">
        <div className="loading-overlay">
          <div className="spinner" />
          Loading metadata...
        </div>
      </div>
    );
  }

  return (
    <div className="metadata-editor">
      <div className="metadata-editor-header">
        <h2>Edit Metadata</h2>
        <div className="metadata-editor-header-actions">
          {/* Always show Grab from API for single files */}
          {fileIds.length === 1 && (
            <button className="btn-ghost btn-sm" onClick={handleGrabClick} title="Fetch metadata from API">
              Grab from API
            </button>
          )}
          {onClose && (
            <button className="btn-icon" onClick={onClose} title="Close">
              ✕
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="metadata-editor-content">
        {/* Cover Preview and Editor */}
        {fileId && (
          <div className="metadata-cover-section">
            <div className="metadata-cover-preview">
              <img
                src={getCoverDisplayUrl()}
                alt={filename}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <div className="filename">{filename}</div>
              <button
                className="btn-edit-cover"
                onClick={() => setIsEditingCover(!isEditingCover)}
              >
                {isEditingCover ? 'Cancel' : 'Edit Cover'}
              </button>
            </div>
            {isEditingCover && (
              <div className="metadata-cover-picker">
                <IssueCoverPicker
                  fileId={fileId}
                  currentCoverSource={coverInfo?.coverSource as 'auto' | 'page' | 'custom' || 'auto'}
                  currentCoverPageIndex={coverInfo?.coverPageIndex ?? null}
                  currentCoverHash={coverInfo?.coverHash ?? null}
                  onCoverChange={handleCoverUpdate}
                />
              </div>
            )}
          </div>
        )}

        {/* Form Fields */}
        <div className="metadata-form">
          {EDITABLE_FIELDS.map(({ key, label, type, autocompleteField }) => {
            // Get display value - treat REMOVE_FIELD sentinel as empty
            const rawValue = metadata[key];
            const displayValue = rawValue === REMOVE_FIELD ? '' : rawValue;
            // Check if this field is locked by series settings
            const isLocked = lockedFields.includes(key);
            // Get format hint for this field
            const hint = FIELD_HINTS[key];

            return (
              <div
                key={key}
                className={`form-field ${type === 'textarea' ? 'full-width' : ''} ${isLocked ? 'form-field--locked' : ''}`}
              >
                <label htmlFor={`field-${key}`}>
                  {label}
                  {isLocked && (
                    <span className="field-locked-indicator" title="This field is locked by series settings">
                      🔒
                    </span>
                  )}
                </label>
                {type === 'textarea' ? (
                  <>
                    <textarea
                      id={`field-${key}`}
                      value={displayValue as string || ''}
                      onChange={(e) => handleFieldChange(key, e.target.value)}
                      rows={3}
                      disabled={isLocked}
                    />
                    {/* Show Generate Description under Summary field */}
                    {key === 'Summary' && fileId && !isLocked && (
                      <DescriptionGenerator
                        type="issue"
                        entityId={fileId}
                        entityName={metadata.Title || metadata.Series || filename}
                        currentDescription={metadata.Summary === REMOVE_FIELD ? undefined : metadata.Summary}
                        onGenerated={(result) => {
                          handleFieldChange('Summary', result.description);
                        }}
                        disabled={saving}
                      />
                    )}
                  </>
                ) : type === 'number' ? (
                  <>
                    <input
                      id={`field-${key}`}
                      type="number"
                      value={displayValue as number ?? ''}
                      onChange={(e) =>
                        handleFieldChange(
                          key,
                          e.target.value ? parseInt(e.target.value, 10) : undefined
                        )
                      }
                      disabled={isLocked}
                    />
                    {hint && <span className="field-hint">{hint}</span>}
                  </>
                ) : type === 'tag' ? (
                  <SimpleTagInput
                    id={`field-${key}`}
                    value={displayValue as string || ''}
                    onChange={(value) => handleFieldChange(key, value || undefined)}
                    autocompleteField={autocompleteField}
                    placeholder={isLocked ? 'Locked' : `Add ${label.toLowerCase()}...`}
                    disabled={isLocked}
                  />
                ) : (
                  <>
                    <input
                      id={`field-${key}`}
                      type="text"
                      value={displayValue as string || ''}
                      onChange={(e) => handleFieldChange(key, e.target.value)}
                      disabled={isLocked}
                    />
                    {hint && <span className="field-hint">{hint}</span>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="metadata-editor-footer">
        <button
          className="btn-secondary"
          onClick={handleReset}
          disabled={saving}
        >
          Reset
        </button>
        <div className="footer-right">
          {onClose && (
            <button
              className="btn-ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
          )}
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={saving || !hasChanges()}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Internal Metadata Grabber Modal (when onGrabMetadata not provided) */}
      {isInternalGrabbing && fileId && (
        <div className="modal-overlay" onClick={() => setIsInternalGrabbing(false)}>
          <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
            <IssueMetadataGrabber
              fileId={fileId}
              onClose={() => setIsInternalGrabbing(false)}
              onSuccess={() => {
                setIsInternalGrabbing(false);
                reloadMetadata();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
