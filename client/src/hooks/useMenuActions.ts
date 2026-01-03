/**
 * useMenuActions Hook
 *
 * Centralized handler for all menu actions across the application.
 * Eliminates duplicate action handling code in pages and components.
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMetadataJob } from '../contexts/MetadataJobContext';
import { useDownloads } from '../contexts/DownloadContext';
import { useApiToast } from './useApiToast';
import {
  markAsCompleted,
  markAsIncomplete,
  rebuildCache,
  setSeriesHidden,
  type Series,
  type SeriesIssue,
} from '../services/api.service';
import type { MenuContext, MenuActionId } from '../components/UnifiedMenu/types';

// =============================================================================
// Types
// =============================================================================

export interface UseMenuActionsOptions {
  /** Callback when data needs refreshing after an action */
  onRefresh?: () => void | Promise<void>;
  /** Callback to clear selection after bulk operations */
  onClearSelection?: () => void;
  /** Current series (for series-level actions) */
  series?: Series | null;
  /** All issues in current view (for series-level bulk operations) */
  issues?: SeriesIssue[];
  /** Callback when Edit Series modal should open */
  onEditSeries?: () => void;
  /** Callback when Merge Series modal should open */
  onMergeWith?: () => void;
  /** Callback when Series Metadata Search modal should open */
  onFetchSeriesMetadata?: () => void;
  /** Callback when Link Series modal should open */
  onLinkSeries?: () => void;
}

export interface UseMenuActionsReturn {
  /** Handle a menu action */
  handleAction: (actionId: MenuActionId | string, context: MenuContext) => Promise<void>;
  /** Whether an operation is currently in progress */
  isOperating: boolean;
  /** Open metadata editor for given file IDs */
  openMetadataEditor: (fileIds: string[]) => void;
  /** Close metadata editor */
  closeMetadataEditor: () => void;
  /** File IDs currently being edited (null if editor is closed) */
  editingMetadataFileIds: string[] | null;
  /** Open collection picker for given file IDs */
  openCollectionPicker: (fileIds: string[]) => void;
  /** Close collection picker */
  closeCollectionPicker: () => void;
  /** File IDs for collection picker (empty if picker is closed) */
  collectionPickerFileIds: string[];
  /** Open rename dialog for a file */
  openRenameDialog: (fileId: string) => void;
  /** Close rename dialog */
  closeRenameDialog: () => void;
  /** File ID being renamed (null if dialog is closed) */
  renamingFileId: string | null;
  /** Open page editor for a file */
  openPageEditor: (fileId: string) => void;
  /** Close page editor */
  closePageEditor: () => void;
  /** File ID being edited in page editor (null if editor is closed) */
  editingPagesFileId: string | null;
}

// =============================================================================
// Hook
// =============================================================================

