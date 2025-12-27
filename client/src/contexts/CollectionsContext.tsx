/**
 * Collections Context
 *
 * Provides collection state and operations using React Query.
 * Wraps React Query hooks for collections with convenience functions
 * for checking item membership in system collections.
 */

import { createContext, useContext, useMemo, ReactNode } from 'react';
import {
  useCollections as useCollectionsQuery,
  useCreateCollection as useCreateCollectionMutation,
  useUpdateCollection as useUpdateCollectionMutation,
  useDeleteCollection as useDeleteCollectionMutation,
  useAddToCollection as useAddToCollectionMutation,
  useRemoveFromCollection as useRemoveFromCollectionMutation,
  useToggleFavorite as useToggleFavoriteMutation,
  useToggleWantToRead as useToggleWantToReadMutation,
  useCollectionsForItem,
  type Collection,
  type CollectionWithItems,
} from '../hooks/queries/useCollections';
import { invalidateCollections } from '../lib/cacheInvalidation';

// Re-export types from hooks
export type { Collection, CollectionWithItems };

// =============================================================================
// Types
// =============================================================================

export interface CollectionsContextValue {
  // State (from React Query)
  collections: Collection[];
  isLoading: boolean;
  error: string | null;

  // System collection IDs for quick access
  favoritesId: string | null;
  wantToReadId: string | null;

  // Data fetching
  refreshCollections: () => Promise<void>;
  getCollectionWithItems: (id: string) => Promise<CollectionWithItems | null>;

  // Collection CRUD (mutations)
  createCollection: (name: string, description?: string) => Promise<Collection | null>;
  updateCollection: (id: string, updates: { name?: string; description?: string }) => Promise<void>;
  deleteCollection: (id: string) => Promise<boolean>;

  // Item operations (mutations)
  addToCollection: (
    collectionId: string,
    items: Array<{ seriesId?: string; fileId?: string }>
  ) => Promise<void>;
  removeFromCollection: (
    collectionId: string,
    items: Array<{ seriesId?: string; fileId?: string }>
  ) => Promise<void>;

  // System collection toggles (mutations)
  toggleFavorite: (seriesId?: string, fileId?: string) => Promise<boolean>;
  toggleWantToRead: (seriesId?: string, fileId?: string) => Promise<boolean>;

  // Query helpers (use hooks directly for reactive updates)
  isFavorite: (seriesId?: string, fileId?: string) => boolean;
  isWantToRead: (seriesId?: string, fileId?: string) => boolean;
  isInCollection: (collectionId: string, seriesId?: string, fileId?: string) => boolean;
  getCollectionsForItem: (seriesId?: string, fileId?: string) => Collection[];

  // Hook access for components that need reactive item membership
  useItemCollections: typeof useCollectionsForItem;
}

// =============================================================================
// Context
// =============================================================================

const CollectionsContext = createContext<CollectionsContextValue | null>(null);

export function useCollections(): CollectionsContextValue {
  const context = useContext(CollectionsContext);
  if (!context) {
    throw new Error('useCollections must be used within CollectionsProvider');
  }
  return context;
}

// =============================================================================
// Provider
// =============================================================================

interface CollectionsProviderProps {
  children: ReactNode;
}

