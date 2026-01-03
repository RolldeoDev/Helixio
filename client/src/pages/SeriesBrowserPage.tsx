/**
 * SeriesBrowserPage Component
 *
 * New series browser page built for performance.
 * Created for A/B testing, intended to eventually replace SeriesPage.
 *
 * Design Principles:
 * - Load ALL data at once, render only visible items via virtualization
 * - Single global IntersectionObserver for batched image loading
 * - RAF-throttled scrolling with minimal state updates
 * - GPU-accelerated positioning using transform: translate3d()
 * - CSS-only skeletons disabled during scroll (.scrolling class)
 * - Navigation sidebar for quick jumping (no pagination)
 */

import { useState, useEffect, useCallback, useMemo, useRef, useReducer } from 'react';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useNavigate } from 'react-router-dom';
import { useBreadcrumbs } from '../contexts/BreadcrumbContext';
import { useApp } from '../contexts/AppContext';
import {
  AdvancedSeriesFilterProvider,
  useAdvancedSeriesFilter,
  FilterableSeries,
} from '../contexts/AdvancedSeriesFilterContext';
import { useVirtualGrid } from '../hooks/useVirtualGrid';
import { CoverSizeSlider } from '../components/CoverSizeSlider';
import { Spinner } from '../components/LoadingState';
import { SeriesBrowserCard } from '../components/SeriesBrowserCard';
import {
  AdvancedSeriesFilterPanel,
  AdvancedSeriesFilterModal,
} from '../components/AdvancedSeriesFilter';
import { NavigationSidebar } from '../components/NavigationSidebar';
import { BulkSeriesActionBar } from '../components/BulkSeriesActionBar';
import { CollectionPickerModal } from '../components/CollectionPickerModal';
import { BatchSeriesMetadataModal } from '../components/BatchSeriesMetadataModal';
import { BulkLinkSeriesModal } from '../components/BulkLinkSeriesModal';
import { useToast } from '../contexts/ToastContext';
import { useMetadataJob } from '../contexts/MetadataJobContext';
import {
  getSeriesPublishers,
  getSeriesIssues,
  getUnifiedGridItems,
  Series,
  SeriesListOptions,
  GridItem,
  PromotedCollectionGridItem,
  bulkToggleFavorite,
  bulkToggleWantToRead,
  bulkMarkSeriesRead,
  bulkMarkSeriesUnread,
  bulkSetSeriesHidden,
} from '../services/api.service';
import { CollectionCoverCard, PromotedCollectionData } from '../components/CollectionCoverCard';
import {
  UnifiedMenu,
  useUnifiedMenu,
  MENU_PRESETS,
  buildMenuItems,
} from '../components/UnifiedMenu';
import type { MenuEntityData } from '../components/UnifiedMenu';
import './SeriesBrowserPage.css';

// localStorage key for cover size preference
const COVER_SIZE_KEY = 'helixio-series-browser-cover-size';

// =============================================================================
// Filter State Types and Reducer
// =============================================================================

type FilterState = {
  searchInput: string;      // Immediate input value (for responsive UI)
  publisher: string;
  type: 'western' | 'manga' | '';
  hasUnread: boolean | undefined;
  showHidden: boolean;
  sortBy: SeriesListOptions['sortBy'];
  sortOrder: 'asc' | 'desc';
};

type FilterAction =
  | { type: 'SET_SEARCH_INPUT'; value: string }
  | { type: 'SET_PUBLISHER'; value: string }
  | { type: 'SET_TYPE'; value: 'western' | 'manga' | '' }
  | { type: 'SET_HAS_UNREAD'; value: boolean | undefined }
  | { type: 'SET_SHOW_HIDDEN'; value: boolean }
  | { type: 'SET_SORT'; sortBy: SeriesListOptions['sortBy']; sortOrder: 'asc' | 'desc' }
  | { type: 'CLEAR_ALL' };

const initialFilterState: FilterState = {
  searchInput: '',
  publisher: '',
  type: '',
  hasUnread: undefined,
  showHidden: false,
  sortBy: 'name',
  sortOrder: 'asc',
};

function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case 'SET_SEARCH_INPUT':
      return { ...state, searchInput: action.value };
    case 'SET_PUBLISHER':
      return { ...state, publisher: action.value };
    case 'SET_TYPE':
      return { ...state, type: action.value };
    case 'SET_HAS_UNREAD':
      return { ...state, hasUnread: action.value };
    case 'SET_SHOW_HIDDEN':
      return { ...state, showHidden: action.value };
    case 'SET_SORT':
      return { ...state, sortBy: action.sortBy, sortOrder: action.sortOrder };
    case 'CLEAR_ALL':
      return initialFilterState;
    default:
      return state;
  }
}

