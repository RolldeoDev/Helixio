/**
 * Collections Context
 *
 * Manages collections (groups of series and files) with backend persistence.
 * Supports system collections (Favorites, Want to Read) and user-created collections.
 * Collections can contain both series and individual files (hybrid model).
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
import {
  Collection,
  CollectionWithItems,
  getCollections as apiGetCollections,
  getCollection as apiGetCollection,
  createCollection as apiCreateCollection,
  updateCollection as apiUpdateCollection,
  deleteCollection as apiDeleteCollection,
  addToCollection as apiAddToCollection,
  removeFromCollection as apiRemoveFromCollection,
  getCollectionsForItem as apiGetCollectionsForItem,
  toggleFavorite as apiToggleFavorite,
  toggleWantToRead as apiToggleWantToRead,
} from '../services/api.service';

// Re-export types from api.service
export type { Collection, CollectionWithItems } from '../services/api.service';

// =============================================================================
// Types
// =============================================================================

export interface CollectionsContextValue {
  // State
  collections: Collection[];
  isLoading: boolean;
  error: string | null;

  // System collection IDs for quick access
  favoritesId: string | null;
  wantToReadId: string | null;

  // Data fetching
  refreshCollections: () => Promise<void>;
  getCollectionWithItems: (id: string) => Promise<CollectionWithItems | null>;

  // Collection CRUD
  createCollection: (name: string, description?: string) => Promise<Collection | null>;
  updateCollection: (id: string, updates: { name?: string; description?: string }) => Promise<void>;
  deleteCollection: (id: string) => Promise<boolean>;

  // Item operations
  addToCollection: (
    collectionId: string,
    items: Array<{ seriesId?: string; fileId?: string }>
  ) => Promise<void>;
  removeFromCollection: (
    collectionId: string,
    items: Array<{ seriesId?: string; fileId?: string }>
  ) => Promise<void>;

  // System collection toggles
  toggleFavorite: (seriesId?: string, fileId?: string) => Promise<boolean>;
  toggleWantToRead: (seriesId?: string, fileId?: string) => Promise<boolean>;

  // Query helpers
  isFavorite: (seriesId?: string, fileId?: string) => boolean;
  isWantToRead: (seriesId?: string, fileId?: string) => boolean;
  isInCollection: (collectionId: string, seriesId?: string, fileId?: string) => boolean;
  getCollectionsForItem: (seriesId?: string, fileId?: string) => Collection[];
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
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cache for item memberships (optimistic updates)
  const [itemMemberships, setItemMemberships] = useState<Map<string, Set<string>>>(new Map());

  // Get system collection IDs
  const favoritesId = collections.find((c) => c.systemKey === 'favorites')?.id ?? null;
  const wantToReadId = collections.find((c) => c.systemKey === 'want-to-read')?.id ?? null;

  // Build item key for membership tracking
  const getItemKey = (seriesId?: string, fileId?: string): string => {
    if (seriesId) return `series:${seriesId}`;
    if (fileId) return `file:${fileId}`;
    return '';
  };

  // =============================================================================
  // Data Fetching
  // =============================================================================

  const refreshCollections = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await apiGetCollections();
      setCollections(result.collections);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load collections');
      console.error('Error loading collections:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getCollectionWithItems = useCallback(async (id: string): Promise<CollectionWithItems | null> => {
    try {
      return await apiGetCollection(id);
    } catch (err) {
      console.error('Error loading collection:', err);
      return null;
    }
  }, []);

  // Load collections on mount
  useEffect(() => {
    refreshCollections();
  }, [refreshCollections]);

  // =============================================================================
  // Collection CRUD
  // =============================================================================

  const createCollection = useCallback(async (
    name: string,
    description?: string
  ): Promise<Collection | null> => {
    try {
      const collection = await apiCreateCollection(name, description);
      setCollections((prev) => [...prev, collection]);
      return collection;
    } catch (err) {
      console.error('Error creating collection:', err);
      return null;
    }
  }, []);

  const updateCollection = useCallback(async (
    id: string,
    updates: { name?: string; description?: string }
  ): Promise<void> => {
    try {
      const updated = await apiUpdateCollection(id, updates);
      setCollections((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...updated } : c))
      );
    } catch (err) {
      console.error('Error updating collection:', err);
    }
  }, []);

  const deleteCollection = useCallback(async (id: string): Promise<boolean> => {
    // Find collection first to check if it's a system collection
    const collection = collections.find((c) => c.id === id);
    if (collection?.isSystem) {
      console.error('Cannot delete system collections');
      return false;
    }

    try {
      await apiDeleteCollection(id);
      setCollections((prev) => prev.filter((c) => c.id !== id));

      // Clear memberships for this collection
      setItemMemberships((prev) => {
        const next = new Map(prev);
        for (const [key, collectionIds] of next) {
          if (collectionIds.has(id)) {
            const newSet = new Set(collectionIds);
            newSet.delete(id);
            next.set(key, newSet);
          }
        }
        return next;
      });

      return true;
    } catch (err) {
      console.error('Error deleting collection:', err);
      return false;
    }
  }, [collections]);

  // =============================================================================
  // Item Operations
  // =============================================================================

  const addToCollection = useCallback(async (
    collectionId: string,
    items: Array<{ seriesId?: string; fileId?: string }>
  ): Promise<void> => {
    try {
      await apiAddToCollection(collectionId, items);

      // Update optimistic memberships
      setItemMemberships((prev) => {
        const next = new Map(prev);
        for (const item of items) {
          const key = getItemKey(item.seriesId, item.fileId);
          if (key) {
            const existing = next.get(key) ?? new Set();
            existing.add(collectionId);
            next.set(key, existing);
          }
        }
        return next;
      });

      // Update item count
      setCollections((prev) =>
        prev.map((c) =>
          c.id === collectionId
            ? { ...c, itemCount: (c.itemCount ?? 0) + items.length }
            : c
        )
      );
    } catch (err) {
      console.error('Error adding to collection:', err);
    }
  }, []);

  const removeFromCollection = useCallback(async (
    collectionId: string,
    items: Array<{ seriesId?: string; fileId?: string }>
  ): Promise<void> => {
    try {
      await apiRemoveFromCollection(collectionId, items);

      // Update optimistic memberships
      setItemMemberships((prev) => {
        const next = new Map(prev);
        for (const item of items) {
          const key = getItemKey(item.seriesId, item.fileId);
          if (key) {
            const existing = next.get(key);
            if (existing) {
              existing.delete(collectionId);
              next.set(key, existing);
            }
          }
        }
        return next;
      });

      // Update item count
      setCollections((prev) =>
        prev.map((c) =>
          c.id === collectionId
            ? { ...c, itemCount: Math.max(0, (c.itemCount ?? 0) - items.length) }
            : c
        )
      );
    } catch (err) {
      console.error('Error removing from collection:', err);
    }
  }, []);

  // =============================================================================
  // System Collection Toggles
  // =============================================================================

  const toggleFavorite = useCallback(async (
    seriesId?: string,
    fileId?: string
  ): Promise<boolean> => {
    try {
      const result = await apiToggleFavorite(seriesId, fileId);
      const key = getItemKey(seriesId, fileId);

      if (key && favoritesId) {
        setItemMemberships((prev) => {
          const next = new Map(prev);
          const existing = next.get(key) ?? new Set();
          if (result.added) {
            existing.add(favoritesId);
          } else {
            existing.delete(favoritesId);
          }
          next.set(key, existing);
          return next;
        });

        // Update favorites count
        setCollections((prev) =>
          prev.map((c) =>
            c.id === favoritesId
              ? { ...c, itemCount: (c.itemCount ?? 0) + (result.added ? 1 : -1) }
              : c
          )
        );
      }

      return result.added;
    } catch (err) {
      console.error('Error toggling favorite:', err);
      return false;
    }
  }, [favoritesId]);

  const toggleWantToRead = useCallback(async (
    seriesId?: string,
    fileId?: string
  ): Promise<boolean> => {
    try {
      const result = await apiToggleWantToRead(seriesId, fileId);
      const key = getItemKey(seriesId, fileId);

      if (key && wantToReadId) {
        setItemMemberships((prev) => {
          const next = new Map(prev);
          const existing = next.get(key) ?? new Set();
          if (result.added) {
            existing.add(wantToReadId);
          } else {
            existing.delete(wantToReadId);
          }
          next.set(key, existing);
          return next;
        });

        // Update want to read count
        setCollections((prev) =>
          prev.map((c) =>
            c.id === wantToReadId
              ? { ...c, itemCount: (c.itemCount ?? 0) + (result.added ? 1 : -1) }
              : c
          )
        );
      }

      return result.added;
    } catch (err) {
      console.error('Error toggling want to read:', err);
      return false;
    }
  }, [wantToReadId]);

  // =============================================================================
  // Query Helpers
  // =============================================================================

  const isFavorite = useCallback((seriesId?: string, fileId?: string): boolean => {
    if (!favoritesId) return false;
    const key = getItemKey(seriesId, fileId);
    return key ? (itemMemberships.get(key)?.has(favoritesId) ?? false) : false;
  }, [favoritesId, itemMemberships]);

  const isWantToRead = useCallback((seriesId?: string, fileId?: string): boolean => {
    if (!wantToReadId) return false;
    const key = getItemKey(seriesId, fileId);
    return key ? (itemMemberships.get(key)?.has(wantToReadId) ?? false) : false;
  }, [wantToReadId, itemMemberships]);

  const isInCollection = useCallback((
    collectionId: string,
    seriesId?: string,
    fileId?: string
  ): boolean => {
    const key = getItemKey(seriesId, fileId);
    return key ? (itemMemberships.get(key)?.has(collectionId) ?? false) : false;
  }, [itemMemberships]);

  const getCollectionsForItem = useCallback((
    seriesId?: string,
    fileId?: string
  ): Collection[] => {
    const key = getItemKey(seriesId, fileId);
    if (!key) return [];
    const collectionIds = itemMemberships.get(key);
    if (!collectionIds || collectionIds.size === 0) return [];
    return collections.filter((c) => collectionIds.has(c.id));
  }, [collections, itemMemberships]);


  // =============================================================================
  // Context Value
  // =============================================================================

  const value: CollectionsContextValue = {
    // State
    collections,
    isLoading,
    error,
    favoritesId,
    wantToReadId,

    // Data fetching
    refreshCollections,
    getCollectionWithItems,

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
    getCollectionsForItem,
  };

  return (
    <CollectionsContext.Provider value={value}>
      {children}
    </CollectionsContext.Provider>
  );
}

// Export a hook to prefetch memberships for an item
export function usePrefetchItemMemberships() {
  return useCallback(async (seriesId?: string, fileId?: string) => {
    // This triggers a fetch that populates the cache
    await apiGetCollectionsForItem(seriesId, fileId);
  }, []);
}
