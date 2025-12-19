/**
 * Annotations Context
 *
 * Manages annotations, bookmarks with notes, and comic notes.
 * Stores data in localStorage with optional sync capability.
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

export interface AnnotationHighlight {
  id: string;
  x: number;      // Percentage from left
  y: number;      // Percentage from top
  width: number;  // Percentage
  height: number; // Percentage
  color: string;
}

export interface PageAnnotation {
  id: string;
  fileId: string;
  pageIndex: number;
  text: string;
  highlights: AnnotationHighlight[];
  createdAt: string;
  updatedAt: string;
}

export interface BookmarkWithNote {
  id: string;
  fileId: string;
  pageIndex: number;
  note: string;
  color: string;
  createdAt: string;
}

export interface ComicNote {
  id: string;
  fileId: string;
  title: string;
  content: string;
  rating?: number; // 1-5
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface AnnotationsState {
  annotations: PageAnnotation[];
  bookmarks: BookmarkWithNote[];
  notes: ComicNote[];
}

interface AnnotationsContextType {
  // Page Annotations
  annotations: PageAnnotation[];
  getPageAnnotations: (fileId: string, pageIndex: number) => PageAnnotation[];
  getFileAnnotations: (fileId: string) => PageAnnotation[];
  addAnnotation: (annotation: Omit<PageAnnotation, 'id' | 'createdAt' | 'updatedAt'>) => PageAnnotation;
  updateAnnotation: (id: string, updates: Partial<PageAnnotation>) => void;
  deleteAnnotation: (id: string) => void;

  // Bookmarks with Notes
  bookmarks: BookmarkWithNote[];
  getFileBookmarks: (fileId: string) => BookmarkWithNote[];
  getPageBookmark: (fileId: string, pageIndex: number) => BookmarkWithNote | undefined;
  addBookmark: (bookmark: Omit<BookmarkWithNote, 'id' | 'createdAt'>) => BookmarkWithNote;
  updateBookmark: (id: string, updates: Partial<BookmarkWithNote>) => void;
  deleteBookmark: (id: string) => void;
  hasBookmark: (fileId: string, pageIndex: number) => boolean;

  // Comic Notes
  notes: ComicNote[];
  getComicNote: (fileId: string) => ComicNote | undefined;
  setComicNote: (note: Omit<ComicNote, 'id' | 'createdAt' | 'updatedAt'>) => ComicNote;
  updateComicNote: (fileId: string, updates: Partial<ComicNote>) => void;
  deleteComicNote: (fileId: string) => void;

  // Export
  exportAnnotations: (fileId?: string) => string;
  exportAsMarkdown: (fileId?: string) => string;
}

const AnnotationsContext = createContext<AnnotationsContextType | null>(null);

// =============================================================================
// Storage
// =============================================================================

const STORAGE_KEY = 'helixio_annotations';

function loadFromStorage(): AnnotationsState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (err) {
    console.error('Failed to load annotations from storage:', err);
  }
  return { annotations: [], bookmarks: [], notes: [] };
}

function saveToStorage(state: AnnotationsState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save annotations to storage:', err);
  }
}

// =============================================================================
// Helpers
// =============================================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// =============================================================================
// Provider
// =============================================================================

export function AnnotationsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AnnotationsState>(() => loadFromStorage());

  // Save to storage when state changes
  useEffect(() => {
    saveToStorage(state);
  }, [state]);

  // =========================================================================
  // Page Annotations
  // =========================================================================

  const getPageAnnotations = useCallback(
    (fileId: string, pageIndex: number) =>
      state.annotations.filter(
        (a) => a.fileId === fileId && a.pageIndex === pageIndex
      ),
    [state.annotations]
  );

  const getFileAnnotations = useCallback(
    (fileId: string) => state.annotations.filter((a) => a.fileId === fileId),
    [state.annotations]
  );

  const addAnnotation = useCallback(
    (annotation: Omit<PageAnnotation, 'id' | 'createdAt' | 'updatedAt'>) => {
      const newAnnotation: PageAnnotation = {
        ...annotation,
        id: generateId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setState((prev) => ({
        ...prev,
        annotations: [...prev.annotations, newAnnotation],
      }));

      return newAnnotation;
    },
    []
  );

  const updateAnnotation = useCallback((id: string, updates: Partial<PageAnnotation>) => {
    setState((prev) => ({
      ...prev,
      annotations: prev.annotations.map((a) =>
        a.id === id ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a
      ),
    }));
  }, []);

  const deleteAnnotation = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      annotations: prev.annotations.filter((a) => a.id !== id),
    }));
  }, []);

  // =========================================================================
  // Bookmarks with Notes
  // =========================================================================

  const getFileBookmarks = useCallback(
    (fileId: string) =>
      state.bookmarks
        .filter((b) => b.fileId === fileId)
        .sort((a, b) => a.pageIndex - b.pageIndex),
    [state.bookmarks]
  );

  const getPageBookmark = useCallback(
    (fileId: string, pageIndex: number) =>
      state.bookmarks.find((b) => b.fileId === fileId && b.pageIndex === pageIndex),
    [state.bookmarks]
  );

  const addBookmark = useCallback(
    (bookmark: Omit<BookmarkWithNote, 'id' | 'createdAt'>) => {
      // Remove existing bookmark at this page
      const existing = state.bookmarks.find(
        (b) => b.fileId === bookmark.fileId && b.pageIndex === bookmark.pageIndex
      );

      const newBookmark: BookmarkWithNote = {
        ...bookmark,
        id: existing?.id || generateId(),
        createdAt: existing?.createdAt || new Date().toISOString(),
      };

      setState((prev) => ({
        ...prev,
        bookmarks: existing
          ? prev.bookmarks.map((b) => (b.id === existing.id ? newBookmark : b))
          : [...prev.bookmarks, newBookmark],
      }));

      return newBookmark;
    },
    [state.bookmarks]
  );

  const updateBookmark = useCallback((id: string, updates: Partial<BookmarkWithNote>) => {
    setState((prev) => ({
      ...prev,
      bookmarks: prev.bookmarks.map((b) =>
        b.id === id ? { ...b, ...updates } : b
      ),
    }));
  }, []);

  const deleteBookmark = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      bookmarks: prev.bookmarks.filter((b) => b.id !== id),
    }));
  }, []);

  const hasBookmark = useCallback(
    (fileId: string, pageIndex: number) =>
      state.bookmarks.some((b) => b.fileId === fileId && b.pageIndex === pageIndex),
    [state.bookmarks]
  );

  // =========================================================================
  // Comic Notes
  // =========================================================================

  const getComicNote = useCallback(
    (fileId: string) => state.notes.find((n) => n.fileId === fileId),
    [state.notes]
  );

  const setComicNote = useCallback(
    (note: Omit<ComicNote, 'id' | 'createdAt' | 'updatedAt'>) => {
      const existing = state.notes.find((n) => n.fileId === note.fileId);

      const newNote: ComicNote = {
        ...note,
        id: existing?.id || generateId(),
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setState((prev) => ({
        ...prev,
        notes: existing
          ? prev.notes.map((n) => (n.fileId === note.fileId ? newNote : n))
          : [...prev.notes, newNote],
      }));

      return newNote;
    },
    [state.notes]
  );

  const updateComicNote = useCallback((fileId: string, updates: Partial<ComicNote>) => {
    setState((prev) => ({
      ...prev,
      notes: prev.notes.map((n) =>
        n.fileId === fileId ? { ...n, ...updates, updatedAt: new Date().toISOString() } : n
      ),
    }));
  }, []);

  const deleteComicNote = useCallback((fileId: string) => {
    setState((prev) => ({
      ...prev,
      notes: prev.notes.filter((n) => n.fileId !== fileId),
    }));
  }, []);

  // =========================================================================
  // Export
  // =========================================================================

  const exportAnnotations = useCallback(
    (fileId?: string) => {
      const data = fileId
        ? {
            annotations: state.annotations.filter((a) => a.fileId === fileId),
            bookmarks: state.bookmarks.filter((b) => b.fileId === fileId),
            notes: state.notes.filter((n) => n.fileId === fileId),
          }
        : state;

      return JSON.stringify(data, null, 2);
    },
    [state]
  );

  const exportAsMarkdown = useCallback(
    (fileId?: string) => {
      const annotations = fileId
        ? state.annotations.filter((a) => a.fileId === fileId)
        : state.annotations;
      const bookmarks = fileId
        ? state.bookmarks.filter((b) => b.fileId === fileId)
        : state.bookmarks;
      const notes = fileId
        ? state.notes.filter((n) => n.fileId === fileId)
        : state.notes;

      let markdown = '# Comic Annotations Export\n\n';
      markdown += `_Exported: ${new Date().toLocaleString()}_\n\n`;

      // Group by file
      const fileIds = new Set([
        ...annotations.map((a) => a.fileId),
        ...bookmarks.map((b) => b.fileId),
        ...notes.map((n) => n.fileId),
      ]);

      for (const fId of fileIds) {
        markdown += `---\n\n`;

        const note = notes.find((n) => n.fileId === fId);
        if (note) {
          markdown += `## ${note.title || 'Untitled'}\n\n`;
          if (note.rating) {
            markdown += `**Rating:** ${'★'.repeat(note.rating)}${'☆'.repeat(5 - note.rating)}\n\n`;
          }
          if (note.content) {
            markdown += `${note.content}\n\n`;
          }
          if (note.tags.length > 0) {
            markdown += `**Tags:** ${note.tags.join(', ')}\n\n`;
          }
        }

        const fileBookmarks = bookmarks.filter((b) => b.fileId === fId);
        if (fileBookmarks.length > 0) {
          markdown += `### Bookmarks\n\n`;
          for (const bm of fileBookmarks) {
            markdown += `- **Page ${bm.pageIndex + 1}**`;
            if (bm.note) {
              markdown += `: ${bm.note}`;
            }
            markdown += '\n';
          }
          markdown += '\n';
        }

        const fileAnnotations = annotations.filter((a) => a.fileId === fId);
        if (fileAnnotations.length > 0) {
          markdown += `### Annotations\n\n`;
          for (const ann of fileAnnotations) {
            markdown += `#### Page ${ann.pageIndex + 1}\n\n`;
            markdown += `${ann.text}\n\n`;
          }
        }
      }

      return markdown;
    },
    [state]
  );

  return (
    <AnnotationsContext.Provider
      value={{
        annotations: state.annotations,
        getPageAnnotations,
        getFileAnnotations,
        addAnnotation,
        updateAnnotation,
        deleteAnnotation,
        bookmarks: state.bookmarks,
        getFileBookmarks,
        getPageBookmark,
        addBookmark,
        updateBookmark,
        deleteBookmark,
        hasBookmark,
        notes: state.notes,
        getComicNote,
        setComicNote,
        updateComicNote,
        deleteComicNote,
        exportAnnotations,
        exportAsMarkdown,
      }}
    >
      {children}
    </AnnotationsContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

export function useAnnotations() {
  const context = useContext(AnnotationsContext);
  if (!context) {
    throw new Error('useAnnotations must be used within an AnnotationsProvider');
  }
  return context;
}
