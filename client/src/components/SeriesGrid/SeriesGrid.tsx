/**
 * SeriesGrid Component
 *
 * Grid view of series with covers, progress indicators, and filtering.
 * Part of the Series-Centric Architecture UI.
 *
 * Performance optimizations:
 * - Virtualized grid rendering (only renders visible items)
 * - Scroll state detection (disables animations during rapid scroll)
 * - CSS containment on individual cards
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getSeriesList,
  getUnifiedGridItems,
  getSeriesIssues,
  markAsCompleted,
  markAsIncomplete,
  setSeriesHidden,
  Series,
  SeriesListOptions,
  GridItem,
  SeriesForMerge,
  PromotedCollectionGridItem,
} from '../../services/api.service';
import { SeriesCoverCard, type SeriesMenuItemPreset } from '../SeriesCoverCard';
import { CollectionCoverCard, type PromotedCollectionData } from '../CollectionCoverCard';
import { CoverSizeSlider } from '../CoverSizeSlider';
import { SeriesSelectModal } from '../SeriesSelectModal';
import { MergeSeriesModal } from '../MergeSeriesModal';
import { NavigationSidebar } from '../NavigationSidebar';
import { Spinner } from '../LoadingState';
import { useMetadataJob } from '../../contexts/MetadataJobContext';
import { useVirtualGrid } from '../../hooks/useVirtualGrid';
import './SeriesGrid.css';

interface SeriesGridProps {
  options?: SeriesListOptions;
  onSeriesSelect?: (seriesId: string) => void;
  /** Enable selection mode with checkboxes */
  selectable?: boolean;
  /** Set of selected series IDs */
  selectedSeries?: Set<string>;
  /** Called when selection changes */
  onSelectionChange?: (seriesId: string, selected: boolean, shiftKey?: boolean) => void;
  /** Use unified grid API to include promoted collections */
  useUnifiedGrid?: boolean;
  /** Called when a collection is clicked */
  onCollectionClick?: (collectionId: string) => void;
}

// =============================================================================
// Helper: Convert PromotedCollectionGridItem to PromotedCollectionData
// =============================================================================

function convertToPromotedCollectionData(item: PromotedCollectionGridItem): PromotedCollectionData {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    isPromoted: item.isPromoted,
    coverType: item.coverType as 'auto' | 'series' | 'issue' | 'custom',
    coverSeriesId: item.coverSeriesId,
    coverFileId: item.coverFileId,
    coverHash: item.coverHash,
    // Map effective values to derived fields (CollectionCoverCard prefers overrides but we pre-computed them)
    derivedPublisher: item.publisher,
    derivedStartYear: item.startYear,
    derivedEndYear: item.endYear,
    derivedGenres: item.genres,
    derivedIssueCount: item.totalIssues,
    derivedReadCount: item.readIssues,
    // No overrides - we've already computed the effective values
    overridePublisher: null,
    overrideStartYear: null,
    overrideEndYear: null,
    overrideGenres: null,
    totalIssues: item.totalIssues,
    readIssues: item.readIssues,
    seriesCount: item.seriesCount,
    seriesCovers: item.seriesCovers.map((sc) => ({
      id: sc.seriesId,
      name: sc.name,
      coverHash: sc.coverHash,
      coverFileId: sc.coverFileId,
      firstIssueId: null, // Not provided by grid API
    })),
  };
}

// =============================================================================
// SeriesGridContent - Virtualized grid rendering with scroll optimization
// =============================================================================

interface SeriesGridContentProps {
  items: GridItem[];
  total: number;
  coverSize: number;
  onCoverSizeChange: (size: number) => void;
  operationMessage: string | null;
  onSeriesClick: (seriesId: string) => void;
  onCollectionClick?: (collectionId: string) => void;
  onMenuAction: (action: SeriesMenuItemPreset | string, seriesId: string) => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  /** Enable selection mode */
  selectable?: boolean;
  /** Set of selected series IDs */
  selectedSeries?: Set<string>;
  /** Called when selection changes */
  onSelectionChange?: (seriesId: string, selected: boolean, shiftKey?: boolean) => void;
}

