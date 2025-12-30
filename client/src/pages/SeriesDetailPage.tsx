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
  getCollectionCoverUrl,
  fetchSeriesMetadata,
  previewSeriesMetadata,
  applySeriesMetadata,
  getSeriesRelationships,
  getSimilarSeries,
  Series,
  SeriesIssue,
  SeriesForMerge,
  MetadataSource,
  SeriesMetadataPayload,
  MetadataPreviewField,
  RelatedSeriesInfo,
  SimilarSeriesEntry,
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
import { LinkSeriesModal } from '../components/LinkSeriesModal';
import { ManageRelationshipsModal } from '../components/ManageRelationshipsModal';
import { removeChildSeries, updateRelationshipType, type RelationshipType } from '../services/api/series';
import { useSeriesCollections, useRemoveFromCollection } from '../hooks/queries/useCollections';
import type { Collection } from '../services/api/series';
import { SeriesMetadataSearchModal } from '../components/SeriesMetadataSearchModal';
import { MetadataPreviewModal } from '../components/MetadataPreviewModal';
import { ActionMenu, type ActionMenuItem } from '../components/ActionMenu';
import { MarkdownContent } from '../components/MarkdownContent';
import { CollectionPickerModal } from '../components/CollectionPickerModal';
import { DetailHeroSection } from '../components/DetailHeroSection';
import { SeriesHero } from '../components/SeriesHero';
import { ExpandablePillSection } from '../components/ExpandablePillSection';
import { CreatorCredits, type CreatorsByRole } from '../components/CreatorCredits';
import { RelationshipTypeBadge } from '../components/RelationshipTypeBadge';
import { useWindowVirtualGrid } from '../hooks/useWindowVirtualGrid';
import { RatingStars } from '../components/RatingStars';
import { SeriesUserDataPanel } from '../components/UserDataPanel';
import { ExternalRatingsPreview } from '../components/ExternalRatingsPreview';
import { CommunityRatingsModal } from '../components/CommunityRatingsModal';
import { useSeriesUserData, useUpdateSeriesUserData, useHasExternalRatings } from '../hooks/queries';
import {
  getReaderPresetsGrouped,
  applyPresetToSeries,
  deleteSeriesReaderSettingsById,
  getSeriesReaderSettingsById,
  getLibraryReaderSettings,
  PresetsGrouped,
} from '../services/api/reading';
import './SeriesDetailPage.css';

