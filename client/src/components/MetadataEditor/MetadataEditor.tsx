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
  type TagFieldType,
} from '../../services/api.service';
import { IssueCoverPicker } from '../IssueCoverPicker';
import { DescriptionGenerator } from '../DescriptionGenerator';
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

  // Load metadata and cover info
  useEffect(() => {
    if (fileIds[0]) {
      setLoading(true);
      setError(null);

      Promise.all([
        getComicInfo(fileIds[0]),
        getFileCoverInfo(fileIds[0]).catch(() => null),
      ])
        .then(([metadataResponse, coverInfoResponse]) => {
          setMetadata(metadataResponse.comicInfo || {});
          setOriginalMetadata(metadataResponse.comicInfo || {});
          setFilename(metadataResponse.filename);
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
  }, [fileIds]);

  const handleFieldChange = (field: EditableField, value: string | number | undefined) => {
    setMetadata((prev) => ({
      ...prev,
      [field]: value === '' ? undefined : value,
    }));
  };

  const hasChanges = () => {
    return JSON.stringify(metadata) !== JSON.stringify(originalMetadata);
  };

  const handleSave = async () => {
    if (!hasChanges()) return;

    setSaving(true);
    setError(null);

    try {
      const changes: Partial<ComicInfo> = {};
      for (const key of Object.keys(metadata) as EditableField[]) {
        if (metadata[key] !== originalMetadata[key]) {
          (changes as Record<string, unknown>)[key] = metadata[key];
        }
      }
      await updateComicInfo(fileIds[0]!, changes);

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
    if (!fileIds[0]) return '';
    if (coverInfo?.coverSource === 'custom' && coverInfo?.coverHash) {
      return getApiCoverUrl(coverInfo.coverHash);
    }
    return `${getCoverUrl(fileIds[0])}?v=${coverKey}`;
  }, [fileIds, coverInfo, coverKey]);

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
          {onGrabMetadata && fileIds.length === 1 && (
            <button className="btn-ghost btn-sm" onClick={onGrabMetadata} title="Fetch metadata from API">
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
        {fileIds[0] && (
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
                  fileId={fileIds[0]}
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
          {EDITABLE_FIELDS.map(({ key, label, type, autocompleteField }) => (
            <div
              key={key}
              className={`form-field ${type === 'textarea' ? 'full-width' : ''}`}
            >
              <label htmlFor={`field-${key}`}>{label}</label>
              {type === 'textarea' ? (
                <>
                  <textarea
                    id={`field-${key}`}
                    value={metadata[key] as string || ''}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    rows={3}
                  />
                  {/* Show Generate Description under Summary field */}
                  {key === 'Summary' && fileIds[0] && (
                    <DescriptionGenerator
                      type="issue"
                      entityId={fileIds[0]}
                      entityName={metadata.Title || metadata.Series || filename}
                      currentDescription={metadata.Summary}
                      onGenerated={(result) => {
                        handleFieldChange('Summary', result.description);
                      }}
                      disabled={saving}
                    />
                  )}
                </>
              ) : type === 'number' ? (
                <input
                  id={`field-${key}`}
                  type="number"
                  value={metadata[key] as number ?? ''}
                  onChange={(e) =>
                    handleFieldChange(
                      key,
                      e.target.value ? parseInt(e.target.value, 10) : undefined
                    )
                  }
                />
              ) : type === 'tag' ? (
                <SimpleTagInput
                  id={`field-${key}`}
                  value={metadata[key] as string || ''}
                  onChange={(value) => handleFieldChange(key, value || undefined)}
                  autocompleteField={autocompleteField}
                  placeholder={`Add ${label.toLowerCase()}...`}
                />
              ) : (
                <input
                  id={`field-${key}`}
                  type="text"
                  value={metadata[key] as string || ''}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                />
              )}
            </div>
          ))}
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
    </div>
  );
}
