/**
 * Helixio - Comic Book Management Application
 *
 * Main application component with routing and layout.
 */

import { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { AppProvider, useApp } from './contexts/AppContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { MetadataJobProvider, useMetadataJob } from './contexts/MetadataJobContext';
import { LibraryScanProvider } from './contexts/LibraryScanContext';
import { AdvancedFilterProvider, useAdvancedFilter } from './contexts/AdvancedFilterContext';
import { FilterPresetProvider } from './contexts/FilterPresetContext';
import { CollectionsProvider } from './contexts/CollectionsContext';
import { WantToReadProvider } from './contexts/WantToReadContext';
import { AnnotationsProvider } from './contexts/AnnotationsContext';
import { ThemeProvider } from './themes/ThemeContext';
import { HelixEffects, SandmanEffects, SynthwaveEffects, RetroEffects, MangaEffects, PulpEffects } from './themes';
import { AchievementProvider } from './contexts/AchievementContext';
import { AchievementToast } from './components/AchievementToast';
import { ToastProvider } from './contexts/ToastContext';
import { Toast } from './components/Toast';
import { JobFailureNotifier } from './components/JobFailureNotifier';
import { ConfirmModalProvider } from './components/ConfirmModal';
import { DownloadProvider } from './contexts/DownloadContext';
import { BreadcrumbProvider } from './contexts/BreadcrumbContext';
import { DownloadNotificationBar } from './components/DownloadNotificationBar/DownloadNotificationBar';
import { DownloadConfirmationModal } from './components/DownloadConfirmationModal/DownloadConfirmationModal';
import { SidebarNew, StatusBar } from './components/Layout';
import { FileList } from './components/FileList';
import { GridView } from './components/GridView';
import { ListView } from './components/ListView';
import { LibraryToolbar } from './components/LibraryToolbar';
import { MetadataEditor } from './components/MetadataEditor';
import { MetadataApprovalModal } from './components/MetadataApproval';
import { PageEditor } from './components/PageEditor';
import { Search } from './components/Search';
import { Settings } from './components/Settings';
import { DuplicateManager } from './components/DuplicateManager';
import { RollbackPanel } from './components/RollbackPanel';
import { JobBanner } from './components/JobBanner';
import { UnifiedJobsPanel } from './components/UnifiedJobsPanel';
import { AdvancedFilterPanel } from './components/AdvancedFilter/AdvancedFilterPanel';
import type { GroupField } from './components/SortGroup/SortGroupPanel';

// Keep eagerly loaded for conditional rendering before Routes
import { LoginPage } from './pages/LoginPage';
import { SetupWizardPage } from './pages/SetupWizardPage';

// Lazy-loaded pages for code splitting (reduces initial bundle by ~40%)
const ReaderPage = lazy(() => import('./pages/ReaderPage').then(m => ({ default: m.ReaderPage })));
const HomePage = lazy(() => import('./pages/HomePage').then(m => ({ default: m.HomePage })));
const SeriesBrowserPage = lazy(() => import('./pages/SeriesBrowserPage').then(m => ({ default: m.SeriesBrowserPage })));
const SeriesPage = lazy(() => import('./pages/SeriesPage').then(m => ({ default: m.SeriesPage })));
const SeriesDetailPage = lazy(() => import('./pages/SeriesDetailPage').then(m => ({ default: m.SeriesDetailPage })));
const IssueDetailPage = lazy(() => import('./pages/IssueDetailPage').then(m => ({ default: m.IssueDetailPage })));
const DuplicatesPage = lazy(() => import('./pages/DuplicatesPage').then(m => ({ default: m.DuplicatesPage })));
const CollectionsPage = lazy(() => import('./pages/CollectionsPage').then(m => ({ default: m.CollectionsPage })));
const CollectionDetailPage = lazy(() => import('./pages/CollectionDetailPage').then(m => ({ default: m.CollectionDetailPage })));
const StatsPage = lazy(() => import('./pages/StatsPage').then(m => ({ default: m.StatsPage })));
const EntityStatsPage = lazy(() => import('./pages/EntityStatsPage').then(m => ({ default: m.EntityStatsPage })));
const AchievementsPage = lazy(() => import('./pages/AchievementsPage').then(m => ({ default: m.AchievementsPage })));
const FoldersPage = lazy(() => import('./pages/FoldersPage').then(m => ({ default: m.FoldersPage })));

// Lazy-loaded components for code splitting
const SharedLists = lazy(() => import('./components/SharedLists').then(m => ({ default: m.SharedLists })));
const UserManagement = lazy(() => import('./components/Admin').then(m => ({ default: m.UserManagement })));
import { HelixioLoader } from './components/HelixioLoader';
import { NavigationSidebar } from './components/NavigationSidebar';
import { GlobalHeader } from './components/GlobalHeader';
import { NotesMigrationBanner } from './components/NotesMigrationBanner';
import { PageLoadingFallback } from './components/PageLoadingFallback';
import { groupFiles } from './utils/file-grouping';
import type { ComicFile } from './services/api.service';

type ViewMode = 'list' | 'grid' | 'compact';

function LibraryView() {
  const { files, selectedFiles, pagination, refreshFiles, groupField: groupFieldRaw, setGroupField, sortField, sortOrder } = useApp();
  const groupField = groupFieldRaw as GroupField;
  const { startJob } = useMetadataJob();
  const { applyFilterToFiles, isFilterPanelOpen, closeFilterPanel } = useAdvancedFilter();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [editingFileIds, setEditingFileIds] = useState<string[] | null>(null);
  const [editingPages, setEditingPages] = useState<{ fileId: string; filename: string } | null>(null);

  // Navigation sidebar state
  const contentRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });

  // Apply advanced filter to files
  const filteredFiles = applyFilterToFiles(files);

  // Get files in display order (flattened from groups when grouping is active)
  // This ensures NavigationSidebar markers match the actual display order
  const displayOrderedFiles = useMemo(() => {
    if (groupField === 'none') {
      return filteredFiles;
    }
    // Flatten the grouped files into display order
    const groups = groupFiles(filteredFiles, groupField);
    const flattened: ComicFile[] = [];
    for (const [, groupedFiles] of groups) {
      flattened.push(...groupedFiles);
    }
    return flattened;
  }, [filteredFiles, groupField]);

  // Determine the effective sort field for the sidebar
  // When grouping is active, navigate by group (e.g., series name, writer name)
  // When no grouping, navigate by the actual sort field
  const sidebarSortField = useMemo(() => {
    if (groupField === 'none') {
      return sortField;
    }
    // Map group fields to the corresponding sort field for the sidebar
    switch (groupField) {
      case 'series':
        return 'series';
      case 'publisher':
        return 'publisher';
      case 'year':
        return 'year';
      case 'genre':
        return 'genre';
      case 'writer':
        return 'writer';
      case 'penciller':
        return 'penciller';
      case 'firstLetter':
        return 'filename'; // First letter of filename/series
      default:
        return sortField;
    }
  }, [groupField, sortField]);

  // Track visible range for navigation sidebar
  useEffect(() => {
    const container = contentRef.current;
    if (!container || filteredFiles.length === 0) return;

    const updateVisibleRange = () => {
      const gridItems = container.querySelectorAll('[data-file-index]');
      const containerRect = container.getBoundingClientRect();

      let minIndex = Infinity;
      let maxIndex = -1;

      gridItems.forEach((item) => {
        const rect = item.getBoundingClientRect();
        const isVisible = rect.bottom > containerRect.top && rect.top < containerRect.bottom;

        if (isVisible) {
          // Read the actual data-file-index attribute, not the forEach index
          const fileIndex = parseInt(item.getAttribute('data-file-index') || '0', 10);
          if (fileIndex < minIndex) minIndex = fileIndex;
          if (fileIndex > maxIndex) maxIndex = fileIndex;
        }
      });

      if (maxIndex >= 0) {
        setVisibleRange({ start: minIndex, end: maxIndex });
      }
    };

    container.addEventListener('scroll', updateVisibleRange, { passive: true });
    // Also listen to window scroll since the container might not be the scroll parent
    window.addEventListener('scroll', updateVisibleRange, { passive: true });
    updateVisibleRange();

    return () => {
      container.removeEventListener('scroll', updateVisibleRange);
      window.removeEventListener('scroll', updateVisibleRange);
    };
  }, [filteredFiles.length]);

  // Scroll to index for navigation sidebar
  const scrollToIndex = useCallback((index: number) => {
    const container = contentRef.current;
    if (!container) return;

    const gridItems = container.querySelectorAll('[data-file-index]');
    const targetItem = gridItems[index] as HTMLElement;

    if (targetItem) {
      targetItem.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Get item value for navigation sidebar based on the effective sort field
  const getItemValue = useCallback((item: ComicFile) => {
    switch (sidebarSortField) {
      case 'filename':
        return item.filename;
      case 'series':
        return item.metadata?.series || 'Unknown Series';
      case 'title':
        return item.metadata?.title || item.filename;
      case 'publisher':
        return item.metadata?.publisher;
      case 'year':
        return item.metadata?.year;
      case 'number':
        return item.metadata?.number;
      case 'createdAt':
        return item.createdAt;
      case 'updatedAt':
        return item.updatedAt;
      case 'writer':
        return item.metadata?.writer;
      case 'penciller':
        return item.metadata?.penciller;
      case 'genre':
        return item.metadata?.genre;
      default:
        return item.filename;
    }
  }, [sidebarSortField]);

  const handleFileDoubleClick = (fileId: string) => {
    // Open reader on double-click
    const file = files.find((f) => f.id === fileId);
    const filename = file?.filename || 'Comic';
    navigate(`/read/${fileId}?filename=${encodeURIComponent(filename)}`);
  };

  // Handle edit metadata from toolbar (uses selected files)
  const handleToolbarEditMetadata = () => {
    if (selectedFiles.size > 0) {
      setEditingFileIds(Array.from(selectedFiles));
    }
  };

  // Handle edit metadata from context menu (uses provided file IDs)
  const handleEditMetadata = (fileIds: string[]) => {
    setEditingFileIds(fileIds);
  };

  const handleEditPages = () => {
    if (selectedFiles.size === 1) {
      const fileId = Array.from(selectedFiles)[0]!;
      const file = files.find((f) => f.id === fileId);
      if (file) {
        setEditingPages({ fileId, filename: file.filename });
      }
    }
  };

  const handleFetchMetadata = (fileIds: string[]) => {
    startJob(fileIds);
  };

  return (
    <div className="library-view">
      {/* Unified Toolbar */}
      <LibraryToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        filteredCount={filteredFiles.length}
        totalCount={pagination.total}
        onEditMetadata={selectedFiles.size > 0 ? handleToolbarEditMetadata : undefined}
        onEditPages={selectedFiles.size === 1 ? handleEditPages : undefined}
        groupField={groupField}
        onGroupChange={setGroupField}
      />

      {/* Advanced Filter Panel - Slide in from right */}
      {isFilterPanelOpen && (
        <div className="filter-panel-overlay" onClick={closeFilterPanel}>
          <div className="filter-panel-container" onClick={(e) => e.stopPropagation()}>
            <AdvancedFilterPanel />
          </div>
        </div>
      )}

      {/* Scrollable content area with view and sidebar */}
      <div className="library-view-content" ref={contentRef}>
        {/* View Content */}
        {viewMode === 'list' ? (
          <ListView
            onFileDoubleClick={handleFileDoubleClick}
            onFetchMetadata={handleFetchMetadata}
            onEditMetadata={handleEditMetadata}
            filteredFiles={filteredFiles}
            groupField={groupField}
          />
        ) : viewMode === 'compact' ? (
          <FileList onFetchMetadata={handleFetchMetadata} onEditMetadata={handleEditMetadata} filteredFiles={filteredFiles} compact />
        ) : (
          <GridView
            onFileDoubleClick={handleFileDoubleClick}
            onFetchMetadata={handleFetchMetadata}
            onEditMetadata={handleEditMetadata}
            filteredFiles={filteredFiles}
            groupField={groupField}
          />
        )}

        {/* Navigation Sidebar - inside scroll container for proper sticky behavior */}
        {displayOrderedFiles.length >= 10 && (
          <NavigationSidebar
            items={displayOrderedFiles}
            sortField={sidebarSortField}
            sortOrder={sortOrder}
            onNavigate={scrollToIndex}
            visibleRange={visibleRange}
            getItemValue={getItemValue}
          />
        )}
      </div>

      {/* Metadata Editor Modal */}
      {editingFileIds && (
        <div className="modal-overlay" onClick={() => setEditingFileIds(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <MetadataEditor
              fileIds={editingFileIds}
              onClose={() => setEditingFileIds(null)}
              onSave={() => {
                setEditingFileIds(null);
                refreshFiles();
              }}
            />
          </div>
        </div>
      )}

      {/* Page Editor Modal */}
      {editingPages && (
        <div className="modal-overlay" onClick={() => setEditingPages(null)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <PageEditor
              fileId={editingPages.fileId}
              filename={editingPages.filename}
              onClose={() => setEditingPages(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function AppContent() {
  const location = useLocation();
  const { hasActiveJob, isModalOpen } = useMetadataJob();
  const { isAuthenticated, isLoading: authLoading, setupRequired, user } = useAuth();

  // Require authentication for all routes except /login
  // Unauthenticated users are always redirected to login page
  if (authLoading) {
    return <HelixioLoader fullPage message="Loading..." />;
  }

  // Show setup/login page if required
  if (setupRequired || (!isAuthenticated && location.pathname !== '/login')) {
    return <LoginPage />;
  }

  // Show setup wizard for new admin users who haven't completed setup
  // Only show if: user is authenticated, is admin, and hasn't completed setup
  if (
    isAuthenticated &&
    user &&
    user.role === 'admin' &&
    !user.setupComplete &&
    location.pathname !== '/setup'
  ) {
    return <SetupWizardPage />;
  }

  // Check if we're on the reader route
  const isReaderRoute = location.pathname.startsWith('/read/');

  // Don't show sidebar for search (full-width view) or reader (fullscreen)
  const hideSidebar = ['/search'].includes(location.pathname) || isReaderRoute;

  // Hide status bar for reader
  const hideStatusBar = isReaderRoute;

  // Add class when job banner is visible
  const showBanner = hasActiveJob && !isModalOpen;

  return (
    <div className={`app ${hideSidebar ? 'no-sidebar' : ''} ${showBanner ? 'has-job-banner' : ''}`}>
      {/* Job Banner - shows when job is running but modal is closed */}
      <JobBanner />

      {!hideSidebar && <SidebarNew />}

      {/* Global Header - hidden on reader route (handled internally) */}
      <GlobalHeader />

      <main className="main-content">
        <Suspense fallback={<PageLoadingFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/library" element={<LibraryView />} />
            <Route path="/library/:libraryId" element={<LibraryView />} />
            <Route path="/folders" element={<FoldersPage />} />
            <Route path="/series" element={<SeriesPage />} />
            <Route path="/series-old" element={<SeriesBrowserPage />} />
            <Route path="/series/duplicates" element={<DuplicatesPage />} />
            <Route path="/series/:seriesId" element={<SeriesDetailPage />} />
            <Route path="/issue/:fileId" element={<IssueDetailPage />} />
            <Route path="/collections" element={<CollectionsPage />} />
            <Route path="/collections/:collectionId" element={<CollectionsPage />} />
            <Route path="/collection/:collectionId" element={<CollectionDetailPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/stats/:entityType/:entityName" element={<EntityStatsPage />} />
            <Route path="/achievements" element={<AchievementsPage />} />
            <Route path="/read/:fileId" element={<ReaderPage />} />
            <Route path="/search" element={<Search />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/duplicates" element={<DuplicateManager />} />
            <Route path="/jobs" element={<UnifiedJobsPanel />} />
            <Route path="/history" element={<RollbackPanel />} />
            <Route path="/lists/*" element={<SharedLists />} />
            <Route path="/admin/users" element={<UserManagement />} />
            <Route path="/setup" element={<SetupWizardPage />} />
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </Suspense>
      </main>

      {!hideStatusBar && <StatusBar />}

      {/* Metadata Approval Modal - controlled by context */}
      {isModalOpen && <MetadataApprovalModal />}

      {/* Theme-specific effects - not shown in reader (would be distracting and cover content) */}
      {!isReaderRoute && (
        <>
          <HelixEffects />
          <SandmanEffects />
          <SynthwaveEffects />
          <RetroEffects />
          <MangaEffects />
          <PulpEffects />
        </>
      )}
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <AppProvider>
            <BreadcrumbProvider>
              <LibraryScanProvider>
              <FilterPresetProvider>
              <AdvancedFilterProvider>
                <CollectionsProvider>
                  <WantToReadProvider>
                    <AnnotationsProvider>
                      <MetadataJobProvider>
                        <AchievementProvider>
                          <DownloadProvider>
                            <ToastProvider>
                              <ConfirmModalProvider>
                                <AppContent />
                                {/* Toast notifications */}
                                <Toast />
                                {/* Job failure notifications */}
                                <JobFailureNotifier />
                                {/* Achievement notifications */}
                                <AchievementToast />
                                {/* Download notifications */}
                                <DownloadNotificationBar />
                                <DownloadConfirmationModal />
                                {/* Notes migration banner */}
                                <NotesMigrationBanner />
                              </ConfirmModalProvider>
                            </ToastProvider>
                          </DownloadProvider>
                        </AchievementProvider>
                      </MetadataJobProvider>
                    </AnnotationsProvider>
                  </WantToReadProvider>
                </CollectionsProvider>
              </AdvancedFilterProvider>
              </FilterPresetProvider>
              </LibraryScanProvider>
            </BreadcrumbProvider>
          </AppProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