export function useMenuActions(options: UseMenuActionsOptions = {}): UseMenuActionsReturn {
  const {
    onRefresh,
    onClearSelection: _onClearSelection, // Reserved for future use
    series,
    issues = [],
    onEditSeries,
    onMergeWith,
    onFetchSeriesMetadata,
    onLinkSeries,
  } = options;
  void _onClearSelection; // Suppress unused warning

  const navigate = useNavigate();
  const { startJob } = useMetadataJob();
  const { requestBulkDownload, requestSeriesDownload } = useDownloads();
  const { addToast } = useApiToast();

  // Modal states
  const [isOperating, setIsOperating] = useState(false);
  const [editingMetadataFileIds, setEditingMetadataFileIds] = useState<string[] | null>(null);
  const [collectionPickerFileIds, setCollectionPickerFileIds] = useState<string[]>([]);
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [editingPagesFileId, setEditingPagesFileId] = useState<string | null>(null);

  // Modal openers/closers
  const openMetadataEditor = useCallback((fileIds: string[]) => {
    setEditingMetadataFileIds(fileIds);
  }, []);

  const closeMetadataEditor = useCallback(() => {
    setEditingMetadataFileIds(null);
  }, []);

  const openCollectionPicker = useCallback((fileIds: string[]) => {
    setCollectionPickerFileIds(fileIds);
  }, []);

  const closeCollectionPicker = useCallback(() => {
    setCollectionPickerFileIds([]);
  }, []);

  const openRenameDialog = useCallback((fileId: string) => {
    setRenamingFileId(fileId);
  }, []);

  const closeRenameDialog = useCallback(() => {
    setRenamingFileId(null);
  }, []);

  const openPageEditor = useCallback((fileId: string) => {
    setEditingPagesFileId(fileId);
  }, []);

  const closePageEditor = useCallback(() => {
    setEditingPagesFileId(null);
  }, []);

  /**
   * Handle all menu actions
   */
  const handleAction = useCallback(
    async (actionId: MenuActionId | string, context: MenuContext) => {
      const { entityId, selectedIds } = context;

      // Determine target IDs (selected items or just the clicked item)
      const targetIds = selectedIds.includes(entityId) && selectedIds.length > 0
        ? selectedIds
        : [entityId];

      setIsOperating(true);

      try {
        switch (actionId) {
          // -----------------------------------------------------------------
          // File/Issue Actions
          // -----------------------------------------------------------------

          case 'read':
            // Navigate to reader with the file
            navigate(`/reader/${entityId}`);
            break;

          case 'markRead':
            await Promise.all(targetIds.map((id) => markAsCompleted(id)));
            addToast('success', `Marked ${targetIds.length} item(s) as read`);
            await onRefresh?.();
            break;

          case 'markUnread':
            await Promise.all(targetIds.map((id) => markAsIncomplete(id)));
            addToast('success', `Marked ${targetIds.length} item(s) as unread`);
            await onRefresh?.();
            break;

          case 'addToCollection':
            openCollectionPicker(targetIds);
            break;

          case 'fetchMetadata':
            startJob(targetIds);
            break;

          case 'editMetadata':
            openMetadataEditor(targetIds);
            break;

          case 'rename':
            if (targetIds.length === 1 && targetIds[0]) {
              // Rename dialog will be opened by the consumer
              // since it needs the current filename which isn't in the context
              openRenameDialog(targetIds[0]);
            }
            break;

          case 'editPages':
            if (targetIds.length === 1 && targetIds[0]) {
              openPageEditor(targetIds[0]);
            }
            break;

          case 'rebuildCache':
            await rebuildCache({ fileIds: targetIds, type: 'full' });
            addToast('success', 'Cache rebuild started');
            break;

          case 'download':
            // Always use bulk download - single file download requires filename
            // which isn't available in the menu context
            requestBulkDownload(targetIds, series?.name || 'Download');
            break;

          case 'quarantine':
            // TODO: Implement quarantine API call
            addToast('info', 'Quarantine not yet implemented');
            break;

          case 'restore':
            // TODO: Implement restore API call
            addToast('info', 'Restore not yet implemented');
            break;

          case 'delete':
            // TODO: Implement delete with confirmation
            addToast('info', 'Delete not yet implemented');
            break;

          // -----------------------------------------------------------------
          // Series Actions
          // -----------------------------------------------------------------

          case 'viewSeries':
            navigate(`/series/${entityId}`);
            break;

          case 'editSeries':
            onEditSeries?.();
            break;

          case 'fetchSeriesMetadata':
            onFetchSeriesMetadata?.();
            break;

          case 'fetchAllIssuesMetadata':
            if (issues.length > 0) {
              const allIssueIds = issues.map((i) => i.id);
              startJob(allIssueIds);
            }
            break;

          case 'markAllRead':
            if (issues.length > 0) {
              await Promise.all(issues.map((i) => markAsCompleted(i.id)));
              addToast('success', 'All issues marked as read');
              await onRefresh?.();
            }
            break;

          case 'markAllUnread':
            if (issues.length > 0) {
              await Promise.all(issues.map((i) => markAsIncomplete(i.id)));
              addToast('success', 'All issues marked as unread');
              await onRefresh?.();
            }
            break;

          case 'downloadAll':
            if (series && issues.length > 0) {
              requestSeriesDownload(series.id, series.name);
            }
            break;

          case 'mergeWith':
            onMergeWith?.();
            break;

          case 'linkSeries':
            onLinkSeries?.();
            break;

          case 'hideSeries':
            await setSeriesHidden(entityId, true);
            addToast('success', 'Series hidden');
            await onRefresh?.();
            break;

          case 'unhideSeries':
            await setSeriesHidden(entityId, false);
            addToast('success', 'Series unhidden');
            await onRefresh?.();
            break;

          case 'rebuildAllCache':
            if (issues.length > 0) {
              const allFileIds = issues.map((i) => i.id);
              await rebuildCache({ fileIds: allFileIds, type: 'full' });
              addToast('success', 'Cache rebuild started');
            }
            break;

          // -----------------------------------------------------------------
          // Collection Actions
          // -----------------------------------------------------------------

          case 'editCollection':
            // TODO: Implement edit collection modal
            addToast('info', 'Edit collection not yet implemented');
            break;

          default:
            console.warn(`Unknown menu action: ${actionId}`);
        }
      } catch (err) {
        addToast(
          'error',
          err instanceof Error ? err.message : `Failed to perform action: ${actionId}`
        );
      } finally {
        setIsOperating(false);
      }
    },
    [
      navigate,
      startJob,
      requestBulkDownload,
      requestSeriesDownload,
      addToast,
      onRefresh,
      series,
      issues,
      onEditSeries,
      onMergeWith,
      onFetchSeriesMetadata,
      onLinkSeries,
      openMetadataEditor,
      openCollectionPicker,
      openRenameDialog,
      openPageEditor,
    ]
  );

  return {
    handleAction,
    isOperating,
    editingMetadataFileIds,
    openMetadataEditor,
    closeMetadataEditor,
    collectionPickerFileIds,
    openCollectionPicker,
    closeCollectionPicker,
    renamingFileId,
    openRenameDialog,
    closeRenameDialog,
    editingPagesFileId,
    openPageEditor,
    closePageEditor,
  };
}
