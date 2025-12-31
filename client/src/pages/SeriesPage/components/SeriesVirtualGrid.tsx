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

import React, { useRef, useCallback, useState } from 'react';
import { GridItem } from '../../../services/api/series';
import { useStableGridLayout } from '../hooks/useStableGridLayout';
import { useVirtualWindow } from '../hooks/useVirtualWindow';
import { SeriesCard } from './SeriesCard';
import './SeriesVirtualGrid.css';

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
}: SeriesVirtualGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Stable layout - only recalculates on resize or cardSize change
  const layout = useStableGridLayout(containerRef, { cardSize });

  // Virtual window - calculates which items to render based on scroll
  const { visibleItems, totalHeight, isScrolling } = useVirtualWindow(
    scrollContainerRef,
    items,
    layout,
    { overscanRows: 2 }
  );

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
    isScrolling && 'series-virtual-grid--scrolling',
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
          {/* Render only visible items */}
          {visibleItems.map(({ data, style }) => (
            <SeriesCard
              key={data.id}
              item={data}
              isSelected={selectedIds.has(data.id)}
              isScrolling={isScrolling}
              cardSize={cardSize}
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
