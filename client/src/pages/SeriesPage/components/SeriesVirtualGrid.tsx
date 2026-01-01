/**
 * SeriesVirtualGrid Component
 *
 * Virtualized grid container for series/collection cards.
 * Uses stable layout calculations and windowed rendering for performance.
 *
 * Key features:
 * - Layout only recalculates on resize or cardSize change (never on data changes)
 * - Keeps previous data visible during fetching (dimmed)
 * - Smooth scrolling with overscan rows
 */

import React, { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { GridItem } from '../../../services/api/series';
import { useStableGridLayout } from '../hooks/useStableGridLayout';
import { useVirtualWindow } from '../hooks/useVirtualWindow';
import { SeriesCard } from './SeriesCard';
import './SeriesVirtualGrid.css';

// =============================================================================
// Skeleton Generation
// =============================================================================

const SKELETON_OVERSCAN_ROWS = 6; // Extra rows of skeletons beyond rendered items

interface SkeletonPosition {
  index: number;
  style: React.CSSProperties;
}

/**
 * Generate skeleton positions for items in an extended range.
 * Skeletons are shown for positions that don't have actual cards rendered.
 */
function generateSkeletonPositions(
  layout: { columns: number; itemWidth: number; itemHeight: number; gap: number; getItemPosition: (i: number) => { x: number; y: number } } | null,
  itemCount: number,
  renderStartIndex: number,
  renderEndIndex: number
): SkeletonPosition[] {
  if (!layout || itemCount === 0) return [];

  const { columns, itemWidth, itemHeight } = layout;

  // Calculate current rendered row range
  const renderStartRow = Math.floor(renderStartIndex / columns);
  const renderEndRow = Math.ceil(renderEndIndex / columns);

  // Extended skeleton range
  const skeletonStartRow = Math.max(0, renderStartRow - SKELETON_OVERSCAN_ROWS);
  const skeletonEndRow = Math.min(
    Math.ceil(itemCount / columns),
    renderEndRow + SKELETON_OVERSCAN_ROWS
  );

  const skeletons: SkeletonPosition[] = [];

  // Generate skeletons for rows before rendered items
  for (let row = skeletonStartRow; row < renderStartRow; row++) {
    for (let col = 0; col < columns; col++) {
      const index = row * columns + col;
      if (index >= itemCount) break;

      const position = layout.getItemPosition(index);
      skeletons.push({
        index,
        style: {
          position: 'absolute',
          width: itemWidth,
          height: itemHeight,
          transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        },
      });
    }
  }

  // Generate skeletons for rows after rendered items
  for (let row = renderEndRow; row < skeletonEndRow; row++) {
    for (let col = 0; col < columns; col++) {
      const index = row * columns + col;
      if (index >= itemCount) break;

      const position = layout.getItemPosition(index);
      skeletons.push({
        index,
        style: {
          position: 'absolute',
          width: itemWidth,
          height: itemHeight,
          transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        },
      });
    }
  }

  return skeletons;
}

// =============================================================================
// Types
// =============================================================================

export interface SeriesVirtualGridProps {
  /** Grid items to display */
  items: GridItem[];
  /** Card size setting (1-10) */
  cardSize: number;
  /** Whether data is being fetched (shows dimmed overlay) */
  isFetching: boolean;
  /** Whether this is the initial load (shows skeleton) */
  isLoading: boolean;
  /** Selected item IDs */
  selectedIds: Set<string>;
  /** Selection handler */
  onSelect: (id: string, event: React.MouseEvent) => void;
  /** Context menu handler */
  onContextMenu: (id: string, event: React.MouseEvent) => void;
  /** Callback with visible range (for navigation sidebar) */
  onVisibleRangeChange?: (range: { start: number; end: number }) => void;
  /** Callback with scrollToIndex function (for navigation sidebar) */
  onScrollToIndexReady?: (scrollToIndex: (index: number) => void) => void;
}

// =============================================================================
// Component
// =============================================================================

export function SeriesVirtualGrid({
  items,
  cardSize,
  isFetching,
  isLoading,
  selectedIds,
  onSelect,
  onContextMenu,
  onVisibleRangeChange,
  onScrollToIndexReady,
}: SeriesVirtualGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Stable layout - only recalculates on resize or cardSize change
  const layout = useStableGridLayout(containerRef, { cardSize });

  // Virtual window - calculates which items to render based on scroll
  const { visibleItems, totalHeight, visibleRange, renderRange, scrollToIndex } = useVirtualWindow(
    scrollContainerRef,
    items,
    layout,
    { overscanRows: 2 }
  );

  // Generate skeleton positions for items beyond the render range
  const skeletonPositions = useMemo(
    () => generateSkeletonPositions(layout, items.length, renderRange.start, renderRange.end),
    [layout, items.length, renderRange.start, renderRange.end]
  );

  // Notify parent of visible range changes
  useEffect(() => {
    onVisibleRangeChange?.(visibleRange);
  }, [visibleRange, onVisibleRangeChange]);

  // Provide scrollToIndex to parent
  useEffect(() => {
    onScrollToIndexReady?.(scrollToIndex);
  }, [scrollToIndex, onScrollToIndexReady]);

  // Track last selected for shift+click range selection
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  // Selection handler with range selection support
  const handleSelect = useCallback(
    (id: string, event: React.MouseEvent) => {
      // Shift+click for range selection
      if (event.shiftKey && lastSelectedId) {
        // Range selection handled by parent
        onSelect(id, event);
      } else {
        setLastSelectedId(id);
        onSelect(id, event);
      }
    },
    [lastSelectedId, onSelect]
  );

  // Build class names
  const gridClassName = [
    'series-virtual-grid',
    isFetching && 'series-virtual-grid--fetching',
  ]
    .filter(Boolean)
    .join(' ');

  // Show skeleton on initial load
  if (isLoading && items.length === 0) {
    return (
      <div className="series-virtual-grid series-virtual-grid--loading">
        <div ref={containerRef} className="series-virtual-grid__measure" />
        <div className="series-virtual-grid__skeleton">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="series-virtual-grid__skeleton-card">
              <div className="series-virtual-grid__skeleton-cover" />
              <div className="series-virtual-grid__skeleton-info">
                <div className="series-virtual-grid__skeleton-title" />
                <div className="series-virtual-grid__skeleton-meta" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Show empty state
  if (!isLoading && items.length === 0) {
    return (
      <div className="series-virtual-grid series-virtual-grid--empty">
        <div ref={containerRef} className="series-virtual-grid__measure" />
        <div className="series-virtual-grid__empty-state">
          <svg
            className="series-virtual-grid__empty-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <p className="series-virtual-grid__empty-title">No series found</p>
          <p className="series-virtual-grid__empty-text">
            Try adjusting your filters or search terms
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={gridClassName}>
      {/* Measure container for layout calculations */}
      <div ref={containerRef} className="series-virtual-grid__measure" />

      {/* Scroll container */}
      <div ref={scrollContainerRef} className="series-virtual-grid__scroll">
        {/* Virtual content area */}
        <div
          className="series-virtual-grid__content"
          style={{ height: totalHeight }}
        >
          {/* Skeleton placeholders for items beyond render range */}
          {skeletonPositions.map(({ index, style }) => (
            <div
              key={`skeleton-${index}`}
              className="series-virtual-grid__skeleton-item"
              style={style}
              aria-hidden="true"
            >
              <div className="series-virtual-grid__skeleton-cover" />
              <div className="series-virtual-grid__skeleton-info">
                <div className="series-virtual-grid__skeleton-title" />
                <div className="series-virtual-grid__skeleton-meta" />
              </div>
            </div>
          ))}

          {/* Render actual visible items */}
          {visibleItems.map(({ data, style }) => (
            <SeriesCard
              key={data.id}
              item={data}
              isSelected={selectedIds.has(data.id)}
              cardSize={cardSize}
              selectable={selectedIds.size > 0}
              onSelect={handleSelect}
              onContextMenu={onContextMenu}
              style={style}
            />
          ))}
        </div>
      </div>

      {/* Fetching overlay - dims current content */}
      {isFetching && (
        <div className="series-virtual-grid__fetching-overlay" aria-hidden="true" />
      )}
    </div>
  );
}