// =============================================================================
// Menu Configurations
// =============================================================================

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

  // Similar series state (from recommendation engine)
  const [similarSeries, setSimilarSeries] = useState<SimilarSeriesEntry[]>([]);
  const [similarSeriesLoading, setSimilarSeriesLoading] = useState(false);
  const [similarSeriesError, setSimilarSeriesError] = useState(false);
  const similarFetchedRef = useRef(false);

  // Tab state for Issues/Related Series/Similar/Collections tabs
  const [activeTab, setActiveTab] = useState<'issues' | 'related' | 'similar' | 'collections'>('issues');

  // Fetch collections containing this series (or its files)
  const { data: seriesCollections = [] } = useSeriesCollections(seriesId);
  const removeFromCollectionMutation = useRemoveFromCollection();

  // User ratings and reviews
  const { data: userData } = useSeriesUserData(seriesId);
  const updateUserDataMutation = useUpdateSeriesUserData();

  // External ratings status (for showing fetch icon when no ratings exist)
  const { hasRatings: hasExternalRatings, isLoading: isLoadingExternalRatings } = useHasExternalRatings(seriesId);

  // Combined related series for the unified row with isParent flag
  const allRelatedSeries = useMemo(() => {
    const parentsWithFlag = parentSeries.map(p => ({ ...p, isParent: true as const }));
    const childrenWithFlag = childSeries.map(c => ({ ...c, isParent: false as const }));
    return [...parentsWithFlag, ...childrenWithFlag];
  }, [parentSeries, childSeries]);

  // Dynamic series action menu items - conditionally show Link/Manage based on relationships
  const seriesMenuItems: ActionMenuItem[] = useMemo(() => {
    const hasRelationships = parentSeries.length > 0 || childSeries.length > 0;
    return [
      { id: 'editSeries', label: 'Edit Series' },
      { id: 'fetchSeriesMetadata', label: 'Fetch Metadata (Series)', dividerBefore: true },
      { id: 'fetchAllIssuesMetadata', label: 'Fetch Metadata (All Issues)' },
      { id: 'markAllRead', label: 'Mark All as Read', dividerBefore: true },
      { id: 'markAllUnread', label: 'Mark All as Unread' },
      { id: 'readerSettings', label: 'Reader Settings...' },
      { id: 'downloadAll', label: 'Download All Issues', dividerBefore: true },
      { id: 'linkSeries', label: 'Link Series...', dividerBefore: true },
      ...(hasRelationships ? [{ id: 'manageRelationships', label: 'Manage Relationships' }] : []),
      { id: 'mergeWith', label: 'Merge with...' },
      { id: 'rebuildCache', label: 'Rebuild All Covers', dividerBefore: true },
    ];
  }, [parentSeries.length, childSeries.length]);

  // Merge modal state
  const [showSeriesSelectModal, setShowSeriesSelectModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [selectedMergeSeries, setSelectedMergeSeries] = useState<SeriesForMerge[]>([]);

  // Relationship modal state
  const [showLinkSeriesModal, setShowLinkSeriesModal] = useState(false);
  const [showManageRelationshipsModal, setShowManageRelationshipsModal] = useState(false);

  // External ratings modal state
  const [showRatingsModal, setShowRatingsModal] = useState(false);

  // Reader settings modal state
  const [showReaderSettingsModal, setShowReaderSettingsModal] = useState(false);
  const [readerPresets, setReaderPresets] = useState<PresetsGrouped | null>(null);
  const [seriesReaderSettings, setSeriesReaderSettings] = useState<{ presetId?: string; presetName?: string } | null>(null);
  const [libraryReaderSettingsInfo, setLibraryReaderSettingsInfo] = useState<{ presetId?: string; presetName?: string } | null>(null);
  const [loadingReaderSettings, setLoadingReaderSettings] = useState(false);

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

  // Fetch similar series when tab is selected (lazy loading)
  const fetchSimilarSeries = useCallback(async () => {
    if (!seriesId || similarFetchedRef.current) return;

    similarFetchedRef.current = true;
    setSimilarSeriesLoading(true);
    setSimilarSeriesError(false);

    try {
      const result = await getSimilarSeries(seriesId, 12);
      setSimilarSeries(result.similar);
    } catch (err) {
      console.error('Failed to fetch similar series:', err);
      setSimilarSeriesError(true);
    } finally {
      setSimilarSeriesLoading(false);
    }
  }, [seriesId]);

  // Load similar series when tab is selected
  useEffect(() => {
    if (activeTab === 'similar') {
      fetchSimilarSeries();
    }
  }, [activeTab, fetchSimilarSeries]);

  // Reset similar series state when seriesId changes
  useEffect(() => {
    similarFetchedRef.current = false;
    setSimilarSeries([]);
    setSimilarSeriesError(false);
  }, [seriesId]);

  // Refresh series data when a metadata job completes
  useEffect(() => {
    if (lastCompletedJobAt) {
      fetchSeries();
    }
  }, [lastCompletedJobAt, fetchSeries]);

  // Handle removing a parent relationship
  const handleRemoveParentRelationship = useCallback(
    async (parentId: string, parentName: string) => {
      if (!seriesId) return;

      // Optimistically remove from UI
      const removed = parentSeries.find((p) => p.id === parentId);
      setParentSeries((prev) => prev.filter((p) => p.id !== parentId));

      try {
        await removeChildSeries(parentId, seriesId);
        addToast('success', `Removed "${parentName}"`);
      } catch (err) {
        console.error('Failed to remove relationship:', err);
        if (removed) {
          setParentSeries((prev) => [...prev, removed]);
        }
        addToast('error', 'Failed to remove relationship');
      }
    },
    [seriesId, parentSeries, addToast]
  );

  // Handle removing a child relationship
  const handleRemoveChildRelationship = useCallback(
    async (childId: string, childName: string) => {
      if (!seriesId) return;

      // Optimistically remove from UI
      const removed = childSeries.find((c) => c.id === childId);
      setChildSeries((prev) => prev.filter((c) => c.id !== childId));

      try {
        await removeChildSeries(seriesId, childId);
        addToast('success', `Removed "${childName}"`);
      } catch (err) {
        console.error('Failed to remove relationship:', err);
        if (removed) {
          setChildSeries((prev) => [...prev, removed]);
        }
        addToast('error', 'Failed to remove relationship');
      }
    },
    [seriesId, childSeries, addToast]
  );

  // Handle unlink from the combined related series row (works for both parent and child)
  const handleUnlinkSeries = useCallback(
    async (related: RelatedSeriesInfo) => {
      const isParent = parentSeries.some((p) => p.id === related.id);
      if (isParent) {
        await handleRemoveParentRelationship(related.id, related.name);
      } else {
        await handleRemoveChildRelationship(related.id, related.name);
      }
    },
    [parentSeries, handleRemoveParentRelationship, handleRemoveChildRelationship]
  );

  // Handle changing relationship type from the context menu
  const handleChangeRelationshipType = useCallback(
    async (relatedId: string, newType: RelationshipType) => {
      if (!seriesId) return;

      const isParent = parentSeries.some((p) => p.id === relatedId);

      try {
        await updateRelationshipType(
          isParent ? relatedId : seriesId,
          isParent ? seriesId : relatedId,
          newType
        );
        fetchSeries();
        addToast('success', 'Relationship type updated');
      } catch (err) {
        console.error('Failed to update relationship type:', err);
        addToast('error', 'Failed to update relationship type');
      }
    },
    [seriesId, parentSeries, fetchSeries, addToast]
  );

  // Handle collection card action menu
  const handleCollectionAction = useCallback(
    (actionId: string, collection: Collection) => {
      if (actionId === 'view') {
        navigate(`/collection/${collection.id}`);
      } else if (actionId === 'remove') {
        removeFromCollectionMutation.mutate(
          { collectionId: collection.id, seriesId },
          {
            onSuccess: () => addToast('success', `Removed from "${collection.name}"`),
            onError: () => addToast('error', 'Failed to remove from collection'),
          }
        );
      }
    },
    [navigate, seriesId, removeFromCollectionMutation, addToast]
  );

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
    onLinkSeries: () => setShowLinkSeriesModal(true),
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

      // Handle local actions first
      if (actionId === 'linkSeries') {
        setShowLinkSeriesModal(true);
        return;
      }
      if (actionId === 'manageRelationships') {
        setShowManageRelationshipsModal(true);
        return;
      }
      if (actionId === 'readerSettings') {
        setShowReaderSettingsModal(true);
        // Fetch presets and current settings
        // Get libraryId from first issue (issues have libraryId, series doesn't)
        const libraryId = issues?.[0]?.libraryId ?? null;
        setLoadingReaderSettings(true);
        Promise.all([
          getReaderPresetsGrouped(),
          getSeriesReaderSettingsById(seriesId),
          libraryId ? getLibraryReaderSettings(libraryId) : Promise.resolve(null)
        ]).then(([presets, seriesSettings, libSettings]) => {
          setReaderPresets(presets);
          // Extract preset info from series settings
          const seriesWithPreset = seriesSettings as { basedOnPresetId?: string; basedOnPresetName?: string };
          setSeriesReaderSettings(seriesWithPreset?.basedOnPresetId ? {
            presetId: seriesWithPreset.basedOnPresetId,
            presetName: seriesWithPreset.basedOnPresetName
          } : null);
          // Extract preset info from library settings
          const libWithPreset = libSettings as { basedOnPresetId?: string; basedOnPresetName?: string } | null;
          setLibraryReaderSettingsInfo(libWithPreset?.basedOnPresetId ? {
            presetId: libWithPreset.basedOnPresetId,
            presetName: libWithPreset.basedOnPresetName
          } : null);
        }).catch(console.error).finally(() => setLoadingReaderSettings(false));
        return;
      }

      const context: MenuContext = {
        entityType: 'series',
        entityId: seriesId,
        selectedIds: [seriesId],
        selectedCount: 1,
      };
      handleMenuActionFromHook(actionId, context);
    },
    [seriesId, issues, handleMenuActionFromHook]
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

  // Cover URL respecting coverSource setting
  const firstIssue = issues[0];
  const firstIssueId = firstIssue?.id;
  // Get first issue's coverHash for cache-busting when its cover changes
  const firstIssueCoverHash = firstIssue?.coverHash;
  const coverUrl = (() => {
    if (series.coverSource === 'api') {
      // Explicit API cover mode - only use coverHash
      if (series.coverHash) return getApiCoverUrl(series.coverHash);
      if (firstIssueId) return getCoverUrl(firstIssueId, firstIssueCoverHash);
      return null;
    }
    if (series.coverSource === 'user') {
      // Explicit user selection mode - use coverFileId
      if (series.coverFileId) return getCoverUrl(series.coverFileId);
      if (firstIssueId) return getCoverUrl(firstIssueId, firstIssueCoverHash);
      return null;
    }
    // 'auto' or unset: Priority fallback chain
    // API cover (local cache) > User-set file > First issue in series
    if (series.coverHash) return getApiCoverUrl(series.coverHash);
    if (series.coverFileId) return getCoverUrl(series.coverFileId);
    if (firstIssueId) return getCoverUrl(firstIssueId, firstIssueCoverHash);
    return null;
  })();

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
              actionItems={seriesMenuItems}
              onContinueReading={handleContinueReading}
              onSeriesAction={handleSeriesAction}
              hasRelatedSeries={allRelatedSeries.length > 0}
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
            {/* User Rating */}
            <div className="series-rating-section">
              <div className="rating-header">
                <span className="rating-label">Your Rating</span>
                {!hasExternalRatings && !isLoadingExternalRatings && (
                  <button
                    className="fetch-external-ratings-icon"
                    onClick={() => setShowRatingsModal(true)}
                    title="Search for external ratings"
                    type="button"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      <path d="M12 17v4m0 0l-2-2m2 2l2-2" />
                    </svg>
                  </button>
                )}
              </div>
              <RatingStars
                value={userData?.data?.rating ?? null}
                onChange={(rating) => seriesId && updateUserDataMutation.mutate({ seriesId, input: { rating } })}
                size="large"
                showEmpty
                allowClear
              />
              {userData?.ratingStats && userData.ratingStats.count > 0 && (
                <span className="rating-avg">
                  Avg: {userData.ratingStats.average?.toFixed(1)} ({userData.ratingStats.count} issues rated)
                </span>
              )}
            </div>

            {/* External Ratings Preview */}
            {seriesId && (
              <ExternalRatingsPreview
                seriesId={seriesId}
                onViewDetails={() => setShowRatingsModal(true)}
              />
            )}

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

      {/* User Rating & Notes Panel - only show when user has data */}
      {seriesId && (userData?.data?.rating !== null && userData?.data?.rating !== undefined
        || userData?.data?.privateNotes
        || userData?.data?.publicReview) && (
        <div className="series-user-data-section">
          <SeriesUserDataPanel seriesId={seriesId} defaultExpanded={false} />
        </div>
      )}

      {/* Content Section - Always use tabbed layout to include Similar Series discovery */}
      {true ? (
        <div className="series-content-section">
          {/* Tab Navigation */}
          <div className="series-content-tabs">
            <button
              className={`series-content-tab ${activeTab === 'issues' ? 'active' : ''}`}
              onClick={() => setActiveTab('issues')}
            >
              Issues
              <span className="tab-count">{totalOwned}</span>
            </button>
            {allRelatedSeries.length > 0 && (
              <button
                className={`series-content-tab ${activeTab === 'related' ? 'active' : ''}`}
                onClick={() => setActiveTab('related')}
              >
                Related Series
                <span className="tab-count">{allRelatedSeries.length}</span>
              </button>
            )}
            {/* Always show Similar tab - content is lazy-loaded */}
            <button
              className={`series-content-tab ${activeTab === 'similar' ? 'active' : ''}`}
              onClick={() => setActiveTab('similar')}
            >
              Similar Series
              {similarSeries.length > 0 && (
                <span className="tab-count">{similarSeries.length}</span>
              )}
            </button>
            {seriesCollections.length > 0 && (
              <button
                className={`series-content-tab ${activeTab === 'collections' ? 'active' : ''}`}
                onClick={() => setActiveTab('collections')}
              >
                Collections
                <span className="tab-count">{seriesCollections.length}</span>
              </button>
            )}
          </div>

          {/* Tab Content */}
          <div className="series-tab-content">
            {activeTab === 'issues' && (
              <>
                {/* Selection actions header */}
                {selectedFiles.size > 0 && (
                  <div className="series-issues-tab-header">
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
                  </div>
                )}

                {/* Virtualized Issues Grid */}
                <VirtualizedIssuesGrid
                  issues={issues}
                  selectedFiles={selectedFiles}
                  onIssueClick={handleIssueClick}
                  onReadIssue={handleReadIssue}
                  onSelectionChange={handleSelectionChange}
                  onMenuAction={handleMenuAction}
                />
              </>
            )}

            {activeTab === 'related' && (
              <div className="series-related-tab-content">
                {allRelatedSeries.map((related) => {
                  const relatedCoverUrl = related.coverHash
                    ? getApiCoverUrl(related.coverHash)
                    : related.coverFileId
                      ? getCoverUrl(related.coverFileId)
                      : related.firstIssueId
                        ? getCoverUrl(related.firstIssueId, related.firstIssueCoverHash)
                        : null;

                  return (
                    <div
                      key={related.id}
                      className="related-series-card"
                      onClick={() => navigate(`/series/${related.id}`)}
                    >
                      {/* Cover image - prominent at top */}
                      <div className="related-series-card__cover">
                        {relatedCoverUrl ? (
                          <img src={relatedCoverUrl} alt={related.name} loading="lazy" />
                        ) : (
                          <div className="related-series-card__cover-placeholder">
                            {related.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>

                      {/* Info section below cover */}
                      <div className="related-series-card__info">
                        <h4 className="related-series-card__name" title={related.name}>
                          {related.name}
                        </h4>
                        <div className="related-series-card__meta">
                          {related.publisher && (
                            <span>{related.publisher}</span>
                          )}
                          {related.publisher && related.startYear && (
                            <span className="related-series-card__meta-separator" aria-hidden="true" />
                          )}
                          {related.startYear && (
                            <span>{related.startYear}</span>
                          )}
                          {(related.publisher || related.startYear) && related._count?.issues && (
                            <span className="related-series-card__meta-separator" aria-hidden="true" />
                          )}
                          {related._count?.issues && (
                            <span>{related._count.issues} issues</span>
                          )}
                        </div>
                        <div className="related-series-card__relationship">
                          <RelationshipTypeBadge
                            type={related.relationshipType}
                            size="medium"
                            isParent={related.isParent}
                          />
                        </div>
                      </div>

                      {/* Actions menu - overlaid in corner */}
                      <div
                        className="related-series-card__actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ActionMenu
                          items={[
                            { id: 'unlinkSeries', label: 'Unlink Series', danger: true },
                            { id: 'changeTypeSpinoff', label: 'Change to Spinoff', dividerBefore: true },
                            { id: 'changeTypePrequel', label: 'Change to Prequel' },
                            { id: 'changeTypeSequel', label: 'Change to Sequel' },
                            { id: 'changeTypeBonus', label: 'Change to Bonus' },
                            { id: 'changeTypeRelated', label: 'Change to Related' },
                          ]}
                          onAction={(actionId) => {
                            if (actionId === 'unlinkSeries') {
                              handleUnlinkSeries(related);
                            } else if (actionId.startsWith('changeType')) {
                              const typeMap: Record<string, RelationshipType> = {
                                changeTypeSpinoff: 'spinoff',
                                changeTypePrequel: 'prequel',
                                changeTypeSequel: 'sequel',
                                changeTypeBonus: 'bonus',
                                changeTypeRelated: 'related',
                              };
                              const newType = typeMap[actionId];
                              if (newType) {
                                handleChangeRelationshipType(related.id, newType);
                              }
                            }
                          }}
                          ariaLabel={`Actions for ${related.name}`}
                          size="small"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'similar' && (
              <div className="series-similar-tab-content">
                {similarSeriesLoading ? (
                  <div className="similar-series-loading">
                    <div className="spinner" />
                    <span>Finding similar series...</span>
                  </div>
                ) : similarSeriesError ? (
                  <div className="similar-series-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <circle cx="12" cy="16" r="0.5" fill="currentColor" />
                    </svg>
                    <p>Unable to load similar series.</p>
                    <button
                      className="similar-series-retry-btn"
                      onClick={() => {
                        similarFetchedRef.current = false;
                        fetchSimilarSeries();
                      }}
                    >
                      Try Again
                    </button>
                  </div>
                ) : similarSeries.length === 0 ? (
                  <div className="similar-series-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <p>No similar series found yet.</p>
                    <span className="similar-series-empty-hint">
                      Similarity scores are computed periodically. Check back later!
                    </span>
                  </div>
                ) : (
                  similarSeries.map((entry) => {
                    const { series: sim, similarityScore, matchReasons } = entry;
                    // Smart cover fallback: series coverHash > coverUrl > first issue coverHash > first issue file
                    const simCoverUrl = sim.coverHash
                      ? getApiCoverUrl(sim.coverHash)
                      : sim.coverUrl
                        ? sim.coverUrl
                        : sim.firstIssueCoverHash
                          ? getApiCoverUrl(sim.firstIssueCoverHash)
                          : sim.firstIssueId
                            ? getCoverUrl(sim.firstIssueId)
                            : null;

                    // Get top match reason for display
                    const topReason = matchReasons[0];
                    const reasonText = topReason
                      ? topReason.type === 'character'
                        ? 'Similar characters'
                        : topReason.type === 'genre'
                          ? 'Similar genres'
                          : topReason.type === 'creator'
                            ? 'Same creators'
                            : topReason.type === 'tag'
                              ? 'Similar tags'
                              : topReason.type === 'team'
                                ? 'Same teams'
                                : topReason.type === 'keyword'
                                  ? 'Related themes'
                                  : topReason.type === 'publisher'
                                    ? 'Same publisher'
                                    : 'Similar'
                      : null;

                    return (
                      <div
                        key={sim.id}
                        className="similar-series-card"
                        onClick={() => navigate(`/series/${sim.id}`)}
                      >
                        {/* Cover image */}
                        <div className="similar-series-card__cover">
                          {simCoverUrl ? (
                            <img src={simCoverUrl} alt={sim.name} loading="lazy" />
                          ) : (
                            <div className="similar-series-card__cover-placeholder">
                              {sim.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          {/* Match score badge */}
                          <div className="similar-series-card__score">
                            {Math.round(similarityScore * 100)}% match
                          </div>
                        </div>

                        {/* Info section */}
                        <div className="similar-series-card__info">
                          <h4 className="similar-series-card__name" title={sim.name}>
                            {sim.name}
                          </h4>
                          <div className="similar-series-card__meta">
                            {sim.publisher && (
                              <span>{sim.publisher}</span>
                            )}
                            {sim.publisher && sim.startYear && (
                              <span className="similar-series-card__meta-separator" aria-hidden="true" />
                            )}
                            {sim.startYear && (
                              <span>{sim.startYear}</span>
                            )}
                            {(sim.publisher || sim.startYear) && sim.issueCount > 0 && (
                              <span className="similar-series-card__meta-separator" aria-hidden="true" />
                            )}
                            {sim.issueCount > 0 && (
                              <span>{sim.issueCount} issues</span>
                            )}
                          </div>
                          {reasonText && (
                            <div className="similar-series-card__reason">
                              {reasonText}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeTab === 'collections' && (
              <div className="series-collections-tab-content">
                {seriesCollections.map((collection) => {
                  // Determine cover URL based on coverType
                  let collectionCoverUrl: string | null = null;
                  if (collection.coverType === 'auto' && collection.coverHash) {
                    // Auto-generated mosaic covers use the collection covers endpoint
                    collectionCoverUrl = getCollectionCoverUrl(collection.coverHash);
                  } else if (collection.coverType === 'custom' && collection.coverHash) {
                    // Custom uploaded covers are stored in series covers directory
                    collectionCoverUrl = getApiCoverUrl(collection.coverHash);
                  } else if (collection.coverType === 'issue' && collection.coverFileId) {
                    // Issue covers use file cover endpoint
                    collectionCoverUrl = getCoverUrl(collection.coverFileId);
                  } else if (collection.coverFileId) {
                    // Fallback to file cover
                    collectionCoverUrl = getCoverUrl(collection.coverFileId);
                  }

                  return (
                    <div
                      key={collection.id}
                      className="collection-series-card"
                      onClick={() => navigate(`/collection/${collection.id}`)}
                    >
                      {/* Cover image */}
                      <div className="collection-series-card__cover">
                        {collectionCoverUrl ? (
                          <img src={collectionCoverUrl} alt={collection.name} loading="lazy" />
                        ) : (
                          <div className="collection-series-card__cover-placeholder">
                            {collection.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>

                      {/* Info section */}
                      <div className="collection-series-card__info">
                        <h4 className="collection-series-card__name" title={collection.name}>
                          {collection.name}
                        </h4>
                        <div className="collection-series-card__meta">
                          {collection.itemCount !== undefined && (
                            <span>{collection.itemCount} items</span>
                          )}
                          {collection.isSystem && collection.systemKey && (
                            <>
                              <span className="collection-series-card__meta-separator" aria-hidden="true" />
                              <span className="collection-series-card__system-badge">
                                {collection.systemKey === 'favorites' ? 'Favorites' : 'Want to Read'}
                              </span>
                            </>
                          )}
                        </div>
                        {collection.deck && (
                          <p className="collection-series-card__deck">{collection.deck}</p>
                        )}
                      </div>

                      {/* Actions menu */}
                      <div
                        className="collection-series-card__actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ActionMenu
                          items={[
                            { id: 'view', label: 'View Collection' },
                            { id: 'remove', label: 'Remove Series', danger: true, dividerBefore: true },
                          ]}
                          onAction={(actionId) => handleCollectionAction(actionId, collection)}
                          ariaLabel={`Actions for ${collection.name}`}
                          size="small"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Original issues section when no related series */
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
      )}

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

      {/* Link Series Modal */}
      {series && seriesId && (
        <LinkSeriesModal
          isOpen={showLinkSeriesModal}
          onClose={() => setShowLinkSeriesModal(false)}
          currentSeries={{ id: seriesId, name: series.name }}
          existingParentIds={parentSeries.map((p) => p.id)}
          existingChildIds={childSeries.map((c) => c.id)}
          onLinked={fetchSeries}
        />
      )}

      {/* Manage Relationships Modal */}
      {series && seriesId && (
        <ManageRelationshipsModal
          isOpen={showManageRelationshipsModal}
          onClose={() => setShowManageRelationshipsModal(false)}
          seriesId={seriesId}
          seriesName={series.name}
          parents={parentSeries}
          children={childSeries}
          onUpdate={fetchSeries}
        />
      )}

      {/* Community Ratings Modal */}
      {seriesId && (
        <CommunityRatingsModal
          isOpen={showRatingsModal}
          seriesId={seriesId}
          seriesName={series?.name}
          issueCount={series?._count?.issues ?? issues.length}
          onClose={() => setShowRatingsModal(false)}
        />
      )}

      {/* Reader Settings Modal */}
      {showReaderSettingsModal && seriesId && (
        <div className="modal-overlay" onClick={() => setShowReaderSettingsModal(false)}>
          <div className="modal-content reader-settings-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Reader Settings</h3>
              <button
                className="modal-close"
                onClick={() => setShowReaderSettingsModal(false)}
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className={`modal-body${loadingReaderSettings ? ' modal-body--loading' : ''}`}>
              {loadingReaderSettings ? (
                <span>Loading...</span>
              ) : (
                <>
                  {/* Status indicator */}
                  <div className="reader-settings-status">
                    <div className="reader-settings-status-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </div>
                    <div className="reader-settings-status-text">
                      <span className="reader-settings-status-label">Active Profile</span>
                      <span className="reader-settings-status-value">
                        {seriesReaderSettings?.presetName
                          ? `Series: ${seriesReaderSettings.presetName}`
                          : libraryReaderSettingsInfo?.presetName
                            ? `Library: ${libraryReaderSettingsInfo.presetName}`
                            : 'Global Defaults'}
                      </span>
                    </div>
                  </div>

                  {/* Profile selector */}
                  <div className="reader-settings-field">
                    <label htmlFor="preset-select">Reader Profile</label>
                    <select
                      id="preset-select"
                      value={seriesReaderSettings?.presetId || ''}
                      onChange={async (e) => {
                        const presetId = e.target.value;
                        if (presetId === '') {
                          await deleteSeriesReaderSettingsById(seriesId);
                          setSeriesReaderSettings(null);
                        } else {
                          const allPresets = [...(readerPresets?.bundled || []), ...(readerPresets?.system || []), ...(readerPresets?.user || [])];
                          const preset = allPresets.find(p => p.id === presetId);
                          await applyPresetToSeries(presetId, seriesId);
                          setSeriesReaderSettings({ presetId, presetName: preset?.name || 'Custom' });
                        }
                      }}
                    >
                      <option value="">Use Inherited Settings</option>
                      <optgroup label="Bundled">
                        {readerPresets?.bundled?.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </optgroup>
                      {readerPresets?.system && readerPresets.system.length > 0 && (
                        <optgroup label="System">
                          {readerPresets.system.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </optgroup>
                      )}
                      {readerPresets?.user && readerPresets.user.length > 0 && (
                        <optgroup label="My Presets">
                          {readerPresets.user.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-primary" onClick={() => setShowReaderSettingsModal(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
