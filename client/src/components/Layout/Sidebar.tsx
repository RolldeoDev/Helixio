/**
 * Sidebar Component
 *
 * A refined two-panel sidebar with:
 * - Icon Rail (left): Primary navigation icons in a vertical strip
 * - Context Panel (right): Dynamic content based on selected view
 *
 * Design inspired by Spotify/Discord's icon-based navigation.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import { useMetadataJob } from '../../contexts/MetadataJobContext';
import { ContinueReading } from './ContinueReading';
import { CollectionsSidebar } from '../Collections';
import { WantToReadPanel } from '../WantToRead';
import { LibraryDropdown } from './LibraryDropdown';
import { scanLibrary, applyScan, rebuildCache, renameFolder, createLibrary, Library } from '../../services/api.service';
import { FolderBrowser } from '../FolderBrowser/FolderBrowser';
import './Sidebar.css';

const API_BASE = '/api';

type SidebarView = 'home' | 'reading' | 'collections' | 'folders' | 'tools';

const PANEL_MIN_WIDTH = 200;
const PANEL_MAX_WIDTH = 400;
const PANEL_DEFAULT_WIDTH = 260;
const PANEL_WIDTH_KEY = 'helixio-panel-width';

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    libraries,
    selectedLibrary,
    loadingLibraries,
    librariesError,
    folders,
    selectedFolder,
    loadingFolders,
    selectLibrary,
    selectFolder,
    refreshLibraries,
    refreshFiles,
    setOperation,
    mobileSidebarOpen,
    setMobileSidebarOpen,
  } = useApp();
  const { activeJobs } = useMetadataJob();

  // Determine active view based on route or selection
  const [activeView, setActiveView] = useState<SidebarView>('home');

  // App version for footer
  const [appVersion, setAppVersion] = useState<string | null>(null);

  // Fetch app version
  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const response = await fetch(`${API_BASE}/config`);
        if (response.ok) {
          const data = await response.json();
          setAppVersion(data.version || null);
        }
      } catch {
        // Silently fail - version in footer is optional
      }
    };
    fetchVersion();
  }, []);

  // Panel resize state
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem(PANEL_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : PANEL_DEFAULT_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Persist panel width
  useEffect(() => {
    localStorage.setItem(PANEL_WIDTH_KEY, String(panelWidth));
    // Total sidebar width = icon rail (56px) + panel width
    document.documentElement.style.setProperty('--sidebar-width', `${56 + panelWidth}px`);
  }, [panelWidth]);

  // Handle resize drag
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const railWidth = 56;
      const newWidth = Math.min(
        PANEL_MAX_WIDTH,
        Math.max(PANEL_MIN_WIDTH, e.clientX - railWidth)
      );
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  // Navigation handlers
  const handleNavClick = (view: SidebarView, route?: string) => {
    setActiveView(view);
    if (route) {
      navigate(route);
    }
    // When switching to folders view, navigate to library view to show files
    if (view === 'folders' && selectedLibrary) {
      const isLibraryView = location.pathname === '/' || location.pathname.startsWith('/library/');
      if (!isLibraryView) {
        navigate(`/library/${selectedLibrary.id}`);
      }
    }
  };

  // Handle folder selection - select folder AND navigate to library view
  const handleFolderSelect = useCallback((folder: string | null) => {
    selectFolder(folder);

    // Navigate to library view if not already there
    const isLibraryView = location.pathname === '/' || location.pathname.startsWith('/library/');
    if (!isLibraryView && selectedLibrary) {
      navigate(`/library/${selectedLibrary.id}`);
    }
  }, [selectFolder, location.pathname, selectedLibrary, navigate]);

  const isRouteActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <>
      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        className={`sidebar-shell ${mobileSidebarOpen ? 'open' : ''}`}
        ref={containerRef}
      >
        {/* Icon Rail - The Spine */}
        <nav className="icon-rail" aria-label="Main navigation">
        {/* Logo */}
        <div className="rail-logo" title="Helixio">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            <path d="M8 7h8M8 11h8M8 15h5" />
          </svg>
        </div>

        <div className="rail-divider" />

        {/* Primary Navigation */}
        <div className="rail-section rail-primary">
          <button
            className={`rail-btn ${activeView === 'home' ? 'active' : ''}`}
            onClick={() => handleNavClick('home')}
            aria-label="Home"
            title="Home"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </button>

          <button
            className={`rail-btn ${activeView === 'reading' ? 'active' : ''}`}
            onClick={() => handleNavClick('reading')}
            aria-label="Reading"
            title="Continue Reading"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          </button>

          <button
            className={`rail-btn ${activeView === 'collections' ? 'active' : ''}`}
            onClick={() => handleNavClick('collections')}
            aria-label="Collections"
            title="Collections & Lists"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
          </button>
        </div>

        <div className="rail-spacer" />

        {/* Secondary Navigation */}
        <div className="rail-section rail-secondary">
          <button
            className={`rail-btn ${activeView === 'folders' ? 'active' : ''}`}
            onClick={() => handleNavClick('folders')}
            aria-label="Browse Folders"
            title="Browse Folders"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </button>

          <button
            className={`rail-btn ${isRouteActive('/series') ? 'active' : ''}`}
            onClick={() => navigate('/series')}
            aria-label="Browse Series"
            title="Browse Series"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
          </button>

          <button
            className={`rail-btn ${isRouteActive('/search') ? 'active' : ''}`}
            onClick={() => navigate('/search')}
            aria-label="Search"
            title="Search"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        </div>

        <div className="rail-divider" />

        {/* Tools/Admin */}
        <div className="rail-section rail-tools">
          <button
            className={`rail-btn ${activeView === 'tools' ? 'active' : ''} ${activeJobs.length > 0 ? 'has-badge' : ''}`}
            onClick={() => handleNavClick('tools')}
            aria-label="Tools & Jobs"
            title="Tools & Jobs"
            data-badge={activeJobs.length > 0 ? activeJobs.length : undefined}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>

          <button
            className={`rail-btn ${isRouteActive('/settings') ? 'active' : ''}`}
            onClick={() => navigate('/settings')}
            aria-label="Settings"
            title="Settings"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
          </button>
        </div>

        {/* About Footer */}
        <div className="rail-footer">
          <img
            src="/helixioHighFidelityLogo.png"
            alt="Helixio"
            className="rail-footer-logo"
            title={appVersion ? `Helixio v${appVersion}` : 'Helixio'}
          />
          {appVersion && (
            <span className="rail-footer-version" title={`Version ${appVersion}`}>
              v{appVersion}
            </span>
          )}
        </div>
      </nav>

      {/* Context Panel - Dynamic Content */}
      <aside className="context-panel" style={{ width: panelWidth }}>
        {/* Panel Header */}
        <header className="panel-header">
          <h2 className="panel-title">
            {activeView === 'home' && 'Library'}
            {activeView === 'reading' && 'Reading'}
            {activeView === 'collections' && 'Collections'}
            {activeView === 'folders' && 'Folders'}
            {activeView === 'tools' && 'Tools'}
          </h2>
          {selectedLibrary && (activeView === 'home' || activeView === 'folders') && (
            <span className="panel-subtitle">{selectedLibrary.name}</span>
          )}
        </header>

        {/* Panel Content */}
        <div className="panel-content">
          {activeView === 'home' && (
            <HomeView selectedLibrary={selectedLibrary} />
          )}

          {activeView === 'reading' && (
            <ReadingView libraryId={selectedLibrary?.id} />
          )}

          {activeView === 'collections' && (
            <CollectionsView />
          )}

          {activeView === 'folders' && (
            <FoldersView
              libraries={libraries}
              selectedLibrary={selectedLibrary}
              loadingLibraries={loadingLibraries}
              librariesError={librariesError}
              folders={folders}
              selectedFolder={selectedFolder}
              loadingFolders={loadingFolders}
              onLibrarySelect={selectLibrary}
              onFolderSelect={handleFolderSelect}
              refreshLibraries={refreshLibraries}
              refreshFiles={refreshFiles}
              setOperation={setOperation}
            />
          )}

          {activeView === 'tools' && (
            <ToolsView activeJobs={activeJobs.length} />
          )}
        </div>
      </aside>

        {/* Resize Handle */}
        <div
          className={`panel-resize-handle ${isResizing ? 'resizing' : ''}`}
          onMouseDown={handleResizeStart}
        />
      </div>
    </>
  );
}

