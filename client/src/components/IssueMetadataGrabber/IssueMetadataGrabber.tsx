/**
 * IssueMetadataGrabber Component
 *
 * Modal for fetching and applying metadata for individual issues.
 * Workflow:
 * 1. Auto-search on open using existing file data
 * 2. Show search results for user selection
 * 3. Fetch full metadata for selected issue
 * 4. Show side-by-side comparison with field selection
 * 5. Apply selected changes to file
 */

import { useState, useEffect, useCallback } from 'react';
import {
  searchIssueMetadata,
  fetchIssueMetadataById,
  previewIssueMetadata,
  applyIssueMetadata,
  type IssueMatch,
  type IssueMetadata,
  type PreviewField,
  type MetadataSource,
} from '../../services/api.service';
import './IssueMetadataGrabber.css';

// =============================================================================
// Types
// =============================================================================

type ModalState = 'searching' | 'results' | 'no_results' | 'fetching' | 'comparison' | 'applying' | 'complete' | 'error';

interface IssueMetadataGrabberProps {
  fileId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function IssueMetadataGrabber({ fileId, onClose, onSuccess }: IssueMetadataGrabberProps) {
  // State
  const [state, setState] = useState<ModalState>('searching');
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSource, setSearchSource] = useState<MetadataSource | undefined>();

  // Search results
  const [results, setResults] = useState<IssueMatch[]>([]);
  const [selectedResult, setSelectedResult] = useState<IssueMatch | null>(null);
  const [, setUsedSource] = useState<MetadataSource>('comicvine');

  // Full metadata
  const [metadata, setMetadata] = useState<IssueMetadata | null>(null);
  const [previewFields, setPreviewFields] = useState<PreviewField[]>([]);
  const [, setLockedFields] = useState<string[]>([]);

  // Apply state
  const [applyProgress, setApplyProgress] = useState<string>('');

