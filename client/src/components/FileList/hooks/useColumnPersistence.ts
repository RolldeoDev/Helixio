/**
 * useColumnPersistence Hook
 *
 * Manages persisted column state (widths, order, visibility) in localStorage.
 * Integrates with TanStack Table state management.
 */

import { useState, useEffect, useCallback } from 'react';
import type { ColumnSizingState, VisibilityState } from '@tanstack/react-table';
import { defaultColumnOrder, defaultColumnSizing, compactHiddenColumns } from '../columns';

const STORAGE_KEY = 'helixio-filelist-columns';

interface PersistedColumnState {
  sizing: ColumnSizingState;
  order: string[];
  visibility: VisibilityState;
}

const defaultState: PersistedColumnState = {
  sizing: defaultColumnSizing,
  order: defaultColumnOrder,
  visibility: {},
};

function loadState(): PersistedColumnState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        sizing: { ...defaultColumnSizing, ...parsed.sizing },
        order: parsed.order || defaultColumnOrder,
        visibility: parsed.visibility || {},
      };
    }
  } catch (e) {
    console.warn('Failed to load column state from localStorage:', e);
  }
  return defaultState;
}

function saveState(state: PersistedColumnState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to save column state to localStorage:', e);
  }
}

export function useColumnPersistence(compact: boolean) {
  const [state, setState] = useState<PersistedColumnState>(() => {
    const loaded = loadState();
    // Apply compact mode visibility overrides
    if (compact) {
      const visibility = { ...loaded.visibility };
      compactHiddenColumns.forEach((col) => {
        visibility[col] = false;
      });
      return { ...loaded, visibility };
    }
    return loaded;
  });

  // Save to localStorage when state changes
  useEffect(() => {
    saveState(state);
  }, [state]);

  // Update visibility when compact prop changes
  useEffect(() => {
    if (compact) {
      setState((prev) => {
        const visibility = { ...prev.visibility };
        compactHiddenColumns.forEach((col) => {
          visibility[col] = false;
        });
        return { ...prev, visibility };
      });
    }
  }, [compact]);

  // Handlers for TanStack Table state changes
  const onColumnSizingChange = useCallback(
    (updater: ColumnSizingState | ((old: ColumnSizingState) => ColumnSizingState)) => {
      setState((prev) => {
        const newSizing = typeof updater === 'function' ? updater(prev.sizing) : updater;
        return { ...prev, sizing: newSizing };
      });
    },
    []
  );

  const onColumnOrderChange = useCallback(
    (updater: string[] | ((old: string[]) => string[])) => {
      setState((prev) => {
        const newOrder = typeof updater === 'function' ? updater(prev.order) : updater;
        return { ...prev, order: newOrder };
      });
    },
    []
  );

  const onColumnVisibilityChange = useCallback(
    (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => {
      setState((prev) => {
        const newVisibility = typeof updater === 'function' ? updater(prev.visibility) : updater;
        return { ...prev, visibility: newVisibility };
      });
    },
    []
  );

  // Reset to defaults
  const resetColumnState = useCallback(() => {
    const newState = { ...defaultState };
    if (compact) {
      compactHiddenColumns.forEach((col) => {
        newState.visibility[col] = false;
      });
    }
    setState(newState);
  }, [compact]);

  return {
    columnSizing: state.sizing,
    columnOrder: state.order,
    columnVisibility: state.visibility,
    onColumnSizingChange,
    onColumnOrderChange,
    onColumnVisibilityChange,
    resetColumnState,
  };
}
