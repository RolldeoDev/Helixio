/**
 * FoldersPage Component
 *
 * Full-page folder browser with resizable split view:
 * - Left panel: Folder tree navigation
 * - Right panel: Cover gallery of comics in selected folder
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { useSmartFilter } from '../contexts/SmartFilterContext';
import { useMetadataJob } from '../contexts/MetadataJobContext';
import { GridView } from '../components/GridView';
import { LibraryToolbar } from '../components/LibraryToolbar';
import { SmartFilterPanel } from '../components/SmartFilter/SmartFilterPanel';
import { LibraryDropdown } from '../components/Layout/LibraryDropdown';
import { FolderBrowser } from '../components/FolderBrowser/FolderBrowser';
import { MetadataEditor } from '../components/MetadataEditor';
import { PageEditor } from '../components/PageEditor';
import { NavigationSidebar } from '../components/NavigationSidebar';
import { scanLibrary, applyScan, rebuildCache, renameFolder, createLibrary, ComicFile } from '../services/api.service';
import { groupFiles } from '../utils/file-grouping';
import type { GroupField } from '../components/SortGroup/SortGroupPanel';
import './FoldersPage.css';

const FOLDER_PANEL_WIDTH_KEY = 'helixio-folders-panel-width';
const FOLDER_PANEL_MIN_WIDTH = 200;
const FOLDER_PANEL_MAX_WIDTH = 500;
const FOLDER_PANEL_DEFAULT_WIDTH = 280;
const GROUP_STORAGE_KEY = 'helixio-group-field';

export function FoldersPage() {
  const navigate = useNavigate();
  const {
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
    selectLibrary,
    selectAllLibraries,
    selectFolder,
    refreshLibraries,
    refreshFiles,
    setOperation,
    sortField,
    sortOrder,
  } = useApp();
  const { applyFilterToFiles, isFilterPanelOpen, closeFilterPanel } = useSmartFilter();
  const { startJob } = useMetadataJob();

  // Panel width state (persisted)
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem(FOLDER_PANEL_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : FOLDER_PANEL_DEFAULT_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);

  // Folder tree state
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [folderContextMenu, setFolderContextMenu] = useState<{
    x: number;
    y: number;
    folderPath: string;
  } | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Library management state
  const [showAddLibrary, setShowAddLibrary] = useState(false);
  const [newLibraryName, setNewLibraryName] = useState('');
  const [newLibraryPath, setNewLibraryPath] = useState('');
  const [newLibraryType, setNewLibraryType] = useState<'western' | 'manga'>('western');
  const [addingLibrary, setAddingLibrary] = useState(false);
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [scanning, setScanning] = useState(false);

  // Editor state
  const [editingFileIds, setEditingFileIds] = useState<string[] | null>(null);
  const [editingPages, setEditingPages] = useState<{ fileId: string; filename: string } | null>(null);

  // View state
  const [groupField, setGroupField] = useState<GroupField>(() => {
    try {
      const stored = localStorage.getItem(GROUP_STORAGE_KEY);
      return (stored as GroupField) || 'none';
    } catch {
      return 'none';
    }
  });

  // Navigation sidebar state
  const contentRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 0 });

  // Persist panel width
  useEffect(() => {
    localStorage.setItem(FOLDER_PANEL_WIDTH_KEY, String(panelWidth));
  }, [panelWidth]);

  // Persist group field
  useEffect(() => {
    localStorage.setItem(GROUP_STORAGE_KEY, groupField);
  }, [groupField]);

  // Handle resize drag
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(
        FOLDER_PANEL_MAX_WIDTH,
        Math.max(FOLDER_PANEL_MIN_WIDTH, e.clientX - 48) // 48px for sidebar rail
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
    if (!container || displayOrderedFiles.length === 0) return;

    const updateVisibleRange = () => {
      const containerRect = container.getBoundingClientRect();
      const gridItems = container.querySelectorAll('[data-file-index]');

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
  }, [displayOrderedFiles.length]);

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

  // Folder tree functions
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

      if (result.success) {
        setOperation(null, `Folder renamed. ${result.filesUpdated} file(s) updated.`);
        setTimeout(() => setOperation(null), 3000);

        if (selectedFolder === renamingFolder || selectedFolder?.startsWith(renamingFolder + '/')) {
          const newSelectedFolder = selectedFolder.replace(renamingFolder, result.newPath);
          selectFolder(newSelectedFolder);
        }

        await refreshFiles();
      } else {
        setRenameError(result.error || 'Rename failed');
        setOperation(null, `Rename failed: ${result.error}`);
        setTimeout(() => setOperation(null), 3000);
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setRenameError(message);
      setOperation(null, `Rename failed: ${message}`);
      setTimeout(() => setOperation(null), 3000);
      return;
    }

    setRenamingFolder(null);
    setRenameValue('');
    setRenameError(null);
  };

  const handleCancelRename = () => {
    setRenamingFolder(null);
    setRenameValue('');
    setRenameError(null);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirmRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelRename();
    }
  };

  // Library management
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

  const renderFolderItem = (path: string, depth: number = 0, tree: { [key: string]: string[] } = folderTree) => {
    const name = path.split('/').pop() || path;
    const children = tree[path] || [];
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
            style={{ paddingLeft: `${12 + depth * 16}px` }}
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
            style={{ paddingLeft: `${12 + depth * 16}px` }}
            onClick={() => selectFolder(path)}
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
        {!isCollapsed && children.map((child) => renderFolderItem(child, depth + 1, tree))}
      </div>
    );
  };

  // File handlers
  const handleFileDoubleClick = (fileId: string) => {
    const file = files.find((f) => f.id === fileId);
    const filename = file?.filename || 'Comic';
    navigate(`/read/${fileId}?filename=${encodeURIComponent(filename)}`);
  };

  const handleToolbarEditMetadata = () => {
    if (selectedFiles.size > 0) {
      setEditingFileIds(Array.from(selectedFiles));
    }
  };

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
    <div className="folders-page">
      {/* Left Panel - Folder Tree */}
      <aside className="folders-panel" style={{ width: panelWidth }}>
        {/* Library Dropdown */}
        <div className="folders-panel-library">
          <LibraryDropdown
            libraries={libraries}
            selectedLibrary={selectedLibrary}
            isAllLibraries={isAllLibraries}
            onSelect={selectLibrary}
            onSelectAll={selectAllLibraries}
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
        {(selectedLibrary || isAllLibraries) ? (
          <div className="folders-panel-content">
            <div className="folders-header">
              <span className="folder-count">
                {isAllLibraries
                  ? `${allLibraryFolders.reduce((sum, lib) => sum + lib.folders.length, 0)} folder${allLibraryFolders.reduce((sum, lib) => sum + lib.folders.length, 0) !== 1 ? 's' : ''}`
                  : `${folders.length} folder${folders.length !== 1 ? 's' : ''}`}
              </span>
              {selectedLibrary && (
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
              )}
            </div>

            {loadingFolders && <div className="loading-folders">Loading...</div>}

            <div className="folder-tree">
              <button
                className={`folder-item root ${selectedFolder === null ? 'selected' : ''}`}
                onClick={() => selectFolder(null)}
              >
                <span className="folder-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                </span>
                <span className="folder-name">All Files</span>
              </button>

              {isAllLibraries ? (
                // All Libraries mode: show folders grouped by library
                allLibraryFolders.map((lib) => {
                  const libTree = buildFolderTree(lib.folders);
                  return (
                    <div key={lib.id} className="library-folder-group">
                      <div className="library-folder-header">{lib.name}</div>
                      {libTree['']?.map((path) => renderFolderItem(path, 0, libTree))}
                    </div>
                  );
                })
              ) : (
                // Single library mode: show flat folder tree
                (folderTree[''] || []).map((path) => renderFolderItem(path, 0))
              )}
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
      </aside>

      {/* Resize Handle */}
      <div
        className={`folders-resize-handle ${isResizing ? 'resizing' : ''}`}
        onMouseDown={handleResizeStart}
      />

      {/* Right Panel - Cover Gallery */}
      <main className="folders-content" ref={contentRef}>
        <LibraryToolbar
          viewMode="grid"
          onViewModeChange={() => {}}
          filteredCount={filteredFiles.length}
          totalCount={files.length}
          onEditMetadata={selectedFiles.size > 0 ? handleToolbarEditMetadata : undefined}
          onEditPages={selectedFiles.size === 1 ? handleEditPages : undefined}
          groupField={groupField}
          onGroupChange={setGroupField}
        />

        {/* Smart Filter Panel */}
        {isFilterPanelOpen && (
          <div className="filter-panel-overlay" onClick={closeFilterPanel}>
            <div className="filter-panel-container" onClick={(e) => e.stopPropagation()}>
              <SmartFilterPanel />
            </div>
          </div>
        )}

        {/* Cover Gallery */}
        <GridView
          onFileDoubleClick={handleFileDoubleClick}
          onFetchMetadata={handleFetchMetadata}
          onEditMetadata={handleEditMetadata}
          filteredFiles={filteredFiles}
          groupField={groupField}
        />

        {/* Navigation Sidebar */}
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
      </main>

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
