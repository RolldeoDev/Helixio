/**
 * MergedMetadataModal Component
 *
 * Displays a comparison of series metadata from multiple sources with
 * an auto-merged preview. Shows which source provided each field via tooltips.
 * User can now select which source to use for each field (interactive mode).
 * User approves the merged result before continuing.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  type SeriesMatch,
  type MergedSeriesMetadata,
  type AllValuesSeriesMetadata,
  type MetadataSource,
  type SeriesCredit,
} from '../../services/api.service';
import { FieldSourceSelector } from './FieldSourceSelector';
import './MergedMetadataModal.css';

interface MergedMetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: (merged: MergedSeriesMetadata) => void;
  /** Results from each source (may be null if source had no match) */
  sourceResults: Record<MetadataSource, SeriesMatch | null>;
  /** The auto-merged preview (can be AllValuesSeriesMetadata for per-field selection) */
  mergedPreview: MergedSeriesMetadata | AllValuesSeriesMetadata;
  /** Loading state while fetching from sources */
  isLoading?: boolean;
  /** Enable interactive per-field source selection */
  interactive?: boolean;
}

const SOURCE_LABELS: Record<MetadataSource, string> = {
  comicvine: 'ComicVine',
  metron: 'Metron',
  gcd: 'GCD',
};

const SOURCE_COLORS: Record<MetadataSource, string> = {
  comicvine: '#f05050',
  metron: '#4a90d9',
  gcd: '#4caf50',
};

