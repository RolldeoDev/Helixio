/**
 * CollectionDetailPage Component
 *
 * Detailed view of a single collection with issues from multiple series.
 * Provides browsing experience similar to SeriesDetailPage but for collections.
 *
 * Features:
 * - Cinematic hero section with collection cover and stats
 * - Toggle between flat grid and grouped-by-series views
 * - "Collection" badge for visual distinction
 * - Aggregate progress stats
 * - Continue Reading and Surprise Me buttons
 * - Read status and series filtering
 * - Virtualized grid for performance
 *
 * Performance optimizations:
 * - Single API call for all collection data (getCollectionExpanded)
 * - Window-based virtualization using useWindowVirtualGrid
 * - Scroll state tracking to disable animations during scroll
 * - Memoized filtering and grouping
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getCollectionExpanded,
  getCoverUrl,
  getApiCoverUrl,
  getCollectionCoverUrl,
  CollectionExpandedData,
  CollectionExpandedIssue,
  markAsCompleted,
  markAsIncomplete,
} from '../services/api.service';
import { useBreadcrumbs, NavigationOrigin } from '../contexts/BreadcrumbContext';
import { DetailHeroSection } from '../components/DetailHeroSection';
import { CoverCard, SERIES_ISSUE_MENU_ITEMS, type MenuItemPreset } from '../components/CoverCard';
import { ExpandablePillSection } from '../components/ExpandablePillSection';
import { ActionMenu, type ActionMenuItem } from '../components/ActionMenu';
import { useWindowVirtualGrid } from '../hooks/useWindowVirtualGrid';
import { useMetadataJob } from '../contexts/MetadataJobContext';
import './CollectionDetailPage.css';

// =============================================================================
// Types
// =============================================================================

type ViewMode = 'flat' | 'grouped';
type ReadStatusFilter = 'all' | 'unread' | 'in-progress' | 'completed';

// =============================================================================
// Collection Action Items
// =============================================================================

const COLLECTION_ACTION_ITEMS: ActionMenuItem[] = [
  { id: 'editCollection', label: 'Edit Collection' },
  { id: 'markAllRead', label: 'Mark All as Read', dividerBefore: true },
  { id: 'markAllUnread', label: 'Mark All as Unread' },
];

// =============================================================================
// Helper Functions
// =============================================================================

function formatTimeRemaining(totalMinutes: number): string {
  if (totalMinutes < 60) {
    return `${Math.round(totalMinutes)}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

// Convert CollectionExpandedIssue to a shape CoverCard expects
function issueToFileShape(issue: CollectionExpandedIssue) {
  return {
    id: issue.id,
    libraryId: '',
    path: '',
    relativePath: issue.relativePath,
    filename: issue.filename,
    size: issue.size,
    hash: null,
    status: 'indexed' as const,
    modifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    seriesId: issue.seriesId,
    metadata: issue.metadata ? {
      id: '',
      series: issue.seriesName,
      number: issue.metadata.number,
      title: issue.metadata.title,
      volume: null,
      year: null,
      month: null,
      writer: issue.metadata.writer,
      penciller: null,
      publisher: null,
      genre: null,
      summary: null,
      characters: null,
      teams: null,
    } : null,
  };
}

// =============================================================================
// VirtualizedIssuesGrid - Flat view with virtualization
// =============================================================================

interface VirtualizedIssuesGridProps {
  issues: CollectionExpandedIssue[];
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
  const { virtualItems, totalHeight, containerRef, isScrolling } = useWindowVirtualGrid(issues, {
    sliderValue: 5,
    gap: 16,
    overscan: 5,
    aspectRatio: 1.5,
    infoHeight: 60,
    minCoverWidth: 80,
    maxCoverWidth: 350,
  });

  if (issues.length === 0) {
    return (
      <div className="collection-issues-empty">
        <p>No issues in this collection.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`collection-issues-grid-container ${isScrolling ? 'scrolling' : ''}`}
    >
      <div
        className="collection-issues-virtual"
        style={{ height: totalHeight, position: 'relative' }}
      >
        {virtualItems.map(({ item: issue, style }) => (
          <div key={issue.id} style={style} className="collection-issue-item">
            <CoverCard
              file={issueToFileShape(issue)}
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
              showSeries={true}
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
// GroupedGrid - Issues organized by series
// =============================================================================

interface SeriesGroup {
  seriesId: string;
  seriesName: string;
  issues: CollectionExpandedIssue[];
  readCount: number;
  totalCount: number;
}

interface GroupedGridProps {
  groups: SeriesGroup[];
  expandedGroups: Set<string>;
  selectedFiles: Set<string>;
  isScrolling: boolean;
  onToggleGroup: (seriesId: string) => void;
  onIssueClick: (fileId: string, event: React.MouseEvent) => void;
  onReadIssue: (fileId: string) => void;
  onSelectionChange: (fileId: string, selected: boolean) => void;
  onMenuAction: (action: MenuItemPreset | string, fileId: string) => void;
}

function GroupedGrid({
  groups,
  expandedGroups,
  selectedFiles,
  isScrolling,
  onToggleGroup,
  onIssueClick,
  onReadIssue,
  onSelectionChange,
  onMenuAction,
}: GroupedGridProps) {
  if (groups.length === 0) {
    return (
      <div className="collection-issues-empty">
        <p>No issues in this collection.</p>
      </div>
    );
  }

  return (
    <div className={`collection-grouped-grid ${isScrolling ? 'scrolling' : ''}`}>
      {groups.map((group) => {
        const isExpanded = expandedGroups.has(group.seriesId);

        return (
          <div key={group.seriesId} className="collection-series-group">
            <button
              className="collection-series-header"
              onClick={() => onToggleGroup(group.seriesId)}
              aria-expanded={isExpanded}
            >
              <span className="collection-series-chevron">
                {isExpanded ? '▼' : '▶'}
              </span>
              <span className="collection-series-name">{group.seriesName}</span>
              <span className="collection-series-count">
                {group.readCount}/{group.totalCount} read
              </span>
            </button>

            {isExpanded && (
              <div className="collection-series-issues">
                {group.issues.map((issue) => (
                  <div key={issue.id} className="collection-series-issue-item">
                    <CoverCard
                      file={issueToFileShape(issue)}
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
            )}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// Main CollectionDetailPage Component
// =============================================================================

export function CollectionDetailPage() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const navigate = useNavigate();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { startJob, lastCompletedJobAt } = useMetadataJob();

  // Data state - now using the optimized API
  const [data, setData] = useState<CollectionExpandedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('flat');
  const [readStatusFilter, setReadStatusFilter] = useState<ReadStatusFilter>('all');
  const [seriesFilter, setSeriesFilter] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);

  // Track scrolling for grouped view (flat view handles it internally)
  useEffect(() => {
    let scrollTimeout: ReturnType<typeof setTimeout>;

    const handleScroll = () => {
      setIsScrolling(true);
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        setIsScrolling(false);
      }, 150);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, []);

  // Fetch collection data using the optimized API
  const fetchCollectionData = useCallback(async () => {
    if (!collectionId) return;

    setLoading(true);
    setError(null);

    try {
      const expandedData = await getCollectionExpanded(collectionId);
      setData(expandedData);

      // Expand all groups by default
      const seriesIds = new Set(expandedData.expandedIssues.map((i) => i.seriesId).filter(Boolean));
      setExpandedGroups(seriesIds);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load collection');
    } finally {
      setLoading(false);
    }
  }, [collectionId]);

  useEffect(() => {
    fetchCollectionData();
  }, [fetchCollectionData]);

  // Refresh when metadata job completes
  useEffect(() => {
    if (lastCompletedJobAt) {
      fetchCollectionData();
    }
  }, [lastCompletedJobAt, fetchCollectionData]);

  // Set breadcrumbs
  useEffect(() => {
    if (data?.collection && collectionId) {
      setBreadcrumbs([
        { label: 'Collections', path: '/collections' },
        { label: data.collection.name, path: `/collection/${collectionId}` },
      ]);
    }
  }, [data?.collection, collectionId, setBreadcrumbs]);

  // Memoized: filter issues based on current filters
  const filteredIssues = useMemo(() => {
    if (!data) return [];
    let result = data.expandedIssues;

    // Apply read status filter
    if (readStatusFilter !== 'all') {
      result = result.filter((issue) => {
        const progress = issue.readingProgress;
        switch (readStatusFilter) {
          case 'unread':
            return !progress || (!progress.completed && progress.currentPage === 0);
          case 'in-progress':
            return progress && !progress.completed && progress.currentPage > 0;
          case 'completed':
            return progress?.completed;
          default:
            return true;
        }
      });
    }

    // Apply series filter
    if (seriesFilter.size > 0) {
      result = result.filter((issue) => seriesFilter.has(issue.seriesId));
    }

    return result;
  }, [data, readStatusFilter, seriesFilter]);

  // Memoized: group issues by series for grouped view
  const seriesGroups = useMemo((): SeriesGroup[] => {
    const groupMap = new Map<string, SeriesGroup>();

    for (const issue of filteredIssues) {
      let group = groupMap.get(issue.seriesId);
      if (!group) {
        group = {
          seriesId: issue.seriesId,
          seriesName: issue.seriesName,
          issues: [],
          readCount: 0,
          totalCount: 0,
        };
        groupMap.set(issue.seriesId, group);
      }
      group.issues.push(issue);
      group.totalCount++;
      if (issue.readingProgress?.completed) {
        group.readCount++;
      }
    }

    return Array.from(groupMap.values());
  }, [filteredIssues]);

  // Memoized: get unique series for filter dropdown
  const availableSeries = useMemo(() => {
    if (!data) return [];
    const seriesMap = new Map<string, string>();
    for (const issue of data.expandedIssues) {
      if (issue.seriesId && !seriesMap.has(issue.seriesId)) {
        seriesMap.set(issue.seriesId, issue.seriesName);
      }
    }
    return Array.from(seriesMap.entries()).map(([id, name]) => ({ id, name }));
  }, [data]);

  // Memoized: get collection cover URL
  const coverUrl = useMemo(() => {
    if (!data?.collection) return null;
    const collection = data.collection;

    if (collection.coverHash) {
      return getCollectionCoverUrl(collection.coverHash);
    }

    // Fallback to first item's cover
    const firstItem = collection.items[0];
    if (firstItem?.series?.coverFileId) {
      return getCoverUrl(firstItem.series.coverFileId);
    }
    if (firstItem?.series?.coverHash) {
      return getApiCoverUrl(firstItem.series.coverHash);
    }
    if (firstItem?.file?.id) {
      return getCoverUrl(firstItem.file.id);
    }

    return null;
  }, [data?.collection]);

  // Event handlers
  const handleContinueReading = useCallback(() => {
    if (data?.nextIssue) {
      navigate(`/read/${data.nextIssue.fileId}?filename=${encodeURIComponent(data.nextIssue.filename)}`);
    } else if (data?.expandedIssues[0]) {
      // All read, start from beginning
      const first = data.expandedIssues[0];
      navigate(`/read/${first.id}?filename=${encodeURIComponent(first.filename)}`);
    }
  }, [data, navigate]);

  const handleSurpriseMe = useCallback(() => {
    if (!data) return;
    // Pick a random unread issue
    const unreadIssues = data.expandedIssues.filter(
      (i) => !i.readingProgress?.completed
    );
    const pool = unreadIssues.length > 0 ? unreadIssues : data.expandedIssues;
    if (pool.length > 0) {
      const randomIndex = Math.floor(Math.random() * pool.length);
      const issue = pool[randomIndex];
      if (issue) {
        navigate(`/read/${issue.id}?filename=${encodeURIComponent(issue.filename)}`);
      }
    }
  }, [data, navigate]);

  const handleReadIssue = useCallback((fileId: string) => {
    const issue = data?.expandedIssues.find((i) => i.id === fileId);
    if (issue) {
      navigate(`/read/${issue.id}?filename=${encodeURIComponent(issue.filename)}`);
    }
  }, [data, navigate]);

  const handleIssueClick = useCallback((fileId: string, e: React.MouseEvent) => {
    // Handle shift/ctrl click for selection
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
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

    // Navigate to issue detail
    const navState: NavigationOrigin = {
      from: 'collection',
      collectionId: collectionId,
      collectionName: data?.collection?.name,
    };
    navigate(`/issue/${fileId}`, { state: navState });
  }, [navigate, collectionId, data?.collection?.name]);

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

  const handleMenuAction = useCallback(async (action: MenuItemPreset | string, fileId: string) => {
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
          fetchCollectionData();
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'markUnread':
        try {
          setOperationMessage(`Marking ${targetIds.length} issue(s) as unread...`);
          await Promise.all(targetIds.map((id) => markAsIncomplete(id)));
          setOperationMessage('Marked as unread');
          fetchCollectionData();
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'fetchMetadata':
        startJob(targetIds);
        break;
    }
  }, [selectedFiles, handleReadIssue, fetchCollectionData, startJob]);

  const handleToggleGroup = useCallback((seriesId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(seriesId)) {
        next.delete(seriesId);
      } else {
        next.add(seriesId);
      }
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    setExpandedGroups(new Set(seriesGroups.map((g) => g.seriesId)));
  }, [seriesGroups]);

  const handleCollapseAll = useCallback(() => {
    setExpandedGroups(new Set());
  }, []);

  const handleCollectionAction = useCallback(async (actionId: string) => {
    if (!data?.collection) return;

    switch (actionId) {
      case 'editCollection':
        navigate(`/collections/${collectionId}`);
        break;

      case 'markAllRead':
        try {
          const allIds = data.expandedIssues.map((i) => i.id);
          setOperationMessage(`Marking ${allIds.length} issue(s) as read...`);
          await Promise.all(allIds.map((id) => markAsCompleted(id)));
          setOperationMessage('All issues marked as read');
          fetchCollectionData();
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'markAllUnread':
        try {
          const allIds = data.expandedIssues.map((i) => i.id);
          setOperationMessage(`Marking ${allIds.length} issue(s) as unread...`);
          await Promise.all(allIds.map((id) => markAsIncomplete(id)));
          setOperationMessage('All issues marked as unread');
          fetchCollectionData();
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;
    }
  }, [data, collectionId, fetchCollectionData, navigate]);

  const handleSeriesFilterToggle = useCallback((seriesId: string) => {
    setSeriesFilter((prev) => {
      const next = new Set(prev);
      if (next.has(seriesId)) {
        next.delete(seriesId);
      } else {
        next.add(seriesId);
      }
      return next;
    });
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="collection-detail-loading">
        <div className="spinner" />
        Loading collection...
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="collection-detail-error">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/collections')}>Back to Collections</button>
      </div>
    );
  }

  // Not found
  if (!data?.collection) {
    return (
      <div className="collection-detail-error">
        <h2>Collection Not Found</h2>
        <button onClick={() => navigate('/collections')}>Back to Collections</button>
      </div>
    );
  }

  const { collection, aggregateStats } = data;

  // Calculate display values
  const progressPercent = aggregateStats.totalIssues > 0
    ? Math.round((aggregateStats.readIssues / aggregateStats.totalIssues) * 100)
    : 0;

  const unreadPages = aggregateStats.totalPages - aggregateStats.pagesRead;
  const estimatedMinutesRemaining = unreadPages * 0.5; // 30 sec per page

  // Parse genres from collection
  const genreList = collection.derivedGenres?.split(',').map((g) => g.trim()).filter(Boolean) ?? [];

  return (
    <div className="collection-detail-page">
      {/* Hero Section */}
      <DetailHeroSection coverUrl={coverUrl}>
        <div className="collection-hero-grid">
          {/* Main column (75%): Hero content */}
          <div className="collection-hero-main">
            {/* Cover and basic info */}
            <div className="collection-hero-content">
              <div className="collection-hero-cover-wrapper">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt={collection.name}
                    className="collection-hero-cover"
                  />
                ) : (
                  <div className="collection-hero-cover-placeholder">
                    <span className="collection-hero-cover-icon">📚</span>
                  </div>
                )}
                {/* Collection badge */}
                <div className="collection-badge">Collection</div>
                {/* Progress ring */}
                {progressPercent > 0 && (
                  <div className="collection-progress-badge">
                    {progressPercent === 100 ? '✓' : `${progressPercent}%`}
                  </div>
                )}
              </div>

              <div className="collection-hero-info">
                <h1 className="collection-title">{collection.name}</h1>

                {collection.description && (
                  <p className="collection-description">{collection.description}</p>
                )}

                {/* Stats row */}
                <div className="collection-stats-row">
                  <div className="collection-stat">
                    <span className="collection-stat-value">{progressPercent}%</span>
                    <span className="collection-stat-label">Complete</span>
                  </div>
                  <div className="collection-stat">
                    <span className="collection-stat-value">
                      {aggregateStats.readIssues}/{aggregateStats.totalIssues}
                    </span>
                    <span className="collection-stat-label">Issues</span>
                  </div>
                  <div className="collection-stat">
                    <span className="collection-stat-value">{aggregateStats.seriesCount}</span>
                    <span className="collection-stat-label">Series</span>
                  </div>
                  {estimatedMinutesRemaining > 0 && (
                    <div className="collection-stat">
                      <span className="collection-stat-value">
                        {formatTimeRemaining(estimatedMinutesRemaining)}
                      </span>
                      <span className="collection-stat-label">Remaining</span>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="collection-actions">
                  <button
                    className="collection-cta-button"
                    onClick={handleContinueReading}
                    disabled={data.expandedIssues.length === 0}
                  >
                    {progressPercent > 0 && progressPercent < 100
                      ? 'Continue Reading'
                      : 'Start Reading'}
                  </button>
                  <button
                    className="collection-surprise-button"
                    onClick={handleSurpriseMe}
                    disabled={data.expandedIssues.length === 0}
                    title="Open a random issue"
                  >
                    🎲 Surprise Me
                  </button>
                  <ActionMenu
                    items={COLLECTION_ACTION_ITEMS}
                    onAction={handleCollectionAction}
                    ariaLabel="Collection actions"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar column (25%) */}
          <aside className="collection-hero-sidebar">
            {/* Genres */}
            {genreList.length > 0 && (
              <ExpandablePillSection
                title="Genres"
                items={genreList}
                variant="genre"
                maxVisible={8}
              />
            )}

            {/* Series quick links */}
            {availableSeries.length > 0 && (
              <div className="collection-sidebar-section">
                <h3 className="collection-sidebar-title">
                  Series ({availableSeries.length})
                </h3>
                <ul className="collection-series-list">
                  {availableSeries.slice(0, 10).map((s) => (
                    <li key={s.id}>
                      <button
                        className={`collection-series-link ${seriesFilter.has(s.id) ? 'active' : ''}`}
                        onClick={() => handleSeriesFilterToggle(s.id)}
                      >
                        {s.name}
                      </button>
                    </li>
                  ))}
                  {availableSeries.length > 10 && (
                    <li className="collection-series-more">
                      +{availableSeries.length - 10} more
                    </li>
                  )}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </DetailHeroSection>

      {/* Issues section */}
      <div className="collection-issues-section">
        {/* Filter bar */}
        <div className="collection-filter-bar">
          <div className="collection-view-toggle">
            <button
              className={`view-toggle-btn ${viewMode === 'flat' ? 'active' : ''}`}
              onClick={() => setViewMode('flat')}
            >
              Grid
            </button>
            <button
              className={`view-toggle-btn ${viewMode === 'grouped' ? 'active' : ''}`}
              onClick={() => setViewMode('grouped')}
            >
              By Series
            </button>
          </div>

          <select
            className="collection-filter-select"
            value={readStatusFilter}
            onChange={(e) => setReadStatusFilter(e.target.value as ReadStatusFilter)}
          >
            <option value="all">All</option>
            <option value="unread">Unread</option>
            <option value="in-progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>

          {viewMode === 'grouped' && (
            <div className="collection-group-controls">
              <button className="group-control-btn" onClick={handleExpandAll}>
                Expand All
              </button>
              <button className="group-control-btn" onClick={handleCollapseAll}>
                Collapse All
              </button>
            </div>
          )}

          {selectedFiles.size > 0 && (
            <div className="collection-selection-info">
              <span>{selectedFiles.size} selected</span>
              <button
                className="btn-ghost"
                onClick={() => setSelectedFiles(new Set())}
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Clear filters link */}
        {(readStatusFilter !== 'all' || seriesFilter.size > 0) && (
          <div className="collection-active-filters">
            <span>Filters active</span>
            <button
              className="clear-filters-btn"
              onClick={() => {
                setReadStatusFilter('all');
                setSeriesFilter(new Set());
              }}
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Operation message */}
        {operationMessage && (
          <div className="collection-operation-message">
            {operationMessage}
          </div>
        )}

        {/* Issues grid */}
        {viewMode === 'flat' ? (
          <VirtualizedIssuesGrid
            issues={filteredIssues}
            selectedFiles={selectedFiles}
            onIssueClick={handleIssueClick}
            onReadIssue={handleReadIssue}
            onSelectionChange={handleSelectionChange}
            onMenuAction={handleMenuAction}
          />
        ) : (
          <GroupedGrid
            groups={seriesGroups}
            expandedGroups={expandedGroups}
            selectedFiles={selectedFiles}
            isScrolling={isScrolling}
            onToggleGroup={handleToggleGroup}
            onIssueClick={handleIssueClick}
            onReadIssue={handleReadIssue}
            onSelectionChange={handleSelectionChange}
            onMenuAction={handleMenuAction}
          />
        )}

        {/* Empty state after filtering */}
        {filteredIssues.length === 0 && data.expandedIssues.length > 0 && (
          <div className="collection-no-results">
            <p>No issues match the current filters.</p>
            <button
              className="clear-filters-btn"
              onClick={() => {
                setReadStatusFilter('all');
                setSeriesFilter(new Set());
              }}
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