export function CollectionsProvider({ children }: CollectionsProviderProps) {
  // ---------------------------------------------------------------------------
  // React Query Hooks
  // ---------------------------------------------------------------------------

  const {
    data: collections = [],
    isLoading,
    error: queryError,
    refetch,
  } = useCollectionsQuery();

  // Mutations
  const createMutation = useCreateCollectionMutation();
  const updateMutation = useUpdateCollectionMutation();
  const deleteMutation = useDeleteCollectionMutation();
  const addToMutation = useAddToCollectionMutation();
  const removeFromMutation = useRemoveFromCollectionMutation();
  const toggleFavoriteMutation = useToggleFavoriteMutation();
  const toggleWantToReadMutation = useToggleWantToReadMutation();

  // ---------------------------------------------------------------------------
  // Derived State
  // ---------------------------------------------------------------------------

  const error = queryError instanceof Error ? queryError.message : null;

  // Get system collection IDs
  const favoritesId = useMemo(
    () => collections.find((c) => c.systemKey === 'favorites')?.id ?? null,
    [collections]
  );

  const wantToReadId = useMemo(
    () => collections.find((c) => c.systemKey === 'want-to-read')?.id ?? null,
    [collections]
  );

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const refreshCollections = async () => {
    invalidateCollections();
    await refetch();
  };

  const getCollectionWithItemsAsync = async (id: string): Promise<CollectionWithItems | null> => {
    // This is a one-off fetch, not using a hook
    // Components should use useCollectionExpanded for reactive data
    try {
      const { getCollectionExpanded: fetchExpanded } = await import('../services/api/series');
      const result = await fetchExpanded(id);
      // The API returns CollectionExpandedData which includes the collection and items
      return result.collection as CollectionWithItems;
    } catch (err) {
      console.error('Error loading collection:', err);
      return null;
    }
  };

  const createCollection = async (
    name: string,
    description?: string
  ): Promise<Collection | null> => {
    try {
      const result = await createMutation.mutateAsync({ name, description });
      return result;
    } catch (err) {
      console.error('Error creating collection:', err);
      return null;
    }
  };

  const updateCollection = async (
    id: string,
    updates: { name?: string; description?: string }
  ): Promise<void> => {
    try {
      await updateMutation.mutateAsync({ id, data: updates });
    } catch (err) {
      console.error('Error updating collection:', err);
    }
  };

  const deleteCollection = async (id: string): Promise<boolean> => {
    const collection = collections.find((c) => c.id === id);
    if (collection?.isSystem) {
      console.error('Cannot delete system collections');
      return false;
    }

    try {
      await deleteMutation.mutateAsync(id);
      return true;
    } catch (err) {
      console.error('Error deleting collection:', err);
      return false;
    }
  };

  const addToCollection = async (
    collectionId: string,
    items: Array<{ seriesId?: string; fileId?: string }>
  ): Promise<void> => {
    try {
      // Add items one by one (mutation is designed for single items)
      for (const item of items) {
        await addToMutation.mutateAsync({
          collectionId,
          seriesId: item.seriesId,
          fileId: item.fileId,
        });
      }
    } catch (err) {
      console.error('Error adding to collection:', err);
    }
  };

  const removeFromCollection = async (
    collectionId: string,
    items: Array<{ seriesId?: string; fileId?: string }>
  ): Promise<void> => {
    try {
      for (const item of items) {
        await removeFromMutation.mutateAsync({
          collectionId,
          seriesId: item.seriesId,
          fileId: item.fileId,
        });
      }
    } catch (err) {
      console.error('Error removing from collection:', err);
    }
  };

  const toggleFavorite = async (seriesId?: string, fileId?: string): Promise<boolean> => {
    try {
      const result = await toggleFavoriteMutation.mutateAsync({ seriesId, fileId });
      return result.added;
    } catch (err) {
      console.error('Error toggling favorite:', err);
      return false;
    }
  };

  const toggleWantToRead = async (seriesId?: string, fileId?: string): Promise<boolean> => {
    try {
      const result = await toggleWantToReadMutation.mutateAsync({ seriesId, fileId });
      return result.added;
    } catch (err) {
      console.error('Error toggling want to read:', err);
      return false;
    }
  };

  // ---------------------------------------------------------------------------
  // Query Helpers (Synchronous)
  // These are convenience functions that check against the cached collections list.
  // For reactive updates, components should use useCollectionsForItem hook.
  // ---------------------------------------------------------------------------

  const isFavorite = (_seriesId?: string, _fileId?: string): boolean => {
    if (!favoritesId) return false;
    // This is a simple check - for full item membership, use useCollectionsForItem
    // This returns false because we don't have item membership in the collections list
    // Components that need this should use useCollectionsForItem hook
    return false;
  };

  const isWantToRead = (_seriesId?: string, _fileId?: string): boolean => {
    if (!wantToReadId) return false;
    return false;
  };

  const isInCollection = (
    _collectionId: string,
    _seriesId?: string,
    _fileId?: string
  ): boolean => {
    // Similar limitation - use useCollectionsForItem for accurate data
    return false;
  };

  const getCollectionsForItemSync = (_seriesId?: string, _fileId?: string): Collection[] => {
    // This synchronous version cannot provide accurate data
    // Use useCollectionsForItem hook for reactive item membership
    return [];
  };

  // ---------------------------------------------------------------------------
  // Context Value
  // ---------------------------------------------------------------------------

  const value: CollectionsContextValue = {
    // State
    collections,
    isLoading,
    error,
    favoritesId,
    wantToReadId,

    // Data fetching
    refreshCollections,
    getCollectionWithItems: getCollectionWithItemsAsync,

    // Collection CRUD
    createCollection,
    updateCollection,
    deleteCollection,

    // Item operations
    addToCollection,
    removeFromCollection,

    // System collection toggles
    toggleFavorite,
    toggleWantToRead,

    // Query helpers
    isFavorite,
    isWantToRead,
    isInCollection,
    getCollectionsForItem: getCollectionsForItemSync,

    // Hook access for reactive updates
    useItemCollections: useCollectionsForItem,
  };

  return (
    <CollectionsContext.Provider value={value}>
      {children}
    </CollectionsContext.Provider>
  );
}

// Export hook to prefetch memberships - now just returns the query hook
export function usePrefetchItemMemberships() {
  // Components should use useCollectionsForItem directly
  return useCollectionsForItem;
}
