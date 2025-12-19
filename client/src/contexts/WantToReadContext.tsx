/**
 * Want to Read Context
 *
 * Manages the "Want to Read" queue - comics users have marked for future reading.
 * Provides prioritization and ordering capabilities.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';

// =============================================================================
// Types
// =============================================================================

export interface WantToReadItem {
  fileId: string;
  filename: string;
  relativePath: string;
  libraryId: string;
  priority: number; // 1 = high, 2 = medium, 3 = low
  addedAt: string;
  notes?: string;
}

interface WantToReadContextType {
  items: WantToReadItem[];
  isLoading: boolean;
  addToWantToRead: (fileId: string, filename: string, relativePath: string, libraryId: string, priority?: number) => void;
  removeFromWantToRead: (fileId: string) => void;
  isInWantToRead: (fileId: string) => boolean;
  updatePriority: (fileId: string, priority: number) => void;
  updateNotes: (fileId: string, notes: string) => void;
  reorderItems: (fromIndex: number, toIndex: number) => void;
  clearAll: () => void;
}

const WantToReadContext = createContext<WantToReadContextType | null>(null);

// =============================================================================
// Local Storage
// =============================================================================

const STORAGE_KEY = 'helixio_want_to_read';

function loadFromStorage(): WantToReadItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    console.error('Failed to load Want to Read from storage:', err);
  }
  return [];
}

function saveToStorage(items: WantToReadItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error('Failed to save Want to Read to storage:', err);
  }
}

// =============================================================================
// Provider
// =============================================================================

export function WantToReadProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<WantToReadItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load from storage on mount
  useEffect(() => {
    const stored = loadFromStorage();
    setItems(stored);
    setIsLoading(false);
  }, []);

  // Save to storage when items change
  useEffect(() => {
    if (!isLoading) {
      saveToStorage(items);
    }
  }, [items, isLoading]);

  const addToWantToRead = useCallback(
    (fileId: string, filename: string, relativePath: string, libraryId: string, priority: number = 2) => {
      setItems((prev) => {
        // Check if already exists
        if (prev.some((item) => item.fileId === fileId)) {
          return prev;
        }
        return [
          ...prev,
          {
            fileId,
            filename,
            relativePath,
            libraryId,
            priority,
            addedAt: new Date().toISOString(),
          },
        ];
      });
    },
    []
  );

  const removeFromWantToRead = useCallback((fileId: string) => {
    setItems((prev) => prev.filter((item) => item.fileId !== fileId));
  }, []);

  const isInWantToRead = useCallback(
    (fileId: string) => items.some((item) => item.fileId === fileId),
    [items]
  );

  const updatePriority = useCallback((fileId: string, priority: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.fileId === fileId ? { ...item, priority } : item
      )
    );
  }, []);

  const updateNotes = useCallback((fileId: string, notes: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.fileId === fileId ? { ...item, notes } : item
      )
    );
  }, []);

  const reorderItems = useCallback((fromIndex: number, toIndex: number) => {
    setItems((prev) => {
      const newItems = [...prev];
      const [removed] = newItems.splice(fromIndex, 1);
      if (removed) {
        newItems.splice(toIndex, 0, removed);
      }
      return newItems;
    });
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
  }, []);

  return (
    <WantToReadContext.Provider
      value={{
        items,
        isLoading,
        addToWantToRead,
        removeFromWantToRead,
        isInWantToRead,
        updatePriority,
        updateNotes,
        reorderItems,
        clearAll,
      }}
    >
      {children}
    </WantToReadContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

export function useWantToRead() {
  const context = useContext(WantToReadContext);
  if (!context) {
    throw new Error('useWantToRead must be used within a WantToReadProvider');
  }
  return context;
}
