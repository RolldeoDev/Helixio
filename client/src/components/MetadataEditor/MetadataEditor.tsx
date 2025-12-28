/**
 * MetadataEditor Component
 *
 * Edit ComicInfo.xml metadata for single or multiple files.
 * Uses BatchMetadataEditor for multi-file editing.
 * Features collapsible accordion sections for organized field grouping.
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
  convertFile,
} from '../../services/api.service';
import { DescriptionGenerator } from '../DescriptionGenerator';
import { IssueMetadataGrabber } from '../IssueMetadataGrabber';
import { LocalSeriesSearchModal } from '../LocalSeriesSearchModal';
import { SimpleTagInput } from './SimpleTagInput';
import { BatchMetadataEditor } from './BatchMetadataEditor';
import { CoverEditorModal } from './CoverEditorModal';
import './MetadataEditor.css';

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

/** Field configurations for all editable fields */
const FIELD_CONFIGS: Record<string, FieldConfig> = {
  Series: { key: 'Series', label: 'Series', type: 'text' },
  Number: { key: 'Number', label: 'Issue #', type: 'text' },
  Title: { key: 'Title', label: 'Title', type: 'text' },
  Volume: { key: 'Volume', label: 'Volume', type: 'number' },
  Year: { key: 'Year', label: 'Year', type: 'number' },
  Month: { key: 'Month', label: 'Month', type: 'number' },
  Day: { key: 'Day', label: 'Day', type: 'number' },
  Publisher: { key: 'Publisher', label: 'Publisher', type: 'tag', autocompleteField: 'publishers' },
  Writer: { key: 'Writer', label: 'Writer', type: 'tag', autocompleteField: 'writers' },
  Penciller: { key: 'Penciller', label: 'Penciller', type: 'tag', autocompleteField: 'pencillers' },
  Inker: { key: 'Inker', label: 'Inker', type: 'tag', autocompleteField: 'inkers' },
  Colorist: { key: 'Colorist', label: 'Colorist', type: 'tag', autocompleteField: 'colorists' },
  Letterer: { key: 'Letterer', label: 'Letterer', type: 'tag', autocompleteField: 'letterers' },
  CoverArtist: { key: 'CoverArtist', label: 'Cover Artist', type: 'tag', autocompleteField: 'coverArtists' },
  Genre: { key: 'Genre', label: 'Genre', type: 'tag', autocompleteField: 'genres' },
  Tags: { key: 'Tags', label: 'Tags', type: 'tag', autocompleteField: 'tags' },
  Characters: { key: 'Characters', label: 'Characters', type: 'tag', autocompleteField: 'characters' },
  Teams: { key: 'Teams', label: 'Teams', type: 'tag', autocompleteField: 'teams' },
  Locations: { key: 'Locations', label: 'Locations', type: 'tag', autocompleteField: 'locations' },
  StoryArc: { key: 'StoryArc', label: 'Story Arc', type: 'tag', autocompleteField: 'storyArcs' },
  AgeRating: { key: 'AgeRating', label: 'Age Rating', type: 'text' },
  Summary: { key: 'Summary', label: 'Summary', type: 'textarea' },
  Notes: { key: 'Notes', label: 'Notes', type: 'textarea' },
};

/** Field sections for accordion organization */
interface FieldSection {
  id: string;
  title: string;
  defaultExpanded: boolean;
  fields: string[];
}

