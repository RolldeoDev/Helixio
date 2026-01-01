/**
 * useSeriesPresets Hook
 *
 * Bridges AdvancedSeriesFilterContext with the SeriesPage filter system.
 * Provides preset management and application functionality.
 */

import { useCallback, useMemo } from 'react';
import { useAdvancedSeriesFilter } from '../../../contexts/AdvancedSeriesFilterContext';
import { GridItem } from '../../../services/api/series';

export interface SeriesPreset {
  id: string;
  name: string;
  isActive: boolean;
}

export interface UseSeriesPresetsReturn {
  /** List of available presets */
  presets: SeriesPreset[];
  /** Currently active preset ID, if any */
  activePresetId: string | null;
  /** Whether a preset is currently active */
  hasActivePreset: boolean;
  /** Load a preset by ID */
  loadPreset: (presetId: string) => void;
  /** Clear the active preset */
  clearPreset: () => void;
  /** Apply active preset filter to items */
  applyPresetFilter: (items: GridItem[]) => GridItem[];
  /** Save current filter as a new preset */
  saveAsPreset: (name: string) => void;
  /** Delete a preset by ID */
  deletePreset: (presetId: string) => void;
  /** Whether the advanced filter is active (has conditions) */
  isAdvancedFilterActive: boolean;
}

export function useSeriesPresets(): UseSeriesPresetsReturn {
  const {
    savedFilters,
    activeFilter,
    loadFilter,
    clearFilter,
    saveFilter,
    deleteFilter,
    applyFilterToSeries,
  } = useAdvancedSeriesFilter();

  // Map saved filters to preset format
  const presets = useMemo((): SeriesPreset[] => {
    return savedFilters.map((filter) => ({
      id: filter.id,
      name: filter.name,
      isActive: activeFilter?.id === filter.id,
    }));
  }, [savedFilters, activeFilter]);

  // Get active preset ID
  const activePresetId = useMemo(() => {
    return activeFilter?.id ?? null;
  }, [activeFilter]);

  // Check if any preset is active
  const hasActivePreset = useMemo(() => {
    return activePresetId !== null;
  }, [activePresetId]);

  // Check if advanced filter has active conditions
  const isAdvancedFilterActive = useMemo(() => {
    if (!activeFilter) return false;
    return activeFilter.groups.some((group) => group.conditions.length > 0);
  }, [activeFilter]);

  // Load a preset
  const loadPreset = useCallback(
    (presetId: string) => {
      loadFilter(presetId);
    },
    [loadFilter]
  );

  // Clear active preset
  const clearPreset = useCallback(() => {
    clearFilter();
  }, [clearFilter]);

  // Apply preset filter to items
  const applyPresetFilter = useCallback(
    (items: GridItem[]): GridItem[] => {
      if (!isAdvancedFilterActive) {
        return items;
      }

      // Separate series items from others (collections stay as-is)
      const seriesItems = items.filter((item) => item.itemType === 'series');
      const otherItems = items.filter((item) => item.itemType !== 'series');

      // Extract series objects and filter them
      const seriesObjects = seriesItems.map((item) => item.series);
      const filteredSeries = applyFilterToSeries(seriesObjects);
      const filteredSeriesIds = new Set(filteredSeries.map((s) => s.id));

      // Return filtered series items + other items
      const filteredSeriesItems = seriesItems.filter((item) =>
        filteredSeriesIds.has(item.id)
      );

      return [...filteredSeriesItems, ...otherItems];
    },
    [isAdvancedFilterActive, applyFilterToSeries]
  );

  // Save current filter as preset
  const saveAsPreset = useCallback(
    (name: string) => {
      saveFilter(name);
    },
    [saveFilter]
  );

  // Delete a preset
  const deletePreset = useCallback(
    (presetId: string) => {
      deleteFilter(presetId);
    },
    [deleteFilter]
  );

  return {
    presets,
    activePresetId,
    hasActivePreset,
    loadPreset,
    clearPreset,
    applyPresetFilter,
    saveAsPreset,
    deletePreset,
    isAdvancedFilterActive,
  };
}