// =============================================================================
// Main Component (with Provider wrapper)
// =============================================================================

export function SeriesBrowserPage() {
  return (
    <AdvancedSeriesFilterProvider>
      <SeriesBrowserPageContent />
    </AdvancedSeriesFilterProvider>
  );
}

// =============================================================================
// Page Content Component
// =============================================================================

function SeriesBrowserPageContent() {
  const navigate = useNavigate();
  const { setBreadcrumbs } = useBreadcrumbs();
  const {
    libraries,
    selectedLibrary,
    isAllLibraries,
    selectLibrary,
    selectedSeries,
    selectSeries,
    selectSeriesRange,
    clearSeriesSelection,
  } = useApp();

  // Advanced filter context
  const {
    applyFilterToSeries,
    isFilterActive: isAdvancedFilterActive,
    isFilterPanelOpen,
    closeFilterPanel,
  } = useAdvancedSeriesFilter();

  // Toast notifications
  const { addToast } = useToast();

  // Metadata job context
  const { startJob } = useMetadataJob();

  // Data state - raw items from API (unified grid with series + promoted collections)
  const [rawItems, setRawItems] = useState<GridItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  // Filter state - consolidated into reducer for better performance
  const [filters, dispatch] = useReducer(filterReducer, initialFilterState);

  // Debounced search - waits 300ms after user stops typing before triggering API
  const debouncedSearch = useDebouncedValue(filters.searchInput, 300);

  // Filter key - changes on data load to force card remount
  // This fixes IntersectionObserver race condition that causes stuck skeletons
  const filterKeyRef = useRef(0);
  const prevLoadingRef = useRef(loading);
  // Increment when loading transitions from true to false (data just loaded)
  if (prevLoadingRef.current && !loading) {
    filterKeyRef.current += 1;
  }
  prevLoadingRef.current = loading;
  const filterKey = filterKeyRef.current;

  // Cache last known count values to prevent layout shift during loading
  const lastCountRef = useRef({ items: 0, total: 0 });

  // Destructure for convenience
  const { searchInput, publisher, type, hasUnread, showHidden, sortBy, sortOrder } = filters;

  // Derive libraryId from AppContext for API calls
  const libraryId = isAllLibraries ? '' : (selectedLibrary?.id || '');

  // Available filter values
  const [publishers, setPublishers] = useState<string[]>([]);

  // Cover size state with localStorage persistence
  const [coverSize, setCoverSize] = useState(() => {
    const saved = localStorage.getItem(COVER_SIZE_KEY);
    return saved ? parseInt(saved, 10) : 5; // Default to medium (5)
  });

  // Handle cover size change with persistence
  const handleCoverSizeChange = useCallback((size: number) => {
    setCoverSize(size);
    localStorage.setItem(COVER_SIZE_KEY, String(size));
  }, []);

  // Selection refs for shift+click range selection
  const allSeriesIdsRef = useRef<string[]>([]);
  const lastSelectedRef = useRef<string | null>(null);

  // Bulk operations state
  const [isBulkLoading, setIsBulkLoading] = useState(false);
  const [showCollectionPicker, setShowCollectionPicker] = useState(false);
  const [showBatchEditModal, setShowBatchEditModal] = useState(false);
  const [showBulkLinkModal, setShowBulkLinkModal] = useState(false);

  // Memoize the selectedSeries array to prevent infinite re-renders in child components
  const selectedSeriesIds = useMemo(() => Array.from(selectedSeries), [selectedSeries]);

  // Get series entity data for conditional menu items (hide/unhide visibility)
  const getSeriesEntityData = useCallback((seriesId: string): MenuEntityData | undefined => {
    const item = rawItems.find((i) => i.id === seriesId && i.itemType === 'series');
    if (item && item.itemType === 'series') {
      return { isHidden: item.series.isHidden };
    }
    return undefined;
  }, [rawItems]);

  // Series context menu state
  const {
    menuState: seriesMenuState,
    handleContextMenu: handleSeriesContextMenu,
    closeMenu: closeSeriesMenu,
  } = useUnifiedMenu({
    entityType: 'series',
    getEntityData: getSeriesEntityData,
  });

  // Collection context menu state
  const {
    menuState: collectionMenuState,
    handleContextMenu: handleCollectionContextMenu,
    closeMenu: closeCollectionMenu,
  } = useUnifiedMenu({
    entityType: 'collection',
  });

  // Set breadcrumbs on mount
  useEffect(() => {
    setBreadcrumbs([{ label: 'Series', path: '/series' }]);
  }, [setBreadcrumbs]);

  // Fetch filter options (publishers)
  useEffect(() => {
    const fetchPublishers = async () => {
      try {
        const result = await getSeriesPublishers();
        setPublishers(result.publishers);
      } catch (err) {
        console.error('Failed to load publishers:', err);
      }
    };
    fetchPublishers();
  }, []);

  // Build API options - memoized to prevent unnecessary refetches
  // Uses debouncedSearch to avoid API calls on every keystroke
  const options = useMemo(() => ({
    sortBy,
    sortOrder,
    all: true, // Load ALL data at once for client-side filtering
    includePromotedCollections: true, // Include promoted collections in grid
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(publisher && { publisher }),
    ...(type && { type }),
    ...(hasUnread !== undefined && { hasUnread }),
    ...(libraryId && { libraryId }),
    ...(showHidden && { includeHidden: true }),
  }), [sortBy, sortOrder, debouncedSearch, publisher, type, hasUnread, libraryId, showHidden]);

  // Fetch series and promoted collections data
  const fetchSeries = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getUnifiedGridItems(options);
      setRawItems(result.items);
      setTotal(result.pagination.total);
    } catch (err) {
      console.error('Failed to load series:', err);
      setError(err instanceof Error ? err.message : 'Failed to load series');
    } finally {
      setLoading(false);
    }
  }, [options]);

  // Fetch on mount and when options change
  useEffect(() => {
    fetchSeries();
  }, [fetchSeries]);

  // Apply advanced filter to raw items (client-side filtering)
  // Note: Advanced filter only applies to series, collections pass through
  const items = useMemo(() => {
    if (!isAdvancedFilterActive) return rawItems;

    // Separate series and collections
    const seriesItems = rawItems.filter((item): item is GridItem & { itemType: 'series' } =>
      item.itemType === 'series'
    );
    const collectionItems = rawItems.filter((item): item is GridItem & { itemType: 'collection' } =>
      item.itemType === 'collection'
    );

    // Apply advanced filter only to series
    const filteredSeries = applyFilterToSeries(
      seriesItems.map(item => item.series) as unknown as FilterableSeries[]
    ) as unknown as Series[];

    // Convert back to GridItem format and combine with collections
    const filteredSeriesItems: GridItem[] = filteredSeries.map(series => {
      const original = seriesItems.find(item => item.series.id === series.id);
      return original || {
        itemType: 'series' as const,
        id: series.id,
        name: series.name,
        startYear: series.startYear ?? null,
        publisher: series.publisher ?? null,
        genres: null,
        issueCount: series.issueCount ?? 0,
        readCount: 0,
        updatedAt: series.updatedAt ?? '',
        createdAt: series.createdAt ?? '',
        series,
      };
    });

    // Collections appear first (promoted), then filtered series
    return [...collectionItems, ...filteredSeriesItems];
  }, [rawItems, isAdvancedFilterActive, applyFilterToSeries]);

  // Update cached count values when data loads (for stable badge during loading)
  useEffect(() => {
    if (!loading && items.length > 0) {
      lastCountRef.current = { items: items.length, total };
    }
  }, [loading, items.length, total]);

  // Calculate dynamic overscan based on estimated column count
  // More columns = more items per row = fewer overscan rows needed
  const dynamicOverscan = useMemo(() => {
    // Configuration for dynamic overscan calculation
    const TARGET_BUFFER_ITEMS = 20; // Items to buffer off-screen for smooth scrolling
    const MIN_COLUMNS = 2; // Minimum column estimate
    const COLUMN_MULTIPLIER = 1.33; // Derived from slider-to-column ratio in useVirtualGrid

    // Estimate columns from coverSize (slider 1-10 maps to ~2-14 columns)
    const estimatedCols = Math.max(
      MIN_COLUMNS,
      Math.round(MIN_COLUMNS + (coverSize - 1) * COLUMN_MULTIPLIER)
    );
    // Calculate rows needed to maintain target buffer items
    return Math.max(1, Math.ceil(TARGET_BUFFER_ITEMS / estimatedCols));
  }, [coverSize]);

  // Use virtual grid hook for performant rendering
  const {
    virtualItems,
    totalHeight,
    containerRef,
    isScrolling,
    columns,
    visibleRange,
    scrollTo,
  } = useVirtualGrid(items, {
    sliderValue: coverSize,
    gap: 16,
    overscan: dynamicOverscan,
    aspectRatio: 1.5,
    infoHeight: 60,
    minCoverWidth: 80,
    maxCoverWidth: 350,
    // Total horizontal padding: paddingLeft (24) + paddingRight for sidebar (48) = 72
    horizontalPadding: 72,
    paddingLeft: 24, // Match var(--spacing-lg) - left spacing for grid content
    paddingTop: 12, // Match var(--spacing-md)
  });

  // Compact mode for smaller card sizes (slider >= 7)
  // Hides ProgressRing and simplifies badge styling for better performance
  const compactMode = coverSize >= 7;

  // Retry handler for error state
  const handleRetry = useCallback(() => {
    fetchSeries();
  }, [fetchSeries]);

  // Handle series click - navigate to series detail page
  const handleSeriesClick = useCallback((seriesId: string) => {
    navigate(`/series/${seriesId}`);
  }, [navigate]);

  // Handle collection click - navigate to collection page
  const handleCollectionClick = useCallback((collectionId: string) => {
    navigate(`/collection/${collectionId}`);
  }, [navigate]);

  // Filter handlers - use dispatch for consolidated state updates
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'SET_SEARCH_INPUT', value: e.target.value });
  }, []);

  const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      dispatch({ type: 'SET_SEARCH_INPUT', value: '' });
    }
  }, []);

  const clearFilters = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' });
    selectLibrary('all');
    clearSeriesSelection();
  }, [selectLibrary, clearSeriesSelection]);

  const hasActiveFilters = searchInput || publisher || type || hasUnread !== undefined || libraryId || showHidden || isAdvancedFilterActive;

  // Keep allSeriesIdsRef in sync with current items for range selection
  // Only include series (not collections) for selection
  useEffect(() => {
    allSeriesIdsRef.current = items
      .filter((item) => item.itemType === 'series')
      .map((item) => item.id);
  }, [items]);

  // Handle selection change (from card checkbox or modifier click)
  const handleSelectionChange = useCallback(
    (seriesId: string, selected: boolean, shiftKey: boolean) => {
      if (shiftKey && allSeriesIdsRef.current.length > 0 && lastSelectedRef.current) {
        // Range selection: select all between last selected and current
        selectSeriesRange(allSeriesIdsRef.current, lastSelectedRef.current, seriesId);
      } else {
        selectSeries(seriesId, selected);
      }
      // Update last selected ref for next shift+click
      lastSelectedRef.current = seriesId;
    },
    [selectSeries, selectSeriesRange]
  );

  // Get item value for NavigationSidebar based on current sort field
  // Works with both series and collections
  const getItemValue = useCallback((item: GridItem): string | number | null => {
    switch (sortBy) {
      case 'name':
        return item.name || '';
      case 'startYear':
        return item.startYear ?? null;
      case 'updatedAt':
        return item.updatedAt ? new Date(item.updatedAt).getFullYear() : null;
      case 'issueCount':
        return item.issueCount ?? 0;
      default:
        return item.name || '';
    }
  }, [sortBy]);

  // Helper function to convert PromotedCollectionGridItem to PromotedCollectionData
  const convertToCollectionData = useCallback((item: PromotedCollectionGridItem): PromotedCollectionData => ({
    id: item.id,
    name: item.name,
    description: item.description,
    isPromoted: item.isPromoted,
    coverType: item.coverType as 'auto' | 'series' | 'issue' | 'custom',
    coverSeriesId: item.coverSeriesId,
    coverFileId: item.coverFileId,
    coverHash: item.coverHash,
    derivedPublisher: item.publisher,
    derivedStartYear: item.startYear,
    derivedEndYear: item.endYear,
    derivedGenres: item.genres,
    derivedIssueCount: item.totalIssues,
    derivedReadCount: item.readIssues,
    overridePublisher: null,
    overrideStartYear: null,
    overrideEndYear: null,
    overrideGenres: null,
    totalIssues: item.totalIssues,
    readIssues: item.readIssues,
    seriesCount: item.seriesCount,
    seriesCovers: item.seriesCovers.map((sc) => ({
      id: sc.id,
      name: sc.name,
      coverHash: sc.coverHash,
      coverFileId: sc.coverFileId,
      firstIssueId: sc.firstIssueId ?? null,
      firstIssueCoverHash: sc.firstIssueCoverHash ?? null,
    })),
  }), []);

  // =============================================================================
  // Bulk Action Handlers
  // =============================================================================

  const handleToggleFavorite = useCallback(async (action: 'add' | 'remove') => {
    const count = selectedSeries.size;
    setIsBulkLoading(true);
    try {
      await bulkToggleFavorite(Array.from(selectedSeries), action);
      clearSeriesSelection();
      addToast('success', action === 'add'
        ? `Added ${count} series to Favorites`
        : `Removed ${count} series from Favorites`
      );
      fetchSeries(); // Refresh data
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
      addToast('error', 'Failed to update favorites');
    } finally {
      setIsBulkLoading(false);
    }
  }, [selectedSeries, clearSeriesSelection, addToast, fetchSeries]);

  const handleToggleWantToRead = useCallback(async (action: 'add' | 'remove') => {
    const count = selectedSeries.size;
    setIsBulkLoading(true);
    try {
      await bulkToggleWantToRead(Array.from(selectedSeries), action);
      clearSeriesSelection();
      addToast('success', action === 'add'
        ? `Added ${count} series to Want to Read`
        : `Removed ${count} series from Want to Read`
      );
      fetchSeries(); // Refresh data
    } catch (err) {
      console.error('Failed to toggle want to read:', err);
      addToast('error', 'Failed to update want to read');
    } finally {
      setIsBulkLoading(false);
    }
  }, [selectedSeries, clearSeriesSelection, addToast, fetchSeries]);

  const handleMarkRead = useCallback(async () => {
    const count = selectedSeries.size;
    setIsBulkLoading(true);
    try {
      await bulkMarkSeriesRead(Array.from(selectedSeries));
      clearSeriesSelection();
      addToast('success', `Marked all issues in ${count} series as read`);
      fetchSeries(); // Refresh data
    } catch (err) {
      console.error('Failed to mark as read:', err);
      addToast('error', 'Failed to mark as read');
    } finally {
      setIsBulkLoading(false);
    }
  }, [selectedSeries, clearSeriesSelection, addToast, fetchSeries]);

  const handleMarkUnread = useCallback(async () => {
    const count = selectedSeries.size;
    setIsBulkLoading(true);
    try {
      await bulkMarkSeriesUnread(Array.from(selectedSeries));
      clearSeriesSelection();
      addToast('success', `Marked all issues in ${count} series as unread`);
      fetchSeries(); // Refresh data
    } catch (err) {
      console.error('Failed to mark as unread:', err);
      addToast('error', 'Failed to mark as unread');
    } finally {
      setIsBulkLoading(false);
    }
  }, [selectedSeries, clearSeriesSelection, addToast, fetchSeries]);

  const handleFetchMetadata = useCallback(async () => {
    const count = selectedSeries.size;
    setIsBulkLoading(true);
    try {
      // Get all issues from all selected series
      const allFileIds: string[] = [];
      for (const seriesId of selectedSeries) {
        const result = await getSeriesIssues(seriesId, { limit: 1000 });
        allFileIds.push(...result.issues.map((issue) => issue.id));
      }
      if (allFileIds.length > 0) {
        startJob(allFileIds);
        addToast('info', `Started metadata fetch for ${allFileIds.length} issues from ${count} series`);
      }
      clearSeriesSelection();
    } catch (err) {
      console.error('Failed to fetch metadata:', err);
      addToast('error', 'Failed to start metadata fetch');
    } finally {
      setIsBulkLoading(false);
    }
  }, [selectedSeries, startJob, clearSeriesSelection, addToast]);

  const handleSetHidden = useCallback(async (hidden: boolean) => {
    const count = selectedSeries.size;
    setIsBulkLoading(true);
    try {
      await bulkSetSeriesHidden(Array.from(selectedSeries), hidden);
      clearSeriesSelection();
      addToast('success', hidden
        ? `Hidden ${count} series`
        : `Unhidden ${count} series`
      );
      fetchSeries(); // Refresh data
    } catch (err) {
      console.error('Failed to set hidden:', err);
      addToast('error', 'Failed to update visibility');
    } finally {
      setIsBulkLoading(false);
    }
  }, [selectedSeries, clearSeriesSelection, addToast, fetchSeries]);

  // =============================================================================
  // Context Menu Action Handlers
  // =============================================================================

  // Handle series context menu actions
  const handleSeriesMenuAction = useCallback(async (action: string) => {
    const context = seriesMenuState.context;
    if (!context) return;

    const seriesId = context.entityId;
    const selectedIds = context.selectedIds;

    closeSeriesMenu();

    switch (action) {
      case 'viewSeries':
        navigate(`/series/${seriesId}`);
        break;

      case 'fetchSeriesMetadata': {
        setIsBulkLoading(true);
        try {
          const allFileIds: string[] = [];
          for (const id of selectedIds) {
            const result = await getSeriesIssues(id, { limit: 1000 });
            allFileIds.push(...result.issues.map((issue) => issue.id));
          }
          if (allFileIds.length > 0) {
            startJob(allFileIds);
            addToast('info', `Started metadata fetch for ${allFileIds.length} issues`);
          }
        } catch (err) {
          console.error('Failed to fetch metadata:', err);
          addToast('error', 'Failed to start metadata fetch');
        } finally {
          setIsBulkLoading(false);
        }
        break;
      }

      case 'markAllRead':
        setIsBulkLoading(true);
        try {
          await bulkMarkSeriesRead(selectedIds);
          addToast('success', `Marked all issues as read`);
          fetchSeries();
        } catch (err) {
          console.error('Failed to mark as read:', err);
          addToast('error', 'Failed to mark as read');
        } finally {
          setIsBulkLoading(false);
        }
        break;

      case 'markAllUnread':
        setIsBulkLoading(true);
        try {
          await bulkMarkSeriesUnread(selectedIds);
          addToast('success', `Marked all issues as unread`);
          fetchSeries();
        } catch (err) {
          console.error('Failed to mark as unread:', err);
          addToast('error', 'Failed to mark as unread');
        } finally {
          setIsBulkLoading(false);
        }
        break;

      case 'hideSeries':
        setIsBulkLoading(true);
        try {
          await bulkSetSeriesHidden(selectedIds, true);
          addToast('success', `Hidden ${selectedIds.length} series`);
          fetchSeries();
        } catch (err) {
          console.error('Failed to hide series:', err);
          addToast('error', 'Failed to hide series');
        } finally {
          setIsBulkLoading(false);
        }
        break;

      case 'unhideSeries':
        setIsBulkLoading(true);
        try {
          await bulkSetSeriesHidden(selectedIds, false);
          addToast('success', `Unhidden ${selectedIds.length} series`);
          fetchSeries();
        } catch (err) {
          console.error('Failed to unhide series:', err);
          addToast('error', 'Failed to unhide series');
        } finally {
          setIsBulkLoading(false);
        }
        break;

      case 'mergeWith':
        // TODO: Implement merge modal
        addToast('info', 'Merge functionality coming soon');
        break;

      case 'linkSeries':
        // TODO: Implement link series modal
        addToast('info', 'Link series functionality coming soon');
        break;

      default:
        console.warn('Unknown menu action:', action);
    }
  }, [seriesMenuState.context, closeSeriesMenu, navigate, startJob, addToast, fetchSeries]);

  // Handle collection context menu actions
  const handleCollectionMenuAction = useCallback((action: string) => {
    const context = collectionMenuState.context;
    if (!context) return;

    const collectionId = context.entityId;
    closeCollectionMenu();

    switch (action) {
      case 'viewCollection':
        navigate(`/collection/${collectionId}`);
        break;

      case 'editCollection':
        navigate(`/collections/${collectionId}/edit`);
        break;

      default:
        console.warn('Unknown collection menu action:', action);
    }
  }, [collectionMenuState.context, closeCollectionMenu, navigate]);

  // Wrapper to handle right-click on series card
  const handleSeriesCardContextMenu = useCallback(
    (e: React.MouseEvent, seriesId: string) => {
      // Ensure the series is selected before showing menu
      const ensureSelected = () => {
        if (!selectedSeries.has(seriesId)) {
          selectSeries(seriesId, true);
        }
      };
      handleSeriesContextMenu(e, seriesId, selectedSeries, ensureSelected);
    },
    [handleSeriesContextMenu, selectedSeries, selectSeries]
  );

  // Wrapper to handle right-click on collection card
  const handleCollectionCardContextMenu = useCallback(
    (e: React.MouseEvent, collectionId: string) => {
      handleCollectionContextMenu(e, collectionId, []);
    },
    [handleCollectionContextMenu]
  );

  return (
    <div className="series-browser-page">
      {/* Header */}
      <div className="series-browser-header">
        <div className="series-browser-header-left">
          <h1>Series Browser</h1>
          {/* Always render count badge to prevent layout shift */}
          <div className="series-browser-count">
            {loading ? (
              <span className="series-browser-count--loading">
                {lastCountRef.current.items || '–'} series
              </span>
            ) : error ? (
              <span className="series-browser-count--error">–</span>
            ) : (
              <>{items.length}{hasActiveFilters ? ` of ${total}` : ''} series</>
            )}
          </div>
        </div>

        {/* Filters and Toolbar - Two Groups */}
        <div className="series-browser-filters">
          {/* Group 1: Content Filters */}
          <div className="series-browser-filter-group series-browser-filter-group--content">
            {/* Advanced Filters Toggle (integrated) */}
            <AdvancedSeriesFilterPanel />

            {/* Search */}
            <div className="series-browser-search">
              <svg className="series-browser-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Search series..."
                value={searchInput}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                className="series-browser-search-input"
              />
              {/* Always render clear button, hide with CSS to prevent layout shift */}
              <button
                className={`series-browser-search-clear ${searchInput ? '' : 'series-browser-search-clear--hidden'}`}
                onClick={() => dispatch({ type: 'SET_SEARCH_INPUT', value: '' })}
              >
                &times;
              </button>
            </div>

            {/* Library + Hidden toggle */}
            <div className="series-browser-library-group">
              <div className="series-browser-select-wrapper series-browser-select-wrapper--icon">
                <svg className="series-browser-select-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
                </svg>
                <select
                  className="series-browser-select series-browser-select--with-icon"
                  value={libraryId}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      selectLibrary('all');
                    } else {
                      const lib = libraries.find(l => l.id === value);
                      if (lib) selectLibrary(lib);
                    }
                  }}
                  title="Library"
                >
                  <option value="">All Libraries</option>
                  {libraries.map((lib) => (
                    <option key={lib.id} value={lib.id}>
                      {lib.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className={`series-browser-hidden-btn ${showHidden ? 'series-browser-hidden-btn--active' : ''}`}
                onClick={() => dispatch({ type: 'SET_SHOW_HIDDEN', value: !showHidden })}
                title={showHidden ? 'Hide hidden series' : 'Show hidden series'}
                aria-label={showHidden ? 'Hide hidden series' : 'Show hidden series'}
                type="button"
              >
                {showHidden ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                )}
              </button>
            </div>

            {/* Publisher */}
            <div className="series-browser-select-wrapper series-browser-select-wrapper--icon">
              <svg className="series-browser-select-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 21h18" />
                <path d="M9 8h1" />
                <path d="M9 12h1" />
                <path d="M9 16h1" />
                <path d="M14 8h1" />
                <path d="M14 12h1" />
                <path d="M14 16h1" />
                <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
              </svg>
              <select
                className="series-browser-select series-browser-select--with-icon"
                value={publisher}
                onChange={(e) => dispatch({ type: 'SET_PUBLISHER', value: e.target.value })}
                title="Publisher"
              >
                <option value="">All Publishers</option>
                {publishers.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* Type */}
            <select
              className="series-browser-select"
              value={type}
              onChange={(e) => dispatch({ type: 'SET_TYPE', value: e.target.value as 'western' | 'manga' | '' })}
              title="Type"
            >
              <option value="">All Types</option>
              <option value="western">Western</option>
              <option value="manga">Manga</option>
            </select>

            {/* Reading Status */}
            <select
              className="series-browser-select"
              value={hasUnread === undefined ? '' : hasUnread ? 'unread' : 'complete'}
              onChange={(e) => {
                const value = e.target.value === '' ? undefined : e.target.value === 'unread';
                dispatch({ type: 'SET_HAS_UNREAD', value });
              }}
              title="Reading Status"
            >
              <option value="">All Status</option>
              <option value="unread">Has Unread</option>
              <option value="complete">Complete</option>
            </select>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button
                className="series-browser-clear-btn"
                onClick={clearFilters}
                title="Clear all filters"
                aria-label="Clear all filters"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          {/* Separator */}
          <div className="series-browser-filter-separator" />

          {/* Group 2: Display Controls */}
          <div className="series-browser-filter-group series-browser-filter-group--display">
            {/* Sort */}
            <select
              className="series-browser-select"
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [newSortBy, newSortOrder] = e.target.value.split('-') as [SeriesListOptions['sortBy'], 'asc' | 'desc'];
                dispatch({ type: 'SET_SORT', sortBy: newSortBy, sortOrder: newSortOrder });
              }}
              title="Sort by"
            >
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
              <option value="startYear-desc">Year (Newest)</option>
              <option value="startYear-asc">Year (Oldest)</option>
              <option value="updatedAt-desc">Recently Updated</option>
              <option value="issueCount-desc">Most Issues</option>
              <option value="issueCount-asc">Fewest Issues</option>
            </select>

            {/* Cover Size Slider */}
            <CoverSizeSlider
              value={coverSize}
              onChange={handleCoverSizeChange}
              label=""
            />
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="series-browser-loading">
          <Spinner message="Loading series..." />
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="series-browser-error">
          <div className="series-browser-error-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2>Failed to Load Series</h2>
          <p>{error}</p>
          <button className="series-browser-retry-btn" onClick={handleRetry}>
            Try Again
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && items.length === 0 && (
        <div className="series-browser-empty">
          <div className="series-browser-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <h2>{hasActiveFilters ? 'No Matching Series' : 'No Series Found'}</h2>
          <p>
            {hasActiveFilters
              ? 'No series match your current filters. Try adjusting or clearing filters.'
              : 'No series in your library yet. Scan a library to discover series.'
            }
          </p>
          {hasActiveFilters && (
            <button className="series-browser-retry-btn" onClick={clearFilters}>
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Virtualized Grid with Navigation Sidebar */}
      {!loading && !error && items.length > 0 && (
        <div className="series-browser-content">
          <div
            ref={containerRef}
            className={`series-browser-scroll-container ${isScrolling ? 'scrolling' : ''}`}
          >
            <div
              className="series-browser-grid"
              style={{ height: totalHeight }}
            >
              {virtualItems.map(({ item, index, style }) => (
                <div
                  key={`${item.id}-${filterKey}`}
                  className="series-browser-grid-item"
                  style={style}
                  data-index={index}
                >
                  {item.itemType === 'series' ? (
                    <SeriesBrowserCard
                      series={item.series}
                      eager={index < columns} // Eager load first row
                      onClick={handleSeriesClick}
                      showYear={true}
                      showPublisher={true}
                      selectable={true}
                      isSelected={selectedSeries.has(item.id)}
                      onSelectionChange={handleSelectionChange}
                      contextMenuEnabled={true}
                      onContextMenu={handleSeriesCardContextMenu}
                      compact={compactMode}
                    />
                  ) : (
                    <CollectionCoverCard
                      collection={convertToCollectionData(item.collection)}
                      fluid
                      showYear={true}
                      showPublisher={true}
                      onClick={handleCollectionClick}
                      onContextMenu={handleCollectionCardContextMenu}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Navigation Sidebar for quick jumping */}
          <NavigationSidebar
            items={items}
            sortField={sortBy || 'name'}
            sortOrder={sortOrder}
            onNavigate={scrollTo}
            visibleRange={visibleRange}
            getItemValue={getItemValue}
            className="series-browser-sidebar"
          />
        </div>
      )}

      {/* Debug info - remove in production */}
      {!loading && !error && items.length > 0 && (
        <div className="series-browser-debug">
          Visible: {visibleRange.start}-{visibleRange.end} of {items.length} |
          Rendered: {virtualItems.length} items |
          Columns: {columns} |
          Overscan: {dynamicOverscan} rows |
          Compact: {compactMode ? 'Yes' : 'No'} |
          Scrolling: {isScrolling ? 'Yes' : 'No'}
        </div>
      )}

      {/* Bulk Actions Bar */}
      {selectedSeries.size > 0 && (
        <BulkSeriesActionBar
          selectedCount={selectedSeries.size}
          selectedSeriesIds={selectedSeriesIds}
          onClearSelection={clearSeriesSelection}
          onAddToCollection={() => setShowCollectionPicker(true)}
          onToggleFavorite={handleToggleFavorite}
          onToggleWantToRead={handleToggleWantToRead}
          onMarkRead={handleMarkRead}
          onMarkUnread={handleMarkUnread}
          onFetchMetadata={handleFetchMetadata}
          onBatchEdit={() => setShowBatchEditModal(true)}
          onLinkSeries={() => setShowBulkLinkModal(true)}
          onSetHidden={handleSetHidden}
          isLoading={isBulkLoading}
        />
      )}

      {/* Collection Picker Modal */}
      <CollectionPickerModal
        isOpen={showCollectionPicker}
        onClose={() => setShowCollectionPicker(false)}
        seriesIds={selectedSeriesIds}
      />

      {/* Batch Edit Modal */}
      <BatchSeriesMetadataModal
        isOpen={showBatchEditModal}
        onClose={() => setShowBatchEditModal(false)}
        seriesIds={selectedSeriesIds}
        onComplete={() => {
          clearSeriesSelection();
          fetchSeries();
        }}
      />

      {/* Bulk Link Series Modal */}
      <BulkLinkSeriesModal
        isOpen={showBulkLinkModal}
        onClose={() => setShowBulkLinkModal(false)}
        sourceSeriesIds={selectedSeriesIds}
        onLinked={(result) => {
          if (result.successful > 0) {
            addToast('success', `Successfully linked ${result.successful} series`);
            clearSeriesSelection();
            fetchSeries();
          }
          if (result.failed > 0) {
            addToast('error', `Failed to link ${result.failed} series`);
          }
          setShowBulkLinkModal(false);
        }}
      />

      {/* Series Context Menu */}
      {seriesMenuState.isOpen && seriesMenuState.context && (
        <UnifiedMenu
          state={seriesMenuState}
          items={buildMenuItems(MENU_PRESETS.seriesCard, seriesMenuState.context)}
          onAction={handleSeriesMenuAction}
          onClose={closeSeriesMenu}
          variant="context"
        />
      )}

      {/* Collection Context Menu */}
      {collectionMenuState.isOpen && collectionMenuState.context && (
        <UnifiedMenu
          state={collectionMenuState}
          items={[
            { id: 'viewCollection', label: 'View Collection' },
            { id: 'editCollection', label: 'Edit Collection' },
          ]}
          onAction={handleCollectionMenuAction}
          onClose={closeCollectionMenu}
          variant="context"
        />
      )}

      {/* Advanced Series Filter Modal */}
      <AdvancedSeriesFilterModal
        isOpen={isFilterPanelOpen}
        onClose={closeFilterPanel}
      />
    </div>
  );
}