/** Field sections for accordion organization (Issue Info is now in cover row) */
const FIELD_SECTIONS: FieldSection[] = [
  {
    id: 'description',
    title: 'Description',
    defaultExpanded: true,
    fields: ['Summary', 'Notes'],
  },
  {
    id: 'publication',
    title: 'Publication',
    defaultExpanded: false,
    fields: ['Year', 'Month', 'Day', 'Publisher'],
  },
  {
    id: 'credits',
    title: 'Credits',
    defaultExpanded: false,
    fields: ['Writer', 'Penciller', 'Inker', 'Colorist', 'Letterer', 'CoverArtist'],
  },
  {
    id: 'content',
    title: 'Content & Tags',
    defaultExpanded: false,
    fields: ['Genre', 'Tags', 'Characters', 'Teams', 'Locations', 'StoryArc', 'AgeRating'],
  },
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
  const [lockedFields, setLockedFields] = useState<string[]>([]);

  // Accordion sections state
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(FIELD_SECTIONS.filter((s) => s.defaultExpanded).map((s) => s.id))
  );

  // Cover modal state
  const [isCoverModalOpen, setIsCoverModalOpen] = useState(false);

  // Internal state for metadata grabbing (when onGrabMetadata is not provided)
  const [isInternalGrabbing, setIsInternalGrabbing] = useState(false);

  // State for changing series
  const [isChangingSeriesOpen, setIsChangingSeriesOpen] = useState(false);

  // State for CBR conversion
  const [isCbrFile, setIsCbrFile] = useState(false);
  const [converting, setConverting] = useState(false);

  // Get the file ID - use first element for single file editing
  const fileId = fileIds[0];

  // Load metadata and cover info
  useEffect(() => {
    if (fileId) {
      setLoading(true);
      setError(null);

      Promise.all([getComicInfo(fileId), getFileCoverInfo(fileId).catch(() => null)])
        .then(([metadataResponse, coverInfoResponse]) => {
          setMetadata(metadataResponse.comicInfo || {});
          setOriginalMetadata(metadataResponse.comicInfo || {});
          setFilename(metadataResponse.filename);
          setLockedFields(metadataResponse.lockedFields || []);

          // Check if this is a CBR file (no ComicInfo.xml support)
          const isCbr = metadataResponse.filename?.toLowerCase().endsWith('.cbr') || false;
          setIsCbrFile(isCbr);

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
      const allKeys = new Set([...Object.keys(metadata), ...Object.keys(originalMetadata)]) as Set<EditableField>;

      for (const key of allKeys) {
        const currentValue = metadata[key];
        const originalValue = originalMetadata[key];

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

  // Reload metadata from server
  const reloadMetadata = useCallback(async () => {
    if (!fileId) return;

    try {
      const response = await getComicInfo(fileId);
      setMetadata(response.comicInfo || {});
      setOriginalMetadata(response.comicInfo || {});
      setFilename(response.filename);
      setLockedFields(response.lockedFields || []);

      // Update CBR status
      const isCbr = response.filename?.toLowerCase().endsWith('.cbr') || false;
      setIsCbrFile(isCbr);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reload metadata');
    }
  }, [fileId]);

  // Handle "Grab from API" button click
  const handleGrabClick = useCallback(() => {
    if (onGrabMetadata) {
      onGrabMetadata();
    } else {
      setIsInternalGrabbing(true);
    }
  }, [onGrabMetadata]);

  // Handle cover change from the picker
  const handleCoverUpdate = useCallback(
    (result: { source: 'auto' | 'page' | 'custom'; pageIndex?: number; coverHash?: string }) => {
      setCoverInfo((prev) => ({
        id: prev?.id || '',
        coverSource: result.source,
        coverPageIndex: result.pageIndex ?? null,
        coverHash: result.coverHash ?? null,
        coverUrl: null,
      }));
      setCoverKey((k) => k + 1);
      onCoverChange?.(result);
    },
    [onCoverChange]
  );

  // Get cover URL based on cover info
  const getCoverDisplayUrl = useCallback(() => {
    if (!fileId) return '';
    // For page or custom covers, use the coverHash from series covers cache
    if ((coverInfo?.coverSource === 'page' || coverInfo?.coverSource === 'custom') && coverInfo?.coverHash) {
      return `${getApiCoverUrl(coverInfo.coverHash)}?v=${coverKey}`;
    }
    // For auto covers, use the file's default cover
    return `${getCoverUrl(fileId)}?v=${coverKey}`;
  }, [fileId, coverInfo, coverKey]);

  // Toggle section expansion
  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  // Handle CBR to CBZ conversion
  const handleConvertToCbz = useCallback(async () => {
    if (!fileId) return;

    setConverting(true);
    setError(null);

    try {
      await convertFile(fileId);
      // Reload metadata after conversion - file ID should remain the same
      await reloadMetadata();
      // Refresh cover
      setCoverKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to convert file');
    } finally {
      setConverting(false);
    }
  }, [fileId, reloadMetadata]);

  // Count filled fields in a section
  const getFilledFieldCount = (fields: string[]): number => {
    return fields.filter((fieldKey) => {
      const value = metadata[fieldKey as EditableField];
      return value !== undefined && value !== '' && value !== REMOVE_FIELD;
    }).length;
  };

  // Render a single form field
  const renderField = (fieldKey: string) => {
    const config = FIELD_CONFIGS[fieldKey];
    if (!config) return null;

    const { key, label, type, autocompleteField } = config;
    const rawValue = metadata[key];
    const displayValue = rawValue === REMOVE_FIELD ? '' : rawValue;
    const isLocked = lockedFields.includes(key);
    const hint = FIELD_HINTS[key];

    return (
      <div key={key} className={`form-field ${type === 'textarea' ? 'full-width' : ''} ${isLocked ? 'form-field--locked' : ''}`}>
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
              value={(displayValue as string) || ''}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              rows={3}
              disabled={isLocked}
            />
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
              value={(displayValue as number) ?? ''}
              onChange={(e) => handleFieldChange(key, e.target.value ? parseInt(e.target.value, 10) : undefined)}
              disabled={isLocked}
            />
            {hint && <span className="field-hint">{hint}</span>}
          </>
        ) : type === 'tag' ? (
          <SimpleTagInput
            id={`field-${key}`}
            value={(displayValue as string) || ''}
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
              value={(displayValue as string) || ''}
              onChange={(e) => handleFieldChange(key, e.target.value)}
              disabled={isLocked}
            />
            {hint && <span className="field-hint">{hint}</span>}
          </>
        )}
      </div>
    );
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
      {/* Converting overlay */}
      {converting && (
        <div className="metadata-editor-converting">
          <div className="converting-spinner" />
          <div className="converting-text">Converting to CBZ...</div>
        </div>
      )}

      {/* Header */}
      <div className="metadata-editor-header">
        <h2>Edit Metadata</h2>
        <div className="metadata-editor-header-actions">
          <button className="btn-ghost btn-sm" onClick={() => setIsChangingSeriesOpen(true)} title="Move file to a different series">
            Change Series
          </button>
          <button className="btn-ghost btn-sm" onClick={handleGrabClick} title="Fetch metadata from API">
            Grab from API
          </button>
          {onClose && (
            <button className="btn-icon" onClick={onClose} title="Close">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Warning banner for CBR files */}
      {isCbrFile && (
        <div className="metadata-editor-warning">
          <span className="warning-icon">⚠️</span>
          <span className="warning-text">This archive does not contain a ComicInfo.xml file. Convert to CBZ to enable metadata editing.</span>
          <button className="btn-warning-action" onClick={handleConvertToCbz} disabled={converting}>
            {converting ? 'Converting...' : 'Convert to CBZ'}
          </button>
        </div>
      )}

      {/* Error message */}
      {error && <div className="error-message">{error}</div>}

      {/* Main content */}
      <div className="metadata-editor-content accordion-layout">
        {/* Combined Cover + Issue Info section */}
        {fileId && (
          <div className="metadata-cover-row">
            <div className="metadata-cover-preview">
              <img
                src={getCoverDisplayUrl()}
                alt={filename}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <button className="btn-edit-cover" onClick={() => setIsCoverModalOpen(true)}>
                Edit Cover
              </button>
            </div>
            <div className="metadata-issue-info">
              <div className="filename">{filename}</div>
              <div className="issue-info-row">
                <div className="form-field issue-field-series">
                  {renderField('Series')}
                </div>
                <div className="form-field issue-field-number">
                  {renderField('Number')}
                </div>
              </div>
              <div className="issue-info-row">
                <div className="form-field issue-field-title">
                  {renderField('Title')}
                </div>
                <div className="form-field issue-field-volume">
                  {renderField('Volume')}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Accordion sections */}
        <div className="metadata-form">
          {FIELD_SECTIONS.map((section) => {
            const isExpanded = expandedSections.has(section.id);
            const filledCount = getFilledFieldCount(section.fields);

            return (
              <div key={section.id} className={`metadata-field-section ${isExpanded ? 'expanded' : ''}`}>
                <button
                  type="button"
                  className="metadata-field-section-header"
                  onClick={() => toggleSection(section.id)}
                  aria-expanded={isExpanded}
                >
                  <span className="section-title">{section.title}</span>
                  {filledCount > 0 && <span className="section-badge">{filledCount}</span>}
                  <span className="section-chevron">▼</span>
                </button>
                <div className="metadata-field-section-content">
                  <div className="content-inner">
                    <div className="fields-wrapper">
                      <div className="metadata-fields-grid">{section.fields.map((fieldKey) => renderField(fieldKey))}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="metadata-editor-footer">
        <button className="btn-secondary" onClick={handleReset} disabled={saving}>
          Reset
        </button>
        <div className="footer-right">
          {onClose && (
            <button className="btn-ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
          )}
          <button className="btn-primary" onClick={handleSave} disabled={saving || !hasChanges()}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Cover Editor Modal */}
      {fileId && (
        <CoverEditorModal
          isOpen={isCoverModalOpen}
          fileId={fileId}
          currentCoverSource={(coverInfo?.coverSource as 'auto' | 'page' | 'custom') || 'auto'}
          currentCoverPageIndex={coverInfo?.coverPageIndex ?? null}
          currentCoverHash={coverInfo?.coverHash ?? null}
          onClose={() => setIsCoverModalOpen(false)}
          onCoverChange={handleCoverUpdate}
        />
      )}

      {/* Internal Metadata Grabber Modal */}
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

      {/* Change Series Modal */}
      {fileId && (
        <LocalSeriesSearchModal
          isOpen={isChangingSeriesOpen}
          onClose={() => setIsChangingSeriesOpen(false)}
          fileIds={[fileId]}
          currentSeriesId={null}
          currentSeriesName={(metadata.Series as string) || null}
          onSuccess={() => {
            setIsChangingSeriesOpen(false);
            reloadMetadata();
            onSave?.();
          }}
        />
      )}
    </div>
  );
}
