/**
 * MetadataEditor Component
 *
 * Edit ComicInfo.xml metadata for single or multiple files.
 * Supports single file editing and batch editing mode.
 */

import { useState, useEffect } from 'react';
import {
  getComicInfo,
  updateComicInfo,
  ComicInfo,
  getCoverUrl,
} from '../../services/api.service';

interface MetadataEditorProps {
  fileIds: string[];
  onClose?: () => void;
  onSave?: () => void;
}

type EditableField = keyof ComicInfo;

const EDITABLE_FIELDS: { key: EditableField; label: string; type: 'text' | 'number' | 'textarea' }[] = [
  { key: 'Series', label: 'Series', type: 'text' },
  { key: 'Number', label: 'Issue Number', type: 'text' },
  { key: 'Title', label: 'Title', type: 'text' },
  { key: 'Volume', label: 'Volume', type: 'number' },
  { key: 'Year', label: 'Year', type: 'number' },
  { key: 'Month', label: 'Month', type: 'number' },
  { key: 'Day', label: 'Day', type: 'number' },
  { key: 'Writer', label: 'Writer', type: 'text' },
  { key: 'Penciller', label: 'Penciller', type: 'text' },
  { key: 'Inker', label: 'Inker', type: 'text' },
  { key: 'Colorist', label: 'Colorist', type: 'text' },
  { key: 'Letterer', label: 'Letterer', type: 'text' },
  { key: 'CoverArtist', label: 'Cover Artist', type: 'text' },
  { key: 'Publisher', label: 'Publisher', type: 'text' },
  { key: 'Genre', label: 'Genre', type: 'text' },
  { key: 'Tags', label: 'Tags', type: 'text' },
  { key: 'Summary', label: 'Summary', type: 'textarea' },
  { key: 'Notes', label: 'Notes', type: 'textarea' },
  { key: 'AgeRating', label: 'Age Rating', type: 'text' },
  { key: 'Characters', label: 'Characters', type: 'text' },
  { key: 'Teams', label: 'Teams', type: 'text' },
  { key: 'Locations', label: 'Locations', type: 'text' },
  { key: 'StoryArc', label: 'Story Arc', type: 'text' },
];

export function MetadataEditor({ fileIds, onClose, onSave }: MetadataEditorProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<ComicInfo>({});
  const [originalMetadata, setOriginalMetadata] = useState<ComicInfo>({});
  const [filename, setFilename] = useState<string>('');
  const [batchFields, setBatchFields] = useState<Set<EditableField>>(new Set());

  const isBatchMode = fileIds.length > 1;

  // Load metadata for single file mode
  useEffect(() => {
    if (!isBatchMode && fileIds[0]) {
      setLoading(true);
      setError(null);

      getComicInfo(fileIds[0])
        .then((response) => {
          setMetadata(response.comicInfo || {});
          setOriginalMetadata(response.comicInfo || {});
          setFilename(response.filename);
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
  }, [fileIds, isBatchMode]);

  const handleFieldChange = (field: EditableField, value: string | number | undefined) => {
    setMetadata((prev) => ({
      ...prev,
      [field]: value === '' ? undefined : value,
    }));
  };

  const handleBatchFieldToggle = (field: EditableField) => {
    setBatchFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  };

  const hasChanges = () => {
    if (isBatchMode) {
      return batchFields.size > 0;
    }
    return JSON.stringify(metadata) !== JSON.stringify(originalMetadata);
  };

  const handleSave = async () => {
    if (!hasChanges()) return;

    setSaving(true);
    setError(null);

    try {
      if (isBatchMode) {
        // Batch update: only update selected fields
        const updates: Partial<ComicInfo> = {};
        batchFields.forEach((field) => {
          (updates as Record<string, unknown>)[field] = metadata[field];
        });

        for (const fileId of fileIds) {
          await updateComicInfo(fileId, updates);
        }
      } else {
        // Single file update: send all changed fields
        const changes: Partial<ComicInfo> = {};
        for (const key of Object.keys(metadata) as EditableField[]) {
          if (metadata[key] !== originalMetadata[key]) {
            (changes as Record<string, unknown>)[key] = metadata[key];
          }
        }
        await updateComicInfo(fileIds[0]!, changes);
      }

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
    setBatchFields(new Set());
  };

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
        <h2>
          {isBatchMode
            ? `Edit ${fileIds.length} Files`
            : 'Edit Metadata'}
        </h2>
        {onClose && (
          <button className="btn-icon" onClick={onClose} title="Close">
            ✕
          </button>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {isBatchMode && (
        <div className="batch-mode-notice">
          <p>
            Select the fields you want to update. Only checked fields will be
            modified across all {fileIds.length} files.
          </p>
        </div>
      )}

      <div className="metadata-editor-content">
        {/* Cover Preview (single file mode) */}
        {!isBatchMode && fileIds[0] && (
          <div className="metadata-cover-preview">
            <img
              src={getCoverUrl(fileIds[0])}
              alt={filename}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <div className="filename">{filename}</div>
          </div>
        )}

        {/* Form Fields */}
        <div className="metadata-form">
          {EDITABLE_FIELDS.map(({ key, label, type }) => (
            <div
              key={key}
              className={`form-field ${type === 'textarea' ? 'full-width' : ''}`}
            >
              {isBatchMode && (
                <input
                  type="checkbox"
                  checked={batchFields.has(key)}
                  onChange={() => handleBatchFieldToggle(key)}
                  className="batch-checkbox"
                />
              )}
              <label htmlFor={`field-${key}`}>{label}</label>
              {type === 'textarea' ? (
                <textarea
                  id={`field-${key}`}
                  value={metadata[key] as string || ''}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  disabled={isBatchMode && !batchFields.has(key)}
                  rows={3}
                />
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
                  disabled={isBatchMode && !batchFields.has(key)}
                />
              ) : (
                <input
                  id={`field-${key}`}
                  type="text"
                  value={metadata[key] as string || ''}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  disabled={isBatchMode && !batchFields.has(key)}
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
            {saving ? 'Saving...' : isBatchMode ? `Update ${fileIds.length} Files` : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
