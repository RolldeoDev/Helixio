/**
 * useLibraries Hook
 *
 * React Query hooks for library management operations.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import {
  getLibraries,
  getLibrary,
  createLibrary,
  updateLibrary,
  deleteLibrary,
} from '../../services/api/libraries';
import type { Library } from '../../services/api/libraries';

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch all libraries with their stats
 */
export function useLibraries() {
  return useQuery({
    queryKey: queryKeys.libraries.list(),
    queryFn: async () => {
      const response = await getLibraries();
      return response.libraries;
    },
    staleTime: 60 * 1000, // Libraries don't change often
  });
}

/**
 * Fetch a single library by ID
 */
export function useLibrary(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.libraries.detail(id!),
    queryFn: () => getLibrary(id!),
    enabled: !!id,
  });
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Create a new library
 */
export function useCreateLibrary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createLibrary,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.libraries.all });
    },
  });
}

/**
 * Update an existing library
 */
export function useUpdateLibrary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateLibrary>[1] }) =>
      updateLibrary(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.libraries.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.libraries.list() });
    },
  });
}

/**
 * Delete a library
 */
export function useDeleteLibrary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteLibrary,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.libraries.all });
    },
  });
}

// =============================================================================
// Utility Hooks
// =============================================================================

/**
 * Get a library from cache without fetching
 */
export function useLibraryFromCache(id: string | null | undefined): Library | undefined {
  const queryClient = useQueryClient();

  if (!id) return undefined;

  // Try to get from detail cache
  const detail = queryClient.getQueryData<Library>(queryKeys.libraries.detail(id));
  if (detail) return detail;

  // Try to get from list cache
  const list = queryClient.getQueryData<Library[]>(queryKeys.libraries.list());
  return list?.find((lib) => lib.id === id);
}

/**
 * Invalidate all library-related queries
 */
export function useInvalidateLibraries() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.libraries.all });
  };
}
