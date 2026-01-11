/**
 * Cache Invalidation Utility
 *
 * Centralized cache invalidation functions for React Query.
 * Use these functions to ensure consistent cache updates across the app.
 */

import { queryClient, queryKeys } from './queryClient';
import { updateCoverVersion } from '../services/api/files';

// =============================================================================
// Individual Invalidation Functions
// =============================================================================

/**
 * Invalidate all library-related queries
 */
export function invalidateLibraries() {
  queryClient.invalidateQueries({ queryKey: queryKeys.libraries.all });
}

/**
 * Invalidate a specific library
 */
export function invalidateLibrary(libraryId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.libraries.detail(libraryId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.libraries.folders(libraryId) });
}

/**
 * Invalidate all file-related queries (BROAD - use sparingly)
 */
export function invalidateFiles() {
  queryClient.invalidateQueries({ queryKey: queryKeys.files.all });
}

/**
 * Invalidate a specific file (SURGICAL)
 * Only invalidates this file's detail queries and file list queries
 */
export function invalidateFile(fileId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.files.detail(fileId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.files.pages(fileId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.files.coverInfo(fileId) });

  // Also invalidate file lists using predicate (more targeted than invalidateFiles())
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey;
      return key[0] === 'files' && key[1] === 'list';
    },
  });
}

/**
 * Invalidate all series-related queries
 */
export function invalidateSeries() {
  queryClient.invalidateQueries({ queryKey: queryKeys.series.all });
}

/**
 * Invalidate a specific series
 */
export function invalidateSeriesDetail(seriesId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.series.detail(seriesId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.series.issues(seriesId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.series.cover(seriesId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.series.nextIssue(seriesId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.series.progress(seriesId) });
}

/**
 * Invalidate all collection-related queries
 */
export function invalidateCollections() {
  queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
}

/**
 * Invalidate a specific collection
 */
export function invalidateCollection(collectionId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.collections.detail(collectionId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.collections.expanded(collectionId) });
}

/**
 * Invalidate all stats queries
 */
export function invalidateStats() {
  queryClient.invalidateQueries({ queryKey: queryKeys.stats.all });
}

/**
 * Invalidate all achievement queries
 */
export function invalidateAchievements() {
  queryClient.invalidateQueries({ queryKey: queryKeys.achievements.all });
}

/**
 * Invalidate all reading-related queries
 */
export function invalidateReading() {
  queryClient.invalidateQueries({ queryKey: queryKeys.reading.all });
}

/**
 * Invalidate reading progress for a specific file
 */
export function invalidateReadingProgress(fileId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.reading.progress(fileId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.reading.continueReading() });
  queryClient.invalidateQueries({ queryKey: queryKeys.reading.queue() });
}

/**
 * Invalidate metadata job queries
 */
export function invalidateMetadataJobs() {
  queryClient.invalidateQueries({ queryKey: queryKeys.metadataJobs.all });
}

/**
 * Invalidate library scan queries
 */
export function invalidateLibraryScans() {
  queryClient.invalidateQueries({ queryKey: queryKeys.libraryScans.all });
}

// =============================================================================
// Composite Invalidation Functions
// =============================================================================

/**
 * Invalidate caches after a metadata job completes.
 * Metadata jobs can update series info, file metadata, and covers.
 */
export function invalidateAfterMetadataJob(options?: {
  seriesIds?: string[];
  fileIds?: string[];
}) {
  // Always invalidate series and files lists
  invalidateSeries();
  invalidateFiles();

  // Invalidate specific series if provided
  if (options?.seriesIds) {
    options.seriesIds.forEach((id) => invalidateSeriesDetail(id));
  }

  // Invalidate specific files if provided
  if (options?.fileIds) {
    options.fileIds.forEach((id) => invalidateFile(id));
  }

  // Stats may have changed
  invalidateStats();

  // Mark metadata jobs as needing refresh
  invalidateMetadataJobs();
}

/**
 * Invalidate caches after a library scan completes.
 * Library scans discover new files, create series, and extract covers.
 */
export function invalidateAfterLibraryScan(libraryId?: string) {
  // New files may have been discovered
  invalidateFiles();

  // New series may have been created
  invalidateSeries();

  // Library stats (file counts) have changed
  invalidateLibraries();
  if (libraryId) {
    invalidateLibrary(libraryId);
  }

  // Stats need recalculation
  invalidateStats();

  // Scan status queries
  invalidateLibraryScans();
}

