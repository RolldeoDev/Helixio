/**
 * useSeriesSelection Hook
 *
 * Manages series selection state for the SeriesPage.
 * Wraps AppContext selection functions with additional logic for:
 * - Shift+click range selection
 * - Ctrl/Cmd+click multi-select
 * - Click to select single item (clears others)
 */

import { useCallback, useRef } from 'react';
import { useApp } from '../../../contexts/AppContext';
import { GridItem } from '../../../services/api/series';

export interface UseSeriesSelectionReturn {
  /** Set of selected series IDs */
  selectedIds: Set<string>;
  /** Number of selected items */
  selectedCount: number;
  /** Whether any items are selected */
  hasSelection: boolean;
  /** Handle item selection (called from card click) */
  handleSelect: (id: string, event: React.MouseEvent) => void;
  /** Select all items in the current list */
  selectAll: () => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Toggle selection for a single item */
  toggleSelection: (id: string) => void;
  /** Get array of selected IDs */
  getSelectedIds: () => string[];
}

export interface UseSeriesSelectionOptions {
  /** Current list of items (for range selection) */
  items: GridItem[];
}

/**
 * Hook for managing series selection with keyboard modifiers.
 *
 * Selection behavior:
 * - Click: Select single item (clears others)
 * - Ctrl/Cmd+Click: Toggle item selection (add/remove from set)
 * - Shift+Click: Range select from last selected to clicked item
 */
export function useSeriesSelection({
  items,
}: UseSeriesSelectionOptions): UseSeriesSelectionReturn {
  const {
    selectedSeries,
    selectSeries,
    selectSeriesRange,
    selectAllSeries,
    clearSeriesSelection,
  } = useApp();

  // Track last selected ID for shift+click range selection
  const lastSelectedIdRef = useRef<string | null>(null);

  // Get only series IDs from items (exclude collections)
  const getSeriesIds = useCallback((): string[] => {
    return items
      .filter((item) => item.itemType === 'series')
      .map((item) => item.id);
  }, [items]);

  // Handle selection with keyboard modifier support
  const handleSelect = useCallback(
    (id: string, event: React.MouseEvent) => {
      const isCtrlOrCmd = event.ctrlKey || event.metaKey;
      const isShift = event.shiftKey;

      if (isShift && lastSelectedIdRef.current) {
        // Shift+click: Range selection
        const seriesIds = getSeriesIds();
        selectSeriesRange(seriesIds, lastSelectedIdRef.current, id);
      } else if (isCtrlOrCmd) {
        // Ctrl/Cmd+click: Toggle selection
        selectSeries(id, !selectedSeries.has(id));
      } else {
        // Regular click: Clear others and select this one
        clearSeriesSelection();
        selectSeries(id, true);
      }

      // Update last selected for next shift+click
      lastSelectedIdRef.current = id;
    },
    [getSeriesIds, selectSeriesRange, selectSeries, selectedSeries, clearSeriesSelection]
  );

  // Select all series in current list
  const selectAll = useCallback(() => {
    const seriesIds = getSeriesIds();
    selectAllSeries(seriesIds);
  }, [getSeriesIds, selectAllSeries]);

  // Toggle selection for a single item
  const toggleSelection = useCallback(
    (id: string) => {
      selectSeries(id, !selectedSeries.has(id));
      lastSelectedIdRef.current = id;
    },
    [selectSeries, selectedSeries]
  );

  // Get array of selected IDs
  const getSelectedIds = useCallback((): string[] => {
    return Array.from(selectedSeries);
  }, [selectedSeries]);

  return {
    selectedIds: selectedSeries,
    selectedCount: selectedSeries.size,
    hasSelection: selectedSeries.size > 0,
    handleSelect,
    selectAll,
    clearSelection: clearSeriesSelection,
    toggleSelection,
    getSelectedIds,
  };
}
