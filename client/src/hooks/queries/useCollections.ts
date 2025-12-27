/**
 * useCollections Hook
 *
 * React Query hooks for collection management with optimistic updates.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import {
  getCollections,
  getCollection,
  getCollectionExpanded,
  getSystemCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  addToCollection,
  removeFromCollection,
  getCollectionsForItem,
  toggleFavorite,
  toggleWantToRead,
  bulkToggleFavorite,
  bulkToggleWantToRead,
} from '../../services/api/series';
import type { Collection, CollectionWithItems } from '../../services/api/series';

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch all collections for the current user
 */
export function useCollections() {
  return useQuery({
    queryKey: queryKeys.collections.list(),
    queryFn: async () => {
      const response = await getCollections();
      return response.collections;
    },
  });
}

/**
 * Fetch a single collection by ID
 */
export function useCollection(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.collections.detail(id!),
    queryFn: () => getCollection(id!),
    enabled: !!id,
  });
}

/**
 * Fetch collection with expanded items (series/file details)
 */
export function useCollectionExpanded(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.collections.expanded(id!),
    queryFn: () => getCollectionExpanded(id!),
    enabled: !!id,
  });
}

/**
 * Fetch a system collection by key (favorites, want-to-read)
 */
export function useSystemCollection(key: 'favorites' | 'want-to-read') {
  return useQuery({
    queryKey: ['collections', 'system', key] as const,
    queryFn: () => getSystemCollection(key),
  });
}

/**
 * Get collections containing a specific item
 */
export function useCollectionsForItem(seriesId?: string, fileId?: string) {
  return useQuery({
    queryKey: queryKeys.collections.forItem(seriesId, fileId),
    queryFn: () => getCollectionsForItem(seriesId, fileId),
    enabled: !!(seriesId || fileId),
  });
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Create a new collection
 */
export function useCreateCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      deck?: string;
      options?: {
        rating?: number;
        notes?: string;
        visibility?: 'public' | 'private' | 'unlisted';
        readingMode?: 'single' | 'double' | 'webtoon';
        tags?: string;
      };
    }) => createCollection(data.name, data.description, data.deck, data.options),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collections.list() });
    },
  });
}

/**
 * Update an existing collection
 */
export function useUpdateCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateCollection>[1] }) =>
      updateCollection(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collections.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.collections.list() });
    },
  });
}

/**
 * Delete a collection
 */
export function useDeleteCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCollection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
    },
  });
}

/**
 * Add an item to a collection
 */
export function useAddToCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      collectionId,
      seriesId,
      fileId,
      notes,
    }: {
      collectionId: string;
      seriesId?: string;
      fileId?: string;
      notes?: string;
    }) => addToCollection(collectionId, [{ seriesId, fileId, notes }]),
    onSuccess: (_, { collectionId, seriesId, fileId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collections.detail(collectionId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.collections.forItem(seriesId, fileId),
      });
    },
  });
}

/**
 * Remove an item from a collection
 */
export function useRemoveFromCollection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      collectionId,
      seriesId,
      fileId,
    }: {
      collectionId: string;
      seriesId?: string;
      fileId?: string;
    }) => removeFromCollection(collectionId, [{ seriesId, fileId }]),
    onSuccess: (_, { collectionId, seriesId, fileId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collections.detail(collectionId) });
      queryClient.invalidateQueries({
        queryKey: queryKeys.collections.forItem(seriesId, fileId),
      });
    },
  });
}

/**
 * Toggle favorite status for a series or file
 */
export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ seriesId, fileId }: { seriesId?: string; fileId?: string }) =>
      toggleFavorite(seriesId, fileId),
    onSuccess: (_, { seriesId, fileId }) => {
      // Invalidate collections list
      queryClient.invalidateQueries({ queryKey: queryKeys.collections.list() });
      // Invalidate forItem query
      queryClient.invalidateQueries({
        queryKey: queryKeys.collections.forItem(seriesId, fileId),
      });
      // Invalidate series if applicable
      if (seriesId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.series.detail(seriesId) });
      }
    },
  });
}

/**
 * Toggle want-to-read status for a series or file
 */
export function useToggleWantToRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ seriesId, fileId }: { seriesId?: string; fileId?: string }) =>
      toggleWantToRead(seriesId, fileId),
    onSuccess: (_, { seriesId, fileId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collections.list() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.collections.forItem(seriesId, fileId),
      });
    },
  });
}

/**
 * Bulk toggle favorites for multiple series
 */
export function useBulkToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ seriesIds, action }: { seriesIds: string[]; action: 'add' | 'remove' }) =>
      bulkToggleFavorite(seriesIds, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.series.all });
    },
  });
}

/**
 * Bulk toggle want-to-read for multiple series
 */
export function useBulkToggleWantToRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ seriesIds, action }: { seriesIds: string[]; action: 'add' | 'remove' }) =>
      bulkToggleWantToRead(seriesIds, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
    },
  });
}

// =============================================================================
// Utility Hooks
// =============================================================================

/**
 * Invalidate all collection-related queries
 */
export function useInvalidateCollections() {
  const queryClient = useQueryClient();

  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.collections.all });
  };
}

// Re-export types for convenience
export type { Collection, CollectionWithItems };
