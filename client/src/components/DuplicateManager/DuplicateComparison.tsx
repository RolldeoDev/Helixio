/**
 * Duplicate Comparison Component
 *
 * Visual side-by-side comparison tool for duplicate files.
 * Allows comparing covers, metadata, and file details.
 */

import { useState, useEffect, useMemo } from 'react';
import { getCoverUrl, getPageUrl, getArchiveContents } from '../../services/api.service';
import { formatFileSize } from '../../utils/format';
import './DuplicateComparison.css';

// =============================================================================
// Types
// =============================================================================

interface ComparisonFile {
  id: string;
  filename: string;
  path: string;
  size: number;
  hash: string;
  modifiedAt: string;
  metadata?: {
    series?: string;
    number?: string;
    title?: string;
    year?: number;
    pageCount?: number;
    publisher?: string;
    writer?: string;
  };
}

interface DuplicateComparisonProps {
  files: ComparisonFile[];
  onKeep: (fileId: string) => void;
  onDelete: (fileId: string) => void;
  onClose: () => void;
}

// PageComparison type could be used for more complex comparisons
// interface PageComparison {
//   left: string | null;
//   right: string | null;
// }

// =============================================================================
// Helpers
// =============================================================================

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

// =============================================================================
// Component
// =============================================================================

export function DuplicateComparison({
  files,
  onKeep,
  onDelete: _onDelete,
  onClose,
}: DuplicateComparisonProps) {
  // onDelete is available for future use when implementing per-file delete actions
  void _onDelete;
  const [viewMode, setViewMode] = useState<'cover' | 'pages' | 'metadata'>('cover');
  const [leftIndex, setLeftIndex] = useState(0);
  const [rightIndex, setRightIndex] = useState(Math.min(1, files.length - 1));
  const [pageIndex, setPageIndex] = useState(0);
  const [leftPages, setLeftPages] = useState<string[]>([]);
  const [rightPages, setRightPages] = useState<string[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);

  const leftFile = files[leftIndex]!;
  const rightFile = files[rightIndex]!;

  // Load pages for comparison
  useEffect(() => {
    if (viewMode !== 'pages') return;

    async function loadPages() {
      setLoadingPages(true);
      try {
        const [leftContents, rightContents] = await Promise.all([
          getArchiveContents(leftFile.id),
          getArchiveContents(rightFile.id),
        ]);

        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];

        const leftImagePaths = leftContents.entries
          .filter(e => !e.isDirectory && imageExtensions.includes(e.path.toLowerCase().split('.').pop() || ''))
          .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
          .map(e => e.path);

        const rightImagePaths = rightContents.entries
          .filter(e => !e.isDirectory && imageExtensions.includes(e.path.toLowerCase().split('.').pop() || ''))
          .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
          .map(e => e.path);

        setLeftPages(leftImagePaths);
        setRightPages(rightImagePaths);
        setPageIndex(0);
      } catch (err) {
        console.error('Failed to load pages:', err);
      } finally {
        setLoadingPages(false);
      }
    }

    loadPages();
  }, [viewMode, leftFile.id, rightFile.id]);

  // Calculate differences
  const differences = useMemo(() => {
    const diffs: Array<{ field: string; left: string; right: string; winner?: 'left' | 'right' | 'tie' }> = [];

    // File size (convert string to number for comparison)
    const leftSize = typeof leftFile.size === 'string' ? parseInt(leftFile.size, 10) : leftFile.size;
    const rightSize = typeof rightFile.size === 'string' ? parseInt(rightFile.size, 10) : rightFile.size;
    diffs.push({
      field: 'File Size',
      left: formatFileSize(leftFile.size),
      right: formatFileSize(rightFile.size),
      winner: leftSize > rightSize ? 'left' : leftSize < rightSize ? 'right' : 'tie',
    });

    // Modified date
    diffs.push({
      field: 'Modified Date',
      left: formatDate(leftFile.modifiedAt),
      right: formatDate(rightFile.modifiedAt),
      winner: new Date(leftFile.modifiedAt) > new Date(rightFile.modifiedAt) ? 'left' : 'right',
    });

    // Page count
    const leftPages = leftFile.metadata?.pageCount || 0;
    const rightPages = rightFile.metadata?.pageCount || 0;
    if (leftPages || rightPages) {
      diffs.push({
        field: 'Page Count',
        left: leftPages.toString() || 'Unknown',
        right: rightPages.toString() || 'Unknown',
        winner: leftPages > rightPages ? 'left' : leftPages < rightPages ? 'right' : 'tie',
      });
    }

    // Metadata completeness
    const leftMetaScore = Object.values(leftFile.metadata || {}).filter(Boolean).length;
    const rightMetaScore = Object.values(rightFile.metadata || {}).filter(Boolean).length;
    diffs.push({
      field: 'Metadata Fields',
      left: `${leftMetaScore} fields`,
      right: `${rightMetaScore} fields`,
      winner: leftMetaScore > rightMetaScore ? 'left' : leftMetaScore < rightMetaScore ? 'right' : 'tie',
    });

    return diffs;
  }, [leftFile, rightFile]);

  // Recommendation based on differences
  const recommendation = useMemo(() => {
    let leftScore = 0;
    let rightScore = 0;

    differences.forEach(diff => {
      if (diff.winner === 'left') leftScore++;
      if (diff.winner === 'right') rightScore++;
    });

    if (leftScore > rightScore) {
      return { file: leftFile, reason: 'Better overall quality' };
    } else if (rightScore > leftScore) {
      return { file: rightFile, reason: 'Better overall quality' };
    }
    return { file: leftFile, reason: 'Files are equivalent' };
  }, [differences, leftFile, rightFile]);

  const maxPages = Math.max(leftPages.length, rightPages.length);

  return (
    <div className="duplicate-comparison">
      {/* Header */}
      <div className="dc-header">
        <h2>Compare Duplicates</h2>
        <button className="dc-close" onClick={onClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* View Mode Tabs */}
      <div className="dc-tabs">
        <button
          className={`dc-tab ${viewMode === 'cover' ? 'active' : ''}`}
          onClick={() => setViewMode('cover')}
        >
          Cover
        </button>
        <button
          className={`dc-tab ${viewMode === 'pages' ? 'active' : ''}`}
          onClick={() => setViewMode('pages')}
        >
          Pages
        </button>
        <button
          className={`dc-tab ${viewMode === 'metadata' ? 'active' : ''}`}
          onClick={() => setViewMode('metadata')}
        >
          Metadata
        </button>
      </div>

      {/* Comparison Area */}
      <div className="dc-content">
        {/* File Selectors (if more than 2 files) */}
        {files.length > 2 && (
          <div className="dc-selectors">
            <select
              value={leftIndex}
              onChange={(e) => setLeftIndex(Number(e.target.value))}
            >
              {files.map((file, i) => (
                <option key={file.id} value={i}>{file.filename}</option>
              ))}
            </select>
            <span>vs</span>
            <select
              value={rightIndex}
              onChange={(e) => setRightIndex(Number(e.target.value))}
            >
              {files.map((file, i) => (
                <option key={file.id} value={i}>{file.filename}</option>
              ))}
            </select>
          </div>
        )}

        {/* Cover Comparison */}
        {viewMode === 'cover' && (
          <div className="dc-covers">
            <div className="dc-cover-panel">
              <img src={getCoverUrl(leftFile.id)} alt={leftFile.filename} />
              <div className="dc-filename">{leftFile.filename}</div>
            </div>
            <div className="dc-cover-panel">
              <img src={getCoverUrl(rightFile.id)} alt={rightFile.filename} />
              <div className="dc-filename">{rightFile.filename}</div>
            </div>
          </div>
        )}

        {/* Page Comparison */}
        {viewMode === 'pages' && (
          <div className="dc-pages">
            {loadingPages ? (
              <div className="dc-loading">Loading pages...</div>
            ) : (
              <>
                <div className="dc-page-nav">
                  <button
                    disabled={pageIndex === 0}
                    onClick={() => setPageIndex(prev => prev - 1)}
                  >
                    ← Previous
                  </button>
                  <span>Page {pageIndex + 1} of {maxPages}</span>
                  <button
                    disabled={pageIndex >= maxPages - 1}
                    onClick={() => setPageIndex(prev => prev + 1)}
                  >
                    Next →
                  </button>
                </div>
                <div className="dc-page-panels">
                  <div className="dc-page-panel">
                    {leftPages[pageIndex] ? (
                      <img
                        src={getPageUrl(leftFile.id, leftPages[pageIndex]!)}
                        alt={`Page ${pageIndex + 1}`}
                      />
                    ) : (
                      <div className="dc-no-page">No page</div>
                    )}
                  </div>
                  <div className="dc-page-panel">
                    {rightPages[pageIndex] ? (
                      <img
                        src={getPageUrl(rightFile.id, rightPages[pageIndex]!)}
                        alt={`Page ${pageIndex + 1}`}
                      />
                    ) : (
                      <div className="dc-no-page">No page</div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Metadata Comparison */}
        {viewMode === 'metadata' && (
          <div className="dc-metadata">
            <table className="dc-table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th className={recommendation.file.id === leftFile.id ? 'winner' : ''}>
                    {leftFile.filename}
                  </th>
                  <th className={recommendation.file.id === rightFile.id ? 'winner' : ''}>
                    {rightFile.filename}
                  </th>
                </tr>
              </thead>
              <tbody>
                {differences.map((diff) => (
                  <tr key={diff.field}>
                    <td className="dc-field-name">{diff.field}</td>
                    <td className={diff.winner === 'left' ? 'better' : diff.winner === 'right' ? 'worse' : ''}>
                      {diff.left}
                      {diff.winner === 'left' && <span className="dc-badge">Better</span>}
                    </td>
                    <td className={diff.winner === 'right' ? 'better' : diff.winner === 'left' ? 'worse' : ''}>
                      {diff.right}
                      {diff.winner === 'right' && <span className="dc-badge">Better</span>}
                    </td>
                  </tr>
                ))}
                <tr className="dc-metadata-row">
                  <td>Series</td>
                  <td>{leftFile.metadata?.series || '-'}</td>
                  <td>{rightFile.metadata?.series || '-'}</td>
                </tr>
                <tr className="dc-metadata-row">
                  <td>Number</td>
                  <td>{leftFile.metadata?.number || '-'}</td>
                  <td>{rightFile.metadata?.number || '-'}</td>
                </tr>
                <tr className="dc-metadata-row">
                  <td>Title</td>
                  <td>{leftFile.metadata?.title || '-'}</td>
                  <td>{rightFile.metadata?.title || '-'}</td>
                </tr>
                <tr className="dc-metadata-row">
                  <td>Publisher</td>
                  <td>{leftFile.metadata?.publisher || '-'}</td>
                  <td>{rightFile.metadata?.publisher || '-'}</td>
                </tr>
                <tr className="dc-metadata-row">
                  <td>Year</td>
                  <td>{leftFile.metadata?.year || '-'}</td>
                  <td>{rightFile.metadata?.year || '-'}</td>
                </tr>
                <tr className="dc-metadata-row">
                  <td>File Path</td>
                  <td className="dc-path">{leftFile.path}</td>
                  <td className="dc-path">{rightFile.path}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recommendation */}
      <div className="dc-recommendation">
        <div className="dc-rec-text">
          <strong>Recommendation:</strong> Keep "{recommendation.file.filename}"
          <span className="dc-rec-reason">({recommendation.reason})</span>
        </div>
      </div>

      {/* Actions */}
      <div className="dc-actions">
        <button
          className="dc-btn-keep"
          onClick={() => onKeep(leftFile.id)}
        >
          Keep Left
        </button>
        <button
          className="dc-btn-keep"
          onClick={() => onKeep(rightFile.id)}
        >
          Keep Right
        </button>
        <button
          className="dc-btn-cancel"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
