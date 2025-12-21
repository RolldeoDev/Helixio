/**
 * Reader Context
 *
 * Manages all state for the comic reader:
 * - Current file and page information
 * - Navigation state
 * - Settings (mode, scaling, direction, etc.)
 * - UI visibility state
 * - Progress tracking
 */

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
import {
  getArchiveContents,
  getReadingProgress,
  updateReadingProgress,
  getReaderSettings,
  updateReaderSettings,
  addBookmark as apiAddBookmark,
  removeBookmark as apiRemoveBookmark,
  getAdjacentFiles,
  generateThumbnails,
  markAsCompleted as apiMarkAsCompleted,
  ReaderSettings,
  ReadingMode as BaseReadingMode,
  ReadingDirection,
  ImageScaling,
  ImageSplitting,
  BackgroundColor,
  ColorCorrection,
  AdjacentFiles,
  getPageUrl,
} from '../../services/api.service';

// Extended reading mode to include webtoon
export type ReadingMode = BaseReadingMode | 'webtoon';

// Page rotation values
export type PageRotation = 0 | 90 | 180 | 270;

// =============================================================================
// Types
// =============================================================================

export interface PageInfo {
  path: string;
  index: number;
  url: string;
}

export interface PageDimensions {
  width: number;
  height: number;
  isLandscape: boolean;
}

export interface ReaderState {
  // File info
  fileId: string;
  filename: string;
  pages: PageInfo[];
  totalPages: number;
  isLoading: boolean;
  error: string | null;

  // Page dimensions (loaded as images are viewed)
  pageDimensions: Map<number, PageDimensions>;

  // Navigation
  currentPage: number;

  // Settings
  mode: ReadingMode;
  direction: ReadingDirection;
  scaling: ImageScaling;
  customWidth: number | null;
  splitting: ImageSplitting;
  background: BackgroundColor;
  brightness: number;
  colorCorrection: ColorCorrection;
  showPageShadow: boolean;
  autoHideUI: boolean;
  preloadCount: number;

  // Webtoon mode settings
  webtoonGap: number; // Gap between pages in webtoon mode (px)
  webtoonMaxWidth: number; // Max width for webtoon images (px)

  // UI state
  isFullscreen: boolean;
  isUIVisible: boolean;
  isSettingsOpen: boolean;
  isThumbnailStripOpen: boolean;
  zoom: number;
  panOffset: { x: number; y: number };

  // Split view (for viewing halves of landscape spreads)
  splitView: 'full' | 'left' | 'right';

  // Page rotation (per-page rotation map)
  pageRotations: Map<number, PageRotation>;

  // Progress
  bookmarks: number[];
  completed: boolean;

  // Chapter navigation
  adjacentFiles: AdjacentFiles | null;

  // Auto-detected webtoon (based on image aspect ratios)
  isAutoWebtoon: boolean;

  // Transition screen (for navigating between issues)
  transitionScreen: 'none' | 'start' | 'end';
}

