/**
 * useBulkActions Hook
 *
 * Provides bulk action handlers for the SeriesPage.
 * Wraps API calls with loading state and toast notifications.
 */

import { useState, useCallback } from 'react';
import { useToast } from '../../../contexts/ToastContext';
import { useCollections } from '../../../contexts/CollectionsContext';
import {
  bulkMarkSeriesRead,
  bulkMarkSeriesUnread,
  bulkSetSeriesHidden,
  getSeriesIssues,
} from '../../../services/api/series';
import { useMetadataJob } from '../../../contexts/MetadataJobContext';

export interface UseBulkActionsReturn {
  /** Whether a bulk operation is in progress */
  isLoading: boolean;
  /** Mark all issues in selected series as read */
  markAsRead: (seriesIds: string[]) => Promise<void>;
  /** Mark all issues in selected series as unread */
  markAsUnread: (seriesIds: string[]) => Promise<void>;
  /** Add selected series to favorites */
  addToFavorites: (seriesIds: string[]) => Promise<void>;
  /** Remove selected series from favorites */
  removeFromFavorites: (seriesIds: string[]) => Promise<void>;
  /** Add selected series to want to read */
  addToWantToRead: (seriesIds: string[]) => Promise<void>;
  /** Remove selected series from want to read */
  removeFromWantToRead: (seriesIds: string[]) => Promise<void>;
  /** Hide selected series */
  hideSeries: (seriesIds: string[]) => Promise<void>;
  /** Unhide selected series */
  unhideSeries: (seriesIds: string[]) => Promise<void>;
  /** Fetch metadata for all issues in selected series */
  fetchMetadata: (seriesIds: string[]) => Promise<void>;
}

export interface UseBulkActionsOptions {
  /** Callback after successful operation (e.g., to refetch data) */
  onSuccess?: () => void;
}

export function useBulkActions(options: UseBulkActionsOptions = {}): UseBulkActionsReturn {
  const { onSuccess } = options;
  const { addToast } = useToast();
  const { toggleFavorite, toggleWantToRead, isFavorite, isWantToRead } = useCollections();
  const { startJob } = useMetadataJob();

  const [isLoading, setIsLoading] = useState(false);

  // Helper to wrap async operations with loading state and error handling
  const withLoading = useCallback(
    async (operation: () => Promise<void>, successMessage: string) => {
      setIsLoading(true);
      try {
        await operation();
        addToast('success', successMessage);
        onSuccess?.();
      } catch (err) {
        console.error('Bulk operation failed:', err);
        addToast('error', 'Operation failed. Please try again.');
      } finally {
        setIsLoading(false);
      }
    },
    [addToast, onSuccess]
  );

  const markAsRead = useCallback(
    async (seriesIds: string[]) => {
      await withLoading(async () => {
        await bulkMarkSeriesRead(seriesIds);
      }, `Marked all issues as read in ${seriesIds.length} series`);
    },
    [withLoading]
  );

  const markAsUnread = useCallback(
    async (seriesIds: string[]) => {
      await withLoading(async () => {
        await bulkMarkSeriesUnread(seriesIds);
      }, `Marked all issues as unread in ${seriesIds.length} series`);
    },
    [withLoading]
  );

  const addToFavorites = useCallback(
    async (seriesIds: string[]) => {
      await withLoading(async () => {
        // Only add series that aren't already favorites
        const toAdd = seriesIds.filter((id) => !isFavorite(id));
        for (const seriesId of toAdd) {
          await toggleFavorite(seriesId);
        }
      }, `Added ${seriesIds.length} series to favorites`);
    },
    [withLoading, isFavorite, toggleFavorite]
  );

  const removeFromFavorites = useCallback(
    async (seriesIds: string[]) => {
      await withLoading(async () => {
        // Only remove series that are favorites
        const toRemove = seriesIds.filter((id) => isFavorite(id));
        for (const seriesId of toRemove) {
          await toggleFavorite(seriesId);
        }
      }, `Removed ${seriesIds.length} series from favorites`);
    },
    [withLoading, isFavorite, toggleFavorite]
  );

  const addToWantToRead = useCallback(
    async (seriesIds: string[]) => {
      await withLoading(async () => {
        // Only add series that aren't already in want to read
        const toAdd = seriesIds.filter((id) => !isWantToRead(id));
        for (const seriesId of toAdd) {
          await toggleWantToRead(seriesId);
        }
      }, `Added ${seriesIds.length} series to want to read`);
    },
    [withLoading, isWantToRead, toggleWantToRead]
  );

  const removeFromWantToRead = useCallback(
    async (seriesIds: string[]) => {
      await withLoading(async () => {
        // Only remove series that are in want to read
        const toRemove = seriesIds.filter((id) => isWantToRead(id));
        for (const seriesId of toRemove) {
          await toggleWantToRead(seriesId);
        }
      }, `Removed ${seriesIds.length} series from want to read`);
    },
    [withLoading, isWantToRead, toggleWantToRead]
  );

  const hideSeries = useCallback(
    async (seriesIds: string[]) => {
      await withLoading(async () => {
        await bulkSetSeriesHidden(seriesIds, true);
      }, `Hidden ${seriesIds.length} series`);
    },
    [withLoading]
  );

  const unhideSeries = useCallback(
    async (seriesIds: string[]) => {
      await withLoading(async () => {
        await bulkSetSeriesHidden(seriesIds, false);
      }, `Unhidden ${seriesIds.length} series`);
    },
    [withLoading]
  );

  const fetchMetadata = useCallback(
    async (seriesIds: string[]) => {
      setIsLoading(true);
      try {
        // Collect all file IDs from selected series
        const allFileIds: string[] = [];
        for (const seriesId of seriesIds) {
          const result = await getSeriesIssues(seriesId, { limit: 1000 });
          allFileIds.push(...result.issues.map((issue) => issue.id));
        }

        if (allFileIds.length > 0) {
          startJob(allFileIds);
          addToast('info', `Started metadata fetch for ${allFileIds.length} issues`);
        } else {
          addToast('info', 'No issues found in selected series');
        }
      } catch (err) {
        console.error('Failed to start metadata fetch:', err);
        addToast('error', 'Failed to start metadata fetch');
      } finally {
        setIsLoading(false);
      }
    },
    [addToast, startJob]
  );

  return {
    isLoading,
    markAsRead,
    markAsUnread,
    addToFavorites,
    removeFromFavorites,
    addToWantToRead,
    removeFromWantToRead,
    hideSeries,
    unhideSeries,
    fetchMetadata,
  };
}
