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

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getCollectionExpanded,
  getCoverUrl,
  getApiCoverUrl,
  getCollectionCoverUrl,
  markAsCompleted,
  markAsIncomplete,
  CollectionExpandedData,
  CollectionExpandedIssue,
  CollectionItem,
  removeFromCollection,
  reorderCollectionItems,
  updateCollection,
  updateCollectionCover,
} from '../services/api.service';
import { useCollections, Collection } from '../contexts/CollectionsContext';
import { CollectionSettingsModal, CollectionUpdates } from '../components/CollectionSettingsModal';
import { MarkdownContent } from '../components/MarkdownContent';
import { useBreadcrumbs, NavigationOrigin } from '../contexts/BreadcrumbContext';
import { DetailHeroSection } from '../components/DetailHeroSection';
import { CoverCard, SERIES_ISSUE_MENU_ITEMS, type MenuItemPreset } from '../components/CoverCard';
import { ExpandablePillSection } from '../components/ExpandablePillSection';
import { ActionMenu, type ActionMenuItem } from '../components/ActionMenu';
import { useMetadataJob } from '../contexts/MetadataJobContext';
import { useMenuActions, useApiToast } from '../hooks';
import type { MenuContext } from '../components/UnifiedMenu/types';
import { ProgressRing, CompletedBadge } from '../components/Progress';
import { RatingStars } from '../components/RatingStars/RatingStars';
import { useUpdateCollection } from '../hooks/queries/useCollections';
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
// Types for Series Grouping
// =============================================================================

interface SeriesGroup {
  seriesId: string;
  seriesName: string;
  issues: CollectionExpandedIssue[];
  readCount: number;
  totalCount: number;
}

// =============================================================================
// FlatGroupedGrid - Grid view with series headers (no expand/collapse)
// =============================================================================

interface FlatGroupedGridProps {
  groups: SeriesGroup[];
  selectedFiles: Set<string>;
  isScrolling: boolean;
  onIssueClick: (fileId: string, event: React.MouseEvent) => void;
  onReadIssue: (fileId: string) => void;
  onSelectionChange: (fileId: string, selected: boolean) => void;
  onMenuAction: (action: MenuItemPreset | string, fileId: string) => void;
}

