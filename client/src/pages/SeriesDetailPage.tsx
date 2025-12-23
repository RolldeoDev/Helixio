/**
 * SeriesDetailPage Component
 *
 * Detailed view of a single series with issues, metadata, and actions.
 * Part of the Series-Centric Architecture UI.
 *
 * Performance optimizations:
 * - Virtualized issues grid (only renders visible items)
 * - Scroll state detection (disables animations during rapid scroll)
 * - CSS containment on individual cards
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getSeries,
  getSeriesIssues,
  getNextSeriesIssue,
  getCoverUrl,
  getApiCoverUrl,
  markAsCompleted,
  markAsIncomplete,
  rebuildCache,
  fetchSeriesMetadata,
  Series,
  SeriesIssue,
  SeriesForMerge,
} from '../services/api.service';
import { useMetadataJob } from '../contexts/MetadataJobContext';
import {
  CoverCard,
  SERIES_ISSUE_MENU_ITEMS,
  type MenuItemPreset,
} from '../components/CoverCard';
import { MetadataEditor } from '../components/MetadataEditor';
import { EditSeriesModal } from '../components/EditSeriesModal';
import { SeriesSelectModal } from '../components/SeriesSelectModal';
import { MergeSeriesModal } from '../components/MergeSeriesModal';
import { ActionMenu, type ActionMenuItem } from '../components/ActionMenu';
import { MarkdownContent } from '../components/MarkdownContent';
import { QuickCollectionIcons } from '../components/QuickCollectionIcons';
import { CollectionFlyout } from '../components/CollectionFlyout';
import { CollectionPickerModal } from '../components/CollectionPickerModal';
import { useVirtualGrid } from '../hooks/useVirtualGrid';
import './SeriesDetailPage.css';

// =============================================================================
// Menu Configurations
// =============================================================================

/** Series-level actions */
const SERIES_ACTION_ITEMS: ActionMenuItem[] = [
  { id: 'editSeries', label: 'Edit Series' },
  { id: 'fetchSeriesMetadata', label: 'Fetch Metadata (Series)', dividerBefore: true },
  { id: 'fetchAllIssuesMetadata', label: 'Fetch Metadata (All Issues)' },
  { id: 'markAllRead', label: 'Mark All as Read', dividerBefore: true },
  { id: 'markAllUnread', label: 'Mark All as Unread' },
  { id: 'mergeWith', label: 'Merge with...', dividerBefore: true },
  { id: 'rebuildCache', label: 'Rebuild All Covers', dividerBefore: true },
];

/** Issue-level actions (for selected issues) */
const ISSUE_BULK_ACTION_ITEMS: ActionMenuItem[] = [
  { id: 'markRead', label: 'Mark as Read' },
  { id: 'markUnread', label: 'Mark as Unread' },
  { id: 'fetchMetadata', label: 'Fetch Metadata', dividerBefore: true },
  { id: 'rebuildCache', label: 'Rebuild Cover Cache', dividerBefore: true },
];

// =============================================================================
// VirtualizedIssuesGrid - Performance optimized issues grid
// =============================================================================

interface VirtualizedIssuesGridProps {
  issues: SeriesIssue[];
  selectedFiles: Set<string>;
  onIssueClick: (fileId: string, event: React.MouseEvent) => void;
  onReadIssue: (fileId: string) => void;
  onSelectionChange: (fileId: string, selected: boolean) => void;
  onMenuAction: (action: MenuItemPreset | string, fileId: string) => void;
}

