/**
 * React Query Configuration
 *
 * QueryClient setup with default options and type-safe query key factory.
 */

import { QueryClient } from '@tanstack/react-query';

// =============================================================================
// Query Client Configuration
// =============================================================================

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Prevent automatic refetch on window focus for most queries
      refetchOnWindowFocus: false,

      // Stale time: 30 seconds default (data considered fresh)
      staleTime: 30 * 1000,

      // Cache time: 5 minutes (how long unused data stays in cache)
      gcTime: 5 * 60 * 1000,

      // Retry logic
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors
        if (error instanceof Error && error.message.includes('HTTP 4')) {
          return false;
        }
        return failureCount < 3;
      },

      // Network mode: always fetch (don't pause when offline)
      networkMode: 'always',
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,

      // Global mutation error handling
      onError: (error) => {
        console.error('Mutation error:', error);
      },
    },
  },
});

// =============================================================================
// Query Key Factory
// =============================================================================

/**
 * Type-safe query key factory for consistent cache key management.
 *
 * Usage:
 * ```ts
 * // In a query hook:
 * useQuery({
 *   queryKey: queryKeys.libraries.list(),
 *   queryFn: () => getLibraries(),
 * });
 *
 * // For invalidation:
 * queryClient.invalidateQueries({ queryKey: queryKeys.libraries.all });
 * ```
 */
export const queryKeys = {
  // Libraries
  libraries: {
    all: ['libraries'] as const,
    list: () => [...queryKeys.libraries.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.libraries.all, 'detail', id] as const,
    folders: (id: string) => [...queryKeys.libraries.all, 'folders', id] as const,
    allFolders: () => [...queryKeys.libraries.all, 'allFolders'] as const,
    scan: (libraryId: string, jobId: string) =>
      [...queryKeys.libraries.all, 'scan', libraryId, jobId] as const,
    activeScan: (libraryId: string) =>
      [...queryKeys.libraries.all, 'activeScan', libraryId] as const,
  },

  // Files
  files: {
    all: ['files'] as const,
    list: (params: object) => [...queryKeys.files.all, 'list', params] as const,
    detail: (id: string) => [...queryKeys.files.all, 'detail', id] as const,
    pages: (id: string) => [...queryKeys.files.all, 'pages', id] as const,
    coverInfo: (id: string) => [...queryKeys.files.all, 'coverInfo', id] as const,
  },

  // Series
  series: {
    all: ['series'] as const,
    list: (options?: object) => [...queryKeys.series.all, 'list', options] as const,
    grid: (options?: object) => [...queryKeys.series.all, 'grid', options] as const,
    detail: (id: string) => [...queryKeys.series.all, 'detail', id] as const,
    issues: (id: string, options?: object) => [...queryKeys.series.all, 'issues', id, options] as const,
    cover: (id: string) => [...queryKeys.series.all, 'cover', id] as const,
    publishers: () => [...queryKeys.series.all, 'publishers'] as const,
    genres: () => [...queryKeys.series.all, 'genres'] as const,
    nextIssue: (id: string) => [...queryKeys.series.all, 'nextIssue', id] as const,
    progress: (id: string) => [...queryKeys.series.all, 'progress', id] as const,
    duplicates: () => [...queryKeys.series.all, 'duplicates'] as const,
  },

  // Collections
  collections: {
    all: ['collections'] as const,
    list: () => [...queryKeys.collections.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.collections.all, 'detail', id] as const,
    expanded: (id: string) => [...queryKeys.collections.all, 'expanded', id] as const,
    forItem: (seriesId?: string, fileId?: string) =>
      [...queryKeys.collections.all, 'forItem', { seriesId, fileId }] as const,
  },

  // Metadata Jobs
  metadataJobs: {
    all: ['metadataJobs'] as const,
    list: () => [...queryKeys.metadataJobs.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.metadataJobs.all, 'detail', id] as const,
  },

  // Library Scans
  libraryScans: {
    all: ['libraryScans'] as const,
    list: () => [...queryKeys.libraryScans.all, 'list'] as const,
    detail: (libraryId: string, jobId: string) =>
      [...queryKeys.libraryScans.all, 'detail', libraryId, jobId] as const,
    active: (libraryId: string) =>
      [...queryKeys.libraryScans.all, 'active', libraryId] as const,
  },

  // Achievements
  achievements: {
    all: ['achievements'] as const,
    list: () => [...queryKeys.achievements.all, 'list'] as const,
    summary: () => [...queryKeys.achievements.all, 'summary'] as const,
    recent: (limit?: number) => [...queryKeys.achievements.all, 'recent', limit] as const,
  },

  // Stats
  stats: {
    all: ['stats'] as const,
    aggregated: (libraryId?: string) => [...queryKeys.stats.all, 'aggregated', libraryId] as const,
    summary: (libraryId?: string) => [...queryKeys.stats.all, 'summary', libraryId] as const,
    entity: (type: string, name: string) => [...queryKeys.stats.all, 'entity', type, name] as const,
  },

  // Reading
  reading: {
    all: ['reading'] as const,
    progress: (fileId: string) => [...queryKeys.reading.all, 'progress', fileId] as const,
    queue: () => [...queryKeys.reading.all, 'queue'] as const,
    history: (options?: object) => [...queryKeys.reading.all, 'history', options] as const,
    continueReading: () => [...queryKeys.reading.all, 'continueReading'] as const,
    presets: () => [...queryKeys.reading.all, 'presets'] as const,
  },

  // Global Search
  globalSearch: {
    all: ['globalSearch'] as const,
    results: (query: string, types?: string[]) =>
      [...queryKeys.globalSearch.all, 'results', query, types] as const,
  },

  // Themes
  themes: {
    all: ['themes'] as const,
    list: () => [...queryKeys.themes.all, 'list'] as const,
    active: () => [...queryKeys.themes.all, 'active'] as const,
  },
} as const;
