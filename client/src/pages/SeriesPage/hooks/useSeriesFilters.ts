/**
 * useSeriesFilters Hook
 *
 * Manages filter state with reducer pattern.
 * Handles preset vs. manual filter mutual exclusivity.
 */

import { useReducer, useCallback, useMemo } from 'react';
import { SeriesFilterState, DEFAULT_FILTERS } from '../utils/filterUtils';

// =============================================================================
// Types
// =============================================================================

type FilterKey = keyof SeriesFilterState;

type FilterAction =
  | { type: 'SET_FILTER'; key: FilterKey; value: SeriesFilterState[FilterKey] }
  | { type: 'SET_FILTERS'; payload: Partial<SeriesFilterState> }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'SET_PRESET'; presetId: string }
  | { type: 'CLEAR_PRESET' };

export interface UseSeriesFiltersReturn {
  filters: SeriesFilterState;
  setFilter: <K extends FilterKey>(key: K, value: SeriesFilterState[K]) => void;
  setFilters: (partial: Partial<SeriesFilterState>) => void;
  clearFilters: () => void;
  setPreset: (presetId: string) => void;
  clearPreset: () => void;
  hasActiveFilters: boolean;
  isUsingPreset: boolean;
}

// =============================================================================
// Reducer
// =============================================================================

// Keys that don't affect data fetching (view-only)
const VIEW_ONLY_KEYS: FilterKey[] = ['cardSize'];

// Keys that should clear preset when changed
function shouldClearPreset(key: FilterKey): boolean {
  return !VIEW_ONLY_KEYS.includes(key) && key !== 'presetId';
}

function filterReducer(state: SeriesFilterState, action: FilterAction): SeriesFilterState {
  switch (action.type) {
    case 'SET_FILTER': {
      const newState = { ...state, [action.key]: action.value };
      // Clear preset if setting a filter that affects data
      if (shouldClearPreset(action.key) && state.presetId) {
        newState.presetId = null;
      }
      return newState;
    }

    case 'SET_FILTERS': {
      const newState = { ...state, ...action.payload };
      // Clear preset if any data-affecting filter is set
      const hasDataFilter = Object.keys(action.payload).some(
        (key) => shouldClearPreset(key as FilterKey)
      );
      if (hasDataFilter && state.presetId) {
        newState.presetId = null;
      }
      return newState;
    }

    case 'CLEAR_FILTERS':
      return { ...DEFAULT_FILTERS };

    case 'SET_PRESET':
      return { ...state, presetId: action.presetId };

    case 'CLEAR_PRESET':
      return { ...state, presetId: null };

    default:
      return state;
  }
}

// =============================================================================
// Hook
// =============================================================================

export function useSeriesFilters(
  initialFilters: SeriesFilterState = DEFAULT_FILTERS
): UseSeriesFiltersReturn {
  const [filters, dispatch] = useReducer(filterReducer, initialFilters);

  const setFilter = useCallback(<K extends FilterKey>(key: K, value: SeriesFilterState[K]) => {
    dispatch({ type: 'SET_FILTER', key, value });
  }, []);

  const setFilters = useCallback((partial: Partial<SeriesFilterState>) => {
    dispatch({ type: 'SET_FILTERS', payload: partial });
  }, []);

  const clearFilters = useCallback(() => {
    dispatch({ type: 'CLEAR_FILTERS' });
  }, []);

  const setPreset = useCallback((presetId: string) => {
    dispatch({ type: 'SET_PRESET', presetId });
  }, []);

  const clearPreset = useCallback(() => {
    dispatch({ type: 'CLEAR_PRESET' });
  }, []);

  const hasActiveFilters = useMemo(() => {
    if (filters.presetId) return true;
    if (filters.search) return true;
    if (filters.publisher) return true;
    if (filters.type) return true;
    if (filters.hasUnread !== null) return true;
    if (filters.showHidden) return true;
    return false;
  }, [filters]);

  const isUsingPreset = filters.presetId !== null;

  return {
    filters,
    setFilter,
    setFilters,
    clearFilters,
    setPreset,
    clearPreset,
    hasActiveFilters,
    isUsingPreset,
  };
}
