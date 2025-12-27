/**
 * Helixio - Comic Book Management Application
 *
 * Main application component with routing and layout.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { AppProvider, useApp } from './contexts/AppContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { MetadataJobProvider, useMetadataJob } from './contexts/MetadataJobContext';
import { LibraryScanProvider } from './contexts/LibraryScanContext';
import { SmartFilterProvider, useSmartFilter } from './contexts/SmartFilterContext';
import { CollectionsProvider } from './contexts/CollectionsContext';
import { WantToReadProvider } from './contexts/WantToReadContext';
import { AnnotationsProvider } from './contexts/AnnotationsContext';
import { ThemeProvider } from './themes/ThemeContext';
import { HelixEffects, SandmanEffects, SynthwaveEffects, RetroEffects, MangaEffects, PulpEffects } from './themes';
import { AchievementProvider } from './contexts/AchievementContext';
import { AchievementToast } from './components/AchievementToast';
import { ToastProvider } from './contexts/ToastContext';
import { Toast } from './components/Toast';
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
import { BatchPanel } from './components/BatchPanel';
import { RollbackPanel } from './components/RollbackPanel';
import { JobBanner } from './components/JobBanner';
import { JobsPanel } from './components/JobsPanel';
import { SmartFilterPanel } from './components/SmartFilter/SmartFilterPanel';
import { ReaderPage } from './pages/ReaderPage';
import type { GroupField } from './components/SortGroup/SortGroupPanel';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { SeriesPage } from './pages/SeriesPage';
import { SeriesDetailPage } from './pages/SeriesDetailPage';
import { IssueDetailPage } from './pages/IssueDetailPage';
import { DuplicatesPage } from './pages/DuplicatesPage';
import { CollectionsPage } from './pages/CollectionsPage';
import { CollectionDetailPage } from './pages/CollectionDetailPage';
import { StatsPage } from './pages/StatsPage';
import { EntityStatsPage } from './pages/EntityStatsPage';
import { AchievementsPage } from './pages/AchievementsPage';
import { FoldersPage } from './pages/FoldersPage';
import { SharedLists } from './components/SharedLists';
import { UserManagement } from './components/Admin';
import { HelixioLoader } from './components/HelixioLoader';
import { NavigationSidebar } from './components/NavigationSidebar';
import { GlobalHeader } from './components/GlobalHeader';
import { groupFiles } from './utils/file-grouping';
import type { ComicFile } from './services/api.service';

type ViewMode = 'list' | 'grid' | 'compact';

function LibraryView() {
  const { files, selectedFiles, pagination, refreshFiles, groupField: groupFieldRaw, setGroupField, sortField, sortOrder } = useApp();
  const groupField = groupFieldRaw as GroupField;
  const { startJob } = useMetadataJob();
  const { applyFilterToFiles, isFilterPanelOpen, closeFilterPanel } = useSmartFilter();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [editingFileIds, setEditingFileIds] = useState<string[] | null>(null);
  const [editingPages, setEditingPages] = useState<{ fileId: string; filename: string } | null>(null);

  // Navigation sidebar state
  const contentRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });

  // Apply smart filter to files
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

      {/* Smart Filter Panel - Slide in from right */}
      {isFilterPanelOpen && (
        <div className="filter-panel-overlay" onClick={closeFilterPanel}>
          <div className="filter-panel-container" onClick={(e) => e.stopPropagation()}>
            <SmartFilterPanel />
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
  const { isAuthenticated, isLoading: authLoading, setupRequired } = useAuth();

  // Show login page if setup required or not authenticated
  // Note: We allow unauthenticated access to library browsing for now
  // Auth is required for trackers, sync, lists, and admin
  if (authLoading) {
    return <HelixioLoader fullPage message="Loading..." />;
  }

  // Show setup/login page if required
  if (setupRequired || (!isAuthenticated && ['/settings', '/lists', '/admin'].some(p => location.pathname.startsWith(p)))) {
    return <LoginPage />;
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
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/library" element={<LibraryView />} />
          <Route path="/library/:libraryId" element={<LibraryView />} />
          <Route path="/folders" element={<FoldersPage />} />
          <Route path="/series" element={<SeriesPage />} />
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
          <Route path="/jobs" element={<JobsPanel />} />
          <Route path="/batches" element={<BatchPanel />} />
          <Route path="/history" element={<RollbackPanel />} />
          <Route path="/lists/*" element={<SharedLists />} />
          <Route path="/admin/users" element={<UserManagement />} />
          <Route path="/login" element={<LoginPage />} />
        </Routes>
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
    <ThemeProvider>
      <AuthProvider>
        <AppProvider>
          <BreadcrumbProvider>
            <LibraryScanProvider>
            <SmartFilterProvider>
              <CollectionsProvider>
                <WantToReadProvider>
                  <AnnotationsProvider>
                    <MetadataJobProvider>
                      <AchievementProvider>
                        <DownloadProvider>
                          <ToastProvider>
                            <AppContent />
                            {/* Toast notifications */}
                            <Toast />
                            {/* Achievement notifications */}
                            <AchievementToast />
                            {/* Download notifications */}
                            <DownloadNotificationBar />
                            <DownloadConfirmationModal />
                          </ToastProvider>
                        </DownloadProvider>
                      </AchievementProvider>
                    </MetadataJobProvider>
                  </AnnotationsProvider>
                </WantToReadProvider>
              </CollectionsProvider>
            </SmartFilterProvider>
            </LibraryScanProvider>
          </BreadcrumbProvider>
        </AppProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