  // Lock body scroll when modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Auto-search on mount
  useEffect(() => {
    performSearch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search for issue metadata
  const performSearch = useCallback(async (query?: string, source?: MetadataSource) => {
    setState('searching');
    setError(null);

    try {
      const result = await searchIssueMetadata(fileId, { query, source });
      setResults(result.results);
      setUsedSource(result.source);

      if (result.results.length > 0) {
        setState('results');
      } else {
        setState('no_results');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      setError(message);
      setState('error');
    }
  }, [fileId]);

  // Handle manual search
  const handleManualSearch = useCallback(() => {
    performSearch(searchQuery || undefined, searchSource);
  }, [performSearch, searchQuery, searchSource]);

  // Select an issue from results
  const handleSelectIssue = useCallback(async (issue: IssueMatch) => {
    setSelectedResult(issue);
    setState('fetching');
    setError(null);

    try {
      // Fetch full metadata
      const { metadata: fullMetadata } = await fetchIssueMetadataById(fileId, issue.source, issue.id);
      setMetadata(fullMetadata);

      // Get preview with field diffs
      const preview = await previewIssueMetadata(fileId, fullMetadata, issue.source, issue.id);
      setPreviewFields(preview.fields);
      setLockedFields(preview.lockedFields);

      setState('comparison');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch issue details';
      setError(message);
      setState('error');
    }
  }, [fileId]);

  // Toggle field selection
  const handleToggleField = useCallback((fieldName: string) => {
    setPreviewFields((prev) =>
      prev.map((f) =>
        f.name === fieldName && !f.isLocked ? { ...f, selected: !f.selected } : f
      )
    );
  }, []);

  // Select all fields
  const handleSelectAll = useCallback(() => {
    setPreviewFields((prev) =>
      prev.map((f) => (f.hasChanged && !f.isLocked ? { ...f, selected: true } : f))
    );
  }, []);

  // Deselect all fields
  const handleDeselectAll = useCallback(() => {
    setPreviewFields((prev) =>
      prev.map((f) => (!f.isLocked ? { ...f, selected: false } : f))
    );
  }, []);

  // Apply changes
  const handleApply = useCallback(async () => {
    if (!metadata || !selectedResult) return;

    const selectedFieldNames = previewFields.filter((f) => f.selected).map((f) => f.name);
    if (selectedFieldNames.length === 0) {
      setError('No fields selected');
      return;
    }

    setState('applying');
    setApplyProgress('Applying metadata...');
    setError(null);

    try {
      const result = await applyIssueMetadata(
        fileId,
        metadata,
        selectedResult.source,
        selectedResult.id,
        selectedFieldNames,
        'keep' // Cover action - keep current for now
      );

      if (result.success) {
        if (result.converted) {
          setApplyProgress('File converted from CBR to CBZ and metadata applied.');
        } else {
          setApplyProgress('Metadata applied successfully.');
        }
        setState('complete');
      } else {
        setError(result.error || 'Failed to apply metadata');
        setState('error');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply metadata';
      setError(message);
      setState('error');
    }
  }, [fileId, metadata, selectedResult, previewFields]);

  // Handle close with success callback
  const handleClose = useCallback(() => {
    if (state === 'complete') {
      onSuccess?.();
    }
    onClose();
  }, [state, onSuccess, onClose]);

  // Go back to results
  const handleBackToResults = useCallback(() => {
    setSelectedResult(null);
    setMetadata(null);
    setPreviewFields([]);
    setState('results');
  }, []);

  // Render content based on state
  const renderContent = () => {
    switch (state) {
      case 'searching':
        return (
          <div className="grabber-searching">
            <div className="spinner" />
            <p>Searching for issue metadata...</p>
          </div>
        );

      case 'results':
        return (
          <div className="grabber-results">
            <div className="results-header">
              <h3>Search Results</h3>
              <span className="results-count">{results.length} matches found</span>
            </div>
            <div className="results-list">
              {results.map((result) => (
                <button
                  key={result.id}
                  className="result-item"
                  onClick={() => handleSelectIssue(result)}
                >
                  {result.coverUrl && (
                    <img
                      src={result.coverUrl}
                      alt=""
                      className="result-cover"
                    />
                  )}
                  <div className="result-info">
                    <div className="result-title">
                      {result.volumeName} #{result.issueNumber}
                    </div>
                    {result.title && (
                      <div className="result-issue-title">{result.title}</div>
                    )}
                    {result.coverDate && (
                      <div className="result-date">{result.coverDate}</div>
                    )}
                    <div className="result-confidence">
                      Confidence: {Math.round(result.confidence * 100)}%
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="results-actions">
              <button
                className="btn btn-ghost"
                onClick={() => setState('no_results')}
              >
                Search Different
              </button>
            </div>
          </div>
        );

      case 'no_results':
        return (
          <div className="grabber-no-results">
            <p>No matches found. Try a different search:</p>
            <div className="search-form">
              <input
                type="text"
                placeholder="Series name or issue title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
              />
              <select
                value={searchSource || ''}
                onChange={(e) => setSearchSource(e.target.value as MetadataSource || undefined)}
              >
                <option value="">Auto (use series link)</option>
                <option value="comicvine">ComicVine</option>
                <option value="metron">Metron</option>
              </select>
              <button
                className="btn btn-primary"
                onClick={handleManualSearch}
              >
                Search
              </button>
            </div>
          </div>
        );

      case 'fetching':
        return (
          <div className="grabber-fetching">
            <div className="spinner" />
            <p>Fetching issue details...</p>
          </div>
        );

      case 'comparison':
        return (
          <div className="grabber-comparison">
            <div className="comparison-header">
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleBackToResults}
              >
                &larr; Back to Results
              </button>
              <h3>
                {selectedResult?.volumeName} #{selectedResult?.issueNumber}
                {selectedResult?.title && ` - ${selectedResult.title}`}
              </h3>
            </div>

            <div className="comparison-actions">
              <button className="btn btn-ghost btn-sm" onClick={handleSelectAll}>
                Select All Changed
              </button>
              <button className="btn btn-ghost btn-sm" onClick={handleDeselectAll}>
                Deselect All
              </button>
            </div>

            <div className="field-list">
              {previewFields.map((field) => (
                <div
                  key={field.name}
                  className={`field-row ${field.isLocked ? 'locked' : ''} ${field.hasChanged ? 'changed' : ''}`}
                >
                  <label className="field-checkbox">
                    <input
                      type="checkbox"
                      checked={field.selected}
                      disabled={field.isLocked || !field.hasChanged}
                      onChange={() => handleToggleField(field.name)}
                    />
                    <span className="field-label">
                      {field.label}
                      {field.isLocked && <span className="lock-icon" title="Field is locked">🔒</span>}
                    </span>
                  </label>
                  <div className="field-values">
                    <div className="field-current">
                      <span className="value-label">Current:</span>
                      <span className="value-text">{field.current || <em>Empty</em>}</span>
                    </div>
                    <div className="field-proposed">
                      <span className="value-label">Proposed:</span>
                      <span className="value-text">{field.proposed || <em>Empty</em>}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="comparison-footer">
              <span className="selected-count">
                {previewFields.filter((f) => f.selected).length} fields selected
              </span>
              <button
                className="btn btn-primary"
                onClick={handleApply}
                disabled={previewFields.filter((f) => f.selected).length === 0}
              >
                Apply Changes
              </button>
            </div>
          </div>
        );

      case 'applying':
        return (
          <div className="grabber-applying">
            <div className="spinner" />
            <p>{applyProgress}</p>
          </div>
        );

      case 'complete':
        return (
          <div className="grabber-complete">
            <div className="success-icon">✓</div>
            <h3>Metadata Applied</h3>
            <p>{applyProgress}</p>
            <button className="btn btn-primary" onClick={handleClose}>
              Close
            </button>
          </div>
        );

      case 'error':
        return (
          <div className="grabber-error">
            <div className="error-icon">✕</div>
            <h3>Error</h3>
            <p>{error}</p>
            <div className="error-actions">
              <button className="btn btn-ghost" onClick={() => performSearch()}>
                Try Again
              </button>
              <button className="btn btn-primary" onClick={handleClose}>
                Close
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content grabber-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Grab Issue Metadata</h2>
          <div className="modal-header-actions">
            <button
              className="btn-close"
              onClick={handleClose}
              title="Close"
              disabled={state === 'applying'}
            >
              ×
            </button>
          </div>
        </div>

        <div className="grabber-body">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
