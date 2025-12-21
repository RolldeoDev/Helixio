/**
 * CoverPicker Component
 *
 * Cover selection component with four modes:
 * - API Cover: Use the cover URL from metadata API (locally cached)
 * - Select from Issues: Choose a cover from owned issues
 * - Custom URL: Enter a custom cover image URL (downloads and stores locally)
 * - Upload: Upload a custom image from local computer
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { getCoverUrl, getApiCoverUrl, SeriesIssue } from '../../services/api.service';

export type CoverMode = 'api' | 'issue' | 'url' | 'upload';

interface CoverPickerProps {
  currentCoverSource: 'api' | 'user' | 'auto';
  currentCoverUrl: string | null;
  currentCoverHash: string | null;  // Hash for locally cached API cover
  currentCoverFileId: string | null;
  issues: SeriesIssue[];
  onCoverChange: (source: 'api' | 'user' | 'auto', fileId: string | null, url: string | null) => void;
  onUpload?: (file: File) => Promise<void>;
  uploadedPreviewUrl?: string | null;  // Preview URL for uploaded file
  disabled?: boolean;
}

export function CoverPicker({
  currentCoverSource,
  currentCoverUrl,
  currentCoverHash,
  currentCoverFileId,
  issues,
  onCoverChange,
  onUpload,
  uploadedPreviewUrl,
  disabled = false,
}: CoverPickerProps) {
  // Determine initial mode from current source
  const getInitialMode = (): CoverMode => {
    // If user selected an issue cover, that's 'issue' mode
    if (currentCoverSource === 'user' && currentCoverFileId) return 'issue';
    // If source is 'api' and we have an API cover cached, that's 'api' mode
    if (currentCoverSource === 'api' && currentCoverHash) return 'api';
    // If user has a custom URL (but no fileId), that's 'url' mode
    if (currentCoverSource === 'user' && currentCoverUrl && !currentCoverFileId) return 'url';
    // If we have a cover hash, default to 'api'
    if (currentCoverHash) return 'api';
    // Default to 'issue' if available, otherwise 'url'
    if (issues.length > 0) return 'issue';
    return 'url';
  };

  const [mode, setMode] = useState<CoverMode>(getInitialMode);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(currentCoverFileId);
  const [customUrl, setCustomUrl] = useState<string>(currentCoverUrl || '');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      case 'upload':
        return uploadedPreviewUrl || null;
      default:
        return null;
    }
  };

  const previewUrl = getPreviewUrl();

  // Handle file upload
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !onUpload) return;

      // Validate file type
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!validTypes.includes(file.type)) {
        alert('Please select a valid image file (JPG, PNG, WebP, or GIF)');
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        return;
      }

      setUploading(true);
      try {
        await onUpload(file);
      } catch (err) {
        console.error('Upload failed:', err);
        alert('Failed to upload cover image');
      } finally {
        setUploading(false);
        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [onUpload]
  );

  // Handle mode change
  const handleModeChange = useCallback(
    (newMode: CoverMode) => {
      setMode(newMode);

      switch (newMode) {
        case 'api':
          // Switch to API cover mode - only valid if we have a coverHash
          if (hasApiCover) {
            onCoverChange('api', null, null);
          }
          break;
        case 'issue':
          // Keep current selection or use first issue
          const issueId = selectedIssueId || (issues.length > 0 ? issues[0]?.id : null);
          if (issueId) {
            setSelectedIssueId(issueId);
            onCoverChange('user', issueId, null);
          }
          break;
        case 'url':
          // Only trigger change if there's a valid URL
          if (customUrl && customUrl.trim()) {
            onCoverChange('user', null, customUrl);
          }
          break;
        case 'upload':
          // Upload mode doesn't trigger onCoverChange until a file is actually uploaded
          // The file upload handler will call the parent's upload function
          break;
      }
    },
    [onCoverChange, selectedIssueId, customUrl, issues, hasApiCover]
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
        <label className={`cover-picker-mode ${mode === 'api' ? 'active' : ''} ${!hasApiCover ? 'no-cover disabled' : ''}`}>
          <input
            type="radio"
            name="coverMode"
            value="api"
            checked={mode === 'api'}
            onChange={() => handleModeChange('api')}
            disabled={disabled || !hasApiCover}
          />
          <span className="mode-label">API Cover</span>
          {!hasApiCover && <span className="mode-unavailable">(none)</span>}
        </label>
        <label className={`cover-picker-mode ${mode === 'issue' ? 'active' : ''} ${issues.length === 0 ? 'disabled' : ''}`}>
          <input
            type="radio"
            name="coverMode"
            value="issue"
            checked={mode === 'issue'}
            onChange={() => handleModeChange('issue')}
            disabled={disabled || issues.length === 0}
          />
          <span className="mode-label">From Issue</span>
          {issues.length === 0 && <span className="mode-unavailable">(none)</span>}
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
          <span className="mode-label">From URL</span>
        </label>
        <label className={`cover-picker-mode ${mode === 'upload' ? 'active' : ''}`}>
          <input
            type="radio"
            name="coverMode"
            value="upload"
            checked={mode === 'upload'}
            onChange={() => handleModeChange('upload')}
            disabled={disabled || !onUpload}
          />
          <span className="mode-label">Upload</span>
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
              <label htmlFor="customCoverUrl">Cover Image URL</label>
              <input
                id="customCoverUrl"
                type="url"
                value={customUrl}
                onChange={handleUrlChange}
                placeholder="https://example.com/cover.jpg"
                disabled={disabled}
                className="field-input"
              />
              <p className="url-hint">
                Enter the full URL to an image file (JPG, PNG, WebP).
                The image will be downloaded and stored locally.
              </p>
            </div>
          )}

          {mode === 'upload' && (
            <div className="cover-upload">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleFileSelect}
                disabled={disabled || uploading}
                style={{ display: 'none' }}
                id="coverFileUpload"
              />
              <label htmlFor="coverFileUpload" className={`upload-button ${uploading ? 'uploading' : ''}`}>
                {uploading ? (
                  <>
                    <div className="upload-spinner" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Choose Image
                  </>
                )}
              </label>
              <p className="upload-hint">
                Select an image from your computer (JPG, PNG, WebP, GIF - max 10MB)
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
