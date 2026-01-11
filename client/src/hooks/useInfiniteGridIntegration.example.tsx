/**
 * Infinite Scroll Integration Example
 *
 * This file demonstrates how to integrate infinite scroll into grid components.
 * Use this as a reference when updating GridView, ListView, or other components.
 *
 * INTEGRATION STEPS:
 * 1. Import infinite hooks (useInfiniteFiles, useInfiniteSeries, useVirtualInfiniteGrid)
 * 2. Add enableInfiniteScroll prop to component (default: false for backwards compatibility)
 * 3. Conditionally use infinite query vs traditional query based on prop
 * 4. Flatten pages for virtual grid
 * 5. Pass infinite scroll config to useVirtualInfiniteGrid
 *
 * EXAMPLE INTEGRATION PATTERNS BELOW:
 */

import { useInfiniteFiles } from './queries/useInfiniteFiles';
import { useInfiniteSeries } from './queries/useInfiniteSeries';
import { useVirtualInfiniteGrid } from './useVirtualInfiniteGrid';
import { usePrefetch } from './usePrefetch';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/queryClient';
import { getSeriesList } from '../services/api/series';

// =============================================================================
// EXAMPLE 1: Files Grid with Infinite Scroll
// =============================================================================

export function ExampleFilesGridWithInfiniteScroll() {
  const libraryId = 'lib-123';
  const coverSize = 5; // Slider value 1-10

  // Use infinite query for files
  const infiniteQuery = useInfiniteFiles({
    libraryId,
    limit: 50, // Load 50 items per page
    sort: 'filename',
    order: 'asc',
  });

  // Integrate with virtual grid for infinite scroll
  const { virtualItems, totalHeight, containerRef } = useVirtualInfiniteGrid<any>(
    infiniteQuery.data?.pages, // Pass pages from infinite query
    {
      sliderValue: coverSize,
      gap: 16,
      overscan: 3, // Render 3 rows outside viewport for smooth scroll
      aspectRatio: 1.5,
      infoHeight: 60,
      minCoverWidth: 80,
      maxCoverWidth: 350,
      // Infinite scroll config
      onLoadMore: () => infiniteQuery.fetchNextPage(),
      hasNextPage: infiniteQuery.hasNextPage,
      isFetchingNextPage: infiniteQuery.isFetchingNextPage,
      threshold: 0.8, // Trigger at 80% scroll
    }
  );

  if (infiniteQuery.isLoading) return <div>Loading...</div>;
  if (infiniteQuery.isError) return <div>Error loading files</div>;

  return (
    <div
      ref={containerRef}
      style={{
        height: '100vh',
        overflow: 'auto',
        position: 'relative',
      }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {virtualItems.map(({ item, style }) => (
          <div key={item.id} style={style}>
            {/* Render CoverCard or other component */}
            <div>{item.filename}</div>
          </div>
        ))}

        {/* Loading indicator for next page */}
        {infiniteQuery.isFetchingNextPage && (
          <div style={{ padding: 20, textAlign: 'center' }}>
            Loading more...
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// EXAMPLE 2: Series Grid with Infinite Scroll
// =============================================================================

export function ExampleSeriesGridWithInfiniteScroll() {
  const libraryId = 'lib-123';
  const coverSize = 5;

  // Use infinite query for series
  const infiniteQuery = useInfiniteSeries({
    libraryId,
    limit: 50,
    sortBy: 'name',
    sortOrder: 'asc',
  });

  const { virtualItems, totalHeight, containerRef } = useVirtualInfiniteGrid<any>(
    infiniteQuery.data?.pages,
    {
      sliderValue: coverSize,
      gap: 16,
      overscan: 3,
      aspectRatio: 1.5,
      infoHeight: 60,
      onLoadMore: () => infiniteQuery.fetchNextPage(),
      hasNextPage: infiniteQuery.hasNextPage,
      isFetchingNextPage: infiniteQuery.isFetchingNextPage,
    }
  );

  return (
    <div ref={containerRef} style={{ height: '100vh', overflow: 'auto' }}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        {virtualItems.map(({ item, style }) => (
          <div key={item.id} style={style}>
            {item.name}
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// EXAMPLE 3: Infinite Scroll with Smart Prefetching
// =============================================================================

export function ExampleWithPrefetching() {
  const libraryId = 'lib-123';
  const coverSize = 5;
  const queryClient = useQueryClient();

  // Hover prefetch hook
  const { prefetchSeries } = usePrefetch();

  // Infinite query for series
  const infiniteQuery = useInfiniteSeries({
    libraryId,
    limit: 50,
  });

  // Prefetch next page callback
  const handlePrefetchNextPage = () => {
    // Prefetch next page silently (won't show loading state)
    queryClient.prefetchInfiniteQuery({
      queryKey: [...queryKeys.series.list({ libraryId }), 'infinite'],
      queryFn: async ({ pageParam = 1 }) => {
        return await getSeriesList({ libraryId, page: pageParam, limit: 50 });
      },
      // Start from next page
      initialPageParam: (infiniteQuery.data?.pages.length || 0) + 1,
    });
  };

  const { virtualItems, totalHeight, containerRef } = useVirtualInfiniteGrid<any>(
    infiniteQuery.data?.pages,
    {
      sliderValue: coverSize,
      gap: 16,
      overscan: 3,
      aspectRatio: 1.5,
      infoHeight: 60,
      // Load at 80%
      onLoadMore: () => infiniteQuery.fetchNextPage(),
      // Prefetch at 60% (ahead of loading)
      onPrefetch: handlePrefetchNextPage,
      hasNextPage: infiniteQuery.hasNextPage,
      isFetchingNextPage: infiniteQuery.isFetchingNextPage,
      threshold: 0.8,
      prefetchThreshold: 0.6,
    }
  );

  return (
    <div ref={containerRef} style={{ height: '100vh', overflow: 'auto' }}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        {virtualItems.map(({ item, style }) => (
          <div
            key={item.id}
            style={style}
            // Prefetch on hover for instant navigation
            onMouseEnter={() => prefetchSeries(item.id)}
          >
            {item.name}
          </div>
        ))}

        {infiniteQuery.isFetchingNextPage && (
          <div style={{ padding: 20, textAlign: 'center' }}>Loading more...</div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// EXAMPLE 4: Opt-in Infinite Scroll with Feature Flag
// =============================================================================

interface GridProps {
  libraryId?: string;
  enableInfiniteScroll?: boolean; // Feature flag (default: false)
}

export function ExampleOptInInfiniteScroll({ libraryId, enableInfiniteScroll = false }: GridProps) {
  const coverSize = 5;

  // Traditional query (existing behavior)
  // const traditionalQuery = useFiles({ libraryId, page: 1, limit: 50 });

  // Infinite query (new behavior)
  const infiniteQuery = useInfiniteFiles({ libraryId, limit: 50 });

  if (enableInfiniteScroll) {
    // Infinite scroll mode
    const { virtualItems, totalHeight, containerRef } = useVirtualInfiniteGrid<any>(
      infiniteQuery.data?.pages,
      {
        sliderValue: coverSize,
        gap: 16,
        overscan: 3,
        onLoadMore: () => infiniteQuery.fetchNextPage(),
        hasNextPage: infiniteQuery.hasNextPage,
        isFetchingNextPage: infiniteQuery.isFetchingNextPage,
      }
    );

    return (
      <div ref={containerRef} style={{ height: '100vh', overflow: 'auto' }}>
        <div style={{ height: totalHeight, position: 'relative' }}>
          {virtualItems.map(({ item, style }) => (
            <div key={item.id} style={style}>
              {item.filename}
            </div>
          ))}
        </div>
      </div>
    );
  } else {
    // Traditional pagination mode (existing behavior)
    return <div>Traditional pagination grid (not shown in example)</div>;
  }
}

// =============================================================================
// INTEGRATION CHECKLIST FOR EXISTING COMPONENTS
// =============================================================================

/*
 * TO INTEGRATE INTO GridView.tsx:
 *
 * 1. Add enableInfiniteScroll prop:
 *    interface GridViewProps {
 *      // ... existing props
 *      enableInfiniteScroll?: boolean;
 *    }
 *
 * 2. Import infinite hooks at top of file:
 *    import { useInfiniteFiles } from '../../hooks/queries/useInfiniteFiles';
 *    import { useVirtualInfiniteGrid } from '../../hooks/useVirtualInfiniteGrid';
 *
 * 3. Add infinite query alongside existing query:
 *    const infiniteQuery = useInfiniteFiles({
 *      libraryId: selectedLibrary?.id,
 *      enabled: enableInfiniteScroll,
 *      limit: 50,
 *    });
 *
 * 4. Conditionally use infinite grid:
 *    if (enableInfiniteScroll && groupField === 'none') {
 *      const { virtualItems, totalHeight } = useVirtualInfiniteGrid(
 *        infiniteQuery.data?.pages,
 *        {
 *          sliderValue: coverSize,
 *          gap: 16,
 *          overscan: 3,
 *          onLoadMore: () => infiniteQuery.fetchNextPage(),
 *          hasNextPage: infiniteQuery.hasNextPage,
 *          isFetchingNextPage: infiniteQuery.isFetchingNextPage,
 *        }
 *      );
 *      // Use virtualItems for rendering
 *    } else {
 *      // Use existing pagination logic
 *    }
 *
 * 5. Update render logic to handle both modes
 *
 * BENEFITS:
 * - Backwards compatible (feature flag defaults to false)
 * - Gradual rollout (enable for specific views first)
 * - Performance preserved (uses existing virtualization)
 * - User experience improved (no pagination clicks)
 */
