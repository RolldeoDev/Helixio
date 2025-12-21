/**
 * Helixio - Comic Book Management Application
 *
 * Main application component with routing and layout.
 */

import { useState, useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { AppProvider, useApp } from './contexts/AppContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { MetadataJobProvider, useMetadataJob } from './contexts/MetadataJobContext';
import { SmartFilterProvider, useSmartFilter } from './contexts/SmartFilterContext';
import { CollectionsProvider } from './contexts/CollectionsContext';
import { WantToReadProvider } from './contexts/WantToReadContext';
import { AnnotationsProvider } from './contexts/AnnotationsContext';
import { ThemeProvider } from './themes/ThemeContext';
import { SandmanEffects, SynthwaveEffects, RetroEffects, MangaEffects } from './themes';
import { AchievementProvider } from './contexts/AchievementContext';
import { AchievementToast } from './components/AchievementToast';
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
import { StatsPage } from './pages/StatsPage';
import { EntityStatsPage } from './pages/EntityStatsPage';
import { AchievementsPage } from './pages/AchievementsPage';
import { SharedLists } from './components/SharedLists';
import { UserManagement } from './components/Admin';

type ViewMode = 'list' | 'grid' | 'compact';

const GROUP_STORAGE_KEY = 'helixio-group-field';

function LibraryView() {
  const { files, selectedFiles, pagination, refreshFiles } = useApp();
  const { startJob } = useMetadataJob();
  const { applyFilterToFiles, isFilterPanelOpen, closeFilterPanel } = useSmartFilter();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [editingFileIds, setEditingFileIds] = useState<string[] | null>(null);
  const [editingPages, setEditingPages] = useState<{ fileId: string; filename: string } | null>(null);

  // Group field state with localStorage persistence
  const [groupField, setGroupField] = useState<GroupField>(() => {
    try {
      const stored = localStorage.getItem(GROUP_STORAGE_KEY);
      return (stored as GroupField) || 'none';
    } catch {
      return 'none';
    }
  });

  // Persist group field to localStorage
  useEffect(() => {
    localStorage.setItem(GROUP_STORAGE_KEY, groupField);
  }, [groupField]);

  // Apply smart filter to files
  const filteredFiles = applyFilterToFiles(files);

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
    return (
      <div className="app-loading">
        <div className="spinner" />
        <span>Loading...</span>
      </div>
    );
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

      <main className="main-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/library" element={<LibraryView />} />
          <Route path="/library/:libraryId" element={<LibraryView />} />
          <Route path="/series" element={<SeriesPage />} />
          <Route path="/series/duplicates" element={<DuplicatesPage />} />
          <Route path="/series/:seriesId" element={<SeriesDetailPage />} />
          <Route path="/issue/:fileId" element={<IssueDetailPage />} />
          <Route path="/collections" element={<CollectionsPage />} />
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
          <SandmanEffects />
          <SynthwaveEffects />
          <RetroEffects />
          <MangaEffects />
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
          <SmartFilterProvider>
            <CollectionsProvider>
              <WantToReadProvider>
                <AnnotationsProvider>
                  <MetadataJobProvider>
                    <AchievementProvider>
                      <AppContent />
                      {/* Achievement notifications */}
                      <AchievementToast />
                    </AchievementProvider>
                  </MetadataJobProvider>
                </AnnotationsProvider>
              </WantToReadProvider>
            </CollectionsProvider>
          </SmartFilterProvider>
        </AppProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