type ReaderAction =
  | { type: 'INIT_START' }
  | { type: 'INIT_SUCCESS'; payload: { pages: PageInfo[]; progress: { currentPage: number; bookmarks: number[]; completed: boolean } } }
  | { type: 'INIT_ERROR'; payload: string }
  | { type: 'SET_PAGE'; payload: number }
  | { type: 'NEXT_PAGE' }
  | { type: 'PREV_PAGE' }
  | { type: 'FIRST_PAGE' }
  | { type: 'LAST_PAGE' }
  | { type: 'SET_MODE'; payload: ReadingMode }
  | { type: 'SET_DIRECTION'; payload: ReadingDirection }
  | { type: 'SET_SCALING'; payload: ImageScaling }
  | { type: 'SET_CUSTOM_WIDTH'; payload: number | null }
  | { type: 'SET_SPLITTING'; payload: ImageSplitting }
  | { type: 'SET_BACKGROUND'; payload: BackgroundColor }
  | { type: 'SET_BRIGHTNESS'; payload: number }
  | { type: 'SET_COLOR_CORRECTION'; payload: ColorCorrection }
  | { type: 'TOGGLE_PAGE_SHADOW' }
  | { type: 'TOGGLE_AUTO_HIDE_UI' }
  | { type: 'TOGGLE_FULLSCREEN' }
  | { type: 'SET_FULLSCREEN'; payload: boolean }
  | { type: 'TOGGLE_UI' }
  | { type: 'SHOW_UI' }
  | { type: 'HIDE_UI' }
  | { type: 'TOGGLE_SETTINGS' }
  | { type: 'CLOSE_SETTINGS' }
  | { type: 'TOGGLE_THUMBNAIL_STRIP' }
  | { type: 'SET_ZOOM'; payload: number }
  | { type: 'ZOOM_IN' }
  | { type: 'ZOOM_OUT' }
  | { type: 'RESET_ZOOM' }
  | { type: 'SET_PAN'; payload: { x: number; y: number } }
  | { type: 'RESET_PAN' }
  | { type: 'ADD_BOOKMARK'; payload: number }
  | { type: 'REMOVE_BOOKMARK'; payload: number }
  | { type: 'MARK_COMPLETED' }
  | { type: 'LOAD_SETTINGS'; payload: ReaderSettings }
  | { type: 'SET_PAGE_DIMENSIONS'; payload: { pageIndex: number; dimensions: PageDimensions } }
  | { type: 'SET_ADJACENT_FILES'; payload: AdjacentFiles }
  | { type: 'SET_SPLIT_VIEW'; payload: 'full' | 'left' | 'right' }
  | { type: 'SET_WEBTOON_GAP'; payload: number }
  | { type: 'SET_WEBTOON_MAX_WIDTH'; payload: number }
  | { type: 'ROTATE_PAGE_CW'; payload: number }
  | { type: 'ROTATE_PAGE_CCW'; payload: number }
  | { type: 'RESET_PAGE_ROTATION'; payload: number }
  | { type: 'SET_AUTO_WEBTOON'; payload: boolean }
  | { type: 'SHOW_START_SCREEN' }
  | { type: 'SHOW_END_SCREEN' }
  | { type: 'HIDE_TRANSITION_SCREEN' };

const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

// =============================================================================
// Initial State
// =============================================================================

const createInitialState = (fileId: string, filename: string): ReaderState => ({
  fileId,
  filename,
  pages: [],
  totalPages: 0,
  isLoading: true,
  error: null,
  pageDimensions: new Map(),
  currentPage: 0,
  mode: 'single',
  direction: 'ltr',
  scaling: 'fitHeight',
  customWidth: null,
  splitting: 'none',
  background: 'black',
  brightness: 100,
  colorCorrection: 'none',
  showPageShadow: true,
  autoHideUI: true,
  preloadCount: 3,
  webtoonGap: 8,
  webtoonMaxWidth: 800,
  isFullscreen: false,
  isUIVisible: true,
  isSettingsOpen: false,
  isThumbnailStripOpen: false,
  zoom: 1,
  panOffset: { x: 0, y: 0 },
  splitView: 'full',
  pageRotations: new Map(),
  bookmarks: [],
  completed: false,
  adjacentFiles: null,
  isAutoWebtoon: false,
  transitionScreen: 'none',
});

// =============================================================================
// Reducer
// =============================================================================

