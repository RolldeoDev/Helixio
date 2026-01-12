/**
 * useFolderFiles Hook
 *
 * Fetches files for a specific folder with automatic request cancellation
 * when the folder changes. Uses React Query with AbortController integration.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import {
  getLibraryFiles,
  getAllLibraryFiles,
  type ComicFile,
  type PaginatedResponse,
} from '../../services/api/files';

// =============================================================================
// Types
// =============================================================================

export interface UseFolderFilesOptions {
  libraryId?: string | null;
  folder: string | null;
  sort?: string;
  order?: 'asc' | 'desc';
  groupBy?: string;
  status?: string;
  limit?: number;
  enabled?: boolean;
}

export interface UseFolderFilesResult {
  files: ComicFile[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Fetch files for a specific folder with request cancellation support.
 *
 * When the folder changes, any in-flight request is automatically cancelled
 * and a new request is started for the selected folder.
 *
 * @param options - Query options including libraryId, folder path, sorting
 * @returns Files data, loading states, and refetch function
 */
export function useFolderFiles(options: UseFolderFilesOptions): UseFolderFilesResult {
  const {
    libraryId,
    folder,
    sort = 'filename',
    order = 'asc',
    groupBy,
    status,
    limit = 100,
    enabled = true,
  } = options;

  // Include folder in query key for per-folder caching
  // Each folder gets its own cache entry
  const queryKeyParams = {
    libraryId: libraryId ?? 'all',
    folder: folder ?? 'root',
    sort,
    order,
    groupBy,
    status,
    limit,
  };

  const query = useQuery({
    queryKey: queryKeys.files.folder(queryKeyParams),
    queryFn: async ({ signal }) => {
      // Build params with folder filter
      const params = {
        folder: folder || undefined, // API treats undefined/missing as "all files"
        sort,
        order,
        groupBy: groupBy !== 'none' ? groupBy : undefined,
        status,
        signal, // Pass signal for cancellation
        // Use pagination instead of all: true to avoid loading thousands of files
        page: 1,
        limit,
      };

      if (libraryId) {
        return getLibraryFiles(libraryId, params);
      }
      return getAllLibraryFiles(params);
    },
    enabled: enabled && (libraryId !== null || folder !== null),
    staleTime: 30 * 1000, // 30 seconds
    // Don't retry on abort errors (cancelled requests)
    retry: (failureCount, error) => {
      if (error instanceof Error && error.name === 'AbortError') {
        return false;
      }
      return failureCount < 3;
    },
  });

  return {
    files: query.data?.files ?? [],
    pagination: query.data?.pagination ?? { page: 1, limit, total: 0, pages: 0 },
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

// Re-export types for convenience
export type { ComicFile, PaginatedResponse };
