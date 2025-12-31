/**
 * useIssueSelection Hook
 *
 * Manages issue selection state for bulk operations in SeriesDetailPage.
 * Handles shift-click, ctrl/cmd-click, and checkbox-based selection.
 */

import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NavigationOrigin } from '../contexts/BreadcrumbContext';

export interface Issue {
  id: string;
  filename: string;
}

export interface UseIssueSelectionOptions {
  /** The series ID for navigation context */
  seriesId: string | undefined;
  /** The series name for navigation context */
  seriesName: string | undefined;
  /** The list of issues in the series */
  issues: Issue[];
}

export interface UseIssueSelectionResult {
  /** Set of selected file IDs */
  selectedFiles: Set<string>;
  /** Number of currently selected files */
  selectedCount: number;
  /** Handle click on an issue card (supports shift/ctrl/cmd modifiers) */
  handleIssueClick: (fileId: string, e: React.MouseEvent) => void;
  /** Handle checkbox selection change */
  handleSelectionChange: (fileId: string, selected: boolean) => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Select all issues */
  selectAll: () => void;
  /** Get target IDs for bulk operations (selected or specific file) */
  getTargetIds: (fileId?: string) => string[];
  /** Check if a file is selected */
  isSelected: (fileId: string) => boolean;
}

/**
 * Hook for managing issue selection in a series.
 *
 * Features:
 * - Shift-click: Toggle selection of a single issue
 * - Ctrl/Cmd-click: Toggle selection of a single issue
 * - Plain click: Navigate to issue detail page
 * - Checkbox: Direct selection toggle
 */
export function useIssueSelection({
  seriesId,
  seriesName,
  issues,
}: UseIssueSelectionOptions): UseIssueSelectionResult {
  const navigate = useNavigate();
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  // Computed selected count
  const selectedCount = useMemo(() => selectedFiles.size, [selectedFiles]);

  // Handle click on issue card
  const handleIssueClick = useCallback(
    (fileId: string, e: React.MouseEvent) => {
      // Handle shift-click for range selection (toggle selection)
      if (e.shiftKey) {
        setSelectedFiles((prev) => {
          const next = new Set(prev);
          if (next.has(fileId)) {
            next.delete(fileId);
          } else {
            next.add(fileId);
          }
          return next;
        });
        return;
      }

      // Handle ctrl/cmd-click for multi-select (toggle selection)
      if (e.ctrlKey || e.metaKey) {
        setSelectedFiles((prev) => {
          const next = new Set(prev);
          if (next.has(fileId)) {
            next.delete(fileId);
          } else {
            next.add(fileId);
          }
          return next;
        });
        return;
      }

      // Plain click (no modifiers) - navigate to issue detail
      const navState: NavigationOrigin = {
        from: 'series',
        seriesId: seriesId,
        seriesName: seriesName,
      };
      navigate(`/issue/${fileId}`, { state: navState });
    },
    [navigate, seriesId, seriesName]
  );

  // Handle selection change from checkbox
  const handleSelectionChange = useCallback((fileId: string, selected: boolean) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(fileId);
      } else {
        next.delete(fileId);
      }
      return next;
    });
  }, []);

  // Clear all selections
  const clearSelection = useCallback(() => {
    setSelectedFiles(new Set());
  }, []);

  // Select all issues
  const selectAll = useCallback(() => {
    setSelectedFiles(new Set(issues.map((issue) => issue.id)));
  }, [issues]);

  // Get target IDs for bulk operations
  // If a fileId is provided and it's selected, return all selected IDs
  // Otherwise, return just the provided fileId or empty array
  const getTargetIds = useCallback(
    (fileId?: string): string[] => {
      if (fileId && selectedFiles.has(fileId)) {
        return Array.from(selectedFiles);
      }
      return fileId ? [fileId] : [];
    },
    [selectedFiles]
  );

  // Check if a file is selected
  const isSelected = useCallback(
    (fileId: string): boolean => selectedFiles.has(fileId),
    [selectedFiles]
  );

  return {
    selectedFiles,
    selectedCount,
    handleIssueClick,
    handleSelectionChange,
    clearSelection,
    selectAll,
    getTargetIds,
    isSelected,
  };
}