// Home View - Library stats and quick access
function HomeView({ selectedLibrary }: { selectedLibrary: { name: string; stats?: { total: number } } | null }) {
  const navigate = useNavigate();

  if (!selectedLibrary) {
    return (
      <div className="view-empty">
        <p>Select a library to begin</p>
      </div>
    );
  }

  return (
    <div className="home-view">
      {/* Stats */}
      <div className="stat-cards">
        <button className="stat-card" onClick={() => navigate('/series')}>
          <span className="stat-value">{selectedLibrary.stats?.total || 0}</span>
          <span className="stat-label">Comics</span>
        </button>
      </div>

      {/* Quick Links */}
      <div className="quick-links">
        <button className="quick-link" onClick={() => navigate('/series')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" />
          </svg>
          <span>Browse Series</span>
          <svg className="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        <button className="quick-link" onClick={() => navigate('/library/' + (selectedLibrary as any)?.id)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span>Browse Files</span>
          <svg className="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Reading View - Continue reading and want to read
function ReadingView({ libraryId }: { libraryId?: string }) {
  return (
    <div className="reading-view">
      <ContinueReading libraryId={libraryId} limit={5} />
      <WantToReadPanel />
    </div>
  );
}

// Collections View
function CollectionsView() {
  return (
    <div className="collections-view">
      <CollectionsSidebar />
    </div>
  );
}

// Folders View - Browse and navigate folders
interface FoldersViewProps {
  libraries: Library[];
  selectedLibrary: Library | null;
  loadingLibraries: boolean;
  librariesError: string | null;
  folders: string[];
  selectedFolder: string | null;
  loadingFolders: boolean;
  onLibrarySelect: (library: Library | null) => void;
  onFolderSelect: (folder: string | null) => void;
  refreshLibraries: () => Promise<void>;
  refreshFiles: () => Promise<void>;
  setOperation: (label: string | null, message?: string) => void;
}

function FoldersView({
  libraries,
  selectedLibrary,
  loadingLibraries,
  librariesError,
  folders,
  selectedFolder,
  loadingFolders,
  onLibrarySelect,
  onFolderSelect,
  refreshLibraries,
  refreshFiles,
  setOperation,
}: FoldersViewProps) {
  const navigate = useNavigate();
  const [showAddLibrary, setShowAddLibrary] = useState(false);
  const [newLibraryName, setNewLibraryName] = useState('');
  const [newLibraryPath, setNewLibraryPath] = useState('');
  const [newLibraryType, setNewLibraryType] = useState<'western' | 'manga'>('western');
  const [addingLibrary, setAddingLibrary] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [folderContextMenu, setFolderContextMenu] = useState<{
    x: number;
    y: number;
    folderPath: string;
  } | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Handle library selection with navigation to ensure files are displayed
  const handleLibrarySelect = useCallback((library: Library) => {
    onLibrarySelect(library);
    // Always navigate to ensure the URL matches and files are refreshed
    navigate(`/library/${library.id}`);
  }, [onLibrarySelect, navigate]);

  const toggleFolderCollapse = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleAddLibrary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLibraryName || !newLibraryPath) return;

    setAddingLibrary(true);
    try {
      await createLibrary({
        name: newLibraryName,
        rootPath: newLibraryPath,
        type: newLibraryType,
      });
      setNewLibraryName('');
      setNewLibraryPath('');
      setShowAddLibrary(false);
      await refreshLibraries();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add library');
    } finally {
      setAddingLibrary(false);
    }
  };

  const handleScan = async () => {
    if (!selectedLibrary || scanning) return;

    setScanning(true);
    setOperation('scan', `Scanning ${selectedLibrary.name}...`);

    try {
      const result = await scanLibrary(selectedLibrary.id);

      if (result.autoApplied) {
        setOperation(null, 'No changes detected');
        setTimeout(() => setOperation(null), 2000);
      } else {
        const changes =
          result.summary.newFiles +
          result.summary.movedFiles +
          result.summary.orphanedFiles;

        if (changes > 0) {
          const confirmed = window.confirm(
            `Found ${result.summary.newFiles} new files, ${result.summary.movedFiles} moved files, and ${result.summary.orphanedFiles} orphaned files.\n\nApply these changes?`
          );

          if (confirmed) {
            await applyScan(selectedLibrary.id, result.scanId);
            setOperation(null, 'Changes applied');
          } else {
            setOperation(null, 'Scan cancelled');
          }
        } else {
          setOperation(null, 'No changes found');
        }
        setTimeout(() => setOperation(null), 2000);
      }

      await refreshLibraries();
      await refreshFiles();
    } catch (err) {
      setOperation(null, `Scan failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setTimeout(() => setOperation(null), 3000);
    } finally {
      setScanning(false);
    }
  };

  const handleFolderContextMenu = (e: React.MouseEvent, folderPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    setFolderContextMenu({ x: e.clientX, y: e.clientY, folderPath });
  };

  const closeFolderContextMenu = () => setFolderContextMenu(null);

  const handleRebuildFolderCache = async () => {
    if (!folderContextMenu || !selectedLibrary) return;

    const { folderPath } = folderContextMenu;
    closeFolderContextMenu();

    setOperation('Rebuild Cache', `Rebuilding cache for folder "${folderPath}"...`);

    try {
      const { jobId, fileCount } = await rebuildCache({
        folderPath,
        libraryId: selectedLibrary.id,
        type: 'full',
      });
      setOperation(null, `Cache rebuild started for ${fileCount} file(s) in folder (Job: ${jobId.slice(-8)})`);
      setTimeout(() => setOperation(null), 3000);
    } catch (err) {
      setOperation(
        null,
        `Cache rebuild failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
      setTimeout(() => setOperation(null), 3000);
    }
  };

  const handleStartRename = () => {
    if (!folderContextMenu) return;
    const folderPath = folderContextMenu.folderPath;
    const folderName = folderPath.split('/').pop() || folderPath;
    setRenameValue(folderName);
    setRenameError(null);
    setRenamingFolder(folderPath);
    closeFolderContextMenu();
    setTimeout(() => renameInputRef.current?.focus(), 0);
  };

  const handleConfirmRename = async () => {
    if (!renamingFolder || !selectedLibrary || !renameValue.trim()) return;

    const trimmedName = renameValue.trim();
    const currentName = renamingFolder.split('/').pop() || renamingFolder;

    if (trimmedName === currentName) {
      handleCancelRename();
      return;
    }

    if (trimmedName.includes('/') || trimmedName.includes('\\')) {
      setRenameError('Folder name cannot contain path separators');
      return;
    }

    setOperation('Rename Folder', `Renaming folder to "${trimmedName}"...`);

    try {
      const result = await renameFolder(selectedLibrary.id, renamingFolder, trimmedName);

      // Success - API returns data directly (errors throw exceptions)
      setOperation(null, `Folder renamed. ${result.filesUpdated} file(s) updated.`);
      setTimeout(() => setOperation(null), 3000);

      if (selectedFolder === renamingFolder || selectedFolder?.startsWith(renamingFolder + '/')) {
        const newSelectedFolder = selectedFolder.replace(renamingFolder, result.newPath);
        onFolderSelect(newSelectedFolder);
      }

      await refreshFiles();

      // Clear rename state on success
      setRenamingFolder(null);
      setRenameValue('');
      setRenameError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setRenameError(message);
      setOperation(null, `Rename failed: ${message}`);
      setTimeout(() => setOperation(null), 3000);
    }
  };

  const handleCancelRename = () => {
    setRenamingFolder(null);
    setRenameValue('');
    setRenameError(null);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleConfirmRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleCancelRename();
    }
  };

  // Build folder tree structure
  const buildFolderTree = (folderPaths: string[]) => {
    const tree: { [key: string]: string[] } = { '': [] };

    for (const path of folderPaths) {
      const parts = path.split('/');
      let current = '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        const fullPath = current ? `${current}/${part}` : part;

        if (!tree[current]) {
          tree[current] = [];
        }

        if (!tree[current]!.includes(fullPath)) {
          tree[current]!.push(fullPath);
        }

        current = fullPath;
      }
    }

    return tree;
  };

  const folderTree = buildFolderTree(folders);

  const renderFolderItem = (path: string, depth: number = 0) => {
    const name = path.split('/').pop() || path;
    const children = folderTree[path] || [];
    const hasChildren = children.length > 0;
    const isSelected = selectedFolder === path;
    const isQuarantine = name.toLowerCase() === 'corrupteddata';
    const isRenaming = renamingFolder === path;
    const isCollapsed = collapsedFolders.has(path);

    return (
      <div key={path}>
        {isRenaming ? (
          <div
            className={`folder-item renaming ${isSelected ? 'selected' : ''}`}
            style={{ paddingLeft: `${8 + depth * 12}px` }}
          >
            {hasChildren && (
              <span className="folder-chevron">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
            )}
            {!hasChildren && <span className="folder-chevron-spacer" />}
            <span className="folder-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <div className="folder-rename-wrapper">
              <input
                ref={renameInputRef}
                type="text"
                className={`folder-rename-input ${renameError ? 'error' : ''}`}
                value={renameValue}
                onChange={(e) => {
                  setRenameValue(e.target.value);
                  setRenameError(null);
                }}
                onKeyDown={handleRenameKeyDown}
                onBlur={handleConfirmRename}
                autoFocus
              />
              {renameError && <span className="folder-rename-error">{renameError}</span>}
            </div>
          </div>
        ) : (
          <button
            className={`folder-item ${isSelected ? 'selected' : ''} ${isQuarantine ? 'quarantine' : ''}`}
            style={{ paddingLeft: `${8 + depth * 12}px` }}
            onClick={() => onFolderSelect(path)}
            onContextMenu={(e) => handleFolderContextMenu(e, path)}
          >
            {hasChildren ? (
              <span
                className={`folder-chevron ${isCollapsed ? '' : 'expanded'}`}
                onClick={(e) => toggleFolderCollapse(path, e)}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
            ) : (
              <span className="folder-chevron-spacer" />
            )}
            <span className="folder-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <span className="folder-name">{name}</span>
            {isQuarantine && <span className="quarantine-badge">!</span>}
          </button>
        )}
        {!isCollapsed && children.map((child) => renderFolderItem(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="folders-view">
      {/* Library Dropdown */}
      <div className="folders-library-select">
        <LibraryDropdown
          libraries={libraries}
          selectedLibrary={selectedLibrary}
          onSelect={handleLibrarySelect}
          onAddClick={() => setShowAddLibrary(true)}
          loading={loadingLibraries}
          error={librariesError}
        />
      </div>

      {/* Add Library Form */}
      {showAddLibrary && (
        <form className="add-library-form" onSubmit={handleAddLibrary}>
          <input
            type="text"
            placeholder="Library Name"
            value={newLibraryName}
            onChange={(e) => setNewLibraryName(e.target.value)}
            required
          />
          <div className="path-input-group">
            <input
              type="text"
              placeholder="Root Path"
              value={newLibraryPath}
              onChange={(e) => setNewLibraryPath(e.target.value)}
              required
            />
            <button
              type="button"
              className="btn-browse"
              onClick={() => setShowFolderBrowser(true)}
            >
              ...
            </button>
          </div>
          <select
            value={newLibraryType}
            onChange={(e) => setNewLibraryType(e.target.value as 'western' | 'manga')}
          >
            <option value="western">Western Comics</option>
            <option value="manga">Manga</option>
          </select>
          <div className="form-actions">
            <button type="submit" className="btn-primary" disabled={addingLibrary}>
              {addingLibrary ? 'Adding...' : 'Add'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowAddLibrary(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <FolderBrowser
        isOpen={showFolderBrowser}
        onClose={() => setShowFolderBrowser(false)}
        onSelect={(path) => setNewLibraryPath(path)}
        initialPath={newLibraryPath}
      />

      {/* Folder Tree */}
      {selectedLibrary ? (
        <div className="folders-content">
          <div className="folders-header">
            <span className="folder-count">
              {folders.length} folder{folders.length !== 1 ? 's' : ''}
            </span>
            <button
              className="btn-icon scan-btn"
              onClick={handleScan}
              disabled={scanning}
              title="Scan Library"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M23 4v6h-6" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
          </div>

          {loadingFolders && <div className="loading-folders">Loading...</div>}

          <div className="folder-tree">
            <button
              className={`folder-item root ${selectedFolder === null ? 'selected' : ''}`}
              onClick={() => onFolderSelect(null)}
            >
              <span className="folder-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <span className="folder-name">All Files</span>
            </button>

            {(folderTree[''] || []).map((path) => renderFolderItem(path, 0))}
          </div>
        </div>
      ) : (
        <div className="folders-empty">
          <p>Select a library to browse folders</p>
        </div>
      )}

      {/* Folder Context Menu */}
      {folderContextMenu && (
        <>
          <div className="context-menu-backdrop" onClick={closeFolderContextMenu} />
          <div
            className="folder-context-menu"
            style={{ top: folderContextMenu.y, left: folderContextMenu.x }}
          >
            <button onClick={handleStartRename}>Rename Folder</button>
            <button onClick={handleRebuildFolderCache}>Rebuild Cache</button>
          </div>
        </>
      )}
    </div>
  );
}

// Tools View - Jobs, Batches, Admin
function ToolsView({ activeJobs }: { activeJobs: number }) {
  const navigate = useNavigate();

  return (
    <div className="tools-view">
      <div className="tool-links">
        <button className="tool-link" onClick={() => navigate('/jobs')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <div className="tool-link-text">
            <span className="tool-link-title">Metadata Jobs</span>
            {activeJobs > 0 && (
              <span className="tool-link-badge">{activeJobs} active</span>
            )}
          </div>
        </button>

        <button className="tool-link" onClick={() => navigate('/batches')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          <div className="tool-link-text">
            <span className="tool-link-title">Batch Operations</span>
          </div>
        </button>

        <button className="tool-link" onClick={() => navigate('/duplicates')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <div className="tool-link-text">
            <span className="tool-link-title">Find Duplicates</span>
          </div>
        </button>

        <button className="tool-link" onClick={() => navigate('/history')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          <div className="tool-link-text">
            <span className="tool-link-title">History & Rollback</span>
          </div>
        </button>
      </div>
    </div>
  );
}
