/**
 * FolderDrawerContext
 *
 * Manages the state for the folder navigation drawer including:
 * - Open/closed state
 * - Pinned/unpinned mode (pinned = pushes content, unpinned = overlay)
 */

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

const DRAWER_PIN_KEY = 'helixio-folder-drawer-pinned';

interface FolderDrawerContextValue {
  isOpen: boolean;
  isPinned: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  togglePin: () => void;
  setIsPinned: (pinned: boolean) => void;
}

const FolderDrawerContext = createContext<FolderDrawerContextValue | null>(null);

export function FolderDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinnedState] = useState(() => {
    try {
      const saved = localStorage.getItem(DRAWER_PIN_KEY);
      return saved === 'true';
    } catch {
      return false;
    }
  });

  // Persist pin state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(DRAWER_PIN_KEY, String(isPinned));
    } catch {
      // Ignore localStorage errors
    }
  }, [isPinned]);

  // If pinned, automatically open the drawer
  useEffect(() => {
    if (isPinned) {
      setIsOpen(true);
    }
  }, [isPinned]);

  const openDrawer = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    // Only close if not pinned
    if (!isPinned) {
      setIsOpen(false);
    }
  }, [isPinned]);

  const toggleDrawer = useCallback(() => {
    if (isPinned) {
      // If pinned, toggle unpins and closes
      setIsPinnedState(false);
      setIsOpen(false);
    } else {
      setIsOpen(prev => !prev);
    }
  }, [isPinned]);

  const togglePin = useCallback(() => {
    setIsPinnedState(prev => {
      const newPinned = !prev;
      // If unpinning, close the drawer
      if (!newPinned) {
        setIsOpen(false);
      }
      return newPinned;
    });
  }, []);

  const setIsPinned = useCallback((pinned: boolean) => {
    setIsPinnedState(pinned);
    if (!pinned) {
      setIsOpen(false);
    }
  }, []);

  return (
    <FolderDrawerContext.Provider
      value={{
        isOpen,
        isPinned,
        openDrawer,
        closeDrawer,
        toggleDrawer,
        togglePin,
        setIsPinned,
      }}
    >
      {children}
    </FolderDrawerContext.Provider>
  );
}

export function useFolderDrawer() {
  const context = useContext(FolderDrawerContext);
  if (!context) {
    throw new Error('useFolderDrawer must be used within a FolderDrawerProvider');
  }
  return context;
}