/**
 * Invalidate caches after cover updates.
 * Used when series or file covers are changed.
 * This ensures covers are refreshed everywhere they are displayed.
 * Also updates cover version for cache-busting browser cache.
 */
export function invalidateAfterCoverUpdate(options: {
  seriesId?: string;
  fileId?: string;
  /** New cover hash (used as cache-buster version) */
  coverHash?: string;
}) {
  const version = options.coverHash || Date.now().toString();

  if (options.seriesId) {
    // Update cover version for cache-busting
    updateCoverVersion(options.seriesId, version);

    queryClient.invalidateQueries({ queryKey: queryKeys.series.cover(options.seriesId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.series.detail(options.seriesId) });
    // Also invalidate series list to refresh thumbnails
    queryClient.invalidateQueries({ queryKey: queryKeys.series.list() });
    queryClient.invalidateQueries({ queryKey: queryKeys.series.grid() });
    // Invalidate issues for this series (in case any issue is displayed with series cover)
    queryClient.invalidateQueries({ queryKey: queryKeys.series.issues(options.seriesId) });
    // Invalidate collections that might display this series
    queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
  }

  if (options.fileId) {
    // Update cover version for cache-busting
    updateCoverVersion(options.fileId, version);

    queryClient.invalidateQueries({ queryKey: queryKeys.files.coverInfo(options.fileId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.files.detail(options.fileId) });
    // Invalidate all series lists and grids since this file's cover might be used as series cover
    queryClient.invalidateQueries({ queryKey: queryKeys.series.list() });
    queryClient.invalidateQueries({ queryKey: queryKeys.series.grid() });
    // Invalidate series issues queries to refresh the cover in issue listings
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === 'series' && query.queryKey[1] === 'issues',
    });
    // Invalidate collections that might display this file
    queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
  }
}

/**
 * Invalidate caches after series merge/update operations.
 */
export function invalidateAfterSeriesUpdate(seriesIds: string[]) {
  // Invalidate specific series
  seriesIds.forEach((id) => invalidateSeriesDetail(id));

  // Invalidate series lists
  queryClient.invalidateQueries({ queryKey: queryKeys.series.list() });
  queryClient.invalidateQueries({ queryKey: queryKeys.series.grid() });
  queryClient.invalidateQueries({ queryKey: queryKeys.series.duplicates() });

  // Files may have been re-linked
  invalidateFiles();

  // Stats may have changed
  invalidateStats();
}

/**
 * Invalidate caches after collection changes.
 */
export function invalidateAfterCollectionUpdate(collectionId?: string) {
  if (collectionId) {
    invalidateCollection(collectionId);
  }
  // Always refresh the list
  queryClient.invalidateQueries({ queryKey: queryKeys.collections.list() });
}

/**
 * Invalidate caches after reading progress updates.
 */