function readerReducer(state: ReaderState, action: ReaderAction): ReaderState {
  switch (action.type) {
    case 'INIT_START':
      return { ...state, isLoading: true, error: null, transitionScreen: 'none' };

    case 'INIT_SUCCESS':
      return {
        ...state,
        isLoading: false,
        pages: action.payload.pages,
        totalPages: action.payload.pages.length,
        currentPage: action.payload.progress.currentPage,
        bookmarks: action.payload.progress.bookmarks,
        completed: action.payload.progress.completed,
      };

    case 'INIT_ERROR':
      return { ...state, isLoading: false, error: action.payload };

    case 'SET_PAGE':
      return {
        ...state,
        currentPage: Math.max(0, Math.min(action.payload, state.totalPages - 1)),
        // Keep zoom level, only reset pan offset when changing pages
        panOffset: { x: 0, y: 0 },
      };

    case 'NEXT_PAGE': {
      const increment = state.mode === 'double' || state.mode === 'doubleManga' ? 2 : 1;
      const nextPage = Math.min(state.currentPage + increment, state.totalPages - 1);
      return {
        ...state,
        currentPage: nextPage,
        // Keep zoom level, only reset pan offset when changing pages
        panOffset: { x: 0, y: 0 },
      };
    }

    case 'PREV_PAGE': {
      const decrement = state.mode === 'double' || state.mode === 'doubleManga' ? 2 : 1;
      const prevPage = Math.max(state.currentPage - decrement, 0);
      return {
        ...state,
        currentPage: prevPage,
        // Keep zoom level, only reset pan offset when changing pages
        panOffset: { x: 0, y: 0 },
      };
    }

    case 'FIRST_PAGE':
      // Keep zoom level, only reset pan offset when changing pages
      return { ...state, currentPage: 0, panOffset: { x: 0, y: 0 } };

    case 'LAST_PAGE':
      // Keep zoom level, only reset pan offset when changing pages
      return { ...state, currentPage: state.totalPages - 1, panOffset: { x: 0, y: 0 } };

    case 'SET_MODE':
      return { ...state, mode: action.payload };

    case 'SET_DIRECTION':
      return { ...state, direction: action.payload };

    case 'SET_SCALING':
      return { ...state, scaling: action.payload, zoom: 1, panOffset: { x: 0, y: 0 } };

    case 'SET_CUSTOM_WIDTH':
      return { ...state, customWidth: action.payload };

    case 'SET_SPLITTING':
      return { ...state, splitting: action.payload };

    case 'SET_BACKGROUND':
      return { ...state, background: action.payload };

    case 'SET_BRIGHTNESS':
      return { ...state, brightness: Math.max(0, Math.min(200, action.payload)) };

    case 'SET_COLOR_CORRECTION':
      return { ...state, colorCorrection: action.payload };

    case 'TOGGLE_PAGE_SHADOW':
      return { ...state, showPageShadow: !state.showPageShadow };

    case 'TOGGLE_AUTO_HIDE_UI':
      return { ...state, autoHideUI: !state.autoHideUI };

    case 'TOGGLE_FULLSCREEN':
      return { ...state, isFullscreen: !state.isFullscreen };

    case 'SET_FULLSCREEN':
      return { ...state, isFullscreen: action.payload };

    case 'TOGGLE_UI':
      return { ...state, isUIVisible: !state.isUIVisible };

    case 'SHOW_UI':
      return { ...state, isUIVisible: true };

    case 'HIDE_UI':
      return { ...state, isUIVisible: false };

    case 'TOGGLE_SETTINGS':
      return { ...state, isSettingsOpen: !state.isSettingsOpen };

    case 'CLOSE_SETTINGS':
      return { ...state, isSettingsOpen: false };

    case 'TOGGLE_THUMBNAIL_STRIP':
      return { ...state, isThumbnailStripOpen: !state.isThumbnailStripOpen };

    case 'SET_ZOOM':
      return { ...state, zoom: Math.max(0.25, Math.min(4, action.payload)) };

    case 'ZOOM_IN': {
      const currentIndex = ZOOM_LEVELS.findIndex((z) => z >= state.zoom);
      const nextIndex = Math.min(currentIndex + 1, ZOOM_LEVELS.length - 1);
      return { ...state, zoom: ZOOM_LEVELS[nextIndex]! };
    }

    case 'ZOOM_OUT': {
      const currentIndex = ZOOM_LEVELS.findIndex((z) => z >= state.zoom);
      const prevIndex = Math.max(currentIndex - 1, 0);
      return { ...state, zoom: ZOOM_LEVELS[prevIndex]! };
    }

    case 'RESET_ZOOM':
      return { ...state, zoom: 1, panOffset: { x: 0, y: 0 } };

    case 'SET_PAN':
      return { ...state, panOffset: action.payload };

    case 'RESET_PAN':
      return { ...state, panOffset: { x: 0, y: 0 } };

    case 'ADD_BOOKMARK':
      if (state.bookmarks.includes(action.payload)) return state;
      return {
        ...state,
        bookmarks: [...state.bookmarks, action.payload].sort((a, b) => a - b),
      };

    case 'REMOVE_BOOKMARK':
      return {
        ...state,
        bookmarks: state.bookmarks.filter((b) => b !== action.payload),
      };

    case 'MARK_COMPLETED':
      return { ...state, completed: true };

    case 'LOAD_SETTINGS':
      return {
        ...state,
        mode: action.payload.mode,
        direction: action.payload.direction,
        scaling: action.payload.scaling,
        customWidth: action.payload.customWidth,
        splitting: action.payload.splitting,
        background: action.payload.background,
        brightness: action.payload.brightness,
        colorCorrection: action.payload.colorCorrection,
        showPageShadow: action.payload.showPageShadow,
        autoHideUI: action.payload.autoHideUI,
        preloadCount: action.payload.preloadCount,
      };

    case 'SET_PAGE_DIMENSIONS': {
      const newDimensions = new Map(state.pageDimensions);
      newDimensions.set(action.payload.pageIndex, action.payload.dimensions);
      return { ...state, pageDimensions: newDimensions };
    }

    case 'SET_ADJACENT_FILES':
      return { ...state, adjacentFiles: action.payload };

    case 'SET_SPLIT_VIEW':
      return { ...state, splitView: action.payload };

    case 'SET_WEBTOON_GAP':
      return { ...state, webtoonGap: Math.max(0, Math.min(100, action.payload)) };

    case 'SET_WEBTOON_MAX_WIDTH':
      return { ...state, webtoonMaxWidth: Math.max(200, Math.min(2000, action.payload)) };

    case 'ROTATE_PAGE_CW': {
      const newRotations = new Map(state.pageRotations);
      const current = newRotations.get(action.payload) ?? 0;
      const next = ((current + 90) % 360) as PageRotation;
      if (next === 0) {
        newRotations.delete(action.payload);
      } else {
        newRotations.set(action.payload, next);
      }
      return { ...state, pageRotations: newRotations };
    }

    case 'ROTATE_PAGE_CCW': {
      const newRotations = new Map(state.pageRotations);
      const current = newRotations.get(action.payload) ?? 0;
      const next = ((current - 90 + 360) % 360) as PageRotation;
      if (next === 0) {
        newRotations.delete(action.payload);
      } else {
        newRotations.set(action.payload, next);
      }
      return { ...state, pageRotations: newRotations };
    }

    case 'RESET_PAGE_ROTATION': {
      const newRotations = new Map(state.pageRotations);
      newRotations.delete(action.payload);
      return { ...state, pageRotations: newRotations };
    }

    case 'SET_AUTO_WEBTOON':
      return { ...state, isAutoWebtoon: action.payload };

    case 'SHOW_START_SCREEN':
      return { ...state, transitionScreen: 'start' };

    case 'SHOW_END_SCREEN':
      return { ...state, transitionScreen: 'end' };

    case 'HIDE_TRANSITION_SCREEN':
      return { ...state, transitionScreen: 'none' };

    default:
      return state;
  }
}

