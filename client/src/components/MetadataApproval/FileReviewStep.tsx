/**
 * FileReviewStep Component
 *
 * Phase 2 of the approval workflow - file-level review with compact list and hover preview.
 * Uses virtualization for smooth scrolling with 100-200+ files.
 *
 * Features:
 * - Compact full-width file list with all key info visible
 * - Hover preview card with field changes and quick actions
 * - Keyboard navigation (arrows, j/k, enter to toggle)
 * - Touch-friendly tap-to-preview on mobile
 * - Batch operations including "Accept High Confidence"
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  getFileChangesByJob,
  updateFieldApprovals,
  rejectFile,
  acceptAllFiles,
  rejectAllFiles,
  moveFileToSeriesGroup,
  type ApprovalSession,
  type FileChange,
} from '../../services/api.service';
import IssueBrowserModal from './IssueBrowserModal';
import HoverPreviewCard from './HoverPreviewCard';
import IssueEditDrawer from './IssueEditDrawer';

interface FileReviewStepProps {
  session: ApprovalSession;
  jobId?: string | null;
  onStartApply: () => void;
  onCancel: () => void;
  onChangeSeriesSelection?: (seriesGroupIndex: number) => void;
  applying?: boolean;
}

type FilterStatus = 'all' | 'matched' | 'unmatched' | 'rejected' | 'high-confidence' | 'low-confidence';

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
  // If both are empty, it's not a meaningful change
  if (isEmptyValue(proposed) && isEmptyValue(current)) {
    return false;
  }
  // Otherwise compare normally
  return proposed !== current;
}

export function FileReviewStep({
  session,
  jobId,
  onStartApply,
  onCancel,
  onChangeSeriesSelection,
  applying = false,
}: FileReviewStepProps) {
  const [fileChanges, setFileChanges] = useState<FileChange[]>([]);
  const [summary, setSummary] = useState<ApprovalSession['fileChangesSummary']>(
    session.fileChangesSummary
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selection and filter state
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [showOnlyWithChanges, setShowOnlyWithChanges] = useState(false);

  // Hover preview state
  const [hoveredFileId, setHoveredFileId] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  // Issue browser modal state
  const [issueBrowserOpen, setIssueBrowserOpen] = useState(false);
  const [issueBrowserFileId, setIssueBrowserFileId] = useState<string | null>(null);

  // Edit drawer state
  const [drawerFileId, setDrawerFileId] = useState<string | null>(null);

  // Batch confirmation state
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [batchAction, setBatchAction] = useState<'high-confidence' | 'all' | 'reject-all' | null>(null);

  // Series group picker state
  const [showSeriesPicker, setShowSeriesPicker] = useState(false);

  // File-to-series-group move modal state
  const [showMoveToSeriesModal, setShowMoveToSeriesModal] = useState(false);
  const [fileToMoveId, setFileToMoveId] = useState<string | null>(null);
  const [isMovingFile, setIsMovingFile] = useState(false);

  // Refs
  const fileListRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Screen reader announcement state
  const [announcement, setAnnouncement] = useState<string>('');

  // Detect touch device
  useEffect(() => {
    const checkTouch = () => {
      setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    };
    checkTouch();
    window.addEventListener('touchstart', () => setIsTouchDevice(true), { once: true });
  }, []);

  // Load file changes
  useEffect(() => {
    // Use jobId for loading file changes (handles session restoration)
    if (!jobId) {
      setError('Job ID not available');
      setLoading(false);
      return;
    }

    const loadChanges = async () => {
      try {
        setLoading(true);
        const result = await getFileChangesByJob(jobId);
        setFileChanges(result.fileChanges);
        setSummary(result.summary);

        // Auto-select first file with changes
        const firstWithChanges = result.fileChanges.find(
          (fc) => Object.keys(fc.fields).length > 0 && fc.status !== 'rejected'
        );
        if (firstWithChanges) {
          setSelectedFileId(firstWithChanges.fileId);
        } else if (result.fileChanges[0]) {
          setSelectedFileId(result.fileChanges[0].fileId);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load file changes');
      } finally {
        setLoading(false);
      }
    };

    loadChanges();
  }, [jobId]);

  // Filter file changes
  const filteredFiles = useMemo(() => {
    return fileChanges.filter((fc) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesFilename = fc.filename.toLowerCase().includes(query);
        const matchesIssue = fc.matchedIssue?.title?.toLowerCase().includes(query) ||
          fc.matchedIssue?.number?.toString().includes(query);
        if (!matchesFilename && !matchesIssue) return false;
      }

      // Status filter
      if (filterStatus === 'high-confidence') {
        if (fc.matchConfidence < 0.8) return false;
      } else if (filterStatus === 'low-confidence') {
        if (fc.matchConfidence >= 0.5) return false;
      } else if (filterStatus !== 'all' && fc.status !== filterStatus) {
        return false;
      }

      // Only with changes filter
      if (showOnlyWithChanges) {
        const hasChanges = Object.values(fc.fields).some(f => hasMeaningfulChange(f.proposed, f.current));
        if (!hasChanges && fc.status !== 'rejected') return false;
      }

      return true;
    });
  }, [fileChanges, searchQuery, filterStatus, showOnlyWithChanges]);

  // High confidence files for batch operation
  const highConfidenceFiles = useMemo(() => {
    return fileChanges.filter(fc =>
      fc.status !== 'rejected' &&
      fc.matchConfidence >= 0.8 &&
      Object.values(fc.fields).some(f => hasMeaningfulChange(f.proposed, f.current))
    );
  }, [fileChanges]);

  // Virtualizer
  const rowVirtualizer = useVirtualizer({
    count: filteredFiles.length,
    getScrollElement: () => fileListRef.current,
    estimateSize: () => 40, // Compact row height for better density
    overscan: 5,
  });

  // Hover handlers
  const handleMouseEnter = useCallback((fileId: string, element: HTMLElement) => {
    if (isTouchDevice) return;

    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }

    hoverTimeoutRef.current = setTimeout(() => {
      setAnchorRect(element.getBoundingClientRect());
      setHoveredFileId(fileId);
    }, 100); // 100ms snappy delay
  }, [isTouchDevice]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    // Small delay to allow moving to preview card
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredFileId(null);
    }, 100);
  }, []);

  const handlePreviewMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
  }, []);

  const handlePreviewMouseLeave = useCallback(() => {
    setHoveredFileId(null);
  }, []);

  // Touch handler
  const handleTouchStart = useCallback((fileId: string, element: HTMLElement) => {
    if (hoveredFileId === fileId) {
      setHoveredFileId(null);
    } else {
      setAnchorRect(element.getBoundingClientRect());
      setHoveredFileId(fileId);
      setSelectedFileId(fileId);
    }
  }, [hoveredFileId]);

  // API handlers
  const handleFieldApproval = useCallback(
    async (fileId: string, field: string, approved: boolean, editedValue?: string | number) => {
      try {
        const update: { approved?: boolean; editedValue?: string | number } = { approved };
        if (editedValue !== undefined) {
          update.editedValue = editedValue;
        }
        const result = await updateFieldApprovals(session.sessionId, fileId, {
          [field]: update,
        });
        setFileChanges((prev) =>
          prev.map((fc) => (fc.fileId === fileId ? result.fileChange : fc))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update field');
      }
    },
    [session.sessionId]
  );

  const handleAcceptAllFields = useCallback(async (fileId: string) => {
    const fc = fileChanges.find(f => f.fileId === fileId);
    if (!fc) return;

    // Accept all fields for this file
    const updates: Record<string, { approved: boolean }> = {};
    Object.keys(fc.fields).forEach(field => {
      updates[field] = { approved: true };
    });

    try {
      const result = await updateFieldApprovals(session.sessionId, fileId, updates);
      setFileChanges((prev) =>
        prev.map((f) => (f.fileId === fileId ? result.fileChange : f))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept fields');
    }
  }, [session.sessionId, fileChanges]);

  // Batch field update handler for the edit drawer
  const handleDrawerFieldUpdate = useCallback(
    async (
      fileId: string,
      fieldUpdates: Record<string, { approved?: boolean; editedValue?: string | number | null }>
    ) => {
      try {
        // Convert null to undefined for API compatibility
        const sanitizedUpdates: Record<string, { approved?: boolean; editedValue?: string | number }> = {};
        for (const [key, value] of Object.entries(fieldUpdates)) {
          sanitizedUpdates[key] = {
            approved: value.approved,
            editedValue: value.editedValue ?? undefined,
          };
        }
        const result = await updateFieldApprovals(session.sessionId, fileId, sanitizedUpdates);
        setFileChanges((prev) =>
          prev.map((fc) => (fc.fileId === fileId ? result.fileChange : fc))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update fields');
      }
    },
    [session.sessionId]
  );

  const handleRejectFile = useCallback(
    async (fileId: string) => {
      try {
        const result = await rejectFile(session.sessionId, fileId);
        setFileChanges((prev) =>
          prev.map((fc) => (fc.fileId === fileId ? result.fileChange : fc))
        );
        setHoveredFileId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reject file');
      }
    },
    [session.sessionId]
  );

  const handleRestoreFile = useCallback(async (fileId: string) => {
    const fc = fileChanges.find(f => f.fileId === fileId);
    if (!fc) return;

    const firstField = Object.keys(fc.fields)[0] ?? 'series';
    await handleFieldApproval(fileId, firstField, true);
  }, [fileChanges, handleFieldApproval]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const currentIndex = filteredFiles.findIndex((f) => f.fileId === selectedFileId);

      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          if (currentIndex < filteredFiles.length - 1) {
            const nextFile = filteredFiles[currentIndex + 1];
            if (nextFile) {
              setSelectedFileId(nextFile.fileId);
              setHoveredFileId(nextFile.fileId);
              const el = rowRefs.current.get(nextFile.fileId);
              if (el) setAnchorRect(el.getBoundingClientRect());
            }
          }
          break;
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          if (currentIndex > 0) {
            const prevFile = filteredFiles[currentIndex - 1];
            if (prevFile) {
              setSelectedFileId(prevFile.fileId);
              setHoveredFileId(prevFile.fileId);
              const el = rowRefs.current.get(prevFile.fileId);
              if (el) setAnchorRect(el.getBoundingClientRect());
            }
          }
          break;
        case 'Escape':
          e.preventDefault();
          setHoveredFileId(null);
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (selectedFileId) {
            const fc = fileChanges.find((f) => f.fileId === selectedFileId);
            if (fc) {
              if (fc.status === 'rejected') {
                handleRestoreFile(fc.fileId);
              } else {
                handleRejectFile(fc.fileId);
              }
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredFiles, selectedFileId, fileChanges, handleRejectFile, handleRestoreFile]);

  // Batch operations
  const handleBatchAcceptHighConfidence = useCallback(async () => {
    if (!jobId) return;
    const count = highConfidenceFiles.length;
    try {
      for (const fc of highConfidenceFiles) {
        const updates: Record<string, { approved: boolean }> = {};
        Object.keys(fc.fields).forEach(field => {
          updates[field] = { approved: true };
        });
        await updateFieldApprovals(session.sessionId, fc.fileId, updates);
      }
      // Reload all changes
      const result = await getFileChangesByJob(jobId);
      setFileChanges(result.fileChanges);
      setSummary(result.summary);
      setAnnouncement(`Accepted ${count} high confidence files`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to batch accept');
    }
    setShowBatchConfirm(false);
    setBatchAction(null);
  }, [jobId, session.sessionId, highConfidenceFiles]);

  const handleAcceptAll = useCallback(async () => {
    try {
      const result = await acceptAllFiles(session.sessionId);
      setFileChanges(result.fileChanges);
      setAnnouncement(`Accepted all ${result.fileChanges.length} files`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept all');
    }
    setShowBatchConfirm(false);
    setBatchAction(null);
  }, [session.sessionId]);

  const handleRejectAll = useCallback(async () => {
    try {
      const result = await rejectAllFiles(session.sessionId);
      setFileChanges(result.fileChanges);
      setAnnouncement(`Rejected all ${result.fileChanges.length} files`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject all');
    }
    setShowBatchConfirm(false);
    setBatchAction(null);
  }, [session.sessionId]);

  const confirmBatchAction = useCallback((action: 'high-confidence' | 'all' | 'reject-all') => {
    setBatchAction(action);
    setShowBatchConfirm(true);
  }, []);

  const executeBatchAction = useCallback(() => {
    if (batchAction === 'high-confidence') {
      handleBatchAcceptHighConfidence();
    } else if (batchAction === 'all') {
      handleAcceptAll();
    } else if (batchAction === 'reject-all') {
      handleRejectAll();
    }
  }, [batchAction, handleBatchAcceptHighConfidence, handleAcceptAll, handleRejectAll]);

  // Issue browser handlers
  const openIssueBrowser = useCallback((fileId: string) => {
    setIssueBrowserFileId(fileId);
    setIssueBrowserOpen(true);
    setHoveredFileId(null);
  }, []);

  // Open issue browser from drawer (closes drawer first)
  const openIssueBrowserFromDrawer = useCallback((fileId: string) => {
    setDrawerFileId(null);
    setIssueBrowserFileId(fileId);
    setIssueBrowserOpen(true);
  }, []);

  const closeIssueBrowser = useCallback(() => {
    setIssueBrowserOpen(false);
    setIssueBrowserFileId(null);
  }, []);

  const handleIssueSelected = useCallback((updatedFileChange: FileChange) => {
    setFileChanges((prev) =>
      prev.map((fc) => (fc.fileId === updatedFileChange.fileId ? updatedFileChange : fc))
    );
  }, []);

  // File-to-series-group move handlers
  const openMoveToSeriesModal = useCallback((fileId: string) => {
    setFileToMoveId(fileId);
    setShowMoveToSeriesModal(true);
    setDrawerFileId(null); // Close the drawer when opening the modal
  }, []);

  const closeMoveToSeriesModal = useCallback(() => {
    setShowMoveToSeriesModal(false);
    setFileToMoveId(null);
  }, []);

  const handleMoveFileToSeriesGroup = useCallback(async (targetGroupIndex: number) => {
    if (!fileToMoveId) return;

    setIsMovingFile(true);
    try {
      const result = await moveFileToSeriesGroup(session.sessionId, fileToMoveId, targetGroupIndex);

      // Update the file change in state
      setFileChanges((prev) =>
        prev.map((fc) => (fc.fileId === result.fileChange.fileId ? result.fileChange : fc))
      );

      const targetGroup = session.seriesGroups?.[targetGroupIndex];
      setAnnouncement(`File moved to "${targetGroup?.displayName || 'series group'}"`);
      closeMoveToSeriesModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move file');
    } finally {
      setIsMovingFile(false);
    }
  }, [session.sessionId, fileToMoveId, session.seriesGroups, closeMoveToSeriesModal]);

  const handleApply = useCallback(() => {
    setError(null);
    onStartApply();
  }, [onStartApply]);

  // Helpers
  const getApprovedCount = (): number => {
    return fileChanges.filter(
      (fc) =>
        fc.status !== 'rejected' &&
        Object.values(fc.fields).some((f) => f.approved)
    ).length;
  };

  const getConfidenceClass = (confidence: number): string => {
    if (confidence >= 0.8) return 'confidence-high';
    if (confidence >= 0.5) return 'confidence-medium';
    return 'confidence-low';
  };

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'matched': return '\u2713';
      case 'unmatched': return '?';
      case 'rejected': return '\u2717';
      case 'manual': return '\u270E';
      default: return '\u25CB';
    }
  };

  const getStatusClass = (status: string): string => {
    switch (status) {
      case 'matched': return 'status-matched';
      case 'unmatched': return 'status-unmatched';
      case 'rejected': return 'status-rejected';
      case 'manual': return 'status-manual';
      default: return '';
    }
  };

  // Calculate stats
  const readyToApply = getApprovedCount();
  const totalWithChanges = fileChanges.filter(
    (fc) => Object.values(fc.fields).some((f) => f.proposed !== f.current)
  ).length;
  const rejectedCount = fileChanges.filter((fc) => fc.status === 'rejected').length;

  // Get hovered file for preview
  const hoveredFile = hoveredFileId ? fileChanges.find(fc => fc.fileId === hoveredFileId) : null;

  // Get drawer file for editing
  const drawerFile = drawerFileId ? fileChanges.find(fc => fc.fileId === drawerFileId) : null;

  if (loading) {
    return (
      <div className="approval-loading">
        <div className="spinner" />
        <p>Loading file changes...</p>
      </div>
    );
  }

  return (
    <div className="file-review-step-compact">
      {/* Top Stats Bar */}
      <div className="review-stats-bar">
        <div className="stat-group">
          <div className="stat-item">
            <span className="stat-number">{fileChanges.length}</span>
            <span className="stat-label">Total Files</span>
          </div>
          <div className="stat-item stat-success">
            <span className="stat-number">{readyToApply}</span>
            <span className="stat-label">Ready to Apply</span>
          </div>
          <div className="stat-item stat-warning">
            <span className="stat-number">{summary?.unmatched ?? 0}</span>
            <span className="stat-label">Unmatched</span>
          </div>
          <div className="stat-item stat-error">
            <span className="stat-number">{rejectedCount}</span>
            <span className="stat-label">Rejected</span>
          </div>
        </div>
        <div className="progress-bar-container">
          <div
            className="progress-bar-fill"
            style={{ width: `${totalWithChanges > 0 ? (readyToApply / totalWithChanges) * 100 : 0}%` }}
          />
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Screen reader announcements */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {/* Batch Actions Bar */}
      <div className="batch-actions-bar">
        <div className="batch-actions-left">
          {highConfidenceFiles.length > 0 && (
            <button
              className="btn-sm btn-success batch-accept-high"
              onClick={() => confirmBatchAction('high-confidence')}
              disabled={applying}
              title={`Accept ${highConfidenceFiles.length} files with 80%+ confidence`}
            >
              Accept High Confidence ({highConfidenceFiles.length})
            </button>
          )}
          {onChangeSeriesSelection && session.seriesGroups && session.seriesGroups.length > 0 && (
            <button
              className="btn-sm btn-secondary"
              onClick={() => setShowSeriesPicker(true)}
              disabled={applying}
              title="Change the series used for matching"
            >
              Change Series
            </button>
          )}
        </div>
        <div className="batch-actions-right">
          <button
            className="btn-xs btn-ghost"
            onClick={() => confirmBatchAction('all')}
            disabled={applying}
          >
            Accept All
          </button>
          <button
            className="btn-xs btn-ghost"
            onClick={() => confirmBatchAction('reject-all')}
            disabled={applying}
          >
            Reject All
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="compact-list-controls">
        <div className="search-input-wrapper">
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button
              className="search-clear"
              onClick={() => setSearchQuery('')}
            >
              &times;
            </button>
          )}
        </div>

        <div className="filter-row">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
            className="filter-select"
          >
            <option value="all">All Status</option>
            <option value="matched">Matched</option>
            <option value="unmatched">Unmatched</option>
            <option value="rejected">Rejected</option>
            <option value="high-confidence">High Confidence (80%+)</option>
            <option value="low-confidence">Low Confidence (&lt;50%)</option>
          </select>

          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={showOnlyWithChanges}
              onChange={(e) => setShowOnlyWithChanges(e.target.checked)}
            />
            <span>With changes</span>
          </label>

          <span className="file-count-inline">
            {filteredFiles.length} of {fileChanges.length} files
          </span>
        </div>
      </div>

      {/* Compact File List Header */}
      <div className="compact-list-header">
        <span className="col-status">Status</span>
        <span className="col-confidence">Match</span>
        <span className="col-filename">Filename</span>
        <span className="col-match-info">Matched Issue</span>
        <span className="col-changes">Changes</span>
        <span className="col-expand"></span>
      </div>

      {/* Virtualized Compact File List */}
      <div
        className="compact-file-list"
        ref={fileListRef}
        role="listbox"
        aria-label="File list"
        aria-activedescendant={selectedFileId ? `file-${selectedFileId}` : undefined}
      >
        {filteredFiles.length === 0 ? (
          <div className="compact-list-empty" role="status">
            <p>No files match your filters</p>
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const fc = filteredFiles[virtualRow.index];
              if (!fc) return null;

              const changeCount = Object.values(fc.fields).filter(
                (f) => hasMeaningfulChange(f.proposed, f.current)
              ).length;
              const isSelected = fc.fileId === selectedFileId;
              const isHovered = fc.fileId === hoveredFileId;

              return (
                <div
                  key={fc.fileId}
                  id={`file-${fc.fileId}`}
                  ref={(el) => {
                    if (el) rowRefs.current.set(fc.fileId, el);
                  }}
                  data-file-id={fc.fileId}
                  role="option"
                  aria-selected={isSelected}
                  aria-label={`${fc.filename}, ${fc.status}, ${fc.matchConfidence > 0 ? Math.round(fc.matchConfidence * 100) + '% confidence' : 'no match'}`}
                  tabIndex={isSelected ? 0 : -1}
                  className={`compact-file-list-item ${isSelected ? 'selected' : ''} ${isHovered ? 'hovered' : ''} ${getStatusClass(fc.status)}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  onClick={() => {
                    setSelectedFileId(fc.fileId);
                    setDrawerFileId(fc.fileId);
                  }}
                  onMouseEnter={(e) => handleMouseEnter(fc.fileId, e.currentTarget)}
                  onMouseLeave={handleMouseLeave}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    handleTouchStart(fc.fileId, e.currentTarget);
                  }}
                >
                  {/* Status Icon */}
                  <div className="compact-col-status">
                    <span className={`compact-status-icon ${getStatusClass(fc.status)}`}>
                      {getStatusIcon(fc.status)}
                    </span>
                  </div>

                  {/* Confidence */}
                  <div className="compact-col-confidence">
                    {fc.matchConfidence > 0 ? (
                      <span className={`compact-confidence-badge ${getConfidenceClass(fc.matchConfidence)}`}>
                        {Math.round(fc.matchConfidence * 100)}%
                      </span>
                    ) : (
                      <span className="compact-confidence-badge confidence-none">&mdash;</span>
                    )}
                  </div>

                  {/* Filename */}
                  <div className="compact-col-filename" title={fc.filename}>
                    {fc.filename}
                  </div>

                  {/* Match Info */}
                  <div className="compact-col-match-info">
                    {fc.matchedIssue ? (
                      <span className="matched-issue-text">
                        #{fc.matchedIssue.number}
                        {fc.matchedIssue.title && (
                          <span className="issue-title"> &mdash; {fc.matchedIssue.title}</span>
                        )}
                      </span>
                    ) : (
                      <span className="no-match-text">No match</span>
                    )}
                  </div>

                  {/* Change Count */}
                  <div className="compact-col-changes">
                    {changeCount > 0 && (
                      <span className="compact-change-badge">{changeCount}</span>
                    )}
                  </div>

                  {/* Expand Arrow */}
                  <div className="compact-col-expand">
                    <span className="expand-arrow" aria-label="Show preview">
                      &#8250;
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Keyboard hint */}
      <div className="keyboard-hint">
        <span>&#8593;&#8595; Navigate</span>
        <span>Enter Toggle</span>
        <span>Esc Close preview</span>
      </div>

      {/* Footer */}
      <div className="review-footer-v2">
        <button className="btn-secondary" onClick={onCancel} disabled={applying}>
          Cancel
        </button>
        <button
          className="btn-primary btn-apply"
          onClick={handleApply}
          disabled={applying || readyToApply === 0}
        >
          {applying ? (
            <>
              <span className="spinner-inline" />
              Applying...
            </>
          ) : (
            `Apply Changes to ${readyToApply} Files`
          )}
        </button>
      </div>

      {/* Hover Preview Card */}
      {hoveredFile && !drawerFileId && (
        <div
          onMouseEnter={handlePreviewMouseEnter}
          onMouseLeave={handlePreviewMouseLeave}
        >
          <HoverPreviewCard
            fileChange={hoveredFile}
            anchorRect={anchorRect}
            isVisible={!!hoveredFileId}
            onAcceptAll={handleAcceptAllFields}
            onSwitchMatch={openIssueBrowser}
            onReject={handleRejectFile}
            onClose={() => setHoveredFileId(null)}
            disabled={applying}
          />
        </div>
      )}

      {/* Issue Edit Drawer */}
      <IssueEditDrawer
        fileChange={drawerFile ?? null}
        isOpen={!!drawerFileId}
        onClose={() => setDrawerFileId(null)}
        onFieldUpdate={handleDrawerFieldUpdate}
        onAcceptAll={handleAcceptAllFields}
        onSwitchMatch={openIssueBrowserFromDrawer}
        onReject={handleRejectFile}
        onMoveToSeriesGroup={session.seriesGroups && session.seriesGroups.length > 1 ? openMoveToSeriesModal : undefined}
        disabled={applying}
      />

      {/* Batch Confirmation Dialog */}
      {showBatchConfirm && (
        <div className="modal-overlay confirm-overlay" onClick={() => setShowBatchConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Confirm Batch Action</h3>
            <p>
              {batchAction === 'high-confidence' && (
                <>Accept all changes for <strong>{highConfidenceFiles.length}</strong> files with 80%+ match confidence?</>
              )}
              {batchAction === 'all' && (
                <>Accept all changes for <strong>{fileChanges.filter(fc => fc.status !== 'rejected').length}</strong> files?</>
              )}
              {batchAction === 'reject-all' && (
                <>Reject all <strong>{fileChanges.length}</strong> files? No changes will be applied.</>
              )}
            </p>
            <div className="confirm-actions">
              <button className="btn-secondary" onClick={() => setShowBatchConfirm(false)}>
                Cancel
              </button>
              <button
                className={batchAction === 'reject-all' ? 'btn-danger' : 'btn-primary'}
                onClick={executeBatchAction}
              >
                {batchAction === 'reject-all' ? 'Reject All' : 'Accept'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Issue Browser Modal */}
      {issueBrowserOpen && issueBrowserFileId && (
        <IssueBrowserModal
          sessionId={session.sessionId}
          jobId={jobId}
          fileId={issueBrowserFileId}
          filename={fileChanges.find((fc) => fc.fileId === issueBrowserFileId)?.filename || ''}
          currentMatchedIssueId={
            fileChanges.find((fc) => fc.fileId === issueBrowserFileId)?.matchedIssue?.sourceId || null
          }
          onClose={closeIssueBrowser}
          onIssueSelected={handleIssueSelected}
        />
      )}

      {/* Series Picker Modal */}
      {showSeriesPicker && onChangeSeriesSelection && (
        <div className="modal-overlay confirm-overlay" onClick={() => setShowSeriesPicker(false)}>
          <div className="confirm-dialog series-picker-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Change Series Selection</h3>
            <p className="series-picker-hint">
              Select a series group to change its metadata source. This will allow you to pick a different series for matching issues.
            </p>
            <div className="series-picker-list">
              {session.seriesGroups?.map((group, index) => {
                // Determine the source label for pre-approved groups
                const getSourceLabel = () => {
                  if (group.preApprovedFromDatabase) {
                    return <span className="auto-match-badge auto-match-db">auto-matched from library</span>;
                  }
                  if (group.preApprovedFromSeriesJson) {
                    return <span className="auto-match-badge auto-match-file">from series.json</span>;
                  }
                  return null;
                };

                return (
                  <button
                    key={index}
                    className="series-picker-item"
                    onClick={() => {
                      setShowSeriesPicker(false);
                      onChangeSeriesSelection(index);
                    }}
                  >
                    <div className="series-picker-item-name">
                      {group.displayName}
                      {getSourceLabel()}
                    </div>
                    <div className="series-picker-item-meta">
                      <span className="file-count">{group.fileCount} files</span>
                      {group.selectedSeries && (
                        <span className="current-match">
                          Currently: {group.selectedSeries.name}
                          {group.selectedSeries.startYear && ` (${group.selectedSeries.startYear})`}
                          {group.issueMatchingSeries && group.issueMatchingSeries.sourceId !== group.selectedSeries.sourceId && (
                            <span className="issue-match-note"> / Issues from: {group.issueMatchingSeries.name}</span>
                          )}
                        </span>
                      )}
                      {group.status === 'skipped' && (
                        <span className="status-skipped">Skipped</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="confirm-actions">
              <button className="btn-secondary" onClick={() => setShowSeriesPicker(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move File to Series Group Modal */}
      {showMoveToSeriesModal && fileToMoveId && session.seriesGroups && (
        <div className="modal-overlay confirm-overlay" onClick={closeMoveToSeriesModal}>
          <div className="confirm-dialog series-picker-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Move File to Series</h3>
            <p className="series-picker-hint">
              Select a series group to move this file to. The file will be re-matched against the new series' issues.
            </p>
            <div className="file-info-preview">
              <span className="label">File:</span>
              <span className="filename" title={fileChanges.find(fc => fc.fileId === fileToMoveId)?.filename}>
                {fileChanges.find(fc => fc.fileId === fileToMoveId)?.filename}
              </span>
            </div>
            <div className="series-picker-list">
              {session.seriesGroups.map((group, index) => {
                // Find current group for this file
                const isCurrentGroup = group.fileIds?.includes(fileToMoveId);

                return (
                  <button
                    key={index}
                    className={`series-picker-item ${isCurrentGroup ? 'current' : ''}`}
                    onClick={() => !isCurrentGroup && handleMoveFileToSeriesGroup(index)}
                    disabled={isCurrentGroup || isMovingFile}
                  >
                    <div className="series-picker-item-name">
                      {group.displayName}
                      {isCurrentGroup && <span className="current-badge">Current</span>}
                    </div>
                    <div className="series-picker-item-meta">
                      <span className="file-count">{group.fileCount} files</span>
                      {group.selectedSeries && (
                        <span className="current-match">
                          {group.selectedSeries.name}
                          {group.selectedSeries.startYear && ` (${group.selectedSeries.startYear})`}
                        </span>
                      )}
                      {group.status === 'skipped' && (
                        <span className="status-skipped">Skipped</span>
                      )}
                      {group.status === 'pending' && (
                        <span className="status-pending">Not yet matched</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="confirm-actions">
              <button className="btn-secondary" onClick={closeMoveToSeriesModal} disabled={isMovingFile}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FileReviewStep;
