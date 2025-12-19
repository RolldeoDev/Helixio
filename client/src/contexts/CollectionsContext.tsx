/**
 * Collections Context
 *
 * Manages collections (groups of related comics) and reading lists.
 * Collections can be auto-generated from SeriesGroup/StoryArc metadata
 * or manually created by users.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';

// =============================================================================
// Types
// =============================================================================

export type CollectionType = 'collection' | 'reading-list' | 'smart-collection';

export interface Collection {
  id: string;
  name: string;
  description?: string;
  type: CollectionType;
  fileIds: string[];
  coverFileId?: string;
  createdAt: string;
  updatedAt: string;
  // For smart collections - auto-generated filter
  smartFilter?: {
    field: string;
    value: string;
  };
  // For reading lists - ordered
  isOrdered?: boolean;
}

export interface ReadingListItem {
  fileId: string;
  position: number;
  completed: boolean;
  completedAt?: string;
}

export interface ReadingList extends Collection {
  type: 'reading-list';
  isOrdered: true;
  items: ReadingListItem[];
  currentIndex: number;
}

export interface CollectionsState {
  collections: Collection[];
  readingLists: ReadingList[];
  isLoading: boolean;
}

export interface CollectionsContextValue extends CollectionsState {
  // Collection actions
  createCollection: (name: string, description?: string) => Collection;
  updateCollection: (id: string, updates: Partial<Pick<Collection, 'name' | 'description' | 'coverFileId'>>) => void;
  deleteCollection: (id: string) => void;
  addToCollection: (collectionId: string, fileIds: string[]) => void;
  removeFromCollection: (collectionId: string, fileIds: string[]) => void;

  // Reading list actions
  createReadingList: (name: string, description?: string) => ReadingList;
  updateReadingList: (id: string, updates: Partial<Pick<ReadingList, 'name' | 'description'>>) => void;
  deleteReadingList: (id: string) => void;
  addToReadingList: (listId: string, fileIds: string[], position?: number) => void;
  removeFromReadingList: (listId: string, fileIds: string[]) => void;
  reorderReadingList: (listId: string, fileIds: string[]) => void;
  markAsRead: (listId: string, fileId: string) => void;
  markAsUnread: (listId: string, fileId: string) => void;
  getNextInReadingList: (listId: string) => string | null;

  // Smart collections from metadata
  generateFromSeriesGroup: (seriesGroup: string, fileIds: string[]) => Collection;
  generateFromStoryArc: (storyArc: string, fileIds: string[]) => ReadingList;

  // Utility
  getCollectionById: (id: string) => Collection | null;
  getReadingListById: (id: string) => ReadingList | null;
  isFileInCollection: (collectionId: string, fileId: string) => boolean;
  isFileInReadingList: (listId: string, fileId: string) => boolean;
}

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY_COLLECTIONS = 'helixio-collections';
const STORAGE_KEY_READING_LISTS = 'helixio-reading-lists';

// =============================================================================
// Helper Functions
// =============================================================================

function generateId(): string {
  return Math.random().toString(36).substring(2, 11);
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
  const [isLoading, setIsLoading] = useState(true);

  // Load collections from localStorage
  const [collections, setCollections] = useState<Collection[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_COLLECTIONS);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Ignore parse errors
    }
    return [];
  });

  // Load reading lists from localStorage
  const [readingLists, setReadingLists] = useState<ReadingList[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_READING_LISTS);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Ignore parse errors
    }
    return [];
  });

  // Mark as loaded
  useEffect(() => {
    setIsLoading(false);
  }, []);

  // Save collections to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_COLLECTIONS, JSON.stringify(collections));
  }, [collections]);

  // Save reading lists to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_READING_LISTS, JSON.stringify(readingLists));
  }, [readingLists]);

  // ---------------------------------------------------------------------------
  // Collection Actions
  // ---------------------------------------------------------------------------

  const createCollection = useCallback((name: string, description?: string): Collection => {
    const newCollection: Collection = {
      id: generateId(),
      name,
      description,
      type: 'collection',
      fileIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setCollections(prev => [...prev, newCollection]);
    return newCollection;
  }, []);

  const updateCollection = useCallback((id: string, updates: Partial<Pick<Collection, 'name' | 'description' | 'coverFileId'>>) => {
    setCollections(prev => prev.map(c =>
      c.id === id
        ? { ...c, ...updates, updatedAt: new Date().toISOString() }
        : c
    ));
  }, []);

  const deleteCollection = useCallback((id: string) => {
    setCollections(prev => prev.filter(c => c.id !== id));
  }, []);

  const addToCollection = useCallback((collectionId: string, fileIds: string[]) => {
    setCollections(prev => prev.map(c =>
      c.id === collectionId
        ? {
            ...c,
            fileIds: [...new Set([...c.fileIds, ...fileIds])],
            updatedAt: new Date().toISOString(),
          }
        : c
    ));
  }, []);

  const removeFromCollection = useCallback((collectionId: string, fileIds: string[]) => {
    const fileIdSet = new Set(fileIds);
    setCollections(prev => prev.map(c =>
      c.id === collectionId
        ? {
            ...c,
            fileIds: c.fileIds.filter(id => !fileIdSet.has(id)),
            updatedAt: new Date().toISOString(),
          }
        : c
    ));
  }, []);

  // ---------------------------------------------------------------------------
  // Reading List Actions
  // ---------------------------------------------------------------------------

  const createReadingList = useCallback((name: string, description?: string): ReadingList => {
    const newList: ReadingList = {
      id: generateId(),
      name,
      description,
      type: 'reading-list',
      fileIds: [],
      isOrdered: true,
      items: [],
      currentIndex: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setReadingLists(prev => [...prev, newList]);
    return newList;
  }, []);

  const updateReadingList = useCallback((id: string, updates: Partial<Pick<ReadingList, 'name' | 'description'>>) => {
    setReadingLists(prev => prev.map(list =>
      list.id === id
        ? { ...list, ...updates, updatedAt: new Date().toISOString() }
        : list
    ));
  }, []);

  const deleteReadingList = useCallback((id: string) => {
    setReadingLists(prev => prev.filter(list => list.id !== id));
  }, []);

  const addToReadingList = useCallback((listId: string, fileIds: string[], position?: number) => {
    setReadingLists(prev => prev.map(list => {
      if (list.id !== listId) return list;

      const existingFileIds = new Set(list.fileIds);
      const newFileIds = fileIds.filter(id => !existingFileIds.has(id));

      if (newFileIds.length === 0) return list;

      const newItems: ReadingListItem[] = newFileIds.map((fileId, index) => ({
        fileId,
        position: position !== undefined
          ? position + index
          : list.items.length + index,
        completed: false,
      }));

      let updatedItems: ReadingListItem[];

      if (position !== undefined) {
        // Insert at specific position
        const before = list.items.filter(item => item.position < position);
        const after = list.items.filter(item => item.position >= position).map(item => ({
          ...item,
          position: item.position + newItems.length,
        }));
        updatedItems = [...before, ...newItems, ...after];
      } else {
        // Append to end
        updatedItems = [...list.items, ...newItems];
      }

      // Re-normalize positions
      updatedItems = updatedItems.sort((a, b) => a.position - b.position).map((item, index) => ({
        ...item,
        position: index,
      }));

      return {
        ...list,
        fileIds: [...list.fileIds, ...newFileIds],
        items: updatedItems,
        updatedAt: new Date().toISOString(),
      };
    }));
  }, []);

  const removeFromReadingList = useCallback((listId: string, fileIds: string[]) => {
    const fileIdSet = new Set(fileIds);

    setReadingLists(prev => prev.map(list => {
      if (list.id !== listId) return list;

      const updatedItems = list.items
        .filter(item => !fileIdSet.has(item.fileId))
        .map((item, index) => ({ ...item, position: index }));

      return {
        ...list,
        fileIds: list.fileIds.filter(id => !fileIdSet.has(id)),
        items: updatedItems,
        currentIndex: Math.min(list.currentIndex, Math.max(0, updatedItems.length - 1)),
        updatedAt: new Date().toISOString(),
      };
    }));
  }, []);

  const reorderReadingList = useCallback((listId: string, orderedFileIds: string[]) => {
    setReadingLists(prev => prev.map(list => {
      if (list.id !== listId) return list;

      const itemMap = new Map(list.items.map(item => [item.fileId, item]));
      const reorderedItems = orderedFileIds.map((fileId, index) => {
        const existingItem = itemMap.get(fileId);
        return existingItem
          ? { ...existingItem, position: index }
          : { fileId, position: index, completed: false };
      });

      return {
        ...list,
        fileIds: orderedFileIds,
        items: reorderedItems,
        updatedAt: new Date().toISOString(),
      };
    }));
  }, []);

  const markAsRead = useCallback((listId: string, fileId: string) => {
    setReadingLists(prev => prev.map(list => {
      if (list.id !== listId) return list;

      const updatedItems = list.items.map(item =>
        item.fileId === fileId
          ? { ...item, completed: true, completedAt: new Date().toISOString() }
          : item
      );

      // Find the next unread item
      const currentItem = updatedItems.find(item => item.fileId === fileId);
      let newCurrentIndex = list.currentIndex;
      if (currentItem && currentItem.position === list.currentIndex) {
        const nextUnread = updatedItems.find(item => !item.completed && item.position > list.currentIndex);
        if (nextUnread) {
          newCurrentIndex = nextUnread.position;
        }
      }

      return {
        ...list,
        items: updatedItems,
        currentIndex: newCurrentIndex,
        updatedAt: new Date().toISOString(),
      };
    }));
  }, []);

  const markAsUnread = useCallback((listId: string, fileId: string) => {
    setReadingLists(prev => prev.map(list => {
      if (list.id !== listId) return list;

      const updatedItems = list.items.map(item =>
        item.fileId === fileId
          ? { ...item, completed: false, completedAt: undefined }
          : item
      );

      return {
        ...list,
        items: updatedItems,
        updatedAt: new Date().toISOString(),
      };
    }));
  }, []);

  const getNextInReadingList = useCallback((listId: string): string | null => {
    const list = readingLists.find(l => l.id === listId);
    if (!list) return null;

    const sortedItems = [...list.items].sort((a, b) => a.position - b.position);
    const nextUnread = sortedItems.find(item => !item.completed);

    return nextUnread?.fileId ?? null;
  }, [readingLists]);

  // ---------------------------------------------------------------------------
  // Smart Collections from Metadata
  // ---------------------------------------------------------------------------

  const generateFromSeriesGroup = useCallback((seriesGroup: string, fileIds: string[]): Collection => {
    const newCollection: Collection = {
      id: generateId(),
      name: seriesGroup,
      type: 'smart-collection',
      fileIds,
      smartFilter: {
        field: 'seriesGroup',
        value: seriesGroup,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setCollections(prev => [...prev, newCollection]);
    return newCollection;
  }, []);

  const generateFromStoryArc = useCallback((storyArc: string, fileIds: string[]): ReadingList => {
    const items: ReadingListItem[] = fileIds.map((fileId, index) => ({
      fileId,
      position: index,
      completed: false,
    }));

    const newList: ReadingList = {
      id: generateId(),
      name: storyArc,
      type: 'reading-list',
      fileIds,
      isOrdered: true,
      items,
      currentIndex: 0,
      smartFilter: {
        field: 'storyArc',
        value: storyArc,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setReadingLists(prev => [...prev, newList]);
    return newList;
  }, []);

  // ---------------------------------------------------------------------------
  // Utility Functions
  // ---------------------------------------------------------------------------

  const getCollectionById = useCallback((id: string): Collection | null => {
    return collections.find(c => c.id === id) ?? null;
  }, [collections]);

  const getReadingListById = useCallback((id: string): ReadingList | null => {
    return readingLists.find(l => l.id === id) ?? null;
  }, [readingLists]);

  const isFileInCollection = useCallback((collectionId: string, fileId: string): boolean => {
    const collection = collections.find(c => c.id === collectionId);
    return collection?.fileIds.includes(fileId) ?? false;
  }, [collections]);

  const isFileInReadingList = useCallback((listId: string, fileId: string): boolean => {
    const list = readingLists.find(l => l.id === listId);
    return list?.fileIds.includes(fileId) ?? false;
  }, [readingLists]);

  // ---------------------------------------------------------------------------
  // Context Value
  // ---------------------------------------------------------------------------

  const value: CollectionsContextValue = {
    // State
    collections,
    readingLists,
    isLoading,

    // Collection actions
    createCollection,
    updateCollection,
    deleteCollection,
    addToCollection,
    removeFromCollection,

    // Reading list actions
    createReadingList,
    updateReadingList,
    deleteReadingList,
    addToReadingList,
    removeFromReadingList,
    reorderReadingList,
    markAsRead,
    markAsUnread,
    getNextInReadingList,

    // Smart collections
    generateFromSeriesGroup,
    generateFromStoryArc,

    // Utility
    getCollectionById,
    getReadingListById,
    isFileInCollection,
    isFileInReadingList,
  };

  return (
    <CollectionsContext.Provider value={value}>
      {children}
    </CollectionsContext.Provider>
  );
}
