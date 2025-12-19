/**
 * CoverPicker Component
 *
 * Cover selection component with three modes:
 * - API Cover: Use the cover URL from metadata API (locally cached)
 * - Select from Issues: Choose a cover from owned issues
 * - Custom URL: Enter a custom cover image URL
 */

import { useState, useCallback, useEffect } from 'react';
import { getCoverUrl, getApiCoverUrl, SeriesIssue } from '../../services/api.service';

export type CoverMode = 'api' | 'issue' | 'url';

interface CoverPickerProps {
  currentCoverSource: 'api' | 'user' | 'auto';
  currentCoverUrl: string | null;
  currentCoverHash: string | null;  // Hash for locally cached API cover
  currentCoverFileId: string | null;
  issues: SeriesIssue[];
  onCoverChange: (source: 'api' | 'user' | 'auto', fileId: string | null, url: string | null) => void;
  disabled?: boolean;
}

export function CoverPicker({
  currentCoverSource,
  currentCoverUrl,
  currentCoverHash,
  currentCoverFileId,
  issues,
  onCoverChange,
  disabled = false,
}: CoverPickerProps) {
  // Determine initial mode from current source
  const getInitialMode = (): CoverMode => {
    // If user selected an issue cover, that's 'issue' mode
    if (currentCoverSource === 'user' && currentCoverFileId) return 'issue';
    // If source is 'api' or we have an API cover cached, that's 'api' mode
    if (currentCoverSource === 'api' || currentCoverHash) return 'api';
    // If user has a custom URL (but no fileId), that's 'url' mode
    if (currentCoverSource === 'user' && currentCoverUrl && !currentCoverFileId) return 'url';
    // Default to 'api' if we have one, otherwise first available mode
    if (currentCoverHash || currentCoverUrl) return 'api';
    return 'api';
  };

  const [mode, setMode] = useState<CoverMode>(getInitialMode);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(currentCoverFileId);
  const [customUrl, setCustomUrl] = useState<string>(currentCoverUrl || '');

  // Check if we have an API cover (locally cached - coverHash is what matters)
  const hasApiCover = !!currentCoverHash;

  // Get preview URL based on current selections
  const getPreviewUrl = (): string | null => {
    switch (mode) {
      case 'api':
        // API covers are always served from local cache via coverHash
        // Only use coverHash - coverUrl is just for reference/re-download
        if (currentCoverHash) {
          return getApiCoverUrl(currentCoverHash);
        }
        // No cached API cover available
        return null;
      case 'issue':
        return selectedIssueId ? getCoverUrl(selectedIssueId) : null;
      case 'url':
        return customUrl || null;
      default:
        return null;
    }
  };

  const previewUrl = getPreviewUrl();

  // Handle mode change
  const handleModeChange = useCallback(
    (newMode: CoverMode) => {
      setMode(newMode);

      switch (newMode) {
        case 'api':
          // Switch to API cover mode - don't send URL, let server use existing coverHash
          // The server will set coverSource='api' and use the existing coverHash
          onCoverChange('api', null, null);
          break;
        case 'issue':
          // Keep current selection or use first issue
          const issueId = selectedIssueId || (issues.length > 0 ? issues[0]?.id : null);
          if (issueId) {
            setSelectedIssueId(issueId);
            onCoverChange('user', issueId, null);
          } else {
            // No issues available - this shouldn't happen as button is disabled
            onCoverChange('user', null, null);
          }
          break;
        case 'url':
          onCoverChange('user', null, customUrl || null);
          break;
      }
    },
    [onCoverChange, selectedIssueId, customUrl, issues]
  );

  // Handle issue selection
  const handleIssueSelect = useCallback(
    (issueId: string) => {
      setSelectedIssueId(issueId);
      onCoverChange('user', issueId, null);
    },
    [onCoverChange]
  );

  // Handle custom URL change
  const handleUrlChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const url = e.target.value;
      setCustomUrl(url);
      onCoverChange('user', null, url || null);
    },
    [onCoverChange]
  );

  // Track preview image load state
  const [previewError, setPreviewError] = useState(false);

  // Update selections when props change
  useEffect(() => {
    if (currentCoverFileId && currentCoverFileId !== selectedIssueId) {
      setSelectedIssueId(currentCoverFileId);
    }
  }, [currentCoverFileId]);

  // Reset preview error when preview URL changes
  useEffect(() => {
    setPreviewError(false);
  }, [previewUrl]);

  return (
    <div className="cover-picker">
      <div className="cover-picker-modes">
        <label className={`cover-picker-mode ${mode === 'api' ? 'active' : ''} ${!hasApiCover ? 'no-cover' : ''}`}>
          <input
            type="radio"
            name="coverMode"
            value="api"
            checked={mode === 'api'}
            onChange={() => handleModeChange('api')}
            disabled={disabled}
          />
          <span className="mode-label">API Cover</span>
          {!hasApiCover && <span className="mode-unavailable">(none)</span>}
        </label>
        <label className={`cover-picker-mode ${mode === 'issue' ? 'active' : ''}`}>
          <input
            type="radio"
            name="coverMode"
            value="issue"
            checked={mode === 'issue'}
            onChange={() => handleModeChange('issue')}
            disabled={disabled || issues.length === 0}
          />
          <span className="mode-label">Select from Issues</span>
        </label>
        <label className={`cover-picker-mode ${mode === 'url' ? 'active' : ''}`}>
          <input
            type="radio"
            name="coverMode"
            value="url"
            checked={mode === 'url'}
            onChange={() => handleModeChange('url')}
            disabled={disabled}
          />
          <span className="mode-label">Custom URL</span>
        </label>
      </div>

      <div className="cover-picker-content">
        {/* Cover Preview */}
        <div className="cover-preview">
          {previewUrl && !previewError ? (
            <img
              src={previewUrl}
              alt="Cover preview"
              onError={() => setPreviewError(true)}
              onLoad={() => setPreviewError(false)}
            />
          ) : (
            <div className="cover-placeholder">
              <span>{previewError ? 'Failed to load' : 'No cover'}</span>
            </div>
          )}
        </div>

        {/* Mode-specific content */}
        <div className="cover-picker-selector">
          {mode === 'api' && (
            <div className="cover-api-info">
              {hasApiCover ? (
                <p>Using cover from metadata API{currentCoverHash ? ' (cached locally)' : ''}.</p>
              ) : (
                <p className="no-api-cover">No API cover available. Try fetching metadata for this series.</p>
              )}
            </div>
          )}

          {mode === 'issue' && (
            <div className="issue-selector">
              {issues.length > 0 ? (
                issues.map((issue) => (
                  <button
                    key={issue.id}
                    type="button"
                    className={`issue-selector-item ${selectedIssueId === issue.id ? 'selected' : ''}`}
                    onClick={() => handleIssueSelect(issue.id)}
                    disabled={disabled}
                  >
                    <img
                      src={getCoverUrl(issue.id)}
                      alt={issue.filename}
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <span className="issue-number">
                      {issue.metadata?.number ? `#${issue.metadata.number}` : issue.filename}
                    </span>
                  </button>
                ))
              ) : (
                <p className="no-issues">No issues available in this series.</p>
              )}
            </div>
          )}

          {mode === 'url' && (
            <div className="cover-url-input">
              <label htmlFor="customCoverUrl">Custom Cover URL</label>
              <input
                id="customCoverUrl"
                type="url"
                value={customUrl}
                onChange={handleUrlChange}
                placeholder="https://example.com/cover.jpg"
                disabled={disabled}
                className="field-input"
              />
              <p className="url-hint">Enter the full URL to an image file (JPG, PNG, WebP)</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
