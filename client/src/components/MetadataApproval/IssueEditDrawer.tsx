/**
 * IssueEditDrawer Component
 *
 * A slide-out drawer for editing issue metadata during the file review step.
 * Displays all ComicInfo.xml fields organized in collapsible sections.
 * Supports showing field source information when metadata comes from multiple sources.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { FileChange, FieldChange, MetadataSource } from '../../services/api.service';
import { FieldSection } from './FieldSection';
import { EditableField } from './EditableField';
import { TagChipsInput } from './TagChipsInput';
import './IssueEditDrawer.css';

const SOURCE_LABELS: Record<MetadataSource, string> = {
  comicvine: 'ComicVine',
  metron: 'Metron',
  gcd: 'GCD',
  anilist: 'AniList',
  mal: 'MAL',
};

const SOURCE_COLORS: Record<MetadataSource, string> = {
  comicvine: '#f05050',
  metron: '#4a90d9',
  gcd: '#4caf50',
  anilist: '#02a9ff',
  mal: '#4e74c9',
};

// Field definition type
type FieldDef = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'select' | 'tags';
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
};

// All ComicInfo.xml fields organized by section
// Keys must match the server-side field names (camelCase)
const FIELD_SECTIONS = {
  basicInfo: {
    title: 'Basic Info',
    icon: '\u{1F4D6}', // book
    fields: [
      { key: 'title', label: 'Title', type: 'text' as const },
      { key: 'series', label: 'Series', type: 'text' as const },
      { key: 'number', label: 'Number', type: 'text' as const },
      { key: 'volume', label: 'Volume', type: 'number' as const },
      { key: 'alternateSeries', label: 'Alternate Series', type: 'text' as const },
      { key: 'alternateNumber', label: 'Alternate Number', type: 'text' as const },
      { key: 'alternateCount', label: 'Alternate Count', type: 'number' as const },
      { key: 'summary', label: 'Summary', type: 'textarea' as const },
      { key: 'notes', label: 'Notes', type: 'textarea' as const },
    ],
  },
  dates: {
    title: 'Dates',
    icon: '\u{1F4C5}', // calendar
    fields: [
      { key: 'year', label: 'Year', type: 'number' as const, min: 1800, max: 2100 },
      { key: 'month', label: 'Month', type: 'number' as const, min: 1, max: 12 },
      { key: 'day', label: 'Day', type: 'number' as const, min: 1, max: 31 },
    ],
  },
  credits: {
    title: 'Credits',
    icon: '\u{270F}\u{FE0F}', // pencil
    fields: [
      { key: 'writer', label: 'Writer', type: 'text' as const },
      { key: 'penciller', label: 'Penciller', type: 'text' as const },
      { key: 'inker', label: 'Inker', type: 'text' as const },
      { key: 'colorist', label: 'Colorist', type: 'text' as const },
      { key: 'letterer', label: 'Letterer', type: 'text' as const },
      { key: 'coverArtist', label: 'Cover Artist', type: 'text' as const },
      { key: 'editor', label: 'Editor', type: 'text' as const },
      { key: 'translator', label: 'Translator', type: 'text' as const },
    ],
  },
  content: {
    title: 'Content',
    icon: '\u{1F9B8}', // superhero
    fields: [
      { key: 'characters', label: 'Characters', type: 'tags' as const },
      { key: 'teams', label: 'Teams', type: 'tags' as const },
      { key: 'locations', label: 'Locations', type: 'tags' as const },
      { key: 'storyArc', label: 'Story Arc', type: 'tags' as const },
      { key: 'storyArcNumber', label: 'Story Arc Number', type: 'text' as const },
    ],
  },
  publishing: {
    title: 'Publishing',
    icon: '\u{1F4DA}', // books
    fields: [
      { key: 'publisher', label: 'Publisher', type: 'text' as const },
      { key: 'imprint', label: 'Imprint', type: 'text' as const },
      { key: 'genre', label: 'Genre', type: 'tags' as const },
      { key: 'tags', label: 'Tags', type: 'tags' as const },
      { key: 'format', label: 'Format', type: 'text' as const },
      { key: 'pageCount', label: 'Page Count', type: 'number' as const, min: 0 },
      { key: 'languageISO', label: 'Language (ISO)', type: 'text' as const },
      { key: 'web', label: 'Web URL', type: 'text' as const },
      { key: 'gtin', label: 'GTIN/ISBN', type: 'text' as const },
    ],
  },
  ratings: {
    title: 'Ratings',
    icon: '\u{2B50}', // star
    fields: [
      {
        key: 'ageRating',
        label: 'Age Rating',
        type: 'select' as const,
        options: [
          { value: 'Unknown', label: 'Unknown' },
          { value: 'Adults Only 18+', label: 'Adults Only 18+' },
          { value: 'Early Childhood', label: 'Early Childhood' },
          { value: 'Everyone', label: 'Everyone' },
          { value: 'Everyone 10+', label: 'Everyone 10+' },
          { value: 'G', label: 'G' },
          { value: 'Kids to Adults', label: 'Kids to Adults' },
          { value: 'M', label: 'M' },
          { value: 'MA15+', label: 'MA15+' },
          { value: 'Mature 17+', label: 'Mature 17+' },
          { value: 'PG', label: 'PG' },
          { value: 'R18+', label: 'R18+' },
          { value: 'Rating Pending', label: 'Rating Pending' },
          { value: 'Teen', label: 'Teen' },
          { value: 'X18+', label: 'X18+' },
        ],
      },
      {
        key: 'manga',
        label: 'Manga',
        type: 'select' as const,
        options: [
          { value: '', label: 'Not Set' },
          { value: 'Yes', label: 'Yes' },
          { value: 'No', label: 'No' },
          { value: 'YesAndRightToLeft', label: 'Yes (Right to Left)' },
        ],
      },
      {
        key: 'blackAndWhite',
        label: 'Black & White',
        type: 'select' as const,
        options: [
          { value: '', label: 'Not Set' },
          { value: 'Yes', label: 'Yes' },
          { value: 'No', label: 'No' },
          { value: 'Unknown', label: 'Unknown' },
        ],
      },
      { key: 'communityRating', label: 'Community Rating', type: 'number' as const, min: 0, max: 5, step: 0.5 },
      { key: 'review', label: 'Review', type: 'textarea' as const },
    ],
  },
  scanInfo: {
    title: 'Scan Info',
    icon: '\u{1F50D}', // magnifying glass
    fields: [
      { key: 'scanInformation', label: 'Scan Information', type: 'text' as const },
      { key: 'seriesGroup', label: 'Series Group', type: 'text' as const },
      { key: 'count', label: 'Total Count', type: 'number' as const, min: 0 },
    ],
  },
};

/**
 * Check if a value is effectively empty (null, undefined, or empty string)
 */
