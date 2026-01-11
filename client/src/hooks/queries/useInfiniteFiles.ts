/**
 * useInfiniteFiles Hook
 *
 * React Query infinite scroll hooks for files.
 * Enables seamless infinite scrolling through large file libraries.
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import {
  getLibraryFiles,
  getAllLibraryFiles,
  type GetFilesParams,
  type PaginatedResponse,
  type ComicFile,
} from '../../services/api/files';

// =============================================================================
// Types
// =============================================================================

export interface UseInfiniteFilesOptions extends Omit<GetFilesParams, 'page'> {
  libraryId?: string | null;
  enabled?: boolean;
}

// =============================================================================
// Infinite Query Hooks
// =============================================================================

/**
 * Fetch files with infinite scroll support.
 * Uses offset-based pagination (page number).
 *
 * @example
 * const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteFiles({
 *   libraryId: 'lib-123',
 *   limit: 50,
 * });
 *
 * // Flatten pages for virtual grid
 * const allFiles = data?.pages.flatMap(page => page.data) ?? [];
 */
export function useInfiniteFiles(options: UseInfiniteFilesOptions = {}) {
  const { libraryId, enabled = true, ...params } = options;

  // Create stable params for query key
  const queryParams = {
    libraryId: libraryId ?? 'all',
    ...params,
  };

  return useInfiniteQuery({
    queryKey: [...queryKeys.files.list(queryParams), 'infinite'],
    queryFn: async ({ pageParam = 1 }) => {
      const pageParams: GetFilesParams = {
        ...params,
        page: pageParam,
        limit: params.limit ?? 50,
      };

      if (libraryId) {
        return getLibraryFiles(libraryId, pageParams);
      }
      return getAllLibraryFiles(pageParams);
    },
    getNextPageParam: (lastPage: PaginatedResponse<ComicFile>) => {
      const { page, pages } = lastPage.pagination;
      // Return next page number if there are more pages, undefined otherwise
      return page < pages ? page + 1 : undefined;
    },
    initialPageParam: 1,
    enabled: enabled && (libraryId !== undefined || true),
    staleTime: 30 * 1000, // Match traditional useFiles staleTime
  });
}

// Re-export types for convenience
export type { ComicFile, PaginatedResponse, GetFilesParams };
