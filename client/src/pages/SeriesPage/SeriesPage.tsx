/**
 * SeriesPage Component
 *
 * Rebuilt series browser page with improved performance and URL-based filtering.
 *
 * Key improvements over SeriesBrowserPage:
 * - URL-based filter state for bookmarkable/shareable views
 * - Stable grid layout (no layout shift during data refresh)
 * - Improved virtualization with stable item positions
 * - Cleaner separation of concerns via custom hooks
 */

import { useEffect, useCallback, useState, useMemo } from 'react';
import { useBreadcrumbs } from '../../contexts/BreadcrumbContext';
import { AdvancedSeriesFilterProvider, useAdvancedSeriesFilter } from '../../contexts/AdvancedSeriesFilterContext';
import { UnifiedMenu } from '../../components/UnifiedMenu';
import { AdvancedSeriesFilterModal } from '../../components/AdvancedSeriesFilter';
import { CollectionPickerModal } from '../../components/CollectionPickerModal/CollectionPickerModal';
import { BatchSeriesMetadataModal } from '../../components/BatchSeriesMetadataModal/BatchSeriesMetadataModal';
import { BulkLinkSeriesModal } from '../../components/BulkLinkSeriesModal';
import { MergeSeriesModal } from '../../components/MergeSeriesModal';
import type { SeriesForMerge, Series } from '../../services/api.service';
import { NavigationSidebar } from '../../components/NavigationSidebar';
import { useToast } from '../../contexts/ToastContext';
import { GridItem } from '../../services/api/series';

// Local hooks
import { useSeriesFilters } from './hooks/useSeriesFilters';
import { useUrlSnapshot } from './hooks/useUrlSnapshot';
import { useSeriesData } from './hooks/useSeriesData';
import { useSeriesSelection } from './hooks/useSeriesSelection';
import { useSeriesContextMenu } from './hooks/useSeriesContextMenu';
import { useSeriesPresets } from './hooks/useSeriesPresets';

// Local components
import { SeriesToolbar } from './components/SeriesToolbar';
import { SeriesVirtualGrid } from './components/SeriesVirtualGrid';
import { BulkActionsBar } from './components/BulkActionsBar';

// Local hooks for bulk actions
import { useBulkActions } from './hooks/useBulkActions';

import './SeriesPage.css';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert Series to SeriesForMerge format for the merge modal.
 */
function seriesToMergeFormat(s: Series): SeriesForMerge {
  return {
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
  };
}

// =============================================================================
// Inner Component (needs AdvancedSeriesFilterProvider context)
// =============================================================================

