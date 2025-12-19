/**
 * IssueBrowserModal
 *
 * Modal for browsing and selecting issues for manual matching.
 * Features:
 * - Search by issue number or title
 * - Filter toggle for specials (annuals, #0 issues, etc.)
 * - Issue list with cover images
 * - Preview panel with detailed info
 * - Keyboard navigation
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  getAvailableIssues,
  getAvailableIssuesForJob,
  manualSelectIssue,
  type AvailableIssue,
  type MetadataSource,
  type FileChange,
} from '../../services/api.service';

interface IssueBrowserModalProps {
  sessionId: string;
  jobId?: string | null;
  fileId: string;
  filename: string;
  currentMatchedIssueId: string | null;
  onClose: () => void;
  onIssueSelected: (fileChange: FileChange) => void;
}

type FilterMode = 'all' | 'regular' | 'specials';

function isSpecialIssue(issue: AvailableIssue): boolean {
  const num = issue.issue_number.toLowerCase();
  // Consider specials: #0, annuals, specials, negative numbers, non-numeric
  if (num === '0' || num.startsWith('-')) return true;
  if (/annual|special|one[- ]shot/i.test(num)) return true;
  if (isNaN(parseInt(num, 10))) return true;
  return false;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Unknown';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  } catch {
    return dateStr;
  }
}

function getCreators(
  issue: AvailableIssue,
  role: string
): string {
  const credits = issue.person_credits || [];
  return credits
    .filter((p) => p.role.toLowerCase().includes(role.toLowerCase()))
    .map((p) => p.name)
    .join(', ');
}

export default function IssueBrowserModal({
  sessionId,
  jobId,
  fileId,
  filename,
  currentMatchedIssueId,
  onClose,
  onIssueSelected,
}: IssueBrowserModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seriesName, setSeriesName] = useState('');
  const [source, setSource] = useState<MetadataSource>('comicvine');
  const [issues, setIssues] = useState<AvailableIssue[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedIssueId, setSelectedIssueId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);

  // Load available issues on mount
  useEffect(() => {
    async function loadIssues() {
      try {
        setLoading(true);
        setError(null);

        // Use job endpoint if jobId is available, otherwise use session endpoint
        const result = jobId
          ? await getAvailableIssuesForJob(jobId, fileId)
          : await getAvailableIssues(sessionId, fileId);

        setSeriesName(result.seriesName);
        setSource(result.source);
        setIssues(result.issues);

        // Pre-select current matched issue if any
        if (result.currentMatchedIssueId) {
          setSelectedIssueId(parseInt(result.currentMatchedIssueId, 10));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load issues');
      } finally {
        setLoading(false);
      }
    }
    loadIssues();
  }, [sessionId, jobId, fileId]);

  // Filter and search issues
  const filteredIssues = useMemo(() => {
    let result = issues;

    // Apply filter
    if (filterMode === 'regular') {
      result = result.filter((iss) => !isSpecialIssue(iss));
    } else if (filterMode === 'specials') {
      result = result.filter((iss) => isSpecialIssue(iss));
    }

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter((iss) => {
        const num = iss.issue_number.toLowerCase();
        const name = (iss.name || '').toLowerCase();
        return num.includes(query) || name.includes(query);
      });
    }

    // Sort by issue number (numeric sort where possible)
    return result.sort((a, b) => {
      const numA = parseFloat(a.issue_number) || 0;
      const numB = parseFloat(b.issue_number) || 0;
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB;
      }
      return a.issue_number.localeCompare(b.issue_number);
    });
  }, [issues, filterMode, searchQuery]);

  // Get selected issue details
  const selectedIssue = useMemo(() => {
    if (selectedIssueId === null) return null;
    return issues.find((iss) => iss.id === selectedIssueId) || null;
  }, [issues, selectedIssueId]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (filteredIssues.length === 0) return;

      const currentIndex = selectedIssueId
        ? filteredIssues.findIndex((iss) => iss.id === selectedIssueId)
        : -1;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (currentIndex < filteredIssues.length - 1) {
            const nextIssue = filteredIssues[currentIndex + 1];
            if (nextIssue) setSelectedIssueId(nextIssue.id);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (currentIndex > 0) {
            const prevIssue = filteredIssues[currentIndex - 1];
            if (prevIssue) setSelectedIssueId(prevIssue.id);
          }
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIssueId !== null) {
            handleSelectIssue();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filteredIssues, selectedIssueId, onClose]
  );

  // Scroll selected item into view
  useEffect(() => {
    if (selectedItemRef.current && listRef.current) {
      selectedItemRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [selectedIssueId]);

  // Handle issue selection
  const handleSelectIssue = useCallback(async () => {
    if (selectedIssueId === null || submitting) return;

    try {
      setSubmitting(true);
      const result = await manualSelectIssue(
        sessionId,
        fileId,
        source,
        String(selectedIssueId)
      );
      onIssueSelected(result.fileChange);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select issue');
      setSubmitting(false);
    }
  }, [sessionId, fileId, source, selectedIssueId, submitting, onIssueSelected, onClose]);

  // Click outside to close
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="issue-browser-overlay" onClick={handleBackdropClick}>
      <div
        className="issue-browser-modal"
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="dialog"
        aria-label="Select Issue"
      >
        {/* Header */}
        <div className="issue-browser-header">
          <div className="issue-browser-title">
            <h2>Select Issue</h2>
            <p className="issue-browser-filename" title={filename}>
              {filename}
            </p>
          </div>
          <button
            className="issue-browser-close"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Series Info */}
        <div className="issue-browser-series-info">
          <span className="series-name">{seriesName || 'Loading...'}</span>
          <span className="issue-count">{issues.length} issues</span>
        </div>

        {/* Search and Filter Bar */}
        <div className="issue-browser-toolbar">
          <input
            type="text"
            className="issue-browser-search"
            placeholder="Search issues..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          <div className="issue-browser-filter">
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value as FilterMode)}
            >
              <option value="all">All Issues</option>
              <option value="regular">Regular Only</option>
              <option value="specials">Specials Only</option>
            </select>
          </div>
        </div>

        {/* Content Area */}
        <div className="issue-browser-content">
          {loading ? (
            <div className="issue-browser-loading">
              <div className="loading-spinner" />
              <p>Loading issues...</p>
            </div>
          ) : error ? (
            <div className="issue-browser-error">
              <p>{error}</p>
              <button onClick={onClose}>Close</button>
            </div>
          ) : (
            <>
              {/* Issue List */}
              <div className="issue-list" ref={listRef}>
                {filteredIssues.length === 0 ? (
                  <div className="issue-list-empty">
                    <p>No issues match your search</p>
                  </div>
                ) : (
                  filteredIssues.map((issue) => {
                    const isSelected = issue.id === selectedIssueId;
                    const isCurrentMatch =
                      currentMatchedIssueId === String(issue.id);

                    return (
                      <div
                        key={issue.id}
                        ref={isSelected ? selectedItemRef : null}
                        className={`issue-list-item ${isSelected ? 'selected' : ''} ${isCurrentMatch ? 'current-match' : ''}`}
                        onClick={() => setSelectedIssueId(issue.id)}
                        onDoubleClick={handleSelectIssue}
                      >
                        {issue.image?.thumb_url && (
                          <img
                            src={issue.image.thumb_url}
                            alt={`Cover for issue #${issue.issue_number}`}
                            className="issue-list-thumb"
                            loading="lazy"
                          />
                        )}
                        <div className="issue-list-info">
                          <span className="issue-number">
                            #{issue.issue_number}
                          </span>
                          {issue.name && (
                            <span className="issue-name">{issue.name}</span>
                          )}
                          <span className="issue-date">
                            {formatDate(issue.cover_date)}
                          </span>
                        </div>
                        {isCurrentMatch && (
                          <span className="current-match-badge">Current</span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Issue Preview */}
              <div className="issue-preview">
                {selectedIssue ? (
                  <>
                    <div className="issue-preview-header">
                      <h3>#{selectedIssue.issue_number}</h3>
                      {selectedIssue.name && <p>{selectedIssue.name}</p>}
                    </div>

                    {selectedIssue.image?.medium_url && (
                      <div className="issue-cover">
                        <img
                          src={selectedIssue.image.medium_url}
                          alt={`Cover for issue #${selectedIssue.issue_number}`}
                        />
                      </div>
                    )}

                    <div className="issue-preview-details">
                      <div className="issue-detail-row">
                        <span className="label">Cover Date:</span>
                        <span className="value">
                          {formatDate(selectedIssue.cover_date)}
                        </span>
                      </div>

                      {getCreators(selectedIssue, 'writer') && (
                        <div className="issue-detail-row">
                          <span className="label">Writer:</span>
                          <span className="value">
                            {getCreators(selectedIssue, 'writer')}
                          </span>
                        </div>
                      )}

                      {getCreators(selectedIssue, 'pencil') && (
                        <div className="issue-detail-row">
                          <span className="label">Artist:</span>
                          <span className="value">
                            {getCreators(selectedIssue, 'pencil')}
                          </span>
                        </div>
                      )}

                      {selectedIssue.deck && (
                        <div className="issue-detail-row description">
                          <span className="label">Summary:</span>
                          <span className="value">{selectedIssue.deck}</span>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="issue-preview-empty">
                    <p>Select an issue to preview</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="issue-browser-footer">
          <button
            className="btn-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSelectIssue}
            disabled={selectedIssueId === null || submitting}
          >
            {submitting
              ? 'Selecting...'
              : selectedIssue
                ? `Select Issue #${selectedIssue.issue_number}`
                : 'Select Issue'}
          </button>
        </div>
      </div>
    </div>
  );
}
