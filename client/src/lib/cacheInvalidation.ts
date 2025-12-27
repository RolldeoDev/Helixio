/**
 * Cache Invalidation Utility
 *
 * Centralized cache invalidation functions for React Query.
 * Use these functions to ensure consistent cache updates across the app.
 */

import { queryClient, queryKeys } from './queryClient';

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
 * Invalidate all file-related queries
 */
export function invalidateFiles() {
  queryClient.invalidateQueries({ queryKey: queryKeys.files.all });
}

/**
 * Invalidate a specific file
 */
export function invalidateFile(fileId: string) {
  queryClient.invalidateQueries({ queryKey: queryKeys.files.detail(fileId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.files.pages(fileId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.files.coverInfo(fileId) });
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
 */
export function invalidateAfterCoverUpdate(options: {
  seriesId?: string;
  fileId?: string;
}) {
  if (options.seriesId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.series.cover(options.seriesId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.series.detail(options.seriesId) });
    // Also invalidate series list to refresh thumbnails
    queryClient.invalidateQueries({ queryKey: queryKeys.series.list() });
    queryClient.invalidateQueries({ queryKey: queryKeys.series.grid() });
  }

  if (options.fileId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.files.coverInfo(options.fileId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.files.detail(options.fileId) });
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
  };
}
