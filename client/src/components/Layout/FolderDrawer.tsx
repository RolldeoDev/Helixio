/**
 * FolderDrawer Component
 *
 * Sliding drawer for folder navigation with pin/unpin functionality.
 * Extracted from Sidebar.tsx to separate folder browsing from main navigation.
 *
 * Modes:
 * - Unpinned (overlay): Slides over content, click-outside closes
 * - Pinned: Pushes content aside, persists until unpinned
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import { useFolderDrawer } from '../../contexts/FolderDrawerContext';
import { scanLibrary, applyScan, rebuildCache, renameFolder } from '../../services/api.service';
import { FolderBrowser } from '../FolderBrowser/FolderBrowser';
import { LibraryDropdown } from './LibraryDropdown';
import { createLibrary } from '../../services/api.service';
import './FolderDrawer.css';

export function FolderDrawer() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isOpen, isPinned, closeDrawer, togglePin } = useFolderDrawer();
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
  } = useApp();

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

  // Folder rename state
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const renameInputRef = useRef<HTMLInputElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

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

  // Handle escape key to close drawer (only when unpinned)
  useEffect(() => {
    if (!isOpen || isPinned) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDrawer();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isPinned, closeDrawer]);

  // Handle folder selection - select folder AND navigate to library view if needed
  const handleFolderSelect = useCallback((folder: string | null) => {
    selectFolder(folder);

    // If not on a library view route, navigate to the library view
    const isLibraryView = location.pathname === '/' || location.pathname.startsWith('/library/');
    if (!isLibraryView && selectedLibrary) {
      navigate(`/library/${selectedLibrary.id}`);
    }

    // Close drawer if unpinned
    if (!isPinned) {
      closeDrawer();
    }
  }, [selectFolder, location.pathname, selectedLibrary, navigate, isPinned, closeDrawer]);

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

  // Start folder rename - extract just the folder name from the path
  const handleStartRename = () => {
    if (!folderContextMenu) return;
    const folderPath = folderContextMenu.folderPath;
    const folderName = folderPath.split('/').pop() || folderPath;
    setRenameValue(folderName);
    setRenameError(null);
    setRenamingFolder(folderPath);
    closeFolderContextMenu();
    // Focus input after state update
    setTimeout(() => renameInputRef.current?.focus(), 0);
  };

  // Confirm folder rename
  const handleConfirmRename = async () => {
    if (!renamingFolder || !selectedLibrary || !renameValue.trim()) return;

    const trimmedName = renameValue.trim();
    const currentName = renamingFolder.split('/').pop() || renamingFolder;

    // If name hasn't changed, just cancel
    if (trimmedName === currentName) {
      handleCancelRename();
      return;
    }

    // Validate name
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

        // If the renamed folder was selected, update selection to new path
        if (selectedFolder === renamingFolder || selectedFolder?.startsWith(renamingFolder + '/')) {
          const newSelectedFolder = selectedFolder.replace(renamingFolder, result.newPath);
          selectFolder(newSelectedFolder);
        }

        // Refresh files to get updated paths
        await refreshFiles();
      } else {
        setRenameError(result.error || 'Rename failed');
        setOperation(null, `Rename failed: ${result.error}`);
        setTimeout(() => setOperation(null), 3000);
        return; // Don't close rename mode on error
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setRenameError(message);
      setOperation(null, `Rename failed: ${message}`);
      setTimeout(() => setOperation(null), 3000);
      return; // Don't close rename mode on error
    }

    setRenamingFolder(null);
    setRenameValue('');
    setRenameError(null);
  };

  // Cancel folder rename
  const handleCancelRename = () => {
    setRenamingFolder(null);
    setRenameValue('');
    setRenameError(null);
  };

  // Handle keyboard events during rename
  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirmRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
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
            <span className="folder-icon">📁</span>
            <div className="folder-rename-input-wrapper">
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
            onClick={() => handleFolderSelect(path)}
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
            <span className="folder-icon">📁</span>
            <span className="folder-name">{name}</span>
            {isQuarantine && <span className="quarantine-badge">!</span>}
          </button>
        )}
        {!isCollapsed && children.map((child) => renderFolderItem(child, depth + 1))}
      </div>
    );
  };

  // Handle click outside to close (only when unpinned)
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isPinned) {
      closeDrawer();
    }
  };

  if (!isOpen) return null;

  const drawerContent = (
    <div
      ref={drawerRef}
      className={`folder-drawer ${isOpen ? 'open' : ''} ${isPinned ? 'pinned' : ''}`}
      role="dialog"
      aria-label="Folder Navigation"
      aria-modal={!isPinned}
    >
      {/* Drawer Header */}
      <div className="folder-drawer-header">
        <h2 className="folder-drawer-title">Folders</h2>
        <div className="folder-drawer-actions">
          <button
            className={`drawer-action-btn pin-btn ${isPinned ? 'pinned' : ''}`}
            onClick={togglePin}
            title={isPinned ? 'Unpin drawer' : 'Pin drawer'}
            aria-label={isPinned ? 'Unpin drawer' : 'Pin drawer'}
            aria-pressed={isPinned}
          >
            📌
          </button>
          {!isPinned && (
            <button
              className="drawer-action-btn close-btn"
              onClick={closeDrawer}
              title="Close drawer"
              aria-label="Close drawer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Library Dropdown */}
      <div className="folder-drawer-library">
        <LibraryDropdown
          libraries={libraries}
          selectedLibrary={selectedLibrary}
          onSelect={selectLibrary}
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
              placeholder="Root Path (e.g., /path/to/comics)"
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
      <div className="folder-drawer-content">
        {selectedLibrary ? (
          <>
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
                {scanning ? '...' : '🔄'}
              </button>
            </div>

            {loadingFolders && <div className="loading">Loading folders...</div>}

            <div className="folder-tree-scroll">
              <button
                className={`folder-item root ${selectedFolder === null ? 'selected' : ''}`}
                onClick={() => handleFolderSelect(null)}
              >
                <span className="folder-icon">📁</span>
                <span className="folder-name">All Files</span>
              </button>

              {(folderTree[''] || []).map((path) => renderFolderItem(path, 0))}
            </div>
          </>
        ) : (
          <div className="drawer-empty-state">
            <p>Select a library to browse folders</p>
          </div>
        )}
      </div>

      {/* Folder Context Menu */}
      {folderContextMenu && (
        <>
          <div
            className="context-menu-backdrop"
            onClick={closeFolderContextMenu}
          />
          <div
            className="context-menu"
            style={{ top: folderContextMenu.y, left: folderContextMenu.x }}
          >
            <button onClick={handleStartRename}>
              Rename Folder
            </button>
            <button onClick={handleRebuildFolderCache}>
              Rebuild Cover & Page Cache
            </button>
          </div>
        </>
      )}
    </div>
  );

  // Render with overlay when unpinned, without when pinned
  if (isPinned) {
    return drawerContent;
  }

  return (
    <div className="folder-drawer-overlay" onClick={handleOverlayClick}>
      {drawerContent}
    </div>
  );
}
