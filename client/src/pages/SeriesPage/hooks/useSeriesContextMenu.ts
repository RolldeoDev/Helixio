/**
 * useSeriesContextMenu Hook
 *
 * Manages context menu state and actions for series cards.
 * Integrates with the unified menu system and bulk actions.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUnifiedMenu, buildMenuItems, MENU_PRESETS, MenuEntityData } from '../../../components/UnifiedMenu';
import { GridItem } from '../../../services/api/series';
import { useBulkActions } from './useBulkActions';

export interface UseSeriesContextMenuReturn {
  /** Menu state (isOpen, position, context) */
  menuState: ReturnType<typeof useUnifiedMenu>['menuState'];
  /** Handle right-click on a series card */
  handleContextMenu: (
    e: React.MouseEvent,
    seriesId: string,
    selectedIds: Set<string>,
    ensureSelected?: () => void
  ) => void;
  /** Close the menu */
  closeMenu: () => void;
  /** Handle a menu action */
  handleAction: (actionId: string) => void;
  /** Get menu items for current context */
  getMenuItems: () => ReturnType<typeof buildMenuItems>;
  /** Whether a bulk operation is in progress */
  isLoading: boolean;
}

export interface UseSeriesContextMenuOptions {
  /** Current grid items (for looking up series data) */
  items: GridItem[];
  /** Callback after successful operation (e.g., to refetch data) */
  onSuccess?: () => void;
  /** Callback to clear selection after operation */
  onClearSelection?: () => void;
  /** Callback when merge action is triggered with selected series IDs */
  onMerge?: (seriesIds: string[]) => void;
}

export function useSeriesContextMenu({
  items,
  onSuccess,
  onClearSelection,
  onMerge,
}: UseSeriesContextMenuOptions): UseSeriesContextMenuReturn {
  const navigate = useNavigate();

  // Bulk actions hook
  const bulkActions = useBulkActions({
    onSuccess: () => {
      onSuccess?.();
      onClearSelection?.();
    },
  });

  // Get entity data for conditional menu items (hide/unhide visibility)
  const getEntityData = useCallback(
    (seriesId: string): MenuEntityData | undefined => {
      const item = items.find((i) => i.id === seriesId && i.itemType === 'series');
      if (!item || item.itemType !== 'series') return undefined;

      return {
        isHidden: item.series.isHidden,
      };
    },
    [items]
  );

  // Unified menu hook
  const {
    menuState,
    handleContextMenu: handleUnifiedContextMenu,
    closeMenu,
  } = useUnifiedMenu({
    entityType: 'series',
    getEntityData,
  });

  // Wrap context menu handler to match our interface
  const handleContextMenu = useCallback(
    (
      e: React.MouseEvent,
      seriesId: string,
      selectedIds: Set<string>,
      ensureSelected?: () => void
    ) => {
      handleUnifiedContextMenu(e, seriesId, selectedIds, ensureSelected);
    },
    [handleUnifiedContextMenu]
  );

  // Handle menu actions
  const handleAction = useCallback(
    async (actionId: string) => {
      const context = menuState.context;
      if (!context) return;

      const { entityId, selectedIds } = context;
      closeMenu();

      switch (actionId) {
        case 'viewSeries':
          navigate(`/series/${entityId}`);
          break;

        case 'fetchSeriesMetadata':
          await bulkActions.fetchMetadata(selectedIds);
          break;

        case 'markAllRead':
          await bulkActions.markAsRead(selectedIds);
          break;

        case 'markAllUnread':
          await bulkActions.markAsUnread(selectedIds);
          break;

        case 'hideSeries':
          await bulkActions.hideSeries(selectedIds);
          break;

        case 'unhideSeries':
          await bulkActions.unhideSeries(selectedIds);
          break;

        case 'mergeWith':
          // Trigger merge modal with selected series
          if (onMerge) {
            // Use selected IDs if multiple selected, otherwise just the clicked entity
            const idsToMerge = selectedIds.length >= 2 ? selectedIds : [entityId];
            onMerge(idsToMerge);
          }
          break;

        case 'linkSeries':
          // Navigate to link series page
          navigate(`/series/${entityId}/link`);
          break;

        default:
          console.warn('Unknown series menu action:', actionId);
      }
    },
    [menuState.context, closeMenu, navigate, bulkActions, onMerge]
  );

  // Get menu items for rendering
  const getMenuItems = useCallback(() => {
    if (!menuState.context) return [];
    return buildMenuItems(MENU_PRESETS.seriesCard, menuState.context);
  }, [menuState.context]);

  return {
    menuState,
    handleContextMenu,
    closeMenu,
    handleAction,
    getMenuItems,
    isLoading: bulkActions.isLoading,
  };
}
