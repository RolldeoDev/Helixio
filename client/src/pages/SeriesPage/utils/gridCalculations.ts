/**
 * Grid Calculations
 *
 * Pure functions for calculating grid layout.
 * No side effects, no state - just math.
 */

// =============================================================================
// Types
// =============================================================================

export interface GridLayout {
  columns: number;
  itemWidth: number;
  itemHeight: number;
  gap: number;
  containerWidth: number;
  getTotalHeight: (itemCount: number) => number;
  getItemPosition: (index: number) => { x: number; y: number };
}

export interface VisibleRange {
  startIndex: number;
  endIndex: number;
}

// =============================================================================
// Constants
// =============================================================================

const MIN_COLUMNS = 2;
const MAX_COLUMNS = 14;
const MIN_GAP = 12;
const ASPECT_RATIO = 1.5; // Cover aspect ratio (height = width * 1.5)
const INFO_HEIGHT = 60; // Height of title/meta section below cover

// Card size slider maps to min card width
// Size 1 = smallest cards (most columns), Size 10 = largest cards (fewest columns)
const CARD_SIZE_TO_MIN_WIDTH: Record<number, number> = {
  1: 80,
  2: 100,
  3: 120,
  4: 140,
  5: 160,
  6: 180,
  7: 200,
  8: 240,
  9: 280,
  10: 320,
};

// =============================================================================
// Layout Calculation
// =============================================================================

/**
 * Calculate grid layout based on container width and card size preference.
 * This is the single source of truth for all layout calculations.
 */
export function calculateGridLayout(containerWidth: number, cardSize: number): GridLayout {
  // Get minimum card width from size preference
  const minCardWidth = CARD_SIZE_TO_MIN_WIDTH[cardSize] ?? 160;

  // Calculate how many columns fit
  // columns = floor((containerWidth + gap) / (minCardWidth + gap))
  const gap = MIN_GAP;
  let columns = Math.floor((containerWidth + gap) / (minCardWidth + gap));

  // Clamp to valid range
  columns = Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, columns));

  // Calculate actual item width to fill container
  // itemWidth = (containerWidth - (columns - 1) * gap) / columns
  const itemWidth = (containerWidth - (columns - 1) * gap) / columns;

  // Calculate item height (cover + info section)
  const coverHeight = itemWidth * ASPECT_RATIO;
  const itemHeight = coverHeight + INFO_HEIGHT;

  return {
    columns,
    itemWidth,
    itemHeight,
    gap,
    containerWidth,

    getTotalHeight(itemCount: number): number {
      if (itemCount === 0) return 0;
      const rows = Math.ceil(itemCount / columns);
      // Last row doesn't need gap after it
      return rows * itemHeight + (rows - 1) * gap;
    },

    getItemPosition(index: number): { x: number; y: number } {
      const col = index % columns;
      const row = Math.floor(index / columns);
      return {
        x: col * (itemWidth + gap),
        y: row * (itemHeight + gap),
      };
    },
  };
}

// =============================================================================
// Visible Range Calculation
// =============================================================================

/**
 * Calculate which items are visible based on scroll position.
 * Includes overscan rows for smooth scrolling.
 */
export function calculateVisibleRange(
  scrollTop: number,
  viewportHeight: number,
  layout: GridLayout,
  itemCount: number,
  overscanRows: number = 2
): VisibleRange {
  if (itemCount === 0) {
    return { startIndex: 0, endIndex: 0 };
  }

  const { columns, itemHeight, gap } = layout;
  const rowHeight = itemHeight + gap;

  // Calculate visible row range
  const firstVisibleRow = Math.floor(scrollTop / rowHeight);
  const lastVisibleRow = Math.ceil((scrollTop + viewportHeight) / rowHeight);

  // Add overscan
  const startRow = Math.max(0, firstVisibleRow - overscanRows);
  const endRow = lastVisibleRow + overscanRows;

  // Convert to indices
  const startIndex = startRow * columns;
  const endIndex = Math.min((endRow + 1) * columns, itemCount);

  return { startIndex, endIndex };
}
