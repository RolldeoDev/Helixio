/**
 * SeriesDetailPage Component
 *
 * Detailed view of a single series with issues, metadata, and actions.
 * Part of the Series-Centric Architecture UI.
 *
 * Features:
 * - Cinematic hero section with gradient backdrop
 * - Two-column content layout (description + entities)
 * - Expandable pill sections for characters, teams, locations
 * - Movie-credits style creator display
 * - Virtualized issues grid (only renders visible items)
 * - Scroll state detection (disables animations during rapid scroll)
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getSeries,
  getSeriesIssues,
  getNextSeriesIssue,
  getCoverUrl,
  getApiCoverUrl,
  fetchSeriesMetadata,
  previewSeriesMetadata,
  applySeriesMetadata,
  getSeriesRelationships,
  Series,
  SeriesIssue,
  SeriesForMerge,
  MetadataSource,
  SeriesMetadataPayload,
  MetadataPreviewField,
  RelatedSeriesInfo,
} from '../services/api.service';
import { useMetadataJob } from '../contexts/MetadataJobContext';
import { useApiToast, useMenuActions } from '../hooks';
import { useBreadcrumbs, NavigationOrigin } from '../contexts/BreadcrumbContext';
import type { MenuContext } from '../components/UnifiedMenu/types';
import {
  CoverCard,
  SERIES_ISSUE_MENU_ITEMS,
  type MenuItemPreset,
} from '../components/CoverCard';
import { MetadataEditor } from '../components/MetadataEditor';
import { EditSeriesModal } from '../components/EditSeriesModal';
import { SeriesSelectModal } from '../components/SeriesSelectModal';
import { MergeSeriesModal } from '../components/MergeSeriesModal';
import { SeriesMetadataSearchModal } from '../components/SeriesMetadataSearchModal';
import { MetadataPreviewModal } from '../components/MetadataPreviewModal';
import { ActionMenu, type ActionMenuItem } from '../components/ActionMenu';
import { MarkdownContent } from '../components/MarkdownContent';
import { CollectionPickerModal } from '../components/CollectionPickerModal';
import { DetailHeroSection } from '../components/DetailHeroSection';
import { SeriesHero } from '../components/SeriesHero';
import { ExpandablePillSection } from '../components/ExpandablePillSection';
import { CreatorCredits, type CreatorsByRole } from '../components/CreatorCredits';
import { SeriesCoverCard } from '../components/SeriesCoverCard';
import { useWindowVirtualGrid } from '../hooks/useWindowVirtualGrid';
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
  { id: 'downloadAll', label: 'Download All Issues', dividerBefore: true },
  { id: 'mergeWith', label: 'Merge with...', dividerBefore: true },
  { id: 'rebuildCache', label: 'Rebuild All Covers', dividerBefore: true },
];

/** Issue-level actions (for selected issues) */
const ISSUE_BULK_ACTION_ITEMS: ActionMenuItem[] = [
  { id: 'markRead', label: 'Mark as Read' },
  { id: 'markUnread', label: 'Mark as Unread' },
  { id: 'fetchMetadata', label: 'Fetch Metadata', dividerBefore: true },
  { id: 'downloadSelected', label: 'Download Selected', dividerBefore: true },
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
  // Window-based virtualization for seamless page scrolling
  // Uses slider value 5 (medium) for consistent sizing
  const { virtualItems, totalHeight, containerRef, isScrolling } = useWindowVirtualGrid(issues, {
    sliderValue: 5,
    gap: 16,
    overscan: 3,
    aspectRatio: 1.5,
    infoHeight: 60,
    minCoverWidth: 80,
    maxCoverWidth: 350,
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
      className={`series-issues-grid-container ${isScrolling ? 'scrolling' : ''}`}
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
  const { lastCompletedJobAt } = useMetadataJob();
  const { setBreadcrumbs } = useBreadcrumbs();

  const [series, setSeries] = useState<Series | null>(null);
  const [issues, setIssues] = useState<SeriesIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextIssue, setNextIssue] = useState<{ id: string; filename: string } | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const { addToast } = useApiToast();
  const [isEditSeriesModalOpen, setIsEditSeriesModalOpen] = useState(false);

  // Related series state
  const [parentSeries, setParentSeries] = useState<RelatedSeriesInfo[]>([]);
  const [childSeries, setChildSeries] = useState<RelatedSeriesInfo[]>([]);

  // Merge modal state
  const [showSeriesSelectModal, setShowSeriesSelectModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [selectedMergeSeries, setSelectedMergeSeries] = useState<SeriesForMerge[]>([]);

  // Description expand/collapse state
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [descriptionNeedsTruncation, setDescriptionNeedsTruncation] = useState(false);
  const descriptionRef = useRef<HTMLDivElement>(null);

  // Metadata fetch workflow state
  const [showMetadataSearchModal, setShowMetadataSearchModal] = useState(false);
  const [showMetadataPreviewModal, setShowMetadataPreviewModal] = useState(false);
  const [pendingMetadata, setPendingMetadata] = useState<SeriesMetadataPayload | null>(null);
  const [pendingSource, setPendingSource] = useState<MetadataSource | null>(null);
  const [pendingExternalId, setPendingExternalId] = useState<string | null>(null);
  const [previewFields, setPreviewFields] = useState<MetadataPreviewField[]>([]);
  const [isApplyingMetadata, setIsApplyingMetadata] = useState(false);

  // Fetch series data (all issues at once for infinite scroll)
  const fetchSeries = useCallback(async () => {
    if (!seriesId) return;

    setLoading(true);
    setError(null);

    try {
      const [seriesResult, issuesResult, nextResult, relationshipsResult] = await Promise.all([
        getSeries(seriesId),
        getSeriesIssues(seriesId, { all: true, sortBy: 'number', sortOrder: 'asc' }),
        getNextSeriesIssue(seriesId),
        getSeriesRelationships(seriesId),
      ]);

      setSeries(seriesResult.series);
      setIssues(issuesResult.issues);
      setParentSeries(relationshipsResult.parents);
      setChildSeries(relationshipsResult.children);

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

  // Set breadcrumbs when series data loads
  useEffect(() => {
    if (series && seriesId) {
      setBreadcrumbs([
        { label: 'Series', path: '/series' },
        { label: series.name, path: `/series/${seriesId}` },
      ]);
    }
  }, [series, seriesId, setBreadcrumbs]);

  // Check if description needs truncation (now 6-8 lines)
  useEffect(() => {
    if (descriptionRef.current) {
      const lineHeight = parseFloat(getComputedStyle(descriptionRef.current).lineHeight);
      const maxHeight = lineHeight * 6; // 6 lines for compact view
      setDescriptionNeedsTruncation(descriptionRef.current.scrollHeight > maxHeight + 2);
    }
  }, [series?.summary, series?.deck]);

  // Centralized menu actions for file-level operations
  const {
    handleAction: handleMenuActionFromHook,
    editingMetadataFileIds,
    closeMetadataEditor,
    collectionPickerFileIds,
    closeCollectionPicker,
  } = useMenuActions({
    onRefresh: fetchSeries,
    series,
    issues,
    onEditSeries: () => setIsEditSeriesModalOpen(true),
    onMergeWith: () => setShowSeriesSelectModal(true),
    onFetchSeriesMetadata: async () => {
      if (!series) return;
      try {
        const result = await fetchSeriesMetadata(series.id);
        if (result.needsSearch) {
          setShowMetadataSearchModal(true);
        } else if (result.metadata && result.source && result.externalId) {
          const previewResult = await previewSeriesMetadata(
            series.id,
            result.metadata,
            result.source,
            result.externalId
          );
          setPendingMetadata(result.metadata);
          setPendingSource(result.source);
          setPendingExternalId(result.externalId);
          setPreviewFields(previewResult.preview.fields);
          setShowMetadataPreviewModal(true);
        } else {
          addToast('info', result.message || 'No metadata found');
        }
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Failed to fetch metadata');
      }
    },
  });

  const handleContinueReading = useCallback(() => {
    if (nextIssue) {
      navigate(`/read/${nextIssue.id}?filename=${encodeURIComponent(nextIssue.filename)}`);
    } else {
      // Start from the first issue if no next issue
      const firstIssue = issues[0];
      if (firstIssue) {
        navigate(`/read/${firstIssue.id}?filename=${encodeURIComponent(firstIssue.filename)}`);
      }
    }
  }, [nextIssue, issues, navigate]);

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
    const navState: NavigationOrigin = {
      from: 'series',
      seriesId: seriesId,
      seriesName: series?.name,
    };
    navigate(`/issue/${fileId}`, { state: navState });
  }, [navigate, seriesId, series?.name]);

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

    const currentSeriesForMerge = seriesToMergeFormat(series);
    const selectedSeriesForMerge = selectedSeries.map(seriesToMergeFormat);

    setSelectedMergeSeries([currentSeriesForMerge, ...selectedSeriesForMerge]);
    setShowSeriesSelectModal(false);
    setShowMergeModal(true);
  };

  // Handle merge complete
  const handleMergeComplete = () => {
    setShowMergeModal(false);
    setSelectedMergeSeries([]);
    fetchSeries();
  };

  // Handle metadata search modal selection
  const handleMetadataSearchSelect = useCallback(
    async (source: MetadataSource, externalId: string, metadata: SeriesMetadataPayload) => {
      setShowMetadataSearchModal(false);

      if (!seriesId) return;

      try {
        // Get preview data for the selected metadata
        const previewResult = await previewSeriesMetadata(
          seriesId,
          metadata,
          source,
          externalId
        );

        setPendingMetadata(metadata);
        setPendingSource(source);
        setPendingExternalId(externalId);
        setPreviewFields(previewResult.preview.fields);
        setShowMetadataPreviewModal(true);
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Failed to load preview');
      }
    },
    [seriesId, addToast]
  );

  // Handle metadata preview modal apply
  const handleMetadataPreviewApply = useCallback(
    async (selectedFields: string[]) => {
      if (!seriesId || !pendingMetadata || !pendingSource) return;

      setIsApplyingMetadata(true);

      try {
        await applySeriesMetadata(seriesId, {
          metadata: pendingMetadata,
          source: pendingSource,
          externalId: pendingExternalId,
          fields: selectedFields,
        });

        // Reset state and refresh
        setShowMetadataPreviewModal(false);
        setPendingMetadata(null);
        setPendingSource(null);
        setPendingExternalId(null);
        setPreviewFields([]);
        addToast('success', 'Metadata applied successfully');
        fetchSeries();
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Failed to apply metadata');
      } finally {
        setIsApplyingMetadata(false);
      }
    },
    [seriesId, pendingMetadata, pendingSource, pendingExternalId, fetchSeries, addToast]
  );

  // Handle metadata preview modal close
  const handleMetadataPreviewClose = useCallback(() => {
    setShowMetadataPreviewModal(false);
    setPendingMetadata(null);
    setPendingSource(null);
    setPendingExternalId(null);
    setPreviewFields([]);
  }, []);

  // Handle series-level actions from ActionMenu - delegates to centralized hook
  const handleSeriesAction = useCallback(
    (actionId: string) => {
      if (!seriesId) return;
      const context: MenuContext = {
        entityType: 'series',
        entityId: seriesId,
        selectedIds: [seriesId],
        selectedCount: 1,
      };
      handleMenuActionFromHook(actionId, context);
    },
    [seriesId, handleMenuActionFromHook]
  );

  // Handle bulk issue actions from ActionMenu - delegates to centralized hook
  const handleBulkIssueAction = useCallback(
    (actionId: string) => {
      if (selectedFiles.size === 0) return;
      const targetIds = Array.from(selectedFiles);
      // Map 'downloadSelected' to 'download' for the hook
      const mappedAction = actionId === 'downloadSelected' ? 'download' : actionId;
      const context: MenuContext = {
        entityType: 'file',
        entityId: targetIds[0] || '',
        selectedIds: targetIds,
        selectedCount: targetIds.length,
      };
      handleMenuActionFromHook(mappedAction, context);
    },
    [selectedFiles, handleMenuActionFromHook]
  );

  // Parse creatorsJson if available for structured creator data
  // NOTE: This must be before early returns to satisfy React's rules of hooks
  const creatorsWithRoles: CreatorsByRole | undefined = useMemo(() => {
    if (!series?.creatorsJson) return undefined;
    try {
      return JSON.parse(series.creatorsJson) as CreatorsByRole;
    } catch {
      return undefined;
    }
  }, [series?.creatorsJson]);

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

  // Cover URL with fallback priority: User-set file > API cover (local cache) > First Issue
  const firstIssueId = issues[0]?.id;
  const coverUrl = series.coverFileId
    ? getCoverUrl(series.coverFileId)
    : series.coverHash
      ? getApiCoverUrl(series.coverHash)
      : firstIssueId
        ? getCoverUrl(firstIssueId)
        : null;

  // Parse entity lists
  const genreList = series.genres?.split(',').map((g) => g.trim()).filter(Boolean) ?? [];
  const tagList = series.tags?.split(',').map((t) => t.trim()).filter(Boolean) ?? [];
  const characterList = series.characters?.split(',').map((c) => c.trim()).filter(Boolean) ?? [];
  const teamList = series.teams?.split(',').map((t) => t.trim()).filter(Boolean) ?? [];
  const locationList = series.locations?.split(',').map((l) => l.trim()).filter(Boolean) ?? [];
  const storyArcList = series.storyArcs?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];

  // Check if series has content to show
  const hasDescription = series.summary;
  const hasTags = genreList.length > 0 || tagList.length > 0;
  const hasEntities = characterList.length > 0 || teamList.length > 0 || locationList.length > 0 || storyArcList.length > 0;

  // Check if we have any creators (either structured or legacy format)
  const hasCreatorsJson = creatorsWithRoles && Object.values(creatorsWithRoles).some((arr: string[] | undefined) => arr && arr.length > 0);
  const hasCreatorsLegacy = series.creators && series.creators.trim().length > 0;
  const hasCreators = hasCreatorsJson || hasCreatorsLegacy;
  const _hasSidebar = hasTags || hasEntities;
  void _hasSidebar; // Used for future conditional rendering
  const _hasMainContent = hasDescription || hasCreators;
  void _hasMainContent; // Used for future conditional rendering

  return (
    <div className="series-detail-page">
      {/* Hero Section with Two-Column Layout */}
      <DetailHeroSection coverUrl={coverUrl}>
        <div className="series-hero-grid">
          {/* Main column (75%): Hero + Description + Creators */}
          <div className="series-hero-main">
            {/* Hero Content */}
            <SeriesHero
              series={series}
              coverUrl={coverUrl}
              issues={issues}
              nextIssue={nextIssue}
              actionItems={SERIES_ACTION_ITEMS}
              onContinueReading={handleContinueReading}
              onSeriesAction={handleSeriesAction}
            />

            {/* Description & Creators - Combined Section */}
            {(hasDescription || hasCreators) && (
              <div className="series-description-section">
                {hasDescription && (
                  <>
                    <h3 className="series-section-title">About</h3>
                    <div
                      ref={descriptionRef}
                      className={`series-description-content ${isDescriptionExpanded ? 'series-description-content--expanded' : descriptionNeedsTruncation ? 'series-description-content--clamped' : ''}`}
                    >
                      <MarkdownContent content={series.summary!} className="series-summary-text" />
                    </div>
                    {descriptionNeedsTruncation && (
                      <button
                        className="series-description-toggle"
                        onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                        aria-expanded={isDescriptionExpanded}
                      >
                        {isDescriptionExpanded ? 'Show less' : 'Read more'}
                      </button>
                    )}
                  </>
                )}

                {/* Creators */}
                {hasCreators && (
                  <div className="series-creators-section">
                    <CreatorCredits
                      creatorsWithRoles={creatorsWithRoles}
                      creators={series.creators}
                      expandable={true}
                      maxPrimary={6}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar column (25%): All metadata */}
          <aside className="series-hero-sidebar">
            {/* Genres */}
            {genreList.length > 0 && (
              <ExpandablePillSection
                title="Genres"
                items={genreList}
                variant="genre"
                maxVisible={8}
              />
            )}

            {/* Tags */}
            {tagList.length > 0 && (
              <ExpandablePillSection
                title="Tags"
                items={tagList}
                variant="tag"
                maxVisible={8}
              />
            )}

            {/* Characters */}
            {characterList.length > 0 && (
              <ExpandablePillSection
                title="Characters"
                items={characterList}
                variant="character"
                maxVisible={8}
              />
            )}

            {/* Teams */}
            {teamList.length > 0 && (
              <ExpandablePillSection
                title="Teams"
                items={teamList}
                variant="team"
                maxVisible={6}
              />
            )}

            {/* Locations */}
            {locationList.length > 0 && (
              <ExpandablePillSection
                title="Locations"
                items={locationList}
                variant="location"
                maxVisible={6}
              />
            )}

            {/* Story Arcs */}
            {storyArcList.length > 0 && (
              <ExpandablePillSection
                title="Story Arcs"
                items={storyArcList}
                variant="arc"
                maxVisible={6}
              />
            )}
          </aside>
        </div>
      </DetailHeroSection>

      {/* Related Series Section - Shows parent and child series */}
      {(parentSeries.length > 0 || childSeries.length > 0) && (
        <div className="series-related-section">
          {/* Parent series (this series is a spinoff/sequel of) */}
          {parentSeries.length > 0 && (
            <div className="series-related-group">
              <h3 className="series-related-title">
                Related To
                <span className="series-related-count">{parentSeries.length}</span>
              </h3>
              <div className="series-related-grid">
                {parentSeries.map((parent) => (
                  <SeriesCoverCard
                    key={parent.id}
                    series={{
                      id: parent.id,
                      name: parent.name,
                      publisher: parent.publisher,
                      startYear: parent.startYear,
                      coverHash: parent.coverHash,
                      coverUrl: parent.coverUrl,
                      coverFileId: parent.coverFileId,
                      coverSource: parent.coverSource as 'api' | 'user' | 'auto',
                      _count: parent._count,
                    } as Series}
                    size="small"
                    onClick={(id) => navigate(`/series/${id}`)}
                    showYear={true}
                    showPublisher={false}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Child series (spinoffs/sequels of this series) */}
          {childSeries.length > 0 && (
            <div className="series-related-group">
              <h3 className="series-related-title">
                Related Series
                <span className="series-related-count">{childSeries.length}</span>
              </h3>
              <div className="series-related-grid">
                {childSeries.map((child) => (
                  <SeriesCoverCard
                    key={child.id}
                    series={{
                      id: child.id,
                      name: child.name,
                      publisher: child.publisher,
                      startYear: child.startYear,
                      coverHash: child.coverHash,
                      coverUrl: child.coverUrl,
                      coverFileId: child.coverFileId,
                      coverSource: child.coverSource as 'api' | 'user' | 'auto',
                      _count: child._count,
                    } as Series}
                    size="small"
                    onClick={(id) => navigate(`/series/${id}`)}
                    showYear={true}
                    showPublisher={false}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* User notes - separate if exists */}
      {series.userNotes && (
        <div className="series-user-notes">
          <p className="user-notes">{series.userNotes}</p>
        </div>
      )}

      {/* Issues section */}
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

        {/* Virtualized Issues Grid */}
        <VirtualizedIssuesGrid
          issues={issues}
          selectedFiles={selectedFiles}
          onIssueClick={handleIssueClick}
          onReadIssue={handleReadIssue}
          onSelectionChange={handleSelectionChange}
          onMenuAction={handleMenuAction}
        />
      </div>

      {/* Metadata Editor Modal */}
      {editingMetadataFileIds && (
        <div className="modal-overlay" onClick={closeMetadataEditor}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <MetadataEditor
              fileIds={editingMetadataFileIds}
              onClose={closeMetadataEditor}
              onSave={() => {
                closeMetadataEditor();
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
        onClose={closeCollectionPicker}
        fileIds={collectionPickerFileIds}
      />

      {/* Series Metadata Search Modal */}
      {series && seriesId && (
        <SeriesMetadataSearchModal
          isOpen={showMetadataSearchModal}
          onClose={() => setShowMetadataSearchModal(false)}
          onSelect={handleMetadataSearchSelect}
          seriesId={seriesId}
          initialQuery={series.name}
          libraryType={series.type}
        />
      )}

      {/* Metadata Preview Modal */}
      <MetadataPreviewModal
        isOpen={showMetadataPreviewModal}
        onClose={handleMetadataPreviewClose}
        onApply={handleMetadataPreviewApply}
        fields={previewFields}
        source={pendingSource}
        currentSeries={series}
        isApplying={isApplyingMetadata}
      />
    </div>
  );
}