export function MergedMetadataModal({
  isOpen,
  onClose,
  onAccept,
  sourceResults,
  mergedPreview,
  isLoading = false,
  interactive = false,
}: MergedMetadataModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // State for per-field source overrides (only used in interactive mode)
  const [fieldSourceOverrides, setFieldSourceOverrides] = useState<Record<string, MetadataSource>>({});
  const [lockedFields, setLockedFields] = useState<Set<string>>(new Set());

  // Check if we have allFieldValues for interactive mode
  const hasAllFieldValues = 'allFieldValues' in mergedPreview && mergedPreview.allFieldValues !== undefined;

  // Reset overrides when modal opens with new data
  useEffect(() => {
    if (isOpen) {
      setFieldSourceOverrides({});
      setLockedFields(new Set());
    }
  }, [isOpen, mergedPreview.sourceId]);

  // Handle source change for a field
  const handleFieldSourceChange = useCallback((fieldName: string, source: MetadataSource) => {
    setFieldSourceOverrides(prev => ({
      ...prev,
      [fieldName]: source,
    }));
  }, []);

  // Handle lock toggle for a field
  const handleLockToggle = useCallback((fieldName: string) => {
    setLockedFields(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fieldName)) {
        newSet.delete(fieldName);
      } else {
        newSet.add(fieldName);
      }
      return newSet;
    });
  }, []);

  // Compute final merged result with user overrides
  const finalMerged = useMemo((): MergedSeriesMetadata => {
    if (!interactive || !hasAllFieldValues || Object.keys(fieldSourceOverrides).length === 0) {
      return mergedPreview;
    }

    const allValues = (mergedPreview as AllValuesSeriesMetadata).allFieldValues;
    const result = { ...mergedPreview } as MergedSeriesMetadata & Record<string, unknown>;

    // Apply field source overrides
    for (const [fieldName, source] of Object.entries(fieldSourceOverrides)) {
      if (allValues[fieldName] && allValues[fieldName][source] !== undefined) {
        result[fieldName] = allValues[fieldName][source];
        result.fieldSources = {
          ...result.fieldSources,
          [fieldName]: source,
        };
      }
    }

    // Update contributing sources
    const uniqueSources = new Set(Object.values(result.fieldSources));
    result.contributingSources = Array.from(uniqueSources) as MetadataSource[];

    return result;
  }, [interactive, hasAllFieldValues, mergedPreview, fieldSourceOverrides]);

  // Get effective field source (considering overrides)
  const getEffectiveFieldSource = useCallback((fieldName: string): MetadataSource | undefined => {
    return fieldSourceOverrides[fieldName] || mergedPreview.fieldSources[fieldName];
  }, [fieldSourceOverrides, mergedPreview.fieldSources]);

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

  if (!isOpen) return null;

  const sources = Object.keys(sourceResults) as MetadataSource[];

  // Helper to build allValues for FieldSourceSelector from source results
  const buildAllValuesForField = (fieldName: string): Partial<Record<MetadataSource, unknown>> => {
    const values: Partial<Record<MetadataSource, unknown>> = {};
    for (const source of sources) {
      const data = sourceResults[source];
      if (data) {
        const value = (data as unknown as Record<string, unknown>)[fieldName];
        if (value !== null && value !== undefined && value !== '') {
          values[source] = value;
        }
      }
    }
    return values;
  };

  // Render an interactive field row with per-field source selection
  const renderInteractiveFieldRow = (
    label: string,
    fieldName: string,
    formatter?: (value: unknown) => string
  ): JSX.Element | null => {
    const allFieldValuesData = hasAllFieldValues
      ? (mergedPreview as AllValuesSeriesMetadata).allFieldValues
      : null;
    const fieldValues = allFieldValuesData?.[fieldName] || buildAllValuesForField(fieldName);
    const effectiveSource = getEffectiveFieldSource(fieldName) || 'comicvine';

    // Cast to the expected type for FieldSourceSelector
    const allValuesTyped = fieldValues as Record<MetadataSource, unknown>;

    return (
      <tr className="field-row interactive-field">
        <td className="field-label">{label}</td>
        <td className="field-selector" colSpan={sources.length + 1}>
          <FieldSourceSelector
            fieldName={fieldName}
            fieldLabel={label}
            allValues={allValuesTyped}
            selectedSource={effectiveSource}
            onSourceChange={(source) => handleFieldSourceChange(fieldName, source)}
            locked={lockedFields.has(fieldName)}
            onLockToggle={() => handleLockToggle(fieldName)}
            formatValue={formatter}
          />
        </td>
      </tr>
    );
  };

  const renderFieldRow = (
    label: string,
    fieldName: string,
    formatter?: (value: unknown) => string
  ): JSX.Element => {
    // Use interactive row if in interactive mode
    if (interactive) {
      return renderInteractiveFieldRow(label, fieldName, formatter) as JSX.Element;
    }

    const mergedValue = (finalMerged as unknown as Record<string, unknown>)[fieldName];
    const fieldSource = getEffectiveFieldSource(fieldName);

    return (
      <tr className="field-row">
        <td className="field-label">{label}</td>
        {sources.map((source) => {
          const data = sourceResults[source];
          const value = data ? (data as unknown as Record<string, unknown>)[fieldName] : null;
          const displayValue = formatter ? formatter(value) : formatValue(value);
          const isWinner = fieldSource === source;

          return (
            <td
              key={source}
              className={`field-value source-${source} ${isWinner ? 'winner' : ''}`}
            >
              {displayValue}
              {isWinner && <span className="winner-indicator" title="Selected">&#10003;</span>}
            </td>
          );
        })}
        <td
          className="field-value merged"
          title={fieldSource ? `From: ${SOURCE_LABELS[fieldSource]}` : 'No value'}
        >
          <span className="merged-value">
            {formatter ? formatter(mergedValue) : formatValue(mergedValue)}
          </span>
          {fieldSource && (
            <span
              className="source-badge"
              style={{ backgroundColor: SOURCE_COLORS[fieldSource] }}
              title={SOURCE_LABELS[fieldSource]}
            >
              {fieldSource === 'comicvine' ? 'CV' : fieldSource === 'metron' ? 'MT' : 'GCD'}
            </span>
          )}
        </td>
      </tr>
    );
  };

  const renderArrayFieldRow = (
    label: string,
    fieldName: string
  ): JSX.Element => {
    // Use interactive row if in interactive mode
    if (interactive) {
      return renderInteractiveFieldRow(label, fieldName, (value) => {
        const arr = value as unknown[] | undefined;
        return arr?.length ? `${arr.length} items` : '-';
      }) as JSX.Element;
    }

    const mergedValue = (finalMerged as unknown as Record<string, unknown>)[fieldName] as unknown[] | undefined;
    const fieldSource = getEffectiveFieldSource(fieldName);

    return (
      <tr className="field-row array-field">
        <td className="field-label">{label}</td>
        {sources.map((source) => {
          const data = sourceResults[source];
          const value = data ? (data as unknown as Record<string, unknown>)[fieldName] as unknown[] | undefined : null;
          const count = value?.length || 0;
          const isWinner = fieldSource === source;

          return (
            <td
              key={source}
              className={`field-value source-${source} ${isWinner ? 'winner' : ''}`}
            >
              {count > 0 ? `${count} items` : '-'}
              {isWinner && <span className="winner-indicator" title="Selected">&#10003;</span>}
            </td>
          );
        })}
        <td
          className="field-value merged"
          title={fieldSource ? `From: ${SOURCE_LABELS[fieldSource]}` : 'No value'}
        >
          <span className="merged-value">
            {mergedValue?.length ? `${mergedValue.length} items` : '-'}
          </span>
          {fieldSource && (
            <span
              className="source-badge"
              style={{ backgroundColor: SOURCE_COLORS[fieldSource] }}
              title={SOURCE_LABELS[fieldSource]}
            >
              {fieldSource === 'comicvine' ? 'CV' : fieldSource === 'metron' ? 'MT' : 'GCD'}
            </span>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="merged-modal-overlay">
      <div ref={modalRef} className="merged-modal">
        {/* Header */}
        <div className="merged-modal-header">
          <h2>Compare & Merge Metadata</h2>
          <button className="modal-close" onClick={onClose} title="Close">
            &times;
          </button>
        </div>

        {/* Content */}
        <div className="merged-modal-content">
          {isLoading ? (
            <div className="loading-state">
              <div className="spinner" />
              <p>Fetching metadata from all sources...</p>
            </div>
          ) : (
            <>
              {/* Series Title */}
              <div className="series-title-section">
                <h3>{mergedPreview.name}</h3>
                {mergedPreview.startYear && (
                  <span className="year">
                    ({mergedPreview.startYear}
                    {mergedPreview.endYear && mergedPreview.endYear !== mergedPreview.startYear
                      ? ` - ${mergedPreview.endYear}`
                      : ''}
                    )
                  </span>
                )}
              </div>

              {/* Source Status */}
              <div className="source-status">
                {sources.map((source) => {
                  const hasData = sourceResults[source] !== null;
                  return (
                    <span
                      key={source}
                      className={`source-status-badge ${hasData ? 'active' : 'inactive'}`}
                      style={{ borderColor: SOURCE_COLORS[source] }}
                    >
                      <span
                        className="source-dot"
                        style={{ backgroundColor: hasData ? SOURCE_COLORS[source] : '#666' }}
                      />
                      {SOURCE_LABELS[source]}
                      {hasData ? ' (found)' : ' (not found)'}
                    </span>
                  );
                })}
              </div>

              {/* Comparison Table */}
              <div className="comparison-table-wrapper">
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th className="field-header">Field</th>
                      {sources.map((source) => (
                        <th
                          key={source}
                          className={`source-header source-${source}`}
                          style={{ borderTopColor: SOURCE_COLORS[source] }}
                        >
                          {SOURCE_LABELS[source]}
                        </th>
                      ))}
                      <th className="merged-header">Merged Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {renderFieldRow('Publisher', 'publisher')}
                    {renderFieldRow('Start Year', 'startYear')}
                    {renderFieldRow('End Year', 'endYear')}
                    {renderFieldRow('Issue Count', 'issueCount')}
                    {renderFieldRow('Series Type', 'seriesType')}
                    {renderFieldRow('Volume', 'volume')}
                    {renderFieldRow('Description', 'description', truncateText)}
                    {renderFieldRow('Short Description', 'shortDescription', truncateText)}
                    {renderArrayFieldRow('Characters', 'characters')}
                    {renderArrayFieldRow('Creators', 'creators')}
                    {renderArrayFieldRow('Locations', 'locations')}
                    {renderArrayFieldRow('Aliases', 'aliases')}
                  </tbody>
                </table>
              </div>

              {/* Contributing Sources Summary */}
              <div className="contributing-summary">
                <p>
                  <strong>Data merged from:</strong>{' '}
                  {mergedPreview.contributingSources.map((s) => SOURCE_LABELS[s]).join(', ')}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="merged-modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          {interactive && Object.keys(fieldSourceOverrides).length > 0 && (
            <button
              className="btn-ghost"
              onClick={() => setFieldSourceOverrides({})}
            >
              Reset to Defaults
            </button>
          )}
          <button
            className="btn-primary"
            onClick={() => onAccept(finalMerged)}
            disabled={isLoading}
          >
            Use Merged Data
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value || '-';
  if (Array.isArray(value)) {
    if (value.length === 0) return '-';
    // Handle SeriesCredit arrays
    if (value[0] && typeof value[0] === 'object' && 'name' in value[0]) {
      return (value as SeriesCredit[]).map((c) => c.name).join(', ');
    }
    return value.join(', ');
  }
  return String(value);
}

function truncateText(value: unknown): string {
  const str = formatValue(value);
  if (str.length > 100) {
    return str.substring(0, 100) + '...';
  }
  return str;
}

export default MergedMetadataModal;