function SeriesGridContent({
  items,
  total,
  coverSize,
  onCoverSizeChange,
  operationMessage,
  onSeriesClick,
  onCollectionClick,
  onMenuAction,
  sortBy = 'name',
  sortOrder = 'asc',
  selectable = false,
  selectedSeries,
  onSelectionChange,
}: SeriesGridContentProps) {
  const gap = 16;

  // Virtualization with dynamic sizing that maximizes cover space
  // Uses sliderValue to calculate optimal columns and item width based on container width
  const { virtualItems, totalHeight, containerRef, isScrolling, scrollTo, visibleRange } = useVirtualGrid(items, {
    sliderValue: coverSize,
    gap,
    overscan: 3, // Render 3 extra rows for smooth scrolling
    aspectRatio: 1.5,
    infoHeight: 60,
    minCoverWidth: 80,
    maxCoverWidth: 350,
  });

  // Create value extractor for navigation sidebar based on sort field
  const getItemValue = useMemo(() => {
    return (item: GridItem) => {
      switch (sortBy) {
        case 'name':
          return item.name;
        case 'publisher':
          return item.publisher;
        case 'startYear':
          return item.startYear;
        case 'updatedAt':
          return item.updatedAt;
        case 'createdAt':
          return item.createdAt;
        case 'issueCount':
          return item.issueCount;
        default:
          return item.name;
      }
    };
  }, [sortBy]);

  return (
    <>
      <div className="series-grid-header">
        <span className="series-count">{total} series</span>
        <CoverSizeSlider value={coverSize} onChange={onCoverSizeChange} />
      </div>

      {/* Operation message */}
      {operationMessage && (
        <div className="series-operation-message">
          {operationMessage}
        </div>
      )}

      {/* Grid content wrapper with sidebar */}
      <div className="series-grid-content-wrapper">
        {/* Virtualized Series Grid */}
        <div
          ref={containerRef}
          className={`series-grid-scroll-container ${isScrolling ? 'scrolling' : ''}`}
        >
          <div
            className="series-grid-virtual"
            style={{ height: totalHeight, position: 'relative' }}
          >
            {virtualItems.map(({ item, style }) => (
              <div key={item.id} style={style} className="series-grid-item">
                {item.itemType === 'series' ? (
                  <SeriesCoverCard
                    series={item.series}
                    size="medium"
                    showYear={true}
                    showPublisher={true}
                    onClick={onSeriesClick}
                    onMenuAction={onMenuAction}
                    contextMenuEnabled={true}
                    selectable={selectable}
                    isSelected={selectedSeries?.has(item.id) ?? false}
                    onSelectionChange={onSelectionChange}
                  />
                ) : (
                  <CollectionCoverCard
                    collection={convertToPromotedCollectionData(item.collection)}
                    size="medium"
                    showYear={true}
                    showPublisher={true}
                    onClick={onCollectionClick}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Navigation Sidebar - positioned fixed to right edge */}
        <NavigationSidebar
          items={items}
          sortField={sortBy}
          sortOrder={sortOrder}
          onNavigate={scrollTo}
          visibleRange={visibleRange}
          getItemValue={getItemValue}
        />
      </div>
    </>
  );
}

// =============================================================================
// Main SeriesGrid Component
// =============================================================================

export function SeriesGrid({
  options = {},
  onSeriesSelect,
  selectable = false,
  selectedSeries,
  onSelectionChange,
  useUnifiedGrid = false,
  onCollectionClick,
}: SeriesGridProps) {
  const navigate = useNavigate();
  const { startJob } = useMetadataJob();
  const [gridItems, setGridItems] = useState<GridItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);

  // Merge modal state
  const [showSeriesSelectModal, setShowSeriesSelectModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSourceSeries, setMergeSourceSeries] = useState<Series | null>(null);
  const [selectedMergeSeries, setSelectedMergeSeries] = useState<SeriesForMerge[]>([]);

  // Cover size state (1-10 scale) - persisted in localStorage
  const [coverSize, setCoverSize] = useState(() => {
    const saved = localStorage.getItem('helixio-cover-size');
    return saved ? parseInt(saved, 10) : 5;
  });

  // Persist cover size changes
  const handleCoverSizeChange = useCallback((size: number) => {
    setCoverSize(size);
    localStorage.setItem('helixio-cover-size', String(size));
  }, []);

  // Fetch all items (no pagination - infinite scroll with navigation sidebar)
  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (useUnifiedGrid) {
        // Use unified grid API to include promoted collections
        const result = await getUnifiedGridItems({
          ...options,
          all: true,
          includePromotedCollections: true,
        });
        setGridItems(result.items);
        setTotal(result.pagination.total);
      } else {
        // Use regular series list API
        const result = await getSeriesList({
          ...options,
          all: true,  // Fetch all series for infinite scroll
        });

        // Convert Series[] to GridItem[] for consistent handling
        const items: GridItem[] = result.series.map((s): GridItem => ({
          itemType: 'series',
          id: s.id,
          name: s.name,
          startYear: s.startYear ?? null,
          publisher: s.publisher ?? null,
          genres: s.genres ?? null,
          issueCount: s._count?.issues ?? s.issueCount ?? 0,
          readCount: s.progress?.totalRead ?? 0,
          updatedAt: s.updatedAt ?? new Date().toISOString(),
          createdAt: s.createdAt ?? new Date().toISOString(),
          series: s,
        }));
        setGridItems(items);
        setTotal(result.pagination.total);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load series');
    } finally {
      setLoading(false);
    }
  }, [options, useUnifiedGrid]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleSeriesClick = useCallback((seriesId: string) => {
    if (onSeriesSelect) {
      onSeriesSelect(seriesId);
    } else {
      navigate(`/series/${seriesId}`);
    }
  }, [navigate, onSeriesSelect]);

  const handleCollectionClick = useCallback((collectionId: string) => {
    if (onCollectionClick) {
      onCollectionClick(collectionId);
    } else {
      navigate(`/collection/${collectionId}`);
    }
  }, [navigate, onCollectionClick]);

  // Handle context menu actions
  const handleMenuAction = useCallback(async (action: SeriesMenuItemPreset | string, seriesId: string) => {
    switch (action) {
      case 'view':
        handleSeriesClick(seriesId);
        break;

      case 'fetchMetadata':
        // Get all issue IDs for this series and start metadata job
        try {
          setOperationMessage('Loading series issues...');
          const result = await getSeriesIssues(seriesId, { limit: 1000 });
          const fileIds = result.issues.map((issue) => issue.id);
          if (fileIds.length > 0) {
            startJob(fileIds);
            setOperationMessage(null);
          } else {
            setOperationMessage('No issues found in this series');
            setTimeout(() => setOperationMessage(null), 2000);
          }
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to fetch issues'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'markAllRead':
        try {
          setOperationMessage('Marking all issues as read...');
          const result = await getSeriesIssues(seriesId, { limit: 1000 });
          await Promise.all(result.issues.map((issue) => markAsCompleted(issue.id)));
          setOperationMessage('All issues marked as read');
          fetchItems();
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to mark as read'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'markAllUnread':
        try {
          setOperationMessage('Marking all issues as unread...');
          const result = await getSeriesIssues(seriesId, { limit: 1000 });
          await Promise.all(result.issues.map((issue) => markAsIncomplete(issue.id)));
          setOperationMessage('All issues marked as unread');
          fetchItems();
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to mark as unread'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'mergeWith':
        // Find the series to use as source (only works for series items)
        const seriesItem = gridItems.find((item) => item.id === seriesId && item.itemType === 'series');
        if (seriesItem && seriesItem.itemType === 'series') {
          setMergeSourceSeries(seriesItem.series);
          setShowSeriesSelectModal(true);
        }
        break;

      case 'hide':
        try {
          setOperationMessage('Hiding series...');
          await setSeriesHidden(seriesId, true);
          setOperationMessage('Series hidden');
          fetchItems();
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to hide series'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;

      case 'unhide':
        try {
          setOperationMessage('Unhiding series...');
          await setSeriesHidden(seriesId, false);
          setOperationMessage('Series unhidden');
          fetchItems();
          setTimeout(() => setOperationMessage(null), 2000);
        } catch (err) {
          setOperationMessage(`Error: ${err instanceof Error ? err.message : 'Failed to unhide series'}`);
          setTimeout(() => setOperationMessage(null), 3000);
        }
        break;
    }
  }, [handleSeriesClick, startJob, fetchItems, gridItems]);

  // Helper to convert Series to SeriesForMerge
  const seriesToMergeFormat = useCallback((s: Series): SeriesForMerge => ({
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
  }), []);

  // Handle series selection for merge
  const handleSeriesSelectedForMerge = useCallback((selectedSeries: Series[]) => {
    if (!mergeSourceSeries) return;

    // Convert source series to SeriesForMerge format
    const sourceSeriesForMerge = seriesToMergeFormat(mergeSourceSeries);

    // Convert selected series to SeriesForMerge format
    const selectedSeriesForMerge = selectedSeries.map(seriesToMergeFormat);

    // Combine source series with selected series
    setSelectedMergeSeries([sourceSeriesForMerge, ...selectedSeriesForMerge]);
    setShowSeriesSelectModal(false);
    setShowMergeModal(true);
  }, [mergeSourceSeries, seriesToMergeFormat]);

  // Handle merge complete
  const handleMergeComplete = useCallback(() => {
    setShowMergeModal(false);
    setSelectedMergeSeries([]);
    setMergeSourceSeries(null);
    // Refresh the grid
    fetchItems();
  }, [fetchItems]);

  return (
    <div className="series-grid-container">
      {/* Loading State */}
      {loading && <Spinner message="Loading series..." />}

      {/* Error State */}
      {error && <div className="error-message">{error}</div>}

      {/* Empty State */}
      {!loading && gridItems.length === 0 && (
        <div className="empty-state">
          <h2>No Series Found</h2>
          <p>
            {options.search
              ? `No series matching "${options.search}"`
              : 'No series in your library yet. Scan a library to discover series.'}
          </p>
        </div>
      )}

      {/* Series Grid */}
      {gridItems.length > 0 && (
        <SeriesGridContent
          items={gridItems}
          total={total}
          coverSize={coverSize}
          onCoverSizeChange={handleCoverSizeChange}
          operationMessage={operationMessage}
          onSeriesClick={handleSeriesClick}
          onCollectionClick={handleCollectionClick}
          onMenuAction={handleMenuAction}
          sortBy={options.sortBy}
          sortOrder={options.sortOrder}
          selectable={selectable}
          selectedSeries={selectedSeries}
          onSelectionChange={onSelectionChange}
        />
      )}

      {/* Series Select Modal for Merge */}
      <SeriesSelectModal
        isOpen={showSeriesSelectModal}
        onClose={() => {
          setShowSeriesSelectModal(false);
          setMergeSourceSeries(null);
        }}
        onSelect={handleSeriesSelectedForMerge}
        excludeIds={mergeSourceSeries ? [mergeSourceSeries.id] : []}
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
            setMergeSourceSeries(null);
          }}
          onMergeComplete={handleMergeComplete}
          initialSeries={selectedMergeSeries}
          initialTargetId={mergeSourceSeries?.id}
        />
      )}

    </div>
  );
}