// =============================================================================
// Context
// =============================================================================

interface ReaderContextValue {
  state: ReaderState;
  // Navigation
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  firstPage: () => void;
  lastPage: () => void;
  // Settings
  setMode: (mode: ReadingMode) => void;
  setDirection: (direction: ReadingDirection) => void;
  setScaling: (scaling: ImageScaling) => void;
  setCustomWidth: (width: number | null) => void;
  setSplitting: (splitting: ImageSplitting) => void;
  setBackground: (background: BackgroundColor) => void;
  setBrightness: (brightness: number) => void;
  setColorCorrection: (colorCorrection: ColorCorrection) => void;
  togglePageShadow: () => void;
  toggleAutoHideUI: () => void;
  saveSettings: () => Promise<void>;
  // Webtoon settings
  setWebtoonGap: (gap: number) => void;
  setWebtoonMaxWidth: (width: number) => void;
  // UI
  toggleFullscreen: () => void;
  toggleUI: () => void;
  showUI: () => void;
  hideUI: () => void;
  toggleSettings: () => void;
  closeSettings: () => void;
  toggleThumbnailStrip: () => void;
  // Zoom
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setPan: (offset: { x: number; y: number }) => void;
  resetPan: () => void;
  // Bookmarks
  addBookmark: (pageIndex?: number) => Promise<void>;
  removeBookmark: (pageIndex: number) => Promise<void>;
  isBookmarked: (pageIndex: number) => boolean;
  // Page dimensions
  setPageDimensions: (pageIndex: number, width: number, height: number) => void;
  isLandscape: (pageIndex: number) => boolean;
  // Page rotation
  rotatePageCW: (pageIndex?: number) => void;
  rotatePageCCW: (pageIndex?: number) => void;
  resetPageRotation: (pageIndex?: number) => void;
  getPageRotation: (pageIndex: number) => PageRotation;
  // Chapter navigation
  goToNextChapter: () => string | null;
  goToPrevChapter: () => string | null;
  hasNextChapter: boolean;
  hasPrevChapter: boolean;
  // Webtoon detection
  detectWebtoonFormat: () => void;
  // Transition screens
  exitTransitionScreen: () => void;
}

