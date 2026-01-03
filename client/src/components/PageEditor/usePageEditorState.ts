/**
 * usePageEditorState Hook
 *
 * State management for the Page Editor modal.
 * Handles page loading, selection, deletion marking, and reordering.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { getArchiveContents } from '../../services/api.service';
import type {
  PageEditorState,
  PendingChanges,
  ArchiveModifiability,
  PageReorderItem,
  PageModifyOperation,
} from './types';

// Image extensions to filter for
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

function isImageFile(path: string): boolean {
  const ext = path.toLowerCase().split('.').pop();
  return ext ? IMAGE_EXTENSIONS.some((e) => e.slice(1) === ext) : false;
}

export interface UsePageEditorStateResult {
  // State
  state: PageEditorState;

  // Computed
  pendingChanges: PendingChanges;

  // Selection actions
  selectPage: (index: number, event: React.MouseEvent) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // Page operations
  markForDeletion: () => void;
  unmarkDeletion: (index: number) => void;
  moveSelection: (direction: 'up' | 'down' | 'front' | 'back') => void;
  reorderPages: (fromIndex: number, toIndex: number) => void;

  // API operations
  loadPages: () => Promise<void>;
  checkModifiability: () => Promise<void>;
  saveChanges: () => Promise<boolean>;

  // Reset
  resetChanges: () => void;
}

export function usePageEditorState(fileId: string): UsePageEditorStateResult {
  const [state, setState] = useState<PageEditorState>({
    originalPages: [],
    pages: [],
    deletedIndices: new Set(),
    selectedIndices: new Set(),
    isLoading: true,
    isSaving: false,
    error: null,
    modifiability: null,
  });

  // Last selected index for shift-click range selection
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  // ==========================================================================
  // Computed: Pending Changes
  // ==========================================================================

  const pendingChanges = useMemo<PendingChanges>(() => {
    const { originalPages, pages, deletedIndices } = state;

    // Pages marked for deletion
    const deletions = Array.from(deletedIndices)
      .map((i) => originalPages[i]?.path)
      .filter((p): p is string => p !== undefined);

    // Calculate reorder operations by comparing current order to original
    // Only include pages that aren't deleted
    const reorders: PageReorderItem[] = [];
    let reorderedCount = 0;

    // Build a map of original path -> original index
    const originalIndexMap = new Map<string, number>();
    originalPages.forEach((p, i) => {
      originalIndexMap.set(p.path, i);
    });

    // Check each page in current order
    pages.forEach((page, currentIndex) => {
      if (deletedIndices.has(page.index)) return;

      const originalIndex = originalIndexMap.get(page.path);
      if (originalIndex !== undefined && originalIndex !== currentIndex) {
        reorders.push({
          originalPath: page.path,
          newIndex: currentIndex,
        });
        reorderedCount++;
      }
    });

    const hasChanges = deletions.length > 0 || reorderedCount > 0;

    return {
      deletions,
      reorders,
      hasChanges,
      summary: {
        deletedCount: deletions.length,
        reorderedCount,
      },
    };
  }, [state.originalPages, state.pages, state.deletedIndices]);

  // ==========================================================================
  // Load Pages
  // ==========================================================================

  const loadPages = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await getArchiveContents(fileId);

      // Filter for image files and sort them
      const imagePages = response.entries
        .filter((entry) => !entry.isDirectory && isImageFile(entry.path))
        .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
        .map((entry, index) => ({
          path: entry.path,
          size: entry.size,
          index,
        }));

      setState((prev) => ({
        ...prev,
        originalPages: imagePages,
        pages: [...imagePages],
        deletedIndices: new Set(),
        selectedIndices: new Set(),
        isLoading: false,
        error: null,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load pages',
      }));
    }
  }, [fileId]);

  // ==========================================================================
  // Check Modifiability
  // ==========================================================================

  const checkModifiability = useCallback(async () => {
    try {
      const response = await fetch(`/api/archives/${fileId}/modifiable`);
      if (!response.ok) {
        throw new Error('Failed to check modifiability');
      }
      const data: ArchiveModifiability = await response.json();
      setState((prev) => ({ ...prev, modifiability: data }));
    } catch (err) {
      console.error('Failed to check modifiability:', err);
    }
  }, [fileId]);

  // ==========================================================================
  // Selection Actions
  // ==========================================================================

  const selectPage = useCallback((index: number, event: React.MouseEvent) => {
    setState((prev) => {
      const { selectedIndices, pages } = prev;
      const newSelected = new Set(selectedIndices);

      if (event.shiftKey && lastSelectedIndex !== null) {
        // Range selection
        const min = Math.min(lastSelectedIndex, index);
        const max = Math.max(lastSelectedIndex, index);
        for (let i = min; i <= max; i++) {
          if (i < pages.length) {
            newSelected.add(i);
          }
        }
      } else if (event.ctrlKey || event.metaKey) {
        // Toggle selection
        if (newSelected.has(index)) {
          newSelected.delete(index);
        } else {
          newSelected.add(index);
        }
      } else {
        // Single selection - but if clicking the only selected item, deselect it
        if (newSelected.size === 1 && newSelected.has(index)) {
          newSelected.clear();
        } else {
          newSelected.clear();
          newSelected.add(index);
        }
      }

      return { ...prev, selectedIndices: newSelected };
    });

    setLastSelectedIndex(index);
  }, [lastSelectedIndex]);

  const selectAll = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedIndices: new Set(prev.pages.map((_, i) => i)),
    }));
  }, []);

  const clearSelection = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedIndices: new Set(),
    }));
    setLastSelectedIndex(null);
  }, []);

  // ==========================================================================
  // Page Operations
  // ==========================================================================

  const markForDeletion = useCallback(() => {
    setState((prev) => {
      const { selectedIndices, deletedIndices, pages } = prev;
      const newDeleted = new Set(deletedIndices);

      // Add selected indices to deleted set
      selectedIndices.forEach((i) => {
        // Map back to original index
        const page = pages[i];
        if (page) {
          newDeleted.add(page.index);
        }
      });

      return {
        ...prev,
        deletedIndices: newDeleted,
        selectedIndices: new Set(),
      };
    });
  }, []);

  const unmarkDeletion = useCallback((index: number) => {
    setState((prev) => {
      const newDeleted = new Set(prev.deletedIndices);
      newDeleted.delete(index);
      return { ...prev, deletedIndices: newDeleted };
    });
  }, []);

  const moveSelection = useCallback((direction: 'up' | 'down' | 'front' | 'back') => {
    setState((prev) => {
      const { pages, selectedIndices } = prev;
      if (selectedIndices.size === 0) return prev;

      const selected = Array.from(selectedIndices).sort((a, b) => a - b);
      const newPages = [...pages];

      switch (direction) {
        case 'up': {
          // Can't move up if first selected is at index 0
          if (selected[0] === 0) return prev;

          // Move each selected item up by swapping with the item before it
          for (const idx of selected) {
            if (idx > 0) {
              [newPages[idx - 1], newPages[idx]] = [newPages[idx]!, newPages[idx - 1]!];
            }
          }

          // Update selected indices
          const newSelected = new Set(selected.map((i) => i - 1));
          return { ...prev, pages: newPages, selectedIndices: newSelected };
        }

        case 'down': {
          // Can't move down if last selected is at end
          if (selected[selected.length - 1] === pages.length - 1) return prev;

          // Move each selected item down (reverse order to avoid conflicts)
          for (let i = selected.length - 1; i >= 0; i--) {
            const idx = selected[i]!;
            if (idx < pages.length - 1) {
              [newPages[idx], newPages[idx + 1]] = [newPages[idx + 1]!, newPages[idx]!];
            }
          }

          // Update selected indices
          const newSelected = new Set(selected.map((i) => i + 1));
          return { ...prev, pages: newPages, selectedIndices: newSelected };
        }

        case 'front': {
          // Extract selected items
          const selectedItems = selected.map((i) => pages[i]!);
          // Remove selected from current positions
          const remaining = pages.filter((_, i) => !selectedIndices.has(i));
          // Place selected at front
          const reordered = [...selectedItems, ...remaining];

          // Update selected indices (now at front)
          const newSelected = new Set(selectedItems.map((_, i) => i));
          return { ...prev, pages: reordered, selectedIndices: newSelected };
        }

        case 'back': {
          // Extract selected items
          const selectedItems = selected.map((i) => pages[i]!);
          // Remove selected from current positions
          const remaining = pages.filter((_, i) => !selectedIndices.has(i));
          // Place selected at back
          const reordered = [...remaining, ...selectedItems];

          // Update selected indices (now at back)
          const newSelected = new Set(
            selectedItems.map((_, i) => remaining.length + i)
          );
          return { ...prev, pages: reordered, selectedIndices: newSelected };
        }
      }
    });
  }, []);

  const reorderPages = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;

    setState((prev) => {
      const { pages, selectedIndices } = prev;
      const newPages = [...pages];

      // Get all selected indices including the dragged one
      const draggedIndices = selectedIndices.has(fromIndex)
        ? Array.from(selectedIndices).sort((a, b) => a - b)
        : [fromIndex];

      // Extract the items being moved
      const movedItems = draggedIndices.map((i) => pages[i]!);

      // Remove moved items from array (in reverse to maintain indices)
      for (let i = draggedIndices.length - 1; i >= 0; i--) {
        newPages.splice(draggedIndices[i]!, 1);
      }

      // Calculate adjusted target index
      // When dragging forward, we want to insert AFTER the target item
      // When dragging backward, we want to insert BEFORE the target item
      let adjustedTarget = toIndex;
      const movedBeforeTarget = draggedIndices.filter(idx => idx < toIndex).length;

      if (toIndex > fromIndex) {
        // Moving forward: subtract moved items that were before target, but add 1 to insert AFTER
        adjustedTarget = toIndex - movedBeforeTarget + 1;
        // Clamp to array bounds
        adjustedTarget = Math.min(adjustedTarget, newPages.length);
      } else {
        // Moving backward: just subtract moved items that were before target
        adjustedTarget = toIndex - movedBeforeTarget;
      }

      // Insert moved items at target position
      newPages.splice(adjustedTarget, 0, ...movedItems);

      // Update selected indices to new positions
      const newSelected = new Set(
        movedItems.map((_, i) => adjustedTarget + i)
      );

      return { ...prev, pages: newPages, selectedIndices: newSelected };
    });
  }, []);

  // ==========================================================================
  // Save Changes
  // ==========================================================================

  const saveChanges = useCallback(async (): Promise<boolean> => {
    if (!pendingChanges.hasChanges) return true;

    setState((prev) => ({ ...prev, isSaving: true, error: null }));

    try {
      // Build operations array
      const operations: PageModifyOperation[] = [];

      // Add deletion operations
      pendingChanges.deletions.forEach((path) => {
        operations.push({ type: 'delete', path });
      });

      // Add reorder operations
      pendingChanges.reorders.forEach((reorder) => {
        operations.push({
          type: 'reorder',
          path: reorder.originalPath,
          newIndex: reorder.newIndex,
        });
      });

      const response = await fetch(`/api/archives/${fileId}/pages/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operations }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to modify pages');
      }

      setState((prev) => ({ ...prev, isSaving: false }));
      return true;
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isSaving: false,
        error: err instanceof Error ? err.message : 'Failed to save changes',
      }));
      return false;
    }
  }, [fileId, pendingChanges]);

  // ==========================================================================
  // Reset
  // ==========================================================================

  const resetChanges = useCallback(() => {
    setState((prev) => ({
      ...prev,
      pages: [...prev.originalPages],
      deletedIndices: new Set(),
      selectedIndices: new Set(),
      error: null,
    }));
    setLastSelectedIndex(null);
  }, []);

  // ==========================================================================
  // Initial Load
  // ==========================================================================

  useEffect(() => {
    loadPages();
    checkModifiability();
  }, [loadPages, checkModifiability]);

  return {
    state,
    pendingChanges,
    selectPage,
    selectAll,
    clearSelection,
    markForDeletion,
    unmarkDeletion,
    moveSelection,
    reorderPages,
    loadPages,
    checkModifiability,
    saveChanges,
    resetChanges,
  };
}