function FlatGroupedGrid({
  groups,
  selectedFiles,
  isScrolling,
  onIssueClick,
  onReadIssue,
  onSelectionChange,
  onMenuAction,
}: FlatGroupedGridProps) {
  if (groups.length === 0) {
    return (
      <div className="collection-issues-empty">
        <p>No issues in this collection.</p>
      </div>
    );
  }

  return (
    <div className={`collection-flat-grouped-grid ${isScrolling ? 'scrolling' : ''}`}>
      {groups.map((group) => (
        <div key={group.seriesId} className="collection-flat-series-group">
          <div className="collection-flat-series-header">
            <Link
              to={`/series/${group.seriesId}`}
              className="collection-flat-series-name"
              title={`Go to ${group.seriesName}`}
            >
              {group.seriesName}
            </Link>
            <span className="collection-flat-series-count">
              {group.readCount}/{group.totalCount} read
            </span>
          </div>
          <div className="collection-flat-series-issues">
            {group.issues.map((issue) => (
              <div key={issue.id} className="collection-flat-issue-item">
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
      ))}
    </div>
  );
}

// =============================================================================
// GroupedGrid - Accordion view with collapsible series
// =============================================================================

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
              <Link
                to={`/series/${group.seriesId}`}
                className="collection-series-name-link"
                title={`Go to ${group.seriesName}`}
                onClick={(e) => e.stopPropagation()}
              >
                {group.seriesName}
              </Link>
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
  const { lastCompletedJobAt } = useMetadataJob();
  const { addToast } = useApiToast();
  const { getCollectionWithItems, refreshCollections } = useCollections();
  const updateCollectionMutation = useUpdateCollection();

  // Data state - now using the optimized API
  const [data, setData] = useState<CollectionExpandedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  const [readStatusFilter, setReadStatusFilter] = useState<ReadStatusFilter>('all');
  const [seriesFilter, setSeriesFilter] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isScrolling, setIsScrolling] = useState(false);

  // Edit modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [collectionForModal, setCollectionForModal] = useState<Collection | null>(null);
  const [collectionItems, setCollectionItems] = useState<CollectionItem[]>([]);

  // Description expand/collapse state
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [descriptionNeedsTruncation, setDescriptionNeedsTruncation] = useState(false);
  const descriptionRef = useRef<HTMLDivElement>(null);

  // Cover error handling - tracks if primary cover URL failed to load
  const [coverLoadError, setCoverLoadError] = useState(false);

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

  // Check if description needs truncation (6 lines)
  useEffect(() => {
    if (descriptionRef.current) {
      const lineHeight = parseFloat(getComputedStyle(descriptionRef.current).lineHeight);
      const maxHeight = lineHeight * 6; // 6 lines for compact view
      setDescriptionNeedsTruncation(descriptionRef.current.scrollHeight > maxHeight + 2);
    }
  }, [data?.collection?.description, data?.collection?.deck]);

  // Reset cover error state when collection changes
  useEffect(() => {
    setCoverLoadError(false);
  }, [collectionId]);

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

  // Memoized: get collection cover URL with fallback support
  // Logic matches CollectionsPage and CollectionCoverCard
  const { primaryCoverUrl, fallbackCoverUrl } = useMemo(() => {
    if (!data?.collection) return { primaryCoverUrl: null, fallbackCoverUrl: null };
    const collection = data.collection;

    // Compute fallback from first item
    // Priority: coverHash (API/custom) > coverFileId > first issue > file
    let fallback: string | null = null;
    const firstItem = collection.items[0];
    if (firstItem?.series?.coverHash) {
      fallback = getApiCoverUrl(firstItem.series.coverHash);
    } else if (firstItem?.series?.coverFileId) {
      fallback = getCoverUrl(firstItem.series.coverFileId);
    } else if (firstItem?.series?.firstIssueId) {
      fallback = getCoverUrl(firstItem.series.firstIssueId, firstItem.series.firstIssueCoverHash);
    } else if (firstItem?.file?.id) {
      fallback = getCoverUrl(firstItem.file.id);
    }

    // Determine primary URL based on coverType (matches CollectionsPage logic)
    let primary: string | null = null;

    if (!collection.coverType || collection.coverType === 'auto') {
      // Auto-generated mosaic cover
      if (collection.coverHash) {
        primary = getCollectionCoverUrl(collection.coverHash);
      }
    } else if (collection.coverType === 'custom' && collection.coverHash) {
      // Custom uploaded cover - stored in API covers (series path)
      primary = getApiCoverUrl(collection.coverHash);
    } else if (collection.coverType === 'issue' && collection.coverFileId) {
      // Issue cover
      primary = getCoverUrl(collection.coverFileId);
    } else if (collection.coverType === 'series' && collection.coverSeriesId) {
      // Series cover - find the series and use its cover
      const series = collection.items.find(item => item.seriesId === collection.coverSeriesId)?.series;
      if (series?.coverHash) {
        primary = getApiCoverUrl(series.coverHash);
      } else if (series?.coverFileId) {
        primary = getCoverUrl(series.coverFileId);
      }
    }

    // If we have a primary, return it with fallback
    if (primary) {
      return { primaryCoverUrl: primary, fallbackCoverUrl: fallback };
    }

    // No primary - use fallback as primary
    return { primaryCoverUrl: fallback, fallbackCoverUrl: null };
  }, [data?.collection]);

  // Final cover URL: use fallback if primary failed to load
  const coverUrl = coverLoadError ? fallbackCoverUrl : primaryCoverUrl;

  // Centralized menu actions hook
  const { handleAction: handleMenuActionFromHook } = useMenuActions({
    onRefresh: fetchCollectionData,
  });

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

  // Handle context menu action - delegates to centralized hook
  const handleMenuAction = useCallback(
    (action: MenuItemPreset | string, fileId: string) => {
      const context: MenuContext = {
        entityType: 'file',
        entityId: fileId,
        selectedIds: selectedFiles.has(fileId) ? Array.from(selectedFiles) : [fileId],
        selectedCount: selectedFiles.has(fileId) ? selectedFiles.size : 1,
      };
      handleMenuActionFromHook(action, context);
    },
    [selectedFiles, handleMenuActionFromHook]
  );

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

  // Handle opening the edit modal
  const handleOpenSettings = useCallback(async () => {
    if (!collectionId || !data?.collection) return;

    try {
      const collectionData = await getCollectionWithItems(collectionId);
      if (collectionData) {
        const { items, ...collectionOnly } = collectionData;
        setCollectionForModal(collectionOnly as Collection);
        setCollectionItems(items ?? []);
        setIsSettingsOpen(true);
      }
    } catch (err) {
      addToast('error', 'Failed to load collection details');
    }
  }, [collectionId, data?.collection, getCollectionWithItems, addToast]);

  // Handle saving collection settings
  const handleSettingsSave = useCallback(async (updates: CollectionUpdates) => {
    if (!collectionForModal || !collectionId) return;

    try {
      const basicUpdates: Record<string, unknown> = {};
      if (updates.name !== undefined) basicUpdates.name = updates.name;
      if (updates.deck !== undefined) basicUpdates.deck = updates.deck;
      if (updates.description !== undefined) basicUpdates.description = updates.description;
      if (updates.lockName !== undefined) basicUpdates.lockName = updates.lockName;
      if (updates.lockDeck !== undefined) basicUpdates.lockDeck = updates.lockDeck;
      if (updates.lockDescription !== undefined) basicUpdates.lockDescription = updates.lockDescription;
      if (updates.lockPublisher !== undefined) basicUpdates.lockPublisher = updates.lockPublisher;
      if (updates.lockStartYear !== undefined) basicUpdates.lockStartYear = updates.lockStartYear;
      if (updates.lockEndYear !== undefined) basicUpdates.lockEndYear = updates.lockEndYear;
      if (updates.lockGenres !== undefined) basicUpdates.lockGenres = updates.lockGenres;
      if (updates.overridePublisher !== undefined) basicUpdates.overridePublisher = updates.overridePublisher;
      if (updates.overrideStartYear !== undefined) basicUpdates.overrideStartYear = updates.overrideStartYear;
      if (updates.overrideEndYear !== undefined) basicUpdates.overrideEndYear = updates.overrideEndYear;
      if (updates.overrideGenres !== undefined) basicUpdates.overrideGenres = updates.overrideGenres;
      if (updates.rating !== undefined) basicUpdates.rating = updates.rating;
      if (updates.notes !== undefined) basicUpdates.notes = updates.notes;
      if (updates.visibility !== undefined) basicUpdates.visibility = updates.visibility;
      if (updates.readingMode !== undefined) basicUpdates.readingMode = updates.readingMode;

      if (Object.keys(basicUpdates).length > 0) {
        await updateCollection(collectionForModal.id, basicUpdates);
      }

      // Handle cover changes
      if (updates.coverType !== undefined) {
        let sourceId: string | undefined;
        if (updates.coverType === 'series') {
          sourceId = updates.coverSeriesId ?? undefined;
        } else if (updates.coverType === 'issue') {
          sourceId = updates.coverFileId ?? undefined;
        }
        await updateCollectionCover(collectionForModal.id, updates.coverType, sourceId);
      }

      // Refresh data after save
      await refreshCollections();
      await fetchCollectionData();
      addToast('success', 'Collection updated');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to update collection');
      throw err;
    }
  }, [collectionForModal, collectionId, refreshCollections, fetchCollectionData, addToast]);

  // Handle removing items from collection
  const handleRemoveItems = useCallback(async (itemIds: string[]) => {
    if (!collectionForModal || !collectionId) return;

    try {
      const itemsToRemove = collectionItems
        .filter(item => itemIds.includes(item.id))
        .map(item => ({
          seriesId: item.seriesId || undefined,
          fileId: item.fileId || undefined,
        }));

      await removeFromCollection(collectionForModal.id, itemsToRemove);

      const collectionData = await getCollectionWithItems(collectionId);
      if (collectionData) {
        const { items, ...collectionOnly } = collectionData;
        setCollectionForModal(collectionOnly as Collection);
        setCollectionItems(items ?? []);
      }

      // Also refresh the main page data
      await fetchCollectionData();
    } catch (err) {
      addToast('error', 'Failed to remove items');
      throw err;
    }
  }, [collectionForModal, collectionId, collectionItems, getCollectionWithItems, fetchCollectionData, addToast]);

  // Handle reordering items
  const handleReorderItems = useCallback(async (itemIds: string[]) => {
    if (!collectionForModal || !collectionId) return;

    try {
      await reorderCollectionItems(collectionForModal.id, itemIds);
      const collectionData = await getCollectionWithItems(collectionId);
      if (collectionData) {
        setCollectionItems(collectionData.items ?? []);
      }
    } catch (err) {
      addToast('error', 'Failed to reorder items');
      throw err;
    }
  }, [collectionForModal, collectionId, getCollectionWithItems, addToast]);

  // Handle refresh from modal (e.g., after smart collection conversion)
  // This refreshes both the modal's items and the main page data
  const handleModalRefresh = useCallback(async () => {
    if (!collectionId) return;

    try {
      // Refresh the modal's collection data and items
      const collectionData = await getCollectionWithItems(collectionId);
      if (collectionData) {
        const { items, ...collectionOnly } = collectionData;
        setCollectionForModal(collectionOnly as Collection);
        setCollectionItems(items ?? []);
      }

      // Also refresh the main page data
      await fetchCollectionData();
    } catch (err) {
      // Silent fail - the main page refresh will show updates after modal close
      await fetchCollectionData();
    }
  }, [collectionId, getCollectionWithItems, fetchCollectionData]);

  // Handle collection-level actions
  const handleCollectionAction = useCallback(
    async (actionId: string) => {
      if (!data?.collection) return;

      switch (actionId) {
        case 'editCollection':
          handleOpenSettings();
          break;

        case 'markAllRead':
          try {
            const allIds = data.expandedIssues.map((i) => i.id);
            await Promise.all(allIds.map((id) => markAsCompleted(id)));
            addToast('success', 'All issues marked as read');
            fetchCollectionData();
          } catch (err) {
            addToast('error', err instanceof Error ? err.message : 'Failed to mark as read');
          }
          break;

        case 'markAllUnread':
          try {
            const allIds = data.expandedIssues.map((i) => i.id);
            await Promise.all(allIds.map((id) => markAsIncomplete(id)));
            addToast('success', 'All issues marked as unread');
            fetchCollectionData();
          } catch (err) {
            addToast('error', err instanceof Error ? err.message : 'Failed to mark as unread');
          }
          break;
      }
    },
    [data, handleOpenSettings, fetchCollectionData, addToast]
  );

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
                    onError={() => {
                      // If primary cover failed and we have a fallback, try it
                      if (!coverLoadError && fallbackCoverUrl) {
                        setCoverLoadError(true);
                      }
                    }}
                  />
                ) : (
                  <div className="collection-hero-cover-placeholder">
                    <span className="collection-hero-cover-icon">📚</span>
                  </div>
                )}
                {/* Collection badge */}
                <div className="collection-badge">Collection</div>
                {/* Progress ring */}
                {progressPercent > 0 && progressPercent < 100 && (
                  <ProgressRing
                    progress={progressPercent}
                    size="lg"
                    showLabel
                    className="collection-hero-progress-ring"
                  />
                )}
                {progressPercent === 100 && (
                  <CompletedBadge
                    size="lg"
                    title="Collection complete"
                    className="collection-hero-complete-badge"
                  />
                )}
              </div>

              <div className="collection-hero-info">
                <h1 className="collection-title">{collection.name}</h1>

                {collection.deck && (
                  <p className="collection-deck">{collection.deck}</p>
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

            {/* Description Section */}
            {collection.description && (
              <div className="collection-description-section">
                <h3 className="collection-section-title">About</h3>
                <div
                  ref={descriptionRef}
                  className={`collection-description-content ${
                    isDescriptionExpanded
                      ? 'collection-description-content--expanded'
                      : descriptionNeedsTruncation
                        ? 'collection-description-content--clamped'
                        : ''
                  }`}
                >
                  <MarkdownContent
                    content={collection.description}
                    className="collection-description-text"
                  />
                </div>
                {descriptionNeedsTruncation && (
                  <button
                    className="collection-description-toggle"
                    onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                    aria-expanded={isDescriptionExpanded}
                  >
                    {isDescriptionExpanded ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Sidebar column (25%) */}
          <aside className="collection-hero-sidebar">
            {/* User Rating */}
            <div className="collection-rating-section">
              <div className="rating-header">
                <span className="rating-label">Your Rating</span>
              </div>
              <RatingStars
                value={collection.rating ?? null}
                onChange={(rating) => {
                  if (collection.id) {
                    updateCollectionMutation.mutate(
                      { id: collection.id, data: { rating } },
                      {
                        onSuccess: () => {
                          // Refetch to update local state
                          fetchCollectionData();
                        },
                      }
                    );
                  }
                }}
                size="large"
                showEmpty
                allowClear
              />
            </div>

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
                    <li key={s.id} className="collection-series-list-item">
                      <Link
                        to={`/series/${s.id}`}
                        className="collection-series-go-link"
                        title={`Go to ${s.name}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </Link>
                      <button
                        className={`collection-series-filter-btn ${seriesFilter.has(s.id) ? 'active' : ''}`}
                        onClick={() => handleSeriesFilterToggle(s.id)}
                        title={seriesFilter.has(s.id) ? 'Remove filter' : 'Filter to this series'}
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

        {/* Issues grid */}
        {viewMode === 'flat' ? (
          <FlatGroupedGrid
            groups={seriesGroups}
            selectedFiles={selectedFiles}
            isScrolling={isScrolling}
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

      {/* Collection Settings Modal */}
      {collectionForModal && (
        <CollectionSettingsModal
          collection={collectionForModal}
          collectionItems={collectionItems}
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onSave={handleSettingsSave}
          onRemoveItems={handleRemoveItems}
          onReorderItems={handleReorderItems}
          onRefresh={handleModalRefresh}
        />
      )}
    </div>
  );
}