function VirtualizedIssuesGrid({
  issues,
  selectedFiles,
  onIssueClick,
  onReadIssue,
  onSelectionChange,
  onMenuAction,
}: VirtualizedIssuesGridProps) {
  // Grid item dimensions (medium size cards)
  const itemWidth = 180;
  const itemHeight = 280;
  const gap = 16;

  // Virtualization with built-in scroll state detection
  const { virtualItems, totalHeight, containerRef, isScrolling } = useVirtualGrid(issues, {
    itemWidth,
    itemHeight,
    gap,
    overscan: 3,
  });

  if (issues.length === 0) {
    return (
      <div className="series-issues-empty">
        <p>No issues found in this series.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`series-issues-scroll-container ${isScrolling ? 'scrolling' : ''}`}
    >
      <div
        className="series-issues-virtual"
        style={{ height: totalHeight, position: 'relative' }}
      >
        {virtualItems.map(({ item: issue, style }) => (
          <div key={issue.id} style={style} className="series-issue-item">
            <CoverCard
              file={issue}
              progress={issue.readingProgress ? {
                currentPage: issue.readingProgress.currentPage,
                totalPages: issue.readingProgress.totalPages,
                completed: issue.readingProgress.completed,
              } : undefined}
              variant="grid"
              size="medium"
              selectable={true}
              isSelected={selectedFiles.has(issue.id)}
              checkboxVisibility="hover"
              contextMenuEnabled={true}
              menuItems={SERIES_ISSUE_MENU_ITEMS}
              selectedCount={selectedFiles.size || 1}
              showInfo={true}
              showSeries={false}
              showIssueNumber={true}
              onClick={onIssueClick}
              onDoubleClick={onReadIssue}
              onRead={onReadIssue}
              onSelectionChange={onSelectionChange}
              onMenuAction={onMenuAction}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Main SeriesDetailPage Component
// =============================================================================

export function SeriesDetailPage() {
  const { seriesId } = useParams<{ seriesId: string }>();
  const navigate = useNavigate();
  const { startJob, lastCompletedJobAt } = useMetadataJob();

  const [series, setSeries] = useState<Series | null>(null);
  const [issues, setIssues] = useState<SeriesIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextIssue, setNextIssue] = useState<{ id: string; filename: string } | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [editingMetadataFileIds, setEditingMetadataFileIds] = useState<string[] | null>(null);
  const [isEditSeriesModalOpen, setIsEditSeriesModalOpen] = useState(false);

  // Merge modal state
  const [showSeriesSelectModal, setShowSeriesSelectModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [selectedMergeSeries, setSelectedMergeSeries] = useState<SeriesForMerge[]>([]);

  // Description expand/collapse state
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [descriptionNeedsTruncation, setDescriptionNeedsTruncation] = useState(false);
  const descriptionRef = useRef<HTMLDivElement>(null);

  // Collection picker modal state
  const [collectionPickerFileIds, setCollectionPickerFileIds] = useState<string[]>([]);

  // Fetch series data (all issues at once for infinite scroll)
  const fetchSeries = useCallback(async () => {
    if (!seriesId) return;

    setLoading(true);
    setError(null);

    try {
      const [seriesResult, issuesResult, nextResult] = await Promise.all([
        getSeries(seriesId),
        getSeriesIssues(seriesId, { all: true, sortBy: 'number', sortOrder: 'asc' }),
        getNextSeriesIssue(seriesId),
      ]);

      setSeries(seriesResult.series);
      setIssues(issuesResult.issues);

      if (nextResult.nextIssue) {
        setNextIssue({
          id: nextResult.nextIssue.id,
          filename: nextResult.nextIssue.filename,
        });
      } else {
        setNextIssue(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load series');
    } finally {
      setLoading(false);
    }
  }, [seriesId]);

  useEffect(() => {
    fetchSeries();
  }, [fetchSeries]);

  // Refresh series data when a metadata job completes
  useEffect(() => {
    if (lastCompletedJobAt) {
      fetchSeries();
    }
  }, [lastCompletedJobAt, fetchSeries]);

  // Check if description needs truncation
  useEffect(() => {
    if (descriptionRef.current) {
      const lineHeight = parseFloat(getComputedStyle(descriptionRef.current).lineHeight);
      const maxHeight = lineHeight * 4; // 4 lines
      setDescriptionNeedsTruncation(descriptionRef.current.scrollHeight > maxHeight + 2);
    }
  }, [series?.summary, series?.deck]);

  const handleContinueReading = () => {
    if (nextIssue) {
      navigate(`/read/${nextIssue.id}?filename=${encodeURIComponent(nextIssue.filename)}`);
    }
  };

  const handleReadIssue = useCallback((fileId: string) => {
    const issue = issues.find((i) => i.id === fileId);
    if (issue) {
      navigate(`/read/${issue.id}?filename=${encodeURIComponent(issue.filename)}`);
    }
  }, [issues, navigate]);

  // Handle click on issue card
  const handleIssueClick = useCallback((fileId: string, e: React.MouseEvent) => {
    // Handle shift-click for range selection (toggle selection)
    if (e.shiftKey) {
      setSelectedFiles((prev) => {
        const next = new Set(prev);
        if (next.has(fileId)) {
          next.delete(fileId);
        } else {
          next.add(fileId);
        }
        return next;
      });
      return;
    }

    // Handle ctrl/cmd-click for multi-select (toggle selection)
    if (e.ctrlKey || e.metaKey) {
      setSelectedFiles((prev) => {
        const next = new Set(prev);
        if (next.has(fileId)) {
          next.delete(fileId);
        } else {
          next.add(fileId);
        }
        return next;
      });
      return;
    }

    // Plain click (no modifiers) - navigate to issue detail
    navigate(`/issue/${fileId}`);
  }, [navigate]);

  // Handle selection change from checkbox
  const handleSelectionChange = useCallback((fileId: string, selected: boolean) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(fileId);
      } else {
        next.delete(fileId);
      }
      return next;
    });
  }, []);

  // Handle context menu action
  const handleMenuAction = useCallback(async (action: MenuItemPreset | string, fileId: string) => {
    // Get all selected file IDs (include the right-clicked one)
    const targetIds = selectedFiles.has(fileId)
      ? Array.from(selectedFiles)
      : [fileId];

    switch (action) {
      case 'read':
        handleReadIssue(fileId);
        break;

      case 'markRead':
        try {
          setOperationMessage(`Marking ${targetIds.length} issue(s) as read...`);
          await Promise.all(targetIds.map((id) => markAsCompleted(id)));
          setOperationMessage('Marked as read');
          // Refresh to update progress
          fetchSeries();
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to mark as read'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'markUnread':
        try {
          setOperationMessage(`Marking ${targetIds.length} issue(s) as unread...`);
          await Promise.all(targetIds.map((id) => markAsIncomplete(id)));
          setOperationMessage('Marked as unread');
          // Refresh to update progress
          fetchSeries();
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to mark as unread'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'addToCollection':
        // Open collection picker modal
        setCollectionPickerFileIds(targetIds);
        break;

      case 'fetchMetadata':
        // Start metadata job with these files
        startJob(targetIds);
        break;

      case 'editMetadata':
        // Open metadata editor modal for selected files
        setEditingMetadataFileIds(targetIds);
        break;

      case 'rebuildCache':
        try {
          setOperationMessage(`Rebuilding cache for ${targetIds.length} file(s)...`);
          await rebuildCache({ fileIds: targetIds, type: 'full' });
          setOperationMessage('Cache rebuild started');
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to rebuild cache'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;
    }
  }, [selectedFiles, handleReadIssue, fetchSeries, navigate]);

  // Helper to convert Series to SeriesForMerge
  const seriesToMergeFormat = (s: Series): SeriesForMerge => ({
    id: s.id,
    name: s.name,
    publisher: s.publisher,
    startYear: s.startYear,
    endYear: s.endYear,
    issueCount: s.issueCount,
    ownedIssueCount: s._count?.issues ?? 0,
    comicVineId: s.comicVineId,
    metronId: s.metronId,
    coverUrl: s.coverUrl,
    coverHash: s.coverHash,
    coverFileId: s.coverFileId,
    aliases: s.aliases,
    summary: s.summary,
    type: s.type,
    createdAt: String(s.createdAt ?? new Date().toISOString()),
    updatedAt: String(s.updatedAt ?? new Date().toISOString()),
  });

  // Handle series selection for merge
  const handleSeriesSelectedForMerge = (selectedSeries: Series[]) => {
    if (!series) return;

    // Convert current series to SeriesForMerge format
    const currentSeriesForMerge = seriesToMergeFormat(series);

    // Convert selected series to SeriesForMerge format
    const selectedSeriesForMerge = selectedSeries.map(seriesToMergeFormat);

    // Combine current series with selected series
    setSelectedMergeSeries([currentSeriesForMerge, ...selectedSeriesForMerge]);
    setShowSeriesSelectModal(false);
    setShowMergeModal(true);
  };

  // Handle merge complete
  const handleMergeComplete = () => {
    setShowMergeModal(false);
    setSelectedMergeSeries([]);
    // Refresh to get updated data (or navigate away if this series was merged into another)
    fetchSeries();
  };

  // Handle series-level actions from ActionMenu
  const handleSeriesAction = useCallback(async (actionId: string) => {
    if (!series) return;

    switch (actionId) {
      case 'editSeries':
        setIsEditSeriesModalOpen(true);
        break;

      case 'fetchSeriesMetadata':
        // Fetch metadata for the series itself
        try {
          setOperationMessage('Fetching series metadata...');
          const result = await fetchSeriesMetadata(series.id);
          if (result.needsSearch) {
            setOperationMessage('No linked metadata source. Use Edit Series to search and link.');
          } else if (result.metadata) {
            setOperationMessage('Series metadata updated');
            fetchSeries();
          } else {
            setOperationMessage(result.message || 'No metadata found');
          }
          setTimeout(() => setOperationMessage(null), 3000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to fetch metadata'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'fetchAllIssuesMetadata':
        // Start metadata job for all issues in the series
        const allIssueIds = issues.map((i) => i.id);
        if (allIssueIds.length > 0) {
          startJob(allIssueIds);
        }
        break;

      case 'markAllRead':
        try {
          setOperationMessage('Marking all issues as read...');
          await Promise.all(issues.map((i) => markAsCompleted(i.id)));
          setOperationMessage('All issues marked as read');
          fetchSeries();
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to mark as read'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'markAllUnread':
        try {
          setOperationMessage('Marking all issues as unread...');
          await Promise.all(issues.map((i) => markAsIncomplete(i.id)));
          setOperationMessage('All issues marked as unread');
          fetchSeries();
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to mark as unread'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'mergeWith':
        setShowSeriesSelectModal(true);
        break;

      case 'rebuildCache':
        try {
          const allFileIds = issues.map((i) => i.id);
          setOperationMessage(`Rebuilding cache for ${allFileIds.length} file(s)...`);
          await rebuildCache({ fileIds: allFileIds, type: 'full' });
          setOperationMessage('Cache rebuild started');
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to rebuild cache'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;
    }
  }, [series, issues, startJob, fetchSeries]);

  // Handle bulk issue actions from ActionMenu
  const handleBulkIssueAction = useCallback(async (actionId: string) => {
    if (selectedFiles.size === 0) return;

    const targetIds = Array.from(selectedFiles);

    switch (actionId) {
      case 'markRead':
        try {
          setOperationMessage(`Marking ${targetIds.length} issue(s) as read...`);
          await Promise.all(targetIds.map((id) => markAsCompleted(id)));
          setOperationMessage('Marked as read');
          fetchSeries();
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to mark as read'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'markUnread':
        try {
          setOperationMessage(`Marking ${targetIds.length} issue(s) as unread...`);
          await Promise.all(targetIds.map((id) => markAsIncomplete(id)));
          setOperationMessage('Marked as unread');
          fetchSeries();
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to mark as unread'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'fetchMetadata':
        startJob(targetIds);
        break;

      case 'rebuildCache':
        try {
          setOperationMessage(`Rebuilding cache for ${targetIds.length} file(s)...`);
          await rebuildCache({ fileIds: targetIds, type: 'full' });
          setOperationMessage('Cache rebuild started');
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to rebuild cache'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;
    }
  }, [selectedFiles, startJob, fetchSeries]);

  if (loading) {
    return (
      <div className="series-detail-loading">
        <div className="spinner" />
        Loading series...
      </div>
    );
  }

  if (error) {
    return (
      <div className="series-detail-error">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/series')}>Back to Series</button>
      </div>
    );
  }

  if (!series) {
    return (
      <div className="series-detail-error">
        <h2>Series Not Found</h2>
        <button onClick={() => navigate('/series')}>Back to Series</button>
      </div>
    );
  }

  // Progress calculations
  const progress = series.progress;
  const totalOwned = progress?.totalOwned ?? series._count?.issues ?? issues.length;
  const totalRead = progress?.totalRead ?? 0;
  const progressPercent = totalOwned > 0 ? Math.round((totalRead / totalOwned) * 100) : 0;
  const isComplete = totalOwned > 0 && totalRead >= totalOwned;

  // Cover URL with fallback priority: User-set file > API cover (local cache) > First Issue
  const firstIssueId = issues[0]?.id;
  const coverUrl = series.coverFileId
    ? getCoverUrl(series.coverFileId)
    : series.coverHash
      ? getApiCoverUrl(series.coverHash)
      : firstIssueId
        ? getCoverUrl(firstIssueId)
        : null;

  // Parse genres and tags
  const genreList = series.genres?.split(',').map((g) => g.trim()).filter(Boolean) ?? [];
  const tagList = series.tags?.split(',').map((t) => t.trim()).filter(Boolean) ?? [];
  const characterList = series.characters?.split(',').map((c) => c.trim()).filter(Boolean) ?? [];
  const teamList = series.teams?.split(',').map((t) => t.trim()).filter(Boolean) ?? [];
  const locationList = series.locations?.split(',').map((l) => l.trim()).filter(Boolean) ?? [];
  const storyArcList = series.storyArcs?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];

  // Format year range
  const yearRange = series.startYear
    ? series.endYear && series.endYear !== series.startYear
      ? `${series.startYear} – ${series.endYear}`
      : String(series.startYear)
    : null;

  // Check if series has any metadata to show
  const hasDescription = series.summary || series.deck;
  // Details grid only shows items NOT already in the header (volume, issueCount, languageISO)
  const hasDetails = series.volume || series.issueCount || series.languageISO;
  const hasTags = genreList.length > 0 || tagList.length > 0;
  const hasCharacters = characterList.length > 0 || teamList.length > 0;
  const hasLocationsOrArcs = locationList.length > 0 || storyArcList.length > 0;

  return (
    <div className="series-detail-page">
      {/* Back button */}
      <button className="back-btn" onClick={() => navigate('/series')}>
        &larr; Back to Series
      </button>

      {/* Header section */}
      <div className="series-detail-header">
        <div className="series-detail-cover">
          {coverUrl ? (
            <img src={coverUrl} alt={series.name} />
          ) : (
            <div className="cover-placeholder">
              <span className="series-initial">{series.name.charAt(0).toUpperCase()}</span>
            </div>
          )}
        </div>

        <div className="series-detail-info">
          <h1>{series.name}</h1>

          {/* Primary meta line */}
          <div className="series-meta-primary">
            {yearRange && <span className="meta-year">{yearRange}</span>}
            {series.publisher && (
              <a className="meta-publisher" href={`/series?publisher=${encodeURIComponent(series.publisher)}`}>
                {series.publisher}
              </a>
            )}
            {series.type === 'manga' && <span className="meta-badge manga">Manga</span>}
            {series.ageRating && <span className="meta-badge age-rating">{series.ageRating}</span>}
          </div>

          {/* Progress bar */}
          <div className="series-progress-container">
            <div className="series-progress-bar">
              <div
                className="series-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="series-progress-text">
              {totalRead} / {totalOwned} read ({progressPercent}%)
              {isComplete && ' ✓'}
            </span>
          </div>

          {/* Actions */}
          <div className="series-actions">
            {nextIssue && (
              <button className="btn-primary" onClick={handleContinueReading}>
                Continue Reading
              </button>
            )}
            {!nextIssue && isComplete && (
              <span className="series-complete-badge">Series Complete</span>
            )}
            <QuickCollectionIcons seriesId={series.id} size="medium" />
            <CollectionFlyout seriesId={series.id} size="medium" align="right" />
            <ActionMenu
              items={SERIES_ACTION_ITEMS}
              onAction={handleSeriesAction}
              ariaLabel="Series actions"
              size="medium"
            />
          </div>
        </div>
      </div>

      {/* Compact metadata row */}
      {(hasDescription || hasDetails || hasTags) && (
        <div className="series-metadata-compact">
          {/* Description - main column */}
          {hasDescription && (
            <div className="metadata-description">
              <div
                ref={descriptionRef}
                className={`series-description-content ${isDescriptionExpanded ? 'expanded' : descriptionNeedsTruncation ? 'collapsed' : ''}`}
              >
                {series.deck && !series.summary && (
                  <MarkdownContent content={series.deck} className="series-deck" />
                )}
                {series.summary && (
                  <MarkdownContent content={series.summary} className="series-summary-text" />
                )}
              </div>
              {descriptionNeedsTruncation && (
                <button
                  className="description-toggle"
                  onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                  aria-expanded={isDescriptionExpanded}
                >
                  {isDescriptionExpanded ? 'Show less' : '... Show more'}
                </button>
              )}
            </div>
          )}

          {/* Sidebar with details and tags */}
          <div className="metadata-sidebar">
            {/* Quick stats inline */}
            {hasDetails && (
              <div className="metadata-stats">
                {series.issueCount && (
                  <div className="stat-item">
                    <span className="stat-value">{series.issueCount}</span>
                    <span className="stat-label">Total Issues</span>
                  </div>
                )}
                {series.volume && (
                  <div className="stat-item">
                    <span className="stat-value">Vol. {series.volume}</span>
                    <span className="stat-label">Volume</span>
                  </div>
                )}
                {series.languageISO && (
                  <div className="stat-item">
                    <span className="stat-value">{series.languageISO.toUpperCase()}</span>
                    <span className="stat-label">Language</span>
                  </div>
                )}
              </div>
            )}

            {/* Genres inline */}
            {genreList.length > 0 && (
              <div className="metadata-tags-inline">
                {genreList.map((genre) => (
                  <span key={genre} className="tag genre-tag">
                    {genre}
                  </span>
                ))}
              </div>
            )}

            {/* Tags inline */}
            {tagList.length > 0 && (
              <div className="metadata-tags-inline">
                {tagList.map((tag) => (
                  <span key={tag} className="tag">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* User notes - separate if exists */}
      {series.userNotes && (
        <div className="series-user-notes">
          <p className="user-notes">{series.userNotes}</p>
        </div>
      )}

      {/* Issues section - moved above entities */}
      <div className="series-issues-section">
        <div className="series-issues-header">
          <h2>Issues <span className="issue-count-pill">{totalOwned}</span></h2>
          <div className="series-issues-header-actions">
            {selectedFiles.size > 0 && (
              <div className="series-issues-selection-info">
                <span>{selectedFiles.size} selected</span>
                <button
                  className="btn-ghost"
                  onClick={() => setSelectedFiles(new Set())}
                >
                  Clear
                </button>
                <ActionMenu
                  items={ISSUE_BULK_ACTION_ITEMS.map(item => ({
                    ...item,
                    label: item.label + ` (${selectedFiles.size})`,
                  }))}
                  onAction={handleBulkIssueAction}
                  ariaLabel="Bulk issue actions"
                  size="small"
                />
              </div>
            )}
          </div>
        </div>

        {/* Operation message */}
        {operationMessage && (
          <div className="series-operation-message">
            {operationMessage}
          </div>
        )}

        {/* Virtualized Issues Grid with Navigation Sidebar */}
        <VirtualizedIssuesGrid
          issues={issues}
          selectedFiles={selectedFiles}
          onIssueClick={handleIssueClick}
          onReadIssue={handleReadIssue}
          onSelectionChange={handleSelectionChange}
          onMenuAction={handleMenuAction}
        />
      </div>

      {/* Characters/Teams and Locations/Story Arcs - Two column layout */}
      {(hasCharacters || hasLocationsOrArcs) && (
        <div className="series-entities-section">
          {/* Left column: Characters and Teams */}
          <div className="entities-column">
            {characterList.length > 0 && (
              <div className="entity-group">
                <h3>Characters</h3>
                <div className="entity-list">
                  {characterList.map((character) => (
                    <span key={character} className="entity-chip character">
                      {character}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {teamList.length > 0 && (
              <div className="entity-group">
                <h3>Teams</h3>
                <div className="entity-list">
                  {teamList.map((team) => (
                    <span key={team} className="entity-chip team">
                      {team}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right column: Locations and Story Arcs */}
          <div className="entities-column">
            {locationList.length > 0 && (
              <div className="entity-group">
                <h3>Locations</h3>
                <div className="entity-list">
                  {locationList.map((location) => (
                    <span key={location} className="entity-chip location">
                      {location}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {storyArcList.length > 0 && (
              <div className="entity-group">
                <h3>Story Arcs</h3>
                <div className="entity-list">
                  {storyArcList.map((arc) => (
                    <span key={arc} className="entity-chip arc">
                      {arc}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Metadata Editor Modal */}
      {editingMetadataFileIds && (
        <div className="modal-overlay" onClick={() => setEditingMetadataFileIds(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <MetadataEditor
              fileIds={editingMetadataFileIds}
              onClose={() => setEditingMetadataFileIds(null)}
              onSave={() => {
                setEditingMetadataFileIds(null);
                fetchSeries();
              }}
            />
          </div>
        </div>
      )}

      {/* Edit Series Modal */}
      {seriesId && (
        <EditSeriesModal
          seriesId={seriesId}
          isOpen={isEditSeriesModalOpen}
          onClose={() => setIsEditSeriesModalOpen(false)}
          onSave={() => {
            fetchSeries();
          }}
        />
      )}

      {/* Series Select Modal for Merge */}
      <SeriesSelectModal
        isOpen={showSeriesSelectModal}
        onClose={() => setShowSeriesSelectModal(false)}
        onSelect={handleSeriesSelectedForMerge}
        excludeIds={seriesId ? [seriesId] : []}
        title="Select Series to Merge"
        multiSelect={true}
      />

      {/* Merge Series Modal */}
      {showMergeModal && selectedMergeSeries.length > 0 && (
        <MergeSeriesModal
          isOpen={showMergeModal}
          onClose={() => {
            setShowMergeModal(false);
            setSelectedMergeSeries([]);
          }}
          onMergeComplete={handleMergeComplete}
          initialSeries={selectedMergeSeries}
          initialTargetId={seriesId}
        />
      )}

      {/* Collection Picker Modal */}
      <CollectionPickerModal
        isOpen={collectionPickerFileIds.length > 0}
        onClose={() => setCollectionPickerFileIds([])}
        fileIds={collectionPickerFileIds}
      />

    </div>
  );
}
