/**
 * SeriesBrowserPage Component
 *
 * High-performance series browser with:
 * - Cursor-based infinite scroll pagination
 * - Virtual grid rendering (useVirtualGrid)
 * - Minimal card component for fast rendering
 * - Cover size slider
 * - Filter and sort controls
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useBreadcrumbs } from '../contexts/BreadcrumbContext';
import { useVirtualGrid } from '../hooks/useVirtualGrid';
import {
  useSeriesBrowse,
  flattenSeriesBrowsePages,
  type SeriesBrowseOptions,
} from '../hooks/queries/useSeriesBrowse';
import { MinimalSeriesCard } from '../components/MinimalSeriesCard';
import { LoadingState } from '../components/LoadingState';
import { CoverSizeSlider } from '../components/CoverSizeSlider';
import { SeriesBrowserControls } from '../components/SeriesBrowserControls';
import './SeriesBrowserPage.css';

// =============================================================================
// Types
// =============================================================================

type FilterOptions = Omit<SeriesBrowseOptions, 'cursor' | 'limit'>;

// =============================================================================
// Constants
// =============================================================================

/** Pixels from bottom to trigger next page load */
const INFINITE_SCROLL_THRESHOLD = 500;

/** localStorage key for cover size preference */
const COVER_SIZE_KEY = 'seriesBrowser.coverSize';

/** localStorage key for filter/sort preferences */
const FILTERS_KEY = 'seriesBrowser.filters';

/** Default filter options */
const DEFAULT_FILTERS: FilterOptions = {
  sortBy: 'name',
  sortOrder: 'asc',
};

// =============================================================================
// Component
// =============================================================================

export function SeriesBrowserPage() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Cover size slider (persisted to localStorage)
  const [sliderValue, setSliderValue] = useState(() => {
    const stored = localStorage.getItem(COVER_SIZE_KEY);
    return stored ? parseInt(stored, 10) : 5;
  });

  const handleSliderChange = useCallback((value: number) => {
    setSliderValue(value);
    localStorage.setItem(COVER_SIZE_KEY, value.toString());
  }, []);

  // Filter/sort options (persisted to localStorage)
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(() => {
    try {
      const stored = localStorage.getItem(FILTERS_KEY);
      if (stored) {
        return { ...DEFAULT_FILTERS, ...JSON.parse(stored) };
      }
    } catch {
      // Invalid JSON, use defaults
    }
    return DEFAULT_FILTERS;
  });

  // Persist filter options to localStorage
  useEffect(() => {
    localStorage.setItem(FILTERS_KEY, JSON.stringify(filterOptions));
  }, [filterOptions]);

  const handleFilterChange = useCallback((options: FilterOptions) => {
    setFilterOptions(options);
  }, []);

  // Set breadcrumbs
  useEffect(() => {
    setBreadcrumbs([{ label: 'Series', path: '/series-v2' }]);
  }, [setBreadcrumbs]);

  // Memoize query options to prevent unnecessary object recreation
  const queryOptions = useMemo(
    () => ({ ...filterOptions, limit: 100 }),
    [filterOptions]
  );

  // Fetch series with infinite query (include filter options)
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useSeriesBrowse(queryOptions);

  // Flatten pages into single array
  const allSeries = useMemo(
    () => flattenSeriesBrowsePages(data?.pages),
    [data?.pages]
  );

  // Virtual grid configuration
  const {
    virtualItems,
    totalHeight,
    containerRef,
    isScrolling,
  } = useVirtualGrid(allSeries, {
    sliderValue,
    gap: 16,
    aspectRatio: 1.5,
    infoHeight: 56,
    overscan: 3,
  });

  // Infinite scroll: fetch next page when approaching bottom
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      },
      { rootMargin: `${INFINITE_SCROLL_THRESHOLD}px` }
    );

    const sentinel = sentinelRef.current;
    if (sentinel) {
      observer.observe(sentinel);
    }

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Total count from first page
  const totalCount = data?.pages[0]?.totalCount ?? 0;

  // Loading state
  if (isLoading) {
    return (
      <div className="series-browser-page">
        <div className="series-browser-page__header">
          <h1>Series</h1>
        </div>
        <div className="series-browser-page__loading">
          <LoadingState variant="skeleton-cards" count={20} />
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="series-browser-page series-browser-page--error">
        <div className="series-browser-page__error-content">
          <h2>Failed to load series</h2>
          <p>{error?.message || 'An unexpected error occurred'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="series-browser-page">
      {/* Header with title and slider */}
      <div className="series-browser-page__header">
        <h1>Series</h1>
        <div className="series-browser-page__header-controls">
          <CoverSizeSlider
            value={sliderValue}
            onChange={handleSliderChange}
            label=""
          />
        </div>
      </div>

      {/* Filter and sort controls */}
      <SeriesBrowserControls
        options={filterOptions}
        onChange={handleFilterChange}
        totalCount={totalCount}
      />

      {/* Virtual Grid Container */}
      <div
        ref={containerRef}
        className={`series-browser-page__grid${isScrolling ? ' scrolling' : ''}`}
      >
        <div
          className="series-browser-page__grid-inner"
          style={{ height: totalHeight, position: 'relative' }}
        >
          {virtualItems.map(({ item, style }) => (
            <MinimalSeriesCard
              key={item.id}
              series={item}
              style={style}
            />
          ))}
        </div>

        {/* Infinite scroll sentinel */}
        <div
          ref={sentinelRef}
          className="series-browser-page__sentinel"
          style={{ height: 1 }}
        />

        {/* Loading indicator for next page */}
        {isFetchingNextPage && (
          <div className="series-browser-page__loading-more">
            <LoadingState variant="inline" message="Loading more..." />
          </div>
        )}

        {/* End of results indicator */}
        {!hasNextPage && allSeries.length > 0 && (
          <div className="series-browser-page__end">
            End of results
          </div>
        )}
      </div>
    </div>
  );
}
