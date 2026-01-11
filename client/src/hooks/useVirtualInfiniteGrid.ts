/**
 * Virtual Infinite Grid Hook
 *
 * Combines virtual grid rendering with infinite scroll for optimal performance.
 * Extends useVirtualGrid to support infinite query patterns from React Query.
 *
 * Features:
 * - Flattens infinite query pages into single array for virtualization
 * - Automatic next page loading when approaching end (80% threshold)
 * - Maintains 60fps scroll performance with RAF throttling
 * - GPU-accelerated positioning (same as useVirtualGrid)
 * - Overscan buffer for smooth scrolling
 */

import { useEffect, useMemo } from 'react';
import { useVirtualGrid, type VirtualGridConfig, type VirtualGridResult } from './useVirtualGrid';

// =============================================================================
// Types
// =============================================================================

export interface InfiniteQueryPage<T> {
  data?: T[];
  series?: T[];
  items?: T[];
  [key: string]: any; // Allow other properties
}

export interface VirtualInfiniteGridConfig extends VirtualGridConfig {
  /** Callback to load next page */
  onLoadMore?: () => void;
  /** Callback to prefetch next page (optional, for performance) */
  onPrefetch?: () => void;
  /** Whether there are more pages to load */
  hasNextPage?: boolean;
  /** Whether currently fetching next page */
  isFetchingNextPage?: boolean;
  /** Scroll threshold (0-1) to trigger loading (default: 0.8) */
  threshold?: number;
  /** Scroll threshold (0-1) to trigger prefetching (default: 0.6) */
  prefetchThreshold?: number;
}

export interface VirtualInfiniteGridResult<T> extends VirtualGridResult<T> {
  /** Index at which next page will be triggered */
  loadMoreTriggerIndex: number;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Virtual grid with infinite scroll support.
 * Automatically loads next page when user scrolls to threshold (default 80%).
 *
 * @example
 * const infiniteQuery = useInfiniteFiles({ libraryId: 'lib-123' });
 * const { virtualItems, totalHeight } = useVirtualInfiniteGrid(
 *   infiniteQuery.data?.pages,
 *   {
 *     sliderValue: coverSize,
 *     gap: 16,
 *     overscan: 3,
 *     onLoadMore: () => infiniteQuery.fetchNextPage(),
 *     hasNextPage: infiniteQuery.hasNextPage,
 *     isFetchingNextPage: infiniteQuery.isFetchingNextPage,
 *   }
 * );
 */
export function useVirtualInfiniteGrid<T>(
  pages: InfiniteQueryPage<T>[] | undefined,
  config: VirtualInfiniteGridConfig
): VirtualInfiniteGridResult<T> {
  const {
    onLoadMore,
    onPrefetch,
    hasNextPage = false,
    isFetchingNextPage = false,
    threshold = 0.8,
    prefetchThreshold = 0.6,
    ...gridConfig
  } = config;

  // Flatten all pages into single array for virtual grid
  // Support different page structures (data, series, items)
  const allItems = useMemo(() => {
    if (!pages || pages.length === 0) return [];

    return pages.flatMap((page) => {
      // Try different page data structures
      if (Array.isArray(page.data)) return page.data;
      if (Array.isArray(page.series)) return page.series;
      if (Array.isArray(page.items)) return page.items;
      return [];
    });
  }, [pages]);

  // Use existing virtual grid with flattened items
  const gridResult = useVirtualGrid(allItems, gridConfig);

  // Calculate trigger indices
  const prefetchTriggerIndex = Math.floor(allItems.length * prefetchThreshold);
  const loadMoreTriggerIndex = Math.floor(allItems.length * threshold);

  // Monitor visible range for prefetching and loading
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }

    const { end } = gridResult.visibleRange;

    // Prefetch at 60% (or configured threshold)
    if (onPrefetch && end >= prefetchTriggerIndex && end < loadMoreTriggerIndex) {
      onPrefetch();
    }

    // Load at 80% (or configured threshold)
    if (onLoadMore && end >= loadMoreTriggerIndex) {
      onLoadMore();
    }
  }, [
    gridResult.visibleRange.end,
    prefetchTriggerIndex,
    loadMoreTriggerIndex,
    hasNextPage,
    isFetchingNextPage,
    onLoadMore,
    onPrefetch,
  ]);

  return {
    ...gridResult,
    loadMoreTriggerIndex,
  };
}
