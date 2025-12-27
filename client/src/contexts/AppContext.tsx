/**
 * App Context
 *
 * Global application state management for libraries, selection, and operations.
 * Uses React Query for server state (libraries, files, folders) and local state
 * for UI state (selections, filters, preferences).
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useLibraries } from '../hooks/queries/useLibraries';
import {
  useFiles,
  useLibraryFolders,
  useAllLibraryFolders,
  type ComicFile,
  type LibraryFolders,
} from '../hooks/queries/useFiles';
import { invalidateLibraries, invalidateFiles } from '../lib/cacheInvalidation';
import type { Library } from '../services/api/libraries';

// =============================================================================
// Types
// =============================================================================

interface AppState {
  // Libraries (from React Query)
  libraries: Library[];
  selectedLibrary: Library | null;
  isAllLibraries: boolean;
  loadingLibraries: boolean;
  librariesError: string | null;

  // Folders (from React Query)
  folders: string[];
  allLibraryFolders: LibraryFolders[];
  selectedFolder: string | null;
  loadingFolders: boolean;

  // Files (from React Query)
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

  // Series selection (for bulk operations on SeriesPage)
  selectedSeries: Set<string>;

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
  relatedSeriesPosition: 'above' | 'below';

  // Mobile sidebar
  mobileSidebarOpen: boolean;
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

  // Series selection actions (for bulk operations on SeriesPage)
  selectSeries: (seriesId: string, multi?: boolean) => void;
  selectSeriesRange: (seriesIds: string[], fromId: string, toId: string) => void;
  selectAllSeries: (seriesIds: string[]) => void;
  clearSeriesSelection: () => void;
  lastSelectedSeriesId: string | null;

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
  setRelatedSeriesPosition: (position: 'above' | 'below') => void;

  // Mobile sidebar actions
  setMobileSidebarOpen: (open: boolean) => void;
  toggleMobileSidebar: () => void;
}

// =============================================================================
// Constants
// =============================================================================

const LAST_LIBRARY_KEY = 'helixio-last-library';
const PREFER_FILENAME_KEY = 'helixio-prefer-filename';
const GROUP_FIELD_KEY = 'helixio-group-field';
const RELATED_SERIES_POSITION_KEY = 'helixio-related-series-position';

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
  const location = useLocation();

  // ---------------------------------------------------------------------------
  // UI State (local)
  // ---------------------------------------------------------------------------

  // Library selection
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(() => {
    const stored = localStorage.getItem(LAST_LIBRARY_KEY);
    return stored === 'all' ? null : stored;
  });
  const [isAllLibraries, setIsAllLibraries] = useState<boolean>(() => {
    return localStorage.getItem(LAST_LIBRARY_KEY) === 'all';
  });

  // Folder selection
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);

  // File selection
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [lastSelectedFileId, setLastSelectedFileId] = useState<string | null>(null);

  // Series selection (for bulk operations on SeriesPage)
  const [selectedSeries, setSelectedSeries] = useState<Set<string>>(new Set());
  const [lastSelectedSeriesId, setLastSelectedSeriesId] = useState<string | null>(null);

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

  // Display preferences
  const [preferFilenameOverMetadata, setPreferFilenameOverMetadataState] = useState<boolean>(() => {
    const stored = localStorage.getItem(PREFER_FILENAME_KEY);
    return stored === 'true';
  });

  const [relatedSeriesPosition, setRelatedSeriesPositionState] = useState<'above' | 'below'>(() => {
    const stored = localStorage.getItem(RELATED_SERIES_POSITION_KEY);
    return stored === 'above' ? 'above' : 'below';
  });

  // Mobile sidebar
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // ---------------------------------------------------------------------------
  // React Query Hooks (server state)
  // ---------------------------------------------------------------------------

  // Libraries
  const {
    data: libraries = [],
    isLoading: loadingLibraries,
    error: librariesQueryError,
    refetch: refetchLibraries,
  } = useLibraries();

  // Derive selectedLibrary from libraries data and selectedLibraryId
  const selectedLibrary = useMemo(() => {
    if (isAllLibraries || !selectedLibraryId) return null;
    return libraries.find((lib) => lib.id === selectedLibraryId) ?? null;
  }, [libraries, selectedLibraryId, isAllLibraries]);

  // Auto-select library from localStorage on initial load
  useEffect(() => {
    if (libraries.length > 0 && selectedLibraryId && !selectedLibrary && !isAllLibraries) {
      // Stored library no longer exists, clear it
      localStorage.removeItem(LAST_LIBRARY_KEY);
      setSelectedLibraryId(null);
    }
  }, [libraries, selectedLibraryId, selectedLibrary, isAllLibraries]);

  // Folders for single library
  const {
    data: singleLibraryFolders = [],
    isLoading: loadingSingleFolders,
  } = useLibraryFolders(selectedLibrary?.id);

  // Folders for all libraries
  const {
    data: allLibraryFoldersData = [],
    isLoading: loadingAllFolders,
  } = useAllLibraryFolders();

  // Derive folder state
  const folders = isAllLibraries ? [] : singleLibraryFolders;
  const allLibraryFolders = isAllLibraries ? allLibraryFoldersData : [];
  const loadingFolders = isAllLibraries ? loadingAllFolders : loadingSingleFolders;

  // Files query params
  // Note: folder filtering is handled locally by FoldersPage, not globally
  const filesParams = useMemo(() => ({
    libraryId: isAllLibraries ? null : selectedLibrary?.id,
    all: true, // Fetch all files for infinite scroll with navigation sidebar
    sort: sortField,
    order: sortOrder,
    groupBy: groupField !== 'none' ? groupField : undefined,
    status: statusFilter ?? undefined,
  }), [isAllLibraries, selectedLibrary?.id, sortField, sortOrder, groupField, statusFilter]);

  // Files
  const {
    data: filesData,
    isLoading: loadingFiles,
    error: filesQueryError,
    refetch: refetchFiles,
  } = useFiles({
    ...filesParams,
    enabled: isAllLibraries || !!selectedLibrary,
  });

  // Derive files state
  const files = filesData?.files ?? [];
  const pagination = filesData?.pagination ?? { page: 1, limit: 50, total: 0, pages: 0 };

  // Error handling
  const librariesError = librariesQueryError instanceof Error ? librariesQueryError.message : null;
  const filesError = filesQueryError instanceof Error ? filesQueryError.message : null;

  // ---------------------------------------------------------------------------
  // Mobile sidebar
  // ---------------------------------------------------------------------------

  const toggleMobileSidebar = useCallback(() => {
    setMobileSidebarOpen((prev) => !prev);
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  // Clear selections on route change
  useEffect(() => {
    setSelectedFiles(new Set());
    setLastSelectedFileId(null);
    setSelectedSeries(new Set());
    setLastSelectedSeriesId(null);
  }, [location.pathname]);

  // ---------------------------------------------------------------------------
  // Display Preference Actions
  // ---------------------------------------------------------------------------

  const setPreferFilenameOverMetadata = useCallback((prefer: boolean) => {
    setPreferFilenameOverMetadataState(prefer);
    localStorage.setItem(PREFER_FILENAME_KEY, String(prefer));
  }, []);

  const setRelatedSeriesPosition = useCallback((position: 'above' | 'below') => {
    setRelatedSeriesPositionState(position);
    localStorage.setItem(RELATED_SERIES_POSITION_KEY, position);
  }, []);

  // ---------------------------------------------------------------------------
  // Library Actions
  // ---------------------------------------------------------------------------

  const refreshLibraries = useCallback(async () => {
    invalidateLibraries();
    await refetchLibraries();
  }, [refetchLibraries]);

  const selectLibrary = useCallback((library: Library | null | 'all') => {
    // Handle 'all' case
    if (library === 'all') {
      if (isAllLibraries) return; // Already in all-libraries mode
      setIsAllLibraries(true);
      setSelectedLibraryId(null);
      setSelectedFolder(null);
      setSelectedFiles(new Set());
      localStorage.setItem(LAST_LIBRARY_KEY, 'all');
      return;
    }

    // If selecting the same library, don't reset - just keep current state
    if (!isAllLibraries && library?.id === selectedLibraryId) {
      return;
    }

    setIsAllLibraries(false);
    setSelectedLibraryId(library?.id ?? null);
    setSelectedFolder(null);
    setSelectedFiles(new Set());

    // Persist last selected library to localStorage
    if (library) {
      localStorage.setItem(LAST_LIBRARY_KEY, library.id);
    } else {
      localStorage.removeItem(LAST_LIBRARY_KEY);
    }
  }, [selectedLibraryId, isAllLibraries]);

  const selectAllLibraries = useCallback(() => {
    selectLibrary('all');
  }, [selectLibrary]);

  // ---------------------------------------------------------------------------
  // Folder Actions
  // ---------------------------------------------------------------------------

  const selectFolderCallback = useCallback((folder: string | null) => {
    setSelectedFolder(folder);
    setSelectedFiles(new Set());
  }, []);

  // ---------------------------------------------------------------------------
  // File Actions
  // ---------------------------------------------------------------------------

  const refreshFilesCallback = useCallback(async () => {
    invalidateFiles();
    await refetchFiles();
  }, [refetchFiles]);

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

  const selectRange = useCallback(
    (fromId: string, toId: string) => {
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
    },
    [files]
  );

  const selectAllFiles = useCallback(() => {
    setSelectedFiles(new Set(files.map((f) => f.id)));
  }, [files]);

  const selectFilesCallback = useCallback((fileIds: string[], selected: boolean) => {
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
  // Series Selection Actions
  // ---------------------------------------------------------------------------

  const selectSeriesCallback = useCallback((seriesId: string, selected?: boolean) => {
    setSelectedSeries((prev) => {
      const next = new Set(prev);
      const isCurrentlySelected = next.has(seriesId);

      // If selected is explicitly provided, use it; otherwise toggle
      const shouldSelect = selected !== undefined ? selected : !isCurrentlySelected;

      if (shouldSelect) {
        next.add(seriesId);
      } else {
        next.delete(seriesId);
      }
      return next;
    });
    setLastSelectedSeriesId(seriesId);
  }, []);

  const selectSeriesRange = useCallback((seriesIds: string[], fromId: string, toId: string) => {
    const fromIndex = seriesIds.findIndex((id) => id === fromId);
    const toIndex = seriesIds.findIndex((id) => id === toId);

    if (fromIndex === -1 || toIndex === -1) return;

    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);

    const rangeIds = seriesIds.slice(start, end + 1);
    setSelectedSeries((prev) => {
      const next = new Set(prev);
      rangeIds.forEach((id) => next.add(id));
      return next;
    });
    setLastSelectedSeriesId(toId);
  }, []);

  const selectAllSeriesCallback = useCallback((seriesIds: string[]) => {
    setSelectedSeries(new Set(seriesIds));
  }, []);

  const clearSeriesSelection = useCallback(() => {
    setSelectedSeries(new Set());
    setLastSelectedSeriesId(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Filter Actions
  // ---------------------------------------------------------------------------

  const handleSetStatusFilter = useCallback((status: string | null) => {
    setStatusFilter(status);
  }, []);

  const setSort = useCallback((field: string, order: 'asc' | 'desc') => {
    setSortField(field);
    setSortOrder(order);
  }, []);

  const setGroupField = useCallback((field: string) => {
    setGroupFieldState(field);
    localStorage.setItem(GROUP_FIELD_KEY, field);
  }, []);

  // Pagination is now managed by React Query, but we keep these for API compatibility
  const setPage = useCallback((_page: number) => {
    // React Query handles pagination through query params
    // This is kept for backward compatibility but is essentially a no-op
    // since we fetch all files at once
  }, []);

  const setPageSize = useCallback((_size: number) => {
    // React Query handles pagination through query params
    // This is kept for backward compatibility
  }, []);

  // ---------------------------------------------------------------------------
  // Operation Feedback
  // ---------------------------------------------------------------------------

  const setOperation = useCallback((operation: string | null, message: string | null = null) => {
    setOperationInProgress(operation);
    setOperationMessage(message);
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
    selectedSeries,
    statusFilter,
    sortField,
    sortOrder,
    groupField,
    operationInProgress,
    operationMessage,
    preferFilenameOverMetadata,
    relatedSeriesPosition,
    mobileSidebarOpen,

    // Actions
    refreshLibraries,
    selectLibrary,
    selectAllLibraries,
    selectFolder: selectFolderCallback,
    refreshFiles: refreshFilesCallback,
    selectFile,
    selectRange,
    selectAllFiles,
    selectFiles: selectFilesCallback,
    clearSelection,
    lastSelectedFileId,
    // Series selection actions
    selectSeries: selectSeriesCallback,
    selectSeriesRange,
    selectAllSeries: selectAllSeriesCallback,
    clearSeriesSelection,
    lastSelectedSeriesId,
    setStatusFilter: handleSetStatusFilter,
    setSort,
    setGroupField,
    setPage,
    setPageSize,
    setOperation,
    setPreferFilenameOverMetadata,
    setRelatedSeriesPosition,
    setMobileSidebarOpen,
    toggleMobileSidebar,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