export function invalidateAfterReadingUpdate(fileId: string, seriesId?: string) {
  invalidateReadingProgress(fileId);

  if (seriesId) {
    // Series progress/next issue may have changed
    queryClient.invalidateQueries({ queryKey: queryKeys.series.nextIssue(seriesId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.series.progress(seriesId) });
  }

  // Reading history changed
  queryClient.invalidateQueries({ queryKey: queryKeys.reading.history() });

  // Achievements may have been unlocked
  invalidateAchievements();

  // Stats need update
  invalidateStats();
}

/**
 * Full cache invalidation - use sparingly.
 * Invalidates all React Query caches.
 */
export function invalidateAll() {
  queryClient.invalidateQueries();
}

// =============================================================================
// Optimistic Update Functions
// =============================================================================

/**
 * Optimistically update a file in cache.
 * Updates both detail cache and all list caches.
 * Returns previous data for rollback on error.
 *
 * @example
 * const previousData = optimisticUpdateFile(fileId, { status: 'read' });
 * // On error: rollbackFileUpdate(fileId, previousData);
 */
export function optimisticUpdateFile<T = any>(
  fileId: string,
  updates: Partial<T>
): { detail: T | undefined; lists: Map<string, any> } {
  // Store previous data for rollback
  const previousDetail = queryClient.getQueryData<T>(queryKeys.files.detail(fileId));
  const previousLists = new Map<string, any>();

  // Update detail cache
  queryClient.setQueryData<T>(queryKeys.files.detail(fileId), (old) =>
    old ? { ...old, ...updates } : old
  );

  // Update in all list caches using predicate
  queryClient.setQueriesData(
    {
      predicate: (query) => {
        const key = query.queryKey;
        return key[0] === 'files' && key[1] === 'list';
      },
    },
    (old: any) => {
      if (!old) return old;

      // Store previous data for rollback
      previousLists.set(JSON.stringify(old.queryKey), old);

      // Update file in list
      const hasData = Array.isArray(old.data);
      if (hasData) {
        return {
          ...old,
          data: old.data.map((f: any) => (f.id === fileId ? { ...f, ...updates } : f)),
        };
      }

      return old;
    }
  );

  return { detail: previousDetail, lists: previousLists };
}

/**
 * Rollback optimistic file update on error.
 */
export function rollbackFileUpdate(
  fileId: string,
  previousData: { detail: any; lists: Map<string, any> }
) {
  // Restore detail cache
  if (previousData.detail !== undefined) {
    queryClient.setQueryData(queryKeys.files.detail(fileId), previousData.detail);
  }

  // Restore list caches
  previousData.lists.forEach((data, key) => {
    const queryKey = JSON.parse(key);
    queryClient.setQueryData(queryKey, data);
  });
}

/**
 * Optimistically update a series in cache.
 * Updates both detail cache and list caches.
 */
export function optimisticUpdateSeries<T = any>(
  seriesId: string,
  updates: Partial<T>
): { detail: T | undefined; lists: Map<string, any> } {
  const previousDetail = queryClient.getQueryData<T>(queryKeys.series.detail(seriesId));
  const previousLists = new Map<string, any>();

  // Update detail cache
  queryClient.setQueryData<T>(queryKeys.series.detail(seriesId), (old) =>
    old ? { ...old, ...updates } : old
  );

  // Update in list caches
  queryClient.setQueriesData(
    {
      predicate: (query) => {
        const key = query.queryKey;
        return (
          (key[0] === 'series' && key[1] === 'list') || (key[0] === 'series' && key[1] === 'grid')
        );
      },
    },
    (old: any) => {
      if (!old) return old;

      previousLists.set(JSON.stringify(old.queryKey), old);

      if (Array.isArray(old.series)) {
        return {
          ...old,
          series: old.series.map((s: any) => (s.id === seriesId ? { ...s, ...updates } : s)),
        };
      }

      // Grid format
      if (Array.isArray(old.items)) {
        return {
          ...old,
          items: old.items.map((item: any) =>
            item.type === 'series' && item.id === seriesId ? { ...item, ...updates } : item
          ),
        };
      }

      return old;
    }
  );

  return { detail: previousDetail, lists: previousLists };
}

/**
 * Rollback optimistic series update on error.
 */
export function rollbackSeriesUpdate(
  seriesId: string,
  previousData: { detail: any; lists: Map<string, any> }
) {
  if (previousData.detail !== undefined) {
    queryClient.setQueryData(queryKeys.series.detail(seriesId), previousData.detail);
  }

  previousData.lists.forEach((data, key) => {
    const queryKey = JSON.parse(key);
    queryClient.setQueryData(queryKey, data);
  });
}

// =============================================================================
// Hook for components that need invalidation functions
// =============================================================================

/**
 * Returns all invalidation functions for use in components.
 * Prefer using specific functions directly for better tree-shaking.
 */
export function getInvalidationFunctions() {
  return {
    // Individual
    invalidateLibraries,
    invalidateLibrary,
    invalidateFiles,
    invalidateFile,
    invalidateSeries,
    invalidateSeriesDetail,
    invalidateCollections,
    invalidateCollection,
    invalidateStats,
    invalidateAchievements,
    invalidateReading,
    invalidateReadingProgress,
    invalidateMetadataJobs,
    invalidateLibraryScans,
    // Composite
    invalidateAfterMetadataJob,
    invalidateAfterLibraryScan,
    invalidateAfterCoverUpdate,
    invalidateAfterSeriesUpdate,
    invalidateAfterCollectionUpdate,
    invalidateAfterReadingUpdate,
    invalidateAll,
    // Optimistic updates
    optimisticUpdateFile,
    rollbackFileUpdate,
    optimisticUpdateSeries,
    rollbackSeriesUpdate,
  };
}
