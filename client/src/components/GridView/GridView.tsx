/**
 * GridView Component
 *
 * Thumbnail grid view of comics with cover images, lazy loading, and selection.
 * Uses the unified CoverCard component for consistent appearance.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import { renameFile, rebuildCache, getLibraryReadingProgress, markAsCompleted, markAsIncomplete } from '../../services/api.service';
import { CoverCard, type MenuItemPreset } from '../CoverCard';
import { CoverSizeSlider, getCoverWidth } from '../CoverSizeSlider';
import { groupFiles } from '../../utils/file-grouping';

import type { ComicFile } from '../../services/api.service';
import type { GroupField } from '../SortGroup/SortGroupPanel';

interface GridViewProps {
  onFileSelect?: (fileId: string) => void;
  onFileDoubleClick?: (fileId: string) => void;
  onFetchMetadata?: (fileIds: string[]) => void;
  onEditMetadata?: (fileIds: string[]) => void;
  filteredFiles?: ComicFile[];
  groupField?: GroupField;
}

export function GridView({ onFileSelect, onFileDoubleClick, onFetchMetadata, onEditMetadata, filteredFiles, groupField = 'none' }: GridViewProps) {
  const navigate = useNavigate();
  const {
    files: contextFiles,
    selectedFiles,
    loadingFiles,
    filesError,
    selectedLibrary,
    selectFile,
    selectRange,
    selectAllFiles,
    clearSelection,
    refreshFiles,
    setOperation,
    lastSelectedFileId,
  } = useApp();

  // Use filtered files if provided, otherwise use context files
  const files = filteredFiles ?? contextFiles;

  const scrollTargetRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Cover size state (1-10 scale) - persisted in localStorage
  const [coverSize, setCoverSize] = useState(() => {
    const saved = localStorage.getItem('helixio-cover-size');
    return saved ? parseInt(saved, 10) : 5;
  });

  // Persist cover size changes
  const handleCoverSizeChange = useCallback((size: number) => {
    setCoverSize(size);
    localStorage.setItem('helixio-cover-size', String(size));
  }, []);

  // Reading progress state
  const [readingProgress, setReadingProgress] = useState<Record<string, { currentPage: number; totalPages: number; completed: boolean }>>({});

  // Rename dialog state
  const [renameDialog, setRenameDialog] = useState<{
    fileId: string;
    currentFilename: string;
    newFilename: string;
  } | null>(null);

  // Fetch reading progress when library changes
  useEffect(() => {
    if (!selectedLibrary) return;

    const fetchProgress = async () => {
      try {
        const { progress } = await getLibraryReadingProgress(selectedLibrary.id);
        setReadingProgress(progress);
      } catch (err) {
        console.error('Failed to fetch reading progress:', err);
      }
    };

    fetchProgress();
  }, [selectedLibrary]);

  // Focus and select filename (without extension) when rename dialog opens
  useEffect(() => {
    if (renameDialog && renameInputRef.current) {
      const input = renameInputRef.current;
      input.focus();
      const lastDot = renameDialog.newFilename.lastIndexOf('.');
      if (lastDot > 0) {
        input.setSelectionRange(0, lastDot);
      } else {
        input.select();
      }
    }
  }, [renameDialog]);

  // Open reader for a file
  const handleRead = useCallback((fileId: string) => {
    const file = files.find((f) => f.id === fileId);
    const filename = file?.filename || 'Comic';
    navigate(`/read/${fileId}?filename=${encodeURIComponent(filename)}`);
  }, [files, navigate]);

  // Open rename dialog
  const openRenameDialog = useCallback((fileId: string) => {
    const file = files.find((f) => f.id === fileId);
    if (!file) return;

    setRenameDialog({
      fileId: file.id,
      currentFilename: file.filename,
      newFilename: file.filename,
    });
  }, [files]);

  // Handle rebuild cache
  const handleRebuildCache = useCallback(async () => {
    const fileIds = Array.from(selectedFiles);
    if (fileIds.length === 0) return;

    setOperation('Rebuild Cache', `Rebuilding cache for ${fileIds.length} file(s)...`);

    try {
      const { jobId, fileCount } = await rebuildCache({ fileIds, type: 'full' });
      setOperation(null, `Cache rebuild started for ${fileCount} file(s) (Job: ${jobId.slice(-8)})`);
      setTimeout(() => setOperation(null), 3000);
    } catch (err) {
      setOperation(
        null,
        `Cache rebuild failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
      setTimeout(() => setOperation(null), 3000);
    }
  }, [selectedFiles, setOperation]);

  // Handle rename submit
  const handleRename = useCallback(async () => {
    if (!renameDialog) return;

    const { fileId, currentFilename, newFilename } = renameDialog;

    if (!newFilename.trim()) return;

    if (newFilename === currentFilename) {
      setRenameDialog(null);
      return;
    }

    setRenameDialog(null);
    setOperation('Rename', `Renaming ${currentFilename}...`);

    try {
      await renameFile(fileId, newFilename.trim());
      setOperation(null, 'File renamed successfully');
      clearSelection();
      await refreshFiles();
      setTimeout(() => setOperation(null), 2000);
    } catch (err) {
      setOperation(
        null,
        `Rename failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
      setTimeout(() => setOperation(null), 3000);
    }
  }, [renameDialog, setOperation, clearSelection, refreshFiles]);

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRename();
    } else if (e.key === 'Escape') {
      setRenameDialog(null);
    }
  }, [handleRename]);

  // Handle card click with selection logic and navigation
  const handleCardClick = useCallback((fileId: string, e: React.MouseEvent) => {
    // Handle shift-click for range selection
    if (e.shiftKey && lastSelectedFileId) {
      selectRange(lastSelectedFileId, fileId);
      onFileSelect?.(fileId);
      return;
    }

    // Handle ctrl/cmd-click for multi-select
    if (e.ctrlKey || e.metaKey) {
      selectFile(fileId, true);
      onFileSelect?.(fileId);
      return;
    }

    // Plain click (no modifiers) - navigate to issue detail
    navigate(`/issue/${fileId}`);
  }, [lastSelectedFileId, selectRange, selectFile, onFileSelect, navigate]);

  // Handle card double click
  const handleCardDoubleClick = useCallback((fileId: string) => {
    onFileDoubleClick?.(fileId);
  }, [onFileDoubleClick]);

  // Handle selection change from checkbox
  const handleSelectionChange = useCallback((fileId: string, _selected: boolean) => {
    selectFile(fileId, true);
  }, [selectFile]);

  // Handle context menu action
  const handleMenuAction = useCallback(async (action: MenuItemPreset | string, fileId: string) => {
    // Get target file IDs (selected files if the clicked file is selected, otherwise just the clicked file)
    const targetIds: string[] = selectedFiles.has(fileId) ? Array.from(selectedFiles) as string[] : [fileId];

    switch (action) {
      case 'read':
        handleRead(fileId);
        break;
      case 'markRead':
        try {
          setOperation('Mark as Read', `Marking ${targetIds.length} issue(s) as read...`);
          await Promise.all(targetIds.map((id) => markAsCompleted(id)));
          // Update local reading progress state
          setReadingProgress((prev) => {
            const updated = { ...prev };
            targetIds.forEach((id) => {
              if (updated[id]) {
                updated[id] = { ...updated[id], completed: true };
              } else {
                updated[id] = { currentPage: 0, totalPages: 1, completed: true };
              }
            });
            return updated;
          });
          setOperation(null, 'Marked as read');
          setTimeout(() => setOperation(null), 2000);
        } catch (err) {
          setOperation(null, `Error: ${err instanceof Error ? err.message : 'Failed to mark as read'}`);
          setTimeout(() => setOperation(null), 3000);
        }
        break;
      case 'markUnread':
        try {
          setOperation('Mark as Unread', `Marking ${targetIds.length} issue(s) as unread...`);
          await Promise.all(targetIds.map((id) => markAsIncomplete(id)));
          // Update local reading progress state
          setReadingProgress((prev) => {
            const updated = { ...prev };
            targetIds.forEach((id) => {
              if (updated[id]) {
                updated[id] = { ...updated[id], completed: false, currentPage: 0 };
              }
            });
            return updated;
          });
          setOperation(null, 'Marked as unread');
          setTimeout(() => setOperation(null), 2000);
        } catch (err) {
          setOperation(null, `Error: ${err instanceof Error ? err.message : 'Failed to mark as unread'}`);
          setTimeout(() => setOperation(null), 3000);
        }
        break;
      case 'fetchMetadata':
        onFetchMetadata?.(targetIds);
        break;
      case 'editMetadata':
        onEditMetadata?.(targetIds);
        break;
      case 'rename':
        openRenameDialog(fileId);
        break;
      case 'rebuildCache':
        handleRebuildCache();
        break;
    }
  }, [handleRead, onFetchMetadata, onEditMetadata, selectedFiles, openRenameDialog, handleRebuildCache, setOperation]);

  // Determine menu items based on available handlers
  const menuItems: MenuItemPreset[] = [
    'read',
    'markRead',
    'markUnread',
    ...(onFetchMetadata ? ['fetchMetadata'] as MenuItemPreset[] : []),
    ...(onEditMetadata ? ['editMetadata'] as MenuItemPreset[] : []),
    'rename',
    'rebuildCache',
  ];

  if (!selectedLibrary) {
    return (
      <div className="grid-view-empty">
        <div className="empty-state">
          <h2>Welcome to Helixio</h2>
          <p>Select a library from the sidebar to view your comics.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid-view" ref={scrollTargetRef}>

      {/* Loading State */}
      {loadingFiles && (
        <div className="loading-overlay">
          <div className="spinner" />
          Loading comics...
        </div>
      )}

      {/* Error State */}
      {filesError && <div className="error-message">{filesError}</div>}

      {/* Empty State */}
      {!loadingFiles && files.length === 0 && (
        <div className="empty-state">
          <p>No comics found in this location</p>
        </div>
      )}

      {/* Grid Header with Select All */}
      {files.length > 0 && (
        <div className="grid-header">
          <div className="grid-header-left">
            <div className="grid-header-checkbox">
              <input
                type="checkbox"
                checked={selectedFiles.size === files.length && files.length > 0}
                onChange={(e) => {
                  if (e.target.checked) {
                    selectAllFiles();
                  } else {
                    clearSelection();
                  }
                }}
                title={selectedFiles.size === files.length ? 'Deselect all' : 'Select all'}
              />
            </div>
            <span className="grid-header-label">
              {selectedFiles.size > 0
                ? `${selectedFiles.size} of ${files.length} selected`
                : `${files.length} item${files.length !== 1 ? 's' : ''}`}
            </span>
          </div>
          <CoverSizeSlider value={coverSize} onChange={handleCoverSizeChange} />
        </div>
      )}

      {/* Grid */}
      {files.length > 0 && (
        <div
          className="grid-container"
          ref={gridRef}
          style={{ '--cover-size': `${getCoverWidth(coverSize)}px` } as React.CSSProperties}
        >
          {Array.from(groupFiles(files, groupField).entries()).map(([groupName, groupedFiles]) => (
            <div key={groupName || 'all'} className="grid-group">
              {groupField !== 'none' && groupName && (
                <div className="grid-group-header">
                  <h3 className="grid-group-title">{groupName}</h3>
                  <span className="grid-group-count">{groupedFiles.length}</span>
                </div>
              )}
              <div className="grid">
                {groupedFiles.map((file, index) => (
                  <CoverCard
                    key={file.id}
                    file={file}
                    progress={readingProgress[file.id]}
                    variant="grid"
                    size="medium"
                    selectable={true}
                    isSelected={selectedFiles.has(file.id)}
                    checkboxVisibility="hover"
                    contextMenuEnabled={true}
                    menuItems={menuItems}
                    selectedCount={selectedFiles.size}
                    showInfo={true}
                    showSeries={true}
                    showIssueNumber={true}
                    onClick={handleCardClick}
                    onDoubleClick={handleCardDoubleClick}
                    onSelectionChange={handleSelectionChange}
                    onMenuAction={handleMenuAction}
                    animationIndex={index}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rename Dialog */}
      {renameDialog && (
        <div className="modal-overlay" onClick={() => setRenameDialog(null)}>
          <div
            className="modal rename-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>Rename File</h3>
              <button
                className="modal-close"
                onClick={() => setRenameDialog(null)}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <label htmlFor="rename-input-grid">New filename:</label>
              <input
                id="rename-input-grid"
                ref={renameInputRef}
                type="text"
                value={renameDialog.newFilename}
                onChange={(e) =>
                  setRenameDialog({ ...renameDialog, newFilename: e.target.value })
                }
                onKeyDown={handleRenameKeyDown}
                className="rename-input"
              />
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setRenameDialog(null)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleRename}
                disabled={
                  !renameDialog.newFilename.trim() ||
                  renameDialog.newFilename === renameDialog.currentFilename
                }
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
