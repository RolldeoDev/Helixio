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
  getPageThumbnailUrl,
  setFileCover,
  FileCoverInfo,
  REMOVE_FIELD,
  type TagFieldType,
  convertFile,
} from '../../services/api.service';

// Pending cover state for deferred save
interface PendingCover {
  source: 'auto' | 'page' | 'custom';
  pageIndex?: number;
  pagePath?: string;   // For preview URL
  url?: string;        // For URL mode preview
  coverHash?: string;  // For upload mode (already saved)
}
import { DescriptionGenerator } from '../DescriptionGenerator';
import { IssueMetadataGrabber } from '../IssueMetadataGrabber';
import { LocalSeriesSearchModal } from '../LocalSeriesSearchModal';
import { IssueMetadataGenerator, type IssueMetadataGeneratorCurrentValues } from '../IssueMetadataGenerator';
import { SimpleTagInput } from './SimpleTagInput';
import { BatchMetadataEditor } from './BatchMetadataEditor';
import { CoverEditorModal } from './CoverEditorModal';
import { RatingStars } from '../RatingStars';
import { useIssueUserData, useUpdateIssueUserData } from '../../hooks/queries';
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

  // Pending cover state for deferred save
  const [pendingCover, setPendingCover] = useState<PendingCover | null>(null);

  // Internal state for metadata grabbing (when onGrabMetadata is not provided)
  const [isInternalGrabbing, setIsInternalGrabbing] = useState(false);

  // State for changing series
  const [isChangingSeriesOpen, setIsChangingSeriesOpen] = useState(false);

  // State for CBR conversion
  const [isCbrFile, setIsCbrFile] = useState(false);
  const [converting, setConverting] = useState(false);

  // Get the file ID - use first element for single file editing
  const fileId = fileIds[0];

  // User data hooks for per-user rating and notes
  const { data: userDataResponse } = useIssueUserData(fileId);
  const updateUserData = useUpdateIssueUserData();
  const userData = userDataResponse?.data;

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
    return JSON.stringify(metadata) !== JSON.stringify(originalMetadata) || pendingCover !== null;
  };

  const handleSave = async () => {
    if (!hasChanges()) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Save pending cover if any (unless it was an upload which is already saved)
      if (pendingCover && !pendingCover.coverHash) {
        if (pendingCover.source === 'auto') {
          await setFileCover(fileId!, { source: 'auto' });
        } else if (pendingCover.source === 'page' && pendingCover.pageIndex !== undefined) {
          await setFileCover(fileId!, { source: 'page', pageIndex: pendingCover.pageIndex });
        } else if (pendingCover.source === 'custom' && pendingCover.url) {
          await setFileCover(fileId!, { source: 'custom', url: pendingCover.url });
        }

        // Refresh cover info after saving
        const newCoverInfo = await getFileCoverInfo(fileId!);
        setCoverInfo(newCoverInfo);
        setCoverKey((k) => k + 1);
        setPendingCover(null);
      }

      // Save metadata changes
      const changes: Partial<ComicInfo> = {};
      const allKeys = new Set([...Object.keys(metadata), ...Object.keys(originalMetadata)]) as Set<EditableField>;

      for (const key of allKeys) {
        const currentValue = metadata[key];
        const originalValue = originalMetadata[key];

        if (currentValue !== originalValue) {
          (changes as Record<string, unknown>)[key] = currentValue ?? REMOVE_FIELD;
        }
      }

      if (Object.keys(changes).length > 0) {
        await updateComicInfo(fileId!, changes);
      }

      onSave?.();
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setMetadata(originalMetadata);
    setPendingCover(null);
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

  // Handle cover change from the picker - store as pending
  const handleCoverUpdate = useCallback(
    (result: { source: 'auto' | 'page' | 'custom'; pageIndex?: number; pagePath?: string; url?: string; coverHash?: string }) => {
      // Store as pending change (will be saved on main Save button click)
      setPendingCover(result);

      // For upload mode, the cover is already saved, so update coverInfo
      if (result.coverHash) {
        setCoverInfo((prev) => ({
          id: prev?.id || '',
          coverSource: result.source,
          coverPageIndex: result.pageIndex ?? null,
          coverHash: result.coverHash ?? null,
          coverUrl: null,
        }));
        setCoverKey((k) => k + 1);
      }

      // Close modal
      setIsCoverModalOpen(false);

      // Notify parent if needed (for IssueDetailPage preview)
      onCoverChange?.(result);
    },
    [onCoverChange]
  );

  // Get cover URL based on cover info or pending cover
  const getCoverDisplayUrl = useCallback(() => {
    if (!fileId) return '';

    // If there's a pending cover change, preview it
    if (pendingCover) {
      switch (pendingCover.source) {
        case 'auto':
          return `${getCoverUrl(fileId)}?v=${coverKey}`;
        case 'page':
          if (pendingCover.pagePath) {
            return getPageThumbnailUrl(fileId, pendingCover.pagePath);
          }
          break;
        case 'custom':
          if (pendingCover.coverHash) {
            return `${getApiCoverUrl(pendingCover.coverHash)}?v=${coverKey}`;
          }
          if (pendingCover.url) {
            return pendingCover.url;
          }
          break;
      }
    }

    // Use current saved cover
    if ((coverInfo?.coverSource === 'page' || coverInfo?.coverSource === 'custom') && coverInfo?.coverHash) {
      return `${getApiCoverUrl(coverInfo.coverHash)}?v=${coverKey}`;
    }
    // For auto covers, use the file's default cover
    return `${getCoverUrl(fileId)}?v=${coverKey}`;
  }, [fileId, pendingCover, coverInfo, coverKey]);

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

  // Handle generated metadata from IssueMetadataGenerator
  const handleGeneratedMetadataApply = useCallback((updates: Partial<IssueMetadataGeneratorCurrentValues>) => {
    // Map generated fields to ComicInfo fields
    const fieldMapping: Record<keyof IssueMetadataGeneratorCurrentValues, EditableField> = {
      summary: 'Summary',
      deck: 'Notes', // Store deck in Notes field since ComicInfo doesn't have a dedicated deck field
      ageRating: 'AgeRating',
      genres: 'Genre',
      tags: 'Tags',
      characters: 'Characters',
      teams: 'Teams',
      locations: 'Locations',
    };

    // Apply each update to the metadata state
    Object.entries(updates).forEach(([key, value]) => {
      const comicInfoField = fieldMapping[key as keyof IssueMetadataGeneratorCurrentValues];
      if (comicInfoField && value !== null && value !== undefined) {
        handleFieldChange(comicInfoField, value as string);
      }
    });
  }, []);

  // Get current values for IssueMetadataGenerator
  const getGeneratorCurrentValues = useCallback((): IssueMetadataGeneratorCurrentValues => {
    const getValue = (field: EditableField): string | null => {
      const value = metadata[field];
      if (value === REMOVE_FIELD || value === undefined || value === '') return null;
      return String(value);
    };

    return {
      summary: getValue('Summary'),
      deck: getValue('Notes'), // Map deck from Notes field
      ageRating: getValue('AgeRating'),
      genres: getValue('Genre'),
      tags: getValue('Tags'),
      characters: getValue('Characters'),
      teams: getValue('Teams'),
      locations: getValue('Locations'),
    };
  }, [metadata]);

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
          {fileId && (
            <IssueMetadataGenerator
              fileId={fileId}
              issueName={metadata.Title || metadata.Series || filename}
              currentValues={getGeneratorCurrentValues()}
              onApply={handleGeneratedMetadataApply}
              disabled={saving || converting}
              isCbrFile={isCbrFile}
              onConvertToCbz={handleConvertToCbz}
            />
          )}
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

          {/* Your Data Section - User rating and notes */}
          <div className={`metadata-field-section ${expandedSections.has('userData') ? 'expanded' : ''}`}>
            <button
              type="button"
              className="metadata-field-section-header"
              onClick={() => toggleSection('userData')}
              aria-expanded={expandedSections.has('userData')}
            >
              <span className="section-title">Your Data</span>
              {(userData?.rating || userData?.privateNotes || userData?.publicReview) && (
                <span className="section-badge">✓</span>
              )}
              <span className="section-chevron">▼</span>
            </button>
            <div className="metadata-field-section-content">
              <div className="content-inner">
                <div className="fields-wrapper">
                  <div className="user-data-fields">
                    {/* Rating */}
                    <div className="user-data-field user-rating-field">
                      <label className="user-data-label">Your Rating</label>
                      <RatingStars
                        value={userData?.rating ?? null}
                        onChange={(rating) => {
                          if (fileId) {
                            updateUserData.mutate({ fileId, input: { rating } });
                          }
                        }}
                        size="large"
                        showValue
                        allowClear
                      />
                    </div>

                    {/* Private Notes - saves on blur to avoid excessive API calls */}
                    <div className="user-data-field full-width">
                      <label className="user-data-label">Private Notes</label>
                      <textarea
                        className="user-data-textarea"
                        defaultValue={userData?.privateNotes ?? ''}
                        onBlur={(e) => {
                          if (fileId) {
                            const value = e.target.value.trim() || null;
                            if (value !== (userData?.privateNotes ?? null)) {
                              updateUserData.mutate({ fileId, input: { privateNotes: value } });
                            }
                          }
                        }}
                        rows={3}
                        placeholder="Your personal notes (only visible to you)..."
                      />
                    </div>

                    {/* Public Review - saves on blur */}
                    <div className="user-data-field full-width">
                      <div className="user-data-label-row">
                        <label className="user-data-label">Review</label>
                        <label className="visibility-toggle">
                          <input
                            type="checkbox"
                            checked={userData?.reviewVisibility === 'public'}
                            onChange={(e) => {
                              if (fileId) {
                                updateUserData.mutate({
                                  fileId,
                                  input: { reviewVisibility: e.target.checked ? 'public' : 'private' }
                                });
                              }
                            }}
                          />
                          <span className="visibility-label">Public</span>
                        </label>
                      </div>
                      <textarea
                        className="user-data-textarea"
                        defaultValue={userData?.publicReview ?? ''}
                        onBlur={(e) => {
                          if (fileId) {
                            const value = e.target.value.trim() || null;
                            if (value !== (userData?.publicReview ?? null)) {
                              updateUserData.mutate({ fileId, input: { publicReview: value } });
                            }
                          }
                        }}
                        rows={4}
                        placeholder={userData?.reviewVisibility === 'public'
                          ? "Write a review (visible to others)..."
                          : "Write a review (currently private)..."}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