function SeriesPageContent() {
  const { setBreadcrumbs } = useBreadcrumbs();

  // Set breadcrumbs on mount
  useEffect(() => {
    setBreadcrumbs([{ label: 'Series', path: '/series' }]);
  }, [setBreadcrumbs]);

  // URL snapshot - get initial filters and sync function
  const { initialFilters, syncToUrl } = useUrlSnapshot();

  // Filter state management (initialized from URL)
  const {
    filters,
    setFilter,
    clearFilters,
    clearPreset,
    hasActiveFilters,
    isUsingPreset,
  } = useSeriesFilters(initialFilters);

  // Sync filter changes to URL
  useEffect(() => {
    syncToUrl(filters);
  }, [filters, syncToUrl]);

  // Data fetching with React Query
  const { items: rawItems, total, isLoading, isFetching, refetch } = useSeriesData(filters);

  // Apply preset filters (advanced filters)
  const { isAdvancedFilterActive, applyPresetFilter } = useSeriesPresets();

  // Advanced filter modal state
  const { isFilterPanelOpen, closeFilterPanel } = useAdvancedSeriesFilter();

  // Get filtered items
  const items = isAdvancedFilterActive && rawItems
    ? applyPresetFilter(rawItems)
    : rawItems ?? [];

  // Selection management
  const {
    selectedIds,
    handleSelect,
    clearSelection,
  } = useSeriesSelection({ items });

  // Toast notifications
  const { addToast } = useToast();

  // Merge modal state
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSeriesData, setMergeSeriesData] = useState<SeriesForMerge[]>([]);

  // Handler for merge action from context menu
  const handleMerge = useCallback((seriesIds: string[]) => {
    // Find the series data for the given IDs from grid items
    const seriesToMerge: SeriesForMerge[] = [];
    for (const id of seriesIds) {
      const item = items.find((i) => i.id === id && i.itemType === 'series');
      if (item && item.itemType === 'series') {
        seriesToMerge.push(seriesToMergeFormat(item.series));
      }
    }

    if (seriesToMerge.length >= 2) {
      setMergeSeriesData(seriesToMerge);
      setShowMergeModal(true);
    } else {
      addToast('warning', 'Select at least 2 series to merge');
    }
  }, [items, addToast]);

  // Handler for merge completion
  const handleMergeComplete = useCallback(() => {
    setShowMergeModal(false);
    setMergeSeriesData([]);
    clearSelection();
    refetch();
    addToast('success', 'Series merged successfully');
  }, [clearSelection, refetch, addToast]);

  // Context menu
  const {
    menuState,
    handleContextMenu,
    closeMenu,
    handleAction,
    getMenuItems,
  } = useSeriesContextMenu({
    items,
    onSuccess: refetch,
    onClearSelection: clearSelection,
    onMerge: handleMerge,
  });

  // Bulk actions
  const bulkActions = useBulkActions({ onSuccess: refetch });

  // Get selected series IDs as array for bulk actions (memoized for stable reference)
  const selectedSeriesIds = useMemo(() => Array.from(selectedIds), [selectedIds]);

  // Navigation sidebar state
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [scrollToIndex, setScrollToIndex] = useState<((index: number) => void) | null>(null);

  // Bulk link modal state
  const [showBulkLinkModal, setShowBulkLinkModal] = useState(false);

  // Handler for scrollToIndex ready callback
  const handleScrollToIndexReady = useCallback((fn: (index: number) => void) => {
    setScrollToIndex(() => fn);
  }, []);

  // Get item value for navigation sidebar based on sort field
  const getItemValue = useCallback((item: GridItem): string | number | null | undefined => {
    switch (filters.sortBy) {
      case 'name':
        return item.name;
      case 'startYear':
        return item.startYear;
      case 'issueCount':
        return item.issueCount;
      case 'updatedAt':
        return item.updatedAt;
      default:
        return item.name;
    }
  }, [filters.sortBy]);

  // Handle navigation from sidebar
  const handleNavigate = useCallback((index: number) => {
    scrollToIndex?.(index);
  }, [scrollToIndex]);

  // Handle batch edit completion
  const handleBatchEditComplete = useCallback((updatedCount: number) => {
    addToast('success', `Updated ${updatedCount} series`);
    clearSelection();
    refetch();
  }, [addToast, clearSelection, refetch]);

  // Wrap context menu handler for grid
  const onContextMenu = useCallback(
    (id: string, event: React.MouseEvent) => {
      handleContextMenu(event, id, selectedIds, () => {
        // Ensure item is selected if not already
        if (!selectedIds.has(id)) {
          handleSelect(id, { ctrlKey: false, metaKey: false, shiftKey: false } as React.MouseEvent);
        }
      });
    },
    [handleContextMenu, selectedIds, handleSelect]
  );

  // Wrap action handler for UnifiedMenu
  const onMenuAction = useCallback(
    (actionId: string) => {
      handleAction(actionId);
    },
    [handleAction]
  );

  return (
    <div className="series-page">
      {/* Toolbar with filters */}
      <SeriesToolbar
        filters={filters}
        onFilterChange={setFilter}
        onClearFilters={clearFilters}
        onClearPreset={clearPreset}
        hasActiveFilters={hasActiveFilters}
        isUsingPreset={isUsingPreset}
        totalCount={total}
        isLoading={isLoading}
      />

      {/* Virtualized grid */}
      <SeriesVirtualGrid
        items={items}
        cardSize={filters.cardSize}
        isFetching={isFetching}
        isLoading={isLoading}
        selectedIds={selectedIds}
        onSelect={handleSelect}
        onContextMenu={onContextMenu}
        onVisibleRangeChange={setVisibleRange}
        onScrollToIndexReady={handleScrollToIndexReady}
      />

      {/* Navigation Sidebar */}
      <NavigationSidebar
        items={items}
        sortField={filters.sortBy}
        sortOrder={filters.sortOrder}
        onNavigate={handleNavigate}
        visibleRange={visibleRange}
        getItemValue={getItemValue}
      />

      {/* Context menu */}
      {menuState.isOpen && menuState.context && (
        <UnifiedMenu
          state={menuState}
          items={getMenuItems()}
          onAction={onMenuAction}
          onClose={closeMenu}
        />
      )}

      {/* Advanced Filter Modal */}
      <AdvancedSeriesFilterModal
        isOpen={isFilterPanelOpen}
        onClose={closeFilterPanel}
      />

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedCount={selectedIds.size}
        isLoading={bulkActions.isLoading}
        onClearSelection={clearSelection}
        onAddToCollection={bulkActions.openCollectionPicker}
        onAddToFavorites={() => bulkActions.addToFavorites(selectedSeriesIds)}
        onRemoveFromFavorites={() => bulkActions.removeFromFavorites(selectedSeriesIds)}
        onAddToWantToRead={() => bulkActions.addToWantToRead(selectedSeriesIds)}
        onRemoveFromWantToRead={() => bulkActions.removeFromWantToRead(selectedSeriesIds)}
        onMarkAsRead={() => bulkActions.markAsRead(selectedSeriesIds)}
        onMarkAsUnread={() => bulkActions.markAsUnread(selectedSeriesIds)}
        onFetchMetadata={() => bulkActions.fetchMetadata(selectedSeriesIds)}
        onHideSeries={() => bulkActions.hideSeries(selectedSeriesIds)}
        onUnhideSeries={() => bulkActions.unhideSeries(selectedSeriesIds)}
        onBatchEdit={bulkActions.openBatchEdit}
        onLinkSeries={() => setShowBulkLinkModal(true)}
      />

      {/* Collection Picker Modal */}
      <CollectionPickerModal
        isOpen={bulkActions.showCollectionPicker}
        onClose={bulkActions.closeCollectionPicker}
        seriesIds={selectedSeriesIds}
      />

      {/* Batch Edit Modal */}
      <BatchSeriesMetadataModal
        isOpen={bulkActions.showBatchEdit}
        onClose={bulkActions.closeBatchEdit}
        seriesIds={selectedSeriesIds}
        onComplete={handleBatchEditComplete}
      />

      {/* Bulk Link Series Modal */}
      <BulkLinkSeriesModal
        isOpen={showBulkLinkModal}
        onClose={() => setShowBulkLinkModal(false)}
        sourceSeriesIds={selectedSeriesIds}
        onLinked={(result) => {
          if (result.successful > 0) {
            addToast('success', `Successfully linked ${result.successful} series`);
            clearSelection();
            refetch();
          }
          if (result.failed > 0) {
            addToast('error', `Failed to link ${result.failed} series`);
          }
          setShowBulkLinkModal(false);
        }}
      />

      {/* Merge Series Modal */}
      <MergeSeriesModal
        isOpen={showMergeModal}
        onClose={() => {
          setShowMergeModal(false);
          setMergeSeriesData([]);
        }}
        onMergeComplete={handleMergeComplete}
        initialSeries={mergeSeriesData}
      />
    </div>
  );
}

// =============================================================================
// Main Component (wraps with providers)
// =============================================================================

export function SeriesPage() {
  return (
    <AdvancedSeriesFilterProvider>
      <SeriesPageContent />
    </AdvancedSeriesFilterProvider>
  );
}
