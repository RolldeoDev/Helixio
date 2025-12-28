/**
 * IssueCoverPicker Component
 *
 * Cover selection component for individual comic issues with four modes:
 * - Auto: Use default cover (first page or cover.jpg)
 * - Select Page: Choose a specific page from the comic as cover (virtualized for large comics)
 * - From URL: Enter a custom cover image URL (downloads and stores locally)
 * - Upload: Upload a custom image from local computer
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  getCoverUrl,
  getApiCoverUrl,
  getFilePages,
  getPageThumbnailUrl,
  setFileCover,
  uploadFileCover,
} from '../../services/api.service';
import { useVirtualGrid } from '../../hooks/useVirtualGrid';
import './IssueCoverPicker.css';

export type IssueCoverMode = 'auto' | 'page' | 'url' | 'upload';

interface IssueCoverPickerProps {
  fileId: string;
  currentCoverSource: 'auto' | 'page' | 'custom';
  currentCoverPageIndex: number | null;
  currentCoverHash: string | null;
  onCoverChange: (result: {
    source: 'auto' | 'page' | 'custom';
    pageIndex?: number;
    coverHash?: string;
  }) => void;
  disabled?: boolean;
}

// Page item for virtualization
interface PageItem {
  index: number;
  filename: string;
}

export function IssueCoverPicker({
  fileId,
  currentCoverSource,
  currentCoverPageIndex,
  currentCoverHash,
  onCoverChange,
  disabled = false,
}: IssueCoverPickerProps) {
  // Determine initial mode from current source
  const getInitialMode = (): IssueCoverMode => {
    if (currentCoverSource === 'page') return 'page';
    if (currentCoverSource === 'custom') return 'url';
    return 'auto';
  };

  const [mode, setMode] = useState<IssueCoverMode>(getInitialMode);
  const [pages, setPages] = useState<string[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);
  const [pagesError, setPagesError] = useState<string | null>(null);
  const [selectedPageIndex, setSelectedPageIndex] = useState<number | null>(currentCoverPageIndex);
  const [customUrl, setCustomUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Track uploaded cover hash, initialized from prop if already custom
  const [uploadedCoverHash, setUploadedCoverHash] = useState<string | null>(currentCoverHash);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Convert pages array to PageItem array for virtualization
  const pageItems = useMemo<PageItem[]>(() => {
    return pages.map((filename, index) => ({ index, filename }));
  }, [pages]);

  // Virtualized grid configuration - fixed item sizes for page thumbnails
  const {
    virtualItems,
    totalHeight,
    containerRef,
    scrollTo,
  } = useVirtualGrid<PageItem>(pageItems, {
    itemWidth: 80,
    itemHeight: 130, // 80 * 1.5 aspect ratio + 10px for page number
    gap: 8,
    overscan: 3,
    horizontalPadding: 8,
  });

  // Load pages when switching to page mode
  useEffect(() => {
    if (mode === 'page' && pages.length === 0 && !loadingPages) {
      loadPages();
    }
  }, [mode]);

  // Scroll to selected page when pages load
  useEffect(() => {
    if (selectedPageIndex !== null && pages.length > 0) {
      // Small delay to ensure virtualization is ready
      setTimeout(() => scrollTo(selectedPageIndex), 100);
    }
  }, [pages.length, selectedPageIndex, scrollTo]);

  const loadPages = async () => {
    setLoadingPages(true);
    setPagesError(null);
    try {
      const result = await getFilePages(fileId);
      setPages(result.pages);
    } catch (err) {
      setPagesError(err instanceof Error ? err.message : 'Failed to load pages');
    } finally {
      setLoadingPages(false);
    }
  };

  // Get preview URL based on current selections
  const getPreviewUrl = (): string | null => {
    switch (mode) {
      case 'auto':
        // Default cover from file
        return getCoverUrl(fileId);
      case 'page':
        if (selectedPageIndex !== null && pages[selectedPageIndex]) {
          return getPageThumbnailUrl(fileId, pages[selectedPageIndex]);
        }
        return null;
      case 'url':
        return customUrl || null;
      case 'upload':
        if (uploadedCoverHash) {
          return getApiCoverUrl(uploadedCoverHash);
        }
        return null;
      default:
        return null;
    }
  };

  const previewUrl = getPreviewUrl();

  // Handle mode change
  const handleModeChange = useCallback((newMode: IssueCoverMode) => {
    setMode(newMode);
  }, []);

  // Handle page selection
  const handlePageSelect = useCallback((pageIndex: number) => {
    setSelectedPageIndex(pageIndex);
  }, []);

  // Handle URL change
  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomUrl(e.target.value);
  }, []);

  // Handle file upload
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

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
        const result = await uploadFileCover(fileId, file);
        setUploadedCoverHash(result.coverHash);
        onCoverChange({
          source: 'custom',
          coverHash: result.coverHash,
        });
      } catch (err) {
        console.error('Upload failed:', err);
        alert('Failed to upload cover image');
      } finally {
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [fileId, onCoverChange]
  );

  // Apply changes
  const handleApply = useCallback(async () => {
    setSaving(true);
    try {
      if (mode === 'auto') {
        await setFileCover(fileId, { source: 'auto' });
        onCoverChange({ source: 'auto' });
      } else if (mode === 'page' && selectedPageIndex !== null) {
        const result = await setFileCover(fileId, { source: 'page', pageIndex: selectedPageIndex });
        onCoverChange({
          source: 'page',
          pageIndex: selectedPageIndex,
          coverHash: result.coverHash,
        });
      } else if (mode === 'url' && customUrl.trim()) {
        const result = await setFileCover(fileId, { source: 'custom', url: customUrl.trim() });
        onCoverChange({
          source: 'custom',
          coverHash: result.coverHash,
        });
      }
      // Upload mode is handled immediately in handleFileSelect
    } catch (err) {
      console.error('Failed to set cover:', err);
      alert(err instanceof Error ? err.message : 'Failed to set cover');
    } finally {
      setSaving(false);
    }
  }, [mode, fileId, selectedPageIndex, customUrl, onCoverChange]);

  // Check if we can apply
  const canApply = () => {
    if (saving || disabled) return false;
    if (mode === 'auto') return true;
    if (mode === 'page') return selectedPageIndex !== null;
    if (mode === 'url') return customUrl.trim().length > 0;
    if (mode === 'upload') return uploadedCoverHash !== null;
    return false;
  };

  return (
    <div className="issue-cover-picker">
      <div className="cover-picker-modes">
        <label className={`cover-picker-mode ${mode === 'auto' ? 'active' : ''}`}>
          <input
            type="radio"
            name="issueCoverMode"
            value="auto"
            checked={mode === 'auto'}
            onChange={() => handleModeChange('auto')}
            disabled={disabled}
          />
          <span className="mode-label">Auto</span>
        </label>
        <label className={`cover-picker-mode ${mode === 'page' ? 'active' : ''}`}>
          <input
            type="radio"
            name="issueCoverMode"
            value="page"
            checked={mode === 'page'}
            onChange={() => handleModeChange('page')}
            disabled={disabled}
          />
          <span className="mode-label">Select Page</span>
        </label>
        <label className={`cover-picker-mode ${mode === 'url' ? 'active' : ''}`}>
          <input
            type="radio"
            name="issueCoverMode"
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
            name="issueCoverMode"
            value="upload"
            checked={mode === 'upload'}
            onChange={() => handleModeChange('upload')}
            disabled={disabled}
          />
          <span className="mode-label">Upload</span>
        </label>
      </div>

      <div className="cover-picker-content">
        {/* Preview */}
        <div className="cover-preview-container">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Cover preview"
              className="cover-preview-image"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/placeholder-cover.svg';
              }}
            />
          ) : (
            <div className="cover-preview-placeholder">
              <span>No preview</span>
            </div>
          )}
        </div>

        {/* Mode-specific content */}
        <div className="cover-mode-content">
          {mode === 'auto' && (
            <p className="mode-description">
              Use the default cover (first page or cover.jpg from the archive)
            </p>
          )}

          {mode === 'page' && (
            <div className="page-selector">
              {loadingPages ? (
                <div className="loading-pages">
                  <div className="loading-spinner" />
                  <span>Loading {pages.length > 0 ? `${pages.length} pages...` : 'pages...'}</span>
                </div>
              ) : pagesError ? (
                <p className="pages-error">{pagesError}</p>
              ) : pages.length === 0 ? (
                <p className="no-pages">No pages found</p>
              ) : (
                <>
                  <div className="page-count-header">
                    <span className="page-count">{pages.length} pages</span>
                    {selectedPageIndex !== null && (
                      <span className="selected-indicator">
                        Selected: Page {selectedPageIndex + 1}
                      </span>
                    )}
                  </div>
                  <div
                    className="virtual-page-grid"
                    ref={containerRef}
                  >
                    <div
                      className="virtual-page-grid-inner"
                      style={{ height: totalHeight, position: 'relative' }}
                    >
                      {virtualItems.map(({ item, style }) => (
                        <button
                          key={item.filename}
                          className={`page-thumbnail ${selectedPageIndex === item.index ? 'selected' : ''}`}
                          style={style}
                          onClick={() => handlePageSelect(item.index)}
                          disabled={disabled}
                        >
                          <img
                            src={getPageThumbnailUrl(fileId, item.filename)}
                            alt={`Page ${item.index + 1}`}
                            loading="lazy"
                          />
                          <span className="page-number">{item.index + 1}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {mode === 'url' && (
            <div className="cover-url-input">
              <label htmlFor="issueCoverUrl">Cover Image URL</label>
              <input
                id="issueCoverUrl"
                type="url"
                value={customUrl}
                onChange={handleUrlChange}
                placeholder="https://example.com/cover.jpg"
                disabled={disabled}
                className="field-input"
              />
              <p className="url-hint">
                Enter the full URL to an image file. The image will be downloaded and stored locally.
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
                id="issueCoverFileUpload"
              />
              <label
                htmlFor="issueCoverFileUpload"
                className={`upload-button ${uploading ? 'uploading' : ''}`}
              >
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

      {/* Apply button (not needed for upload mode) */}
      {mode !== 'upload' && (
        <div className="cover-picker-actions">
          <button
            className="btn btn-primary"
            onClick={handleApply}
            disabled={!canApply()}
          >
            {saving ? 'Applying...' : 'Apply Cover'}
          </button>
        </div>
      )}
    </div>
  );
}

export default IssueCoverPicker;
