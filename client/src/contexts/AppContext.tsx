/**
 * App Context
 *
 * Global application state management for libraries, selection, and operations.
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
  Library,
  ComicFile,
  getLibraries,
  getLibraryFiles,
  getLibraryFolders,
  getAllLibraryFiles,
  getAllLibraryFolders,
  GetFilesParams,
  LibraryFolders,
} from '../services/api.service';

// =============================================================================
// Types
// =============================================================================

interface AppState {
  // Libraries
  libraries: Library[];
  selectedLibrary: Library | null;
  isAllLibraries: boolean;
  loadingLibraries: boolean;
  librariesError: string | null;

  // Folders (single library mode: flat list, all libraries mode: grouped by library)
  folders: string[];
  allLibraryFolders: LibraryFolders[];
  selectedFolder: string | null;
  loadingFolders: boolean;

  // Files
  files: ComicFile[];
  selectedFiles: Set<string>;
  loadingFiles: boolean;
  filesError: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };

  // Filters
  statusFilter: string | null;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  groupField: string;

  // Operations
  operationInProgress: string | null;
  operationMessage: string | null;

  // Display preferences
  preferFilenameOverMetadata: boolean;
}

interface AppContextValue extends AppState {
  // Library actions
  refreshLibraries: () => Promise<void>;
  selectLibrary: (library: Library | null | 'all') => void;
  selectAllLibraries: () => void;

  // Folder actions
  selectFolder: (folder: string | null) => void;

  // File actions
  refreshFiles: () => Promise<void>;
  selectFile: (fileId: string, multi?: boolean, shiftKey?: boolean) => void;
  selectRange: (fromId: string, toId: string) => void;
  selectAllFiles: () => void;
  selectFiles: (fileIds: string[], selected: boolean) => void;
  clearSelection: () => void;
  lastSelectedFileId: string | null;

  // Filter actions
  setStatusFilter: (status: string | null) => void;
  setSort: (field: string, order: 'asc' | 'desc') => void;
  setGroupField: (field: string) => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;

  // Operation feedback
  setOperation: (operation: string | null, message?: string | null) => void;

  // Display preference actions
  setPreferFilenameOverMetadata: (prefer: boolean) => void;
}

// =============================================================================
// Constants
// =============================================================================

const LAST_LIBRARY_KEY = 'helixio-last-library';
const PREFER_FILENAME_KEY = 'helixio-prefer-filename';
const GROUP_FIELD_KEY = 'helixio-group-field';

// =============================================================================
// Context
// =============================================================================

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}

// =============================================================================
// Provider
// =============================================================================

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  // Libraries
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [selectedLibrary, setSelectedLibrary] = useState<Library | null>(null);
  const [isAllLibraries, setIsAllLibraries] = useState<boolean>(() => {
    return localStorage.getItem(LAST_LIBRARY_KEY) === 'all';
  });
  const [loadingLibraries, setLoadingLibraries] = useState(true);
  const [librariesError, setLibrariesError] = useState<string | null>(null);

  // Folders
  const [folders, setFolders] = useState<string[]>([]);
  const [allLibraryFolders, setAllLibraryFolders] = useState<LibraryFolders[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [loadingFolders, setLoadingFolders] = useState(false);

  // Files
  const [files, setFiles] = useState<ComicFile[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [lastSelectedFileId, setLastSelectedFileId] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    pages: 0,
  });

  // Filters
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [sortField, setSortField] = useState('filename');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [groupField, setGroupFieldState] = useState<string>(() => {
    const stored = localStorage.getItem(GROUP_FIELD_KEY);
    return stored || 'none';
  });

  // Operations
  const [operationInProgress, setOperationInProgress] = useState<string | null>(null);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);

  // Display preferences (loaded from localStorage)
  const [preferFilenameOverMetadata, setPreferFilenameOverMetadataState] = useState<boolean>(() => {
    const stored = localStorage.getItem(PREFER_FILENAME_KEY);
    return stored === 'true';
  });

  // ---------------------------------------------------------------------------
  // Display Preference Actions
  // ---------------------------------------------------------------------------

  const setPreferFilenameOverMetadata = useCallback((prefer: boolean) => {
    setPreferFilenameOverMetadataState(prefer);
    localStorage.setItem(PREFER_FILENAME_KEY, String(prefer));
  }, []);

  // ---------------------------------------------------------------------------
  // Library Actions
  // ---------------------------------------------------------------------------

  const refreshLibraries = useCallback(async () => {
    setLoadingLibraries(true);
    setLibrariesError(null);

    try {
      const response = await getLibraries();
      setLibraries(response.libraries);

      // If we had a library selected, update it with fresh data
      if (selectedLibrary) {
        const updated = response.libraries.find((l) => l.id === selectedLibrary.id);
        if (updated) {
          setSelectedLibrary(updated);
        } else {
          setSelectedLibrary(null);
          localStorage.removeItem(LAST_LIBRARY_KEY);
        }
      } else {
        // On initial load, try to restore the last selected library
        const lastLibraryId = localStorage.getItem(LAST_LIBRARY_KEY);
        if (lastLibraryId) {
          const lastLibrary = response.libraries.find((l) => l.id === lastLibraryId);
          if (lastLibrary) {
            setSelectedLibrary(lastLibrary);
          } else {
            // Library no longer exists, clear the stored ID
            localStorage.removeItem(LAST_LIBRARY_KEY);
          }
        }
      }
    } catch (err) {
      setLibrariesError(err instanceof Error ? err.message : 'Failed to load libraries');
    } finally {
      setLoadingLibraries(false);
    }
  }, [selectedLibrary]);

  const selectLibrary = useCallback((library: Library | null | 'all') => {
    // Handle 'all' case
    if (library === 'all') {
      if (isAllLibraries) return; // Already in all-libraries mode
      setIsAllLibraries(true);
      setSelectedLibrary(null);
      setSelectedFolder(null);
      setFiles([]);
      setSelectedFiles(new Set());
      setPagination({ page: 1, limit: 50, total: 0, pages: 0 });
      localStorage.setItem(LAST_LIBRARY_KEY, 'all');
      return;
    }

    // If selecting the same library, don't reset files - just keep current state
    if (!isAllLibraries && library?.id === selectedLibrary?.id) {
      return;
    }

    setIsAllLibraries(false);
    setSelectedLibrary(library);
    setSelectedFolder(null);
    setFiles([]);
    setSelectedFiles(new Set());
    setPagination({ page: 1, limit: 50, total: 0, pages: 0 });

    // Persist last selected library to localStorage
    if (library) {
      localStorage.setItem(LAST_LIBRARY_KEY, library.id);
    } else {
      localStorage.removeItem(LAST_LIBRARY_KEY);
    }
  }, [selectedLibrary?.id, isAllLibraries]);

  const selectAllLibraries = useCallback(() => {
    selectLibrary('all');
  }, [selectLibrary]);

  // ---------------------------------------------------------------------------
  // Folder Actions
  // ---------------------------------------------------------------------------

  const selectFolder = useCallback((folder: string | null) => {
    setSelectedFolder(folder);
    setSelectedFiles(new Set());
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  // Load folders when library changes
  useEffect(() => {
    if (isAllLibraries) {
      // Load folders from all libraries
      setLoadingFolders(true);
      getAllLibraryFolders()
        .then((response) => {
          setAllLibraryFolders(response.libraries);
          setFolders([]); // Clear single-library folders
        })
        .catch(() => {
          setAllLibraryFolders([]);
          setFolders([]);
        })
        .finally(() => setLoadingFolders(false));
      return;
    }

    if (!selectedLibrary) {
      setFolders([]);
      setAllLibraryFolders([]);
      return;
    }

    setLoadingFolders(true);
    getLibraryFolders(selectedLibrary.id)
      .then((response) => {
        setFolders(response.folders);
        setAllLibraryFolders([]); // Clear all-library folders
      })
      .catch(() => {
        setFolders([]);
        setAllLibraryFolders([]);
      })
      .finally(() => setLoadingFolders(false));
  }, [selectedLibrary, isAllLibraries]);

  // ---------------------------------------------------------------------------
  // File Actions
  // ---------------------------------------------------------------------------

  const refreshFiles = useCallback(async () => {
    // Need either a selected library OR all-libraries mode
    if (!selectedLibrary && !isAllLibraries) {
      setFiles([]);
      return;
    }

    setLoadingFiles(true);
    setFilesError(null);

    const params: GetFilesParams = {
      all: true, // Fetch all files for infinite scroll with navigation sidebar
      sort: sortField,
      order: sortOrder,
      groupBy: groupField,
    };

    if (statusFilter) {
      params.status = statusFilter;
    }

    if (selectedFolder) {
      params.folder = selectedFolder;
    }

    try {
      // Use different API based on mode
      const response = isAllLibraries
        ? await getAllLibraryFiles(params)
        : await getLibraryFiles(selectedLibrary!.id, params);
      setFiles(response.files);
      setPagination(response.pagination);
    } catch (err) {
      setFilesError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setLoadingFiles(false);
    }
  }, [
    selectedLibrary,
    isAllLibraries,
    sortField,
    sortOrder,
    groupField,
    statusFilter,
    selectedFolder,
  ]);

  // Load files when filters change
  useEffect(() => {
    refreshFiles();
  }, [refreshFiles]);

  const selectFile = useCallback((fileId: string, multi = false) => {
    setSelectedFiles((prev) => {
      const next = new Set(multi ? prev : []);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
    setLastSelectedFileId(fileId);
  }, []);

  const selectRange = useCallback((fromId: string, toId: string) => {
    const fromIndex = files.findIndex((f) => f.id === fromId);
    const toIndex = files.findIndex((f) => f.id === toId);

    if (fromIndex === -1 || toIndex === -1) return;

    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);

    const rangeIds = files.slice(start, end + 1).map((f) => f.id);
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      rangeIds.forEach((id) => next.add(id));
      return next;
    });
    setLastSelectedFileId(toId);
  }, [files]);

  const selectAllFiles = useCallback(() => {
    setSelectedFiles(new Set(files.map((f) => f.id)));
  }, [files]);

  const selectFiles = useCallback((fileIds: string[], selected: boolean) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (selected) {
        fileIds.forEach((id) => next.add(id));
      } else {
        fileIds.forEach((id) => next.delete(id));
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedFiles(new Set());
    setLastSelectedFileId(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Filter Actions
  // ---------------------------------------------------------------------------

  const handleSetStatusFilter = useCallback((status: string | null) => {
    setStatusFilter(status);
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  const setSort = useCallback((field: string, order: 'asc' | 'desc') => {
    setSortField(field);
    setSortOrder(order);
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  const setGroupField = useCallback((field: string) => {
    setGroupFieldState(field);
    localStorage.setItem(GROUP_FIELD_KEY, field);
    setPagination((p) => ({ ...p, page: 1 }));
  }, []);

  const setPage = useCallback((page: number) => {
    setPagination((p) => ({ ...p, page }));
  }, []);

  const setPageSize = useCallback((size: number) => {
    setPagination((p) => ({ ...p, limit: size, page: 1 }));
  }, []);

  // ---------------------------------------------------------------------------
  // Operation Feedback
  // ---------------------------------------------------------------------------

  const setOperation = useCallback((operation: string | null, message: string | null = null) => {
    setOperationInProgress(operation);
    setOperationMessage(message);
  }, []);

  // ---------------------------------------------------------------------------
  // Initial Load
  // ---------------------------------------------------------------------------

  useEffect(() => {
    refreshLibraries();
  }, []);

  // ---------------------------------------------------------------------------
  // Context Value
  // ---------------------------------------------------------------------------

  const value: AppContextValue = {
    // State
    libraries,
    selectedLibrary,
    isAllLibraries,
    loadingLibraries,
    librariesError,
    folders,
    allLibraryFolders,
    selectedFolder,
    loadingFolders,
    files,
    selectedFiles,
    loadingFiles,
    filesError,
    pagination,
    statusFilter,
    sortField,
    sortOrder,
    groupField,
    operationInProgress,
    operationMessage,
    preferFilenameOverMetadata,

    // Actions
    refreshLibraries,
    selectLibrary,
    selectAllLibraries,
    selectFolder,
    refreshFiles,
    selectFile,
    selectRange,
    selectAllFiles,
    selectFiles,
    clearSelection,
    lastSelectedFileId,
    setStatusFilter: handleSetStatusFilter,
    setSort,
    setGroupField,
    setPage,
    setPageSize,
    setOperation,
    setPreferFilenameOverMetadata,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