const ReaderContext = createContext<ReaderContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface ReaderProviderProps {
  fileId: string;
  filename: string;
  startPage?: number;
  children: ReactNode;
}

export function ReaderProvider({ fileId, filename, startPage, children }: ReaderProviderProps) {
  const [state, dispatch] = useReducer(readerReducer, createInitialState(fileId, filename));

  // Initialize reader
  useEffect(() => {
    let cancelled = false;

    async function init() {
      dispatch({ type: 'INIT_START' });

      try {
        // Load settings, archive contents, progress, and adjacent files in parallel
        const [settingsResponse, contentsResponse, progressResponse, adjacentResponse] = await Promise.all([
          getReaderSettings(),
          getArchiveContents(fileId),
          getReadingProgress(fileId),
          getAdjacentFiles(fileId),
        ]);

        if (cancelled) return;

        // Apply settings
        dispatch({ type: 'LOAD_SETTINGS', payload: settingsResponse });

        // Filter to only image files and sort
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
        const imageEntries = contentsResponse.entries
          .filter((e) => {
            if (e.isDirectory) return false;
            const ext = e.path.toLowerCase().split('.').pop() || '';
            return imageExtensions.includes(ext);
          })
          .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

        const pages: PageInfo[] = imageEntries.map((e, i) => ({
          path: e.path,
          index: i,
          url: getPageUrl(fileId, e.path),
        }));

        dispatch({
          type: 'INIT_SUCCESS',
          payload: {
            pages,
            progress: {
              // Use startPage if provided (e.g., when transitioning between issues),
              // otherwise use saved progress
              currentPage: startPage !== undefined ? startPage : (progressResponse.currentPage || 0),
              bookmarks: progressResponse.bookmarks || [],
              completed: progressResponse.completed || false,
            },
          },
        });

        // Set adjacent files for chapter navigation
        dispatch({
          type: 'SET_ADJACENT_FILES',
          payload: adjacentResponse,
        });

        // Generate thumbnails in the background if not already cached
        // This ensures thumbnails are available for the thumbnail strip
        generateThumbnails(fileId).catch((err) => {
          console.warn('Failed to generate thumbnails:', err);
        });
      } catch (err) {
        if (cancelled) return;
        dispatch({
          type: 'INIT_ERROR',
          payload: err instanceof Error ? err.message : 'Failed to load comic',
        });
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [fileId, startPage]);

  // Save progress when page changes
  useEffect(() => {
    if (state.isLoading || state.totalPages === 0) return;

    const saveProgress = async () => {
      try {
        await updateReadingProgress(fileId, {
          currentPage: state.currentPage,
          totalPages: state.totalPages,
        });
      } catch (err) {
        console.error('Failed to save reading progress:', err);
      }
    };

    // Debounce progress saves
    const timeout = setTimeout(saveProgress, 1000);
    return () => clearTimeout(timeout);
  }, [fileId, state.currentPage, state.totalPages, state.isLoading]);

  // Check if current page should be split
  const shouldSplitCurrentPage = useCallback(() => {
    if (state.splitting === 'none') return false;
    if (state.mode !== 'single') return false;
    const dims = state.pageDimensions.get(state.currentPage);
    return dims?.isLandscape ?? false;
  }, [state.splitting, state.mode, state.pageDimensions, state.currentPage]);

  // Navigation actions
  const goToPage = useCallback((page: number) => {
    dispatch({ type: 'SET_PAGE', payload: page });
    // Reset split view when navigating to a new page
    dispatch({ type: 'SET_SPLIT_VIEW', payload: 'full' });
  }, []);

  const nextPage = useCallback(() => {
    // If on start screen, hide it and return to first page
    if (state.transitionScreen === 'start') {
      dispatch({ type: 'HIDE_TRANSITION_SCREEN' });
      return;
    }

    // If on end screen, do nothing (navigation to next issue handled by Reader.tsx)
    if (state.transitionScreen === 'end') {
      return;
    }

    // Handle split page navigation
    if (shouldSplitCurrentPage()) {
      const firstHalf = state.splitting === 'rtl' ? 'right' : 'left';
      const secondHalf = state.splitting === 'rtl' ? 'left' : 'right';

      if (state.splitView === 'full') {
        // First time viewing split page - show first half
        dispatch({ type: 'SET_SPLIT_VIEW', payload: firstHalf });
        return;
      } else if (state.splitView === firstHalf) {
        // On first half - go to second half
        dispatch({ type: 'SET_SPLIT_VIEW', payload: secondHalf });
        return;
      }
      // On second half - proceed to next page (fall through)
    }

    // Check if we're on the last page - if so, show end screen
    const isLastPage = state.currentPage >= state.totalPages - 1;
    if (isLastPage) {
      dispatch({ type: 'SHOW_END_SCREEN' });
      // Mark as completed
      if (!state.completed) {
        apiMarkAsCompleted(fileId).catch((err) => {
          console.error('Failed to mark as completed:', err);
        });
        dispatch({ type: 'MARK_COMPLETED' });
      }
      return;
    }

    dispatch({ type: 'NEXT_PAGE' });
    dispatch({ type: 'SET_SPLIT_VIEW', payload: 'full' });
  }, [shouldSplitCurrentPage, state.splitting, state.splitView, state.transitionScreen, state.currentPage, state.totalPages, state.completed, fileId]);

  const prevPage = useCallback(() => {
    // If on end screen, hide it and return to last page
    if (state.transitionScreen === 'end') {
      dispatch({ type: 'HIDE_TRANSITION_SCREEN' });
      return;
    }

    // If on start screen, do nothing (navigation to prev issue handled by Reader.tsx)
    if (state.transitionScreen === 'start') {
      return;
    }

    // Handle split page navigation
    if (shouldSplitCurrentPage()) {
      const firstHalf = state.splitting === 'rtl' ? 'right' : 'left';
      const secondHalf = state.splitting === 'rtl' ? 'left' : 'right';

      if (state.splitView === secondHalf) {
        // On second half - go back to first half
        dispatch({ type: 'SET_SPLIT_VIEW', payload: firstHalf });
        return;
      }
      // On first half or full - proceed to prev page (fall through)
    }

    // Check if we're on the first page with a previous issue - if so, show start screen
    const isFirstPage = state.currentPage === 0;
    if (isFirstPage && state.adjacentFiles?.previous) {
      dispatch({ type: 'SHOW_START_SCREEN' });
      return;
    }

    dispatch({ type: 'PREV_PAGE' });
    dispatch({ type: 'SET_SPLIT_VIEW', payload: 'full' });
  }, [shouldSplitCurrentPage, state.splitting, state.splitView, state.transitionScreen, state.currentPage, state.adjacentFiles]);

  const firstPage = useCallback(() => {
    dispatch({ type: 'FIRST_PAGE' });
    dispatch({ type: 'SET_SPLIT_VIEW', payload: 'full' });
  }, []);

  const lastPage = useCallback(() => {
    dispatch({ type: 'LAST_PAGE' });
    dispatch({ type: 'SET_SPLIT_VIEW', payload: 'full' });
  }, []);

  // Settings actions
  const setMode = useCallback((mode: ReadingMode) => {
    dispatch({ type: 'SET_MODE', payload: mode });
  }, []);

  const setDirection = useCallback((direction: ReadingDirection) => {
    dispatch({ type: 'SET_DIRECTION', payload: direction });
  }, []);

  const setScaling = useCallback((scaling: ImageScaling) => {
    dispatch({ type: 'SET_SCALING', payload: scaling });
  }, []);

  const setCustomWidth = useCallback((width: number | null) => {
    dispatch({ type: 'SET_CUSTOM_WIDTH', payload: width });
  }, []);

  const setSplitting = useCallback((splitting: ImageSplitting) => {
    dispatch({ type: 'SET_SPLITTING', payload: splitting });
  }, []);

  const setBackground = useCallback((background: BackgroundColor) => {
    dispatch({ type: 'SET_BACKGROUND', payload: background });
  }, []);

  const setBrightness = useCallback((brightness: number) => {
    dispatch({ type: 'SET_BRIGHTNESS', payload: brightness });
  }, []);

  const setColorCorrection = useCallback((colorCorrection: ColorCorrection) => {
    dispatch({ type: 'SET_COLOR_CORRECTION', payload: colorCorrection });
  }, []);

  const togglePageShadow = useCallback(() => {
    dispatch({ type: 'TOGGLE_PAGE_SHADOW' });
  }, []);

  const toggleAutoHideUI = useCallback(() => {
    dispatch({ type: 'TOGGLE_AUTO_HIDE_UI' });
  }, []);

  const saveSettings = useCallback(async () => {
    try {
      // Convert webtoon mode to continuous for saving (API doesn't know about webtoon)
      const modeToSave = state.mode === 'webtoon' ? 'continuous' : state.mode;
      await updateReaderSettings({
        mode: modeToSave,
        direction: state.direction,
        scaling: state.scaling,
        customWidth: state.customWidth,
        splitting: state.splitting,
        background: state.background,
        brightness: state.brightness,
        colorCorrection: state.colorCorrection,
        showPageShadow: state.showPageShadow,
        autoHideUI: state.autoHideUI,
        preloadCount: state.preloadCount,
      });
    } catch (err) {
      console.error('Failed to save reader settings:', err);
    }
  }, [state]);

  // UI actions
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      dispatch({ type: 'SET_FULLSCREEN', payload: true });
    } else {
      document.exitFullscreen();
      dispatch({ type: 'SET_FULLSCREEN', payload: false });
    }
  }, []);

  const toggleUI = useCallback(() => {
    dispatch({ type: 'TOGGLE_UI' });
  }, []);

  const showUI = useCallback(() => {
    dispatch({ type: 'SHOW_UI' });
  }, []);

  const hideUI = useCallback(() => {
    dispatch({ type: 'HIDE_UI' });
  }, []);

  const toggleSettings = useCallback(() => {
    dispatch({ type: 'TOGGLE_SETTINGS' });
  }, []);

  const closeSettings = useCallback(() => {
    dispatch({ type: 'CLOSE_SETTINGS' });
  }, []);

  const toggleThumbnailStrip = useCallback(() => {
    dispatch({ type: 'TOGGLE_THUMBNAIL_STRIP' });
  }, []);

  // Zoom actions
  const setZoom = useCallback((zoom: number) => {
    dispatch({ type: 'SET_ZOOM', payload: zoom });
  }, []);

  const zoomIn = useCallback(() => {
    dispatch({ type: 'ZOOM_IN' });
  }, []);

  const zoomOut = useCallback(() => {
    dispatch({ type: 'ZOOM_OUT' });
  }, []);

  const resetZoom = useCallback(() => {
    dispatch({ type: 'RESET_ZOOM' });
  }, []);

  const setPan = useCallback((offset: { x: number; y: number }) => {
    dispatch({ type: 'SET_PAN', payload: offset });
  }, []);

  const resetPan = useCallback(() => {
    dispatch({ type: 'RESET_PAN' });
  }, []);

  // Bookmark actions
  const addBookmark = useCallback(
    async (pageIndex?: number) => {
      const page = pageIndex ?? state.currentPage;
      try {
        await apiAddBookmark(fileId, page);
        dispatch({ type: 'ADD_BOOKMARK', payload: page });
      } catch (err) {
        console.error('Failed to add bookmark:', err);
      }
    },
    [fileId, state.currentPage]
  );

  const removeBookmark = useCallback(
    async (pageIndex: number) => {
      try {
        await apiRemoveBookmark(fileId, pageIndex);
        dispatch({ type: 'REMOVE_BOOKMARK', payload: pageIndex });
      } catch (err) {
        console.error('Failed to remove bookmark:', err);
      }
    },
    [fileId]
  );

  const isBookmarked = useCallback(
    (pageIndex: number) => {
      return state.bookmarks.includes(pageIndex);
    },
    [state.bookmarks]
  );

  // Page dimensions actions
  const setPageDimensions = useCallback(
    (pageIndex: number, width: number, height: number) => {
      const isLandscapePage = width > height * 1.2; // 20% wider than tall = landscape
      dispatch({
        type: 'SET_PAGE_DIMENSIONS',
        payload: {
          pageIndex,
          dimensions: { width, height, isLandscape: isLandscapePage },
        },
      });
    },
    []
  );

  const isLandscape = useCallback(
    (pageIndex: number) => {
      const dims = state.pageDimensions.get(pageIndex);
      return dims?.isLandscape ?? false;
    },
    [state.pageDimensions]
  );

  // Webtoon settings
  const setWebtoonGap = useCallback((gap: number) => {
    dispatch({ type: 'SET_WEBTOON_GAP', payload: gap });
  }, []);

  const setWebtoonMaxWidth = useCallback((width: number) => {
    dispatch({ type: 'SET_WEBTOON_MAX_WIDTH', payload: width });
  }, []);

  // Page rotation
  const rotatePageCW = useCallback(
    (pageIndex?: number) => {
      dispatch({ type: 'ROTATE_PAGE_CW', payload: pageIndex ?? state.currentPage });
    },
    [state.currentPage]
  );

  const rotatePageCCW = useCallback(
    (pageIndex?: number) => {
      dispatch({ type: 'ROTATE_PAGE_CCW', payload: pageIndex ?? state.currentPage });
    },
    [state.currentPage]
  );

  const resetPageRotation = useCallback(
    (pageIndex?: number) => {
      dispatch({ type: 'RESET_PAGE_ROTATION', payload: pageIndex ?? state.currentPage });
    },
    [state.currentPage]
  );

  const getPageRotation = useCallback(
    (pageIndex: number): PageRotation => {
      return state.pageRotations.get(pageIndex) ?? 0;
    },
    [state.pageRotations]
  );

  // Webtoon detection - checks if majority of pages are tall/narrow (webtoon format)
  const detectWebtoonFormat = useCallback(() => {
    if (state.pageDimensions.size < 3) return; // Need enough pages to detect

    let tallPageCount = 0;
    let widePageCount = 0;

    state.pageDimensions.forEach((dims) => {
      const aspectRatio = dims.height / dims.width;
      if (aspectRatio > 2) {
        // Very tall - likely webtoon
        tallPageCount++;
      } else if (aspectRatio < 0.8) {
        // Landscape/wide
        widePageCount++;
      }
    });

    // If 70%+ of pages are very tall, auto-detect as webtoon
    const totalChecked = state.pageDimensions.size;
    const isWebtoon = tallPageCount / totalChecked > 0.7;

    dispatch({ type: 'SET_AUTO_WEBTOON', payload: isWebtoon });

    // Auto-switch to webtoon mode if detected and currently in single mode
    if (isWebtoon && state.mode === 'single') {
      dispatch({ type: 'SET_MODE', payload: 'webtoon' });
    }
  }, [state.pageDimensions, state.mode]);

  // Chapter navigation
  const hasNextChapter = state.adjacentFiles?.next !== null;
  const hasPrevChapter = state.adjacentFiles?.previous !== null;

  const goToNextChapter = useCallback((): string | null => {
    if (state.adjacentFiles?.next) {
      return state.adjacentFiles.next.fileId;
    }
    return null;
  }, [state.adjacentFiles]);

  const goToPrevChapter = useCallback((): string | null => {
    if (state.adjacentFiles?.previous) {
      return state.adjacentFiles.previous.fileId;
    }
    return null;
  }, [state.adjacentFiles]);

  // Exit transition screen
  const exitTransitionScreen = useCallback(() => {
    dispatch({ type: 'HIDE_TRANSITION_SCREEN' });
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      dispatch({ type: 'SET_FULLSCREEN', payload: !!document.fullscreenElement });
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const value: ReaderContextValue = {
    state,
    goToPage,
    nextPage,
    prevPage,
    firstPage,
    lastPage,
    setMode,
    setDirection,
    setScaling,
    setCustomWidth,
    setSplitting,
    setBackground,
    setBrightness,
    setColorCorrection,
    togglePageShadow,
    toggleAutoHideUI,
    saveSettings,
    setWebtoonGap,
    setWebtoonMaxWidth,
    toggleFullscreen,
    toggleUI,
    showUI,
    hideUI,
    toggleSettings,
    closeSettings,
    toggleThumbnailStrip,
    setZoom,
    zoomIn,
    zoomOut,
    resetZoom,
    setPan,
    resetPan,
    addBookmark,
    removeBookmark,
    isBookmarked,
    setPageDimensions,
    isLandscape,
    rotatePageCW,
    rotatePageCCW,
    resetPageRotation,
    getPageRotation,
    goToNextChapter,
    goToPrevChapter,
    hasNextChapter,
    hasPrevChapter,
    detectWebtoonFormat,
    exitTransitionScreen,
  };

  return <ReaderContext.Provider value={value}>{children}</ReaderContext.Provider>;
}

// =============================================================================
// Hook
// =============================================================================

export function useReader() {
  const context = useContext(ReaderContext);
  if (!context) {
    throw new Error('useReader must be used within a ReaderProvider');
  }
  return context;
}