function isEmptyValue(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

/**
 * Check if a field change is a meaningful change (not empty-to-empty)
 */
function hasMeaningfulChange(proposed: unknown, current: unknown): boolean {
  if (isEmptyValue(proposed) && isEmptyValue(current)) {
    return false;
  }
  return proposed !== current;
}

interface IssueEditDrawerProps {
  fileChange: FileChange | null;
  isOpen: boolean;
  onClose: () => void;
  onFieldUpdate: (
    fileId: string,
    fieldUpdates: Record<string, { approved?: boolean; editedValue?: string | number | null }>
  ) => Promise<void>;
  onAcceptAll: (fileId: string) => Promise<void>;
  onSwitchMatch: (fileId: string) => void;
  onReject: (fileId: string) => Promise<void>;
  /** Callback to move file to a different series group (only shown when provided) */
  onMoveToSeriesGroup?: (fileId: string) => void;
  disabled?: boolean;
  /** Optional field sources showing which provider each field came from */
  fieldSources?: Record<string, MetadataSource>;
  /** Whether to show source badges next to field values */
  showFieldSources?: boolean;
}

export function IssueEditDrawer({
  fileChange,
  isOpen,
  onClose,
  onFieldUpdate,
  onAcceptAll,
  onSwitchMatch,
  onReject,
  onMoveToSeriesGroup,
  disabled = false,
  fieldSources,
  showFieldSources = false,
}: IssueEditDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [pendingUpdates, setPendingUpdates] = useState<
    Record<string, { editedValue?: string | number | null }>
  >({});
  const [isSaving, setIsSaving] = useState(false);

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node) && isOpen) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Reset pending updates when file changes
  useEffect(() => {
    setPendingUpdates({});
  }, [fileChange?.fileId]);

  // Save pending updates when drawer closes
  useEffect(() => {
    if (!isOpen && Object.keys(pendingUpdates).length > 0 && fileChange) {
      savePendingUpdates();
    }
  }, [isOpen]);

  const savePendingUpdates = async () => {
    if (!fileChange || Object.keys(pendingUpdates).length === 0) return;

    setIsSaving(true);
    try {
      await onFieldUpdate(fileChange.fileId, pendingUpdates);
      setPendingUpdates({});
    } catch (error) {
      console.error('Failed to save field updates:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFieldChange = useCallback((fieldKey: string, value: string | number | null) => {
    setPendingUpdates((prev) => ({
      ...prev,
      [fieldKey]: { editedValue: value },
    }));
  }, []);

  // Get field change with pending updates applied
  const getFieldChange = (fieldKey: string): FieldChange | undefined => {
    const original = fileChange?.fields[fieldKey];
    const pending = pendingUpdates[fieldKey];

    if (!original && !pending) return undefined;

    if (pending) {
      return {
        current: original?.current ?? null,
        proposed: original?.proposed ?? null,
        approved: original?.approved ?? false,
        edited: true,
        // Preserve null values (user cleared field) - convert null to undefined for type safety
        editedValue: pending.editedValue ?? undefined,
      };
    }

    return original;
  };

  // Count changes in a section (excluding empty-to-empty)
  const countSectionChanges = (fields: FieldDef[]): number => {
    return fields.reduce((count, field) => {
      const fc = getFieldChange(field.key);
      if (fc && (hasMeaningfulChange(fc.proposed, fc.current) || fc.edited)) {
        return count + 1;
      }
      return count;
    }, 0);
  };

  const formatConfidence = (confidence: number): string => {
    return `${Math.round(confidence * 100)}%`;
  };

  const getConfidenceClass = (confidence: number): string => {
    if (confidence >= 0.8) return 'confidence-high';
    if (confidence >= 0.5) return 'confidence-medium';
    return 'confidence-low';
  };

  const getStatusClass = (status: string): string => {
    switch (status) {
      case 'matched':
        return 'status-matched';
      case 'manual':
        return 'status-manual';
      case 'rejected':
        return 'status-rejected';
      default:
        return 'status-unmatched';
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'matched':
        return 'Matched';
      case 'manual':
        return 'Manual';
      case 'rejected':
        return 'Rejected';
      default:
        return 'Unmatched';
    }
  };

  if (!fileChange) return null;

  // Render source badge for a field
  const renderSourceBadge = (fieldKey: string) => {
    if (!showFieldSources || !fieldSources) return null;
    const source = fieldSources[fieldKey];
    if (!source) return null;

    return (
      <span
        className="field-source-badge"
        style={{ backgroundColor: SOURCE_COLORS[source] }}
        title={`Data from ${SOURCE_LABELS[source]}`}
      >
        {source === 'comicvine' ? 'CV' : source === 'metron' ? 'MT' : 'GCD'}
      </span>
    );
  };

  const renderField = (field: {
    key: string;
    label: string;
    type: 'text' | 'number' | 'textarea' | 'select' | 'tags';
    options?: { value: string; label: string }[];
    min?: number;
    max?: number;
    step?: number;
  }) => {
    const fieldChangeData = getFieldChange(field.key);
    const sourceBadge = renderSourceBadge(field.key);

    if (field.type === 'tags') {
      return (
        <div key={field.key} className="field-with-source">
          <TagChipsInput
            label={field.label}
            fieldKey={field.key}
            fieldChange={fieldChangeData}
            onChange={(value) => handleFieldChange(field.key, value)}
            disabled={disabled}
          />
          {sourceBadge}
        </div>
      );
    }

    return (
      <div key={field.key} className="field-with-source">
        <EditableField
          label={field.label}
          fieldKey={field.key}
          fieldChange={fieldChangeData}
          type={field.type}
          options={field.options}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(value) => handleFieldChange(field.key, value)}
          disabled={disabled}
        />
        {sourceBadge}
      </div>
    );
  };

  const handleAcceptAll = async () => {
    // Save any pending updates first
    if (Object.keys(pendingUpdates).length > 0) {
      await savePendingUpdates();
    }
    await onAcceptAll(fileChange.fileId);
    // Close the drawer after accepting all
    onClose();
  };

  const handleReject = async () => {
    await onReject(fileChange.fileId);
  };

  const handleSwitchMatch = () => {
    onSwitchMatch(fileChange.fileId);
  };

  const handleMoveToSeriesGroup = () => {
    if (onMoveToSeriesGroup) {
      onMoveToSeriesGroup(fileChange.fileId);
    }
  };

  return (
    <div className={`issue-edit-drawer-overlay ${isOpen ? 'open' : ''}`}>
      <div ref={drawerRef} className={`issue-edit-drawer ${isOpen ? 'open' : ''}`}>
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-title-section">
            <h2 className="drawer-title" title={fileChange.filename}>
              {fileChange.filename}
            </h2>
            <div className="drawer-meta">
              <span className={`status-badge ${getStatusClass(fileChange.status)}`}>
                {getStatusLabel(fileChange.status)}
              </span>
              {fileChange.matchConfidence > 0 && (
                <span className={`confidence-badge ${getConfidenceClass(fileChange.matchConfidence)}`}>
                  {formatConfidence(fileChange.matchConfidence)} match
                </span>
              )}
            </div>
          </div>
          <button className="drawer-close" onClick={onClose} title="Close">
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="drawer-content">
          {/* Match Info */}
          {fileChange.matchedIssue && (
            <div className="match-info-section">
              <div className="match-info-header">
                <span className="match-source-badge">{fileChange.matchedIssue.source}</span>
                <span className="match-issue-info">
                  #{fileChange.matchedIssue.number}
                  {fileChange.matchedIssue.title && ` - ${fileChange.matchedIssue.title}`}
                </span>
              </div>
              {fileChange.matchedIssue.coverDate && (
                <div className="match-cover-date">
                  Cover Date: {fileChange.matchedIssue.coverDate}
                </div>
              )}
            </div>
          )}

          {/* Field Sections */}
          {Object.entries(FIELD_SECTIONS).map(([sectionKey, section]) => (
            <FieldSection
              key={sectionKey}
              title={section.title}
              icon={section.icon}
              defaultExpanded={sectionKey === 'basicInfo'}
              changeCount={countSectionChanges(section.fields)}
            >
              <div className="fields-grid">
                {section.fields.map(renderField)}
              </div>
            </FieldSection>
          ))}
        </div>

        {/* Footer */}
        <div className="drawer-footer">
          <div className="footer-left">
            <button
              className="btn-ghost"
              onClick={handleSwitchMatch}
              disabled={disabled}
            >
              Switch Match
            </button>
            {onMoveToSeriesGroup && (
              <button
                className="btn-ghost"
                onClick={handleMoveToSeriesGroup}
                disabled={disabled}
                title="Move this file to a different series group"
              >
                Move to Series
              </button>
            )}
            <button
              className="btn-danger-ghost"
              onClick={handleReject}
              disabled={disabled || fileChange.status === 'rejected'}
            >
              Reject
            </button>
          </div>
          <div className="footer-right">
            <button
              className="btn-ghost"
              onClick={onClose}
            >
              Close
            </button>
            <button
              className="btn-primary"
              onClick={handleAcceptAll}
              disabled={disabled || isSaving}
            >
              {isSaving ? 'Saving...' : 'Accept All'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default IssueEditDrawer;
