/**
 * ListView Component
 *
 * Editorial-style list view with thumbnail cards for comics.
 * Each row displays a small cover, title, metadata, and status.
 * Uses shared CoverCard components for consistent context menus.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import { NavigationOrigin } from '../../contexts/BreadcrumbContext';
import {
  getCoverUrl,
  renameFile,
  rebuildCache,
  getLibraryReadingProgress,
  deleteFile,
  quarantineFile,
  restoreFile,
  bulkDeleteFiles,
  bulkQuarantineFiles,
} from '../../services/api.service';
import { ContextMenu, useContextMenu, EXTENDED_MENU_ITEMS, type MenuItemPreset } from '../CoverCard';
import { GroupSelectCheckbox } from '../GroupSelectCheckbox';
import { Spinner } from '../LoadingState';
import { formatFileSize } from '../../utils/format';
import { groupFiles } from '../../utils/file-grouping';
import { useConfirmModal } from '../ConfirmModal';

import type { ComicFile } from '../../services/api.service';
import type { GroupField } from '../SortGroup/SortGroupPanel';
import './ListView.css';

interface ListViewProps {
  onFileSelect?: (fileId: string) => void;
  onFileDoubleClick?: (fileId: string) => void;
  onFetchMetadata?: (fileIds: string[]) => void;
  onEditMetadata?: (fileIds: string[]) => void;
  filteredFiles?: ComicFile[];
  groupField?: GroupField;
}

interface ListCoverProps {
  fileId: string;
  filename: string;
}

/**
 * Small thumbnail cover for list items
 */
function ListCover({ fileId, filename }: ListCoverProps) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const coverUrl = getCoverUrl(fileId);

  const handleLoad = useCallback(() => {
    setStatus('loaded');
  }, []);

  const handleError = useCallback(() => {
    setStatus('error');
  }, []);

  return (
    <div className="list-item-cover">
      {status === 'loading' && (
        <div className="list-cover-loading">
          <div className="list-cover-shimmer" />
        </div>
      )}
      {status === 'error' && (
        <div className="list-cover-error">
          <span className="list-cover-error-icon">!</span>
        </div>
      )}
      <img
        src={coverUrl}
        alt={filename}
        loading="lazy"
        decoding="async"
        onLoad={handleLoad}
        onError={handleError}
        className={status === 'loaded' ? 'loaded' : 'hidden'}
      />
    </div>
  );
}

export function ListView({
  onFileSelect,
  onFileDoubleClick,
  onFetchMetadata,
  onEditMetadata,
  filteredFiles,
  groupField = 'none',
}: ListViewProps) {
  const navigate = useNavigate();
  const {
    files: contextFiles,
    selectedFiles,
    loadingFiles,
    filesError,
    selectedLibrary,
    isAllLibraries,
    selectFile,
    selectRange,
    selectAllFiles,
    selectFiles,
    clearSelection,
    refreshFiles,
    setOperation,
    lastSelectedFileId,
  } = useApp();
  const confirm = useConfirmModal();

  const files = filteredFiles ?? contextFiles;
  const scrollTargetRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Use shared context menu hook
  const { menuState, handleContextMenu, closeMenu } = useContextMenu();

  // Reading progress state
  const [readingProgress, setReadingProgress] = useState<
    Record<string, { currentPage: number; totalPages: number; completed: boolean }>
  >({});

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

  // Handle file actions (delete, quarantine, restore)
  const handleFileAction = useCallback(async (action: 'Delete' | 'Quarantine' | 'Restore') => {
    const fileIds = Array.from(selectedFiles);
    if (fileIds.length === 0) return;

    const isBulk = fileIds.length > 1;
    const confirmMessage = isBulk
      ? `${action} ${fileIds.length} files?`
      : `${action} this file?`;

    const confirmed = await confirm({
      title: action,
      message: confirmMessage,
      confirmText: action,
      variant: 'danger',
    });
    if (!confirmed) return;

    setOperation(action, `${action} ${fileIds.length} file(s)...`);

    try {
      if (action === 'Delete') {
        if (isBulk) {
          await bulkDeleteFiles(fileIds);
        } else {
          await deleteFile(fileIds[0]!);
        }
      } else if (action === 'Quarantine') {
        if (isBulk) {
          await bulkQuarantineFiles(fileIds);
        } else {
          await quarantineFile(fileIds[0]!);
        }
      } else if (action === 'Restore') {
        for (const id of fileIds) {
          await restoreFile(id);
        }
      }

      setOperation(null, `${action} completed`);
      clearSelection();
      await refreshFiles();
      setTimeout(() => setOperation(null), 2000);
    } catch (err) {
      setOperation(
        null,
        `${action} failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
      setTimeout(() => setOperation(null), 3000);
    }
  }, [selectedFiles, setOperation, clearSelection, refreshFiles]);

  // Handle rebuild cache
  const handleRebuildCache = useCallback(async () => {
    const fileIds = Array.from(selectedFiles);
    if (fileIds.length === 0) return;

    setOperation('Rebuild Cache', `Rebuilding cache for ${fileIds.length} file(s)...`);

    try {
      const { jobId, fileCount } = await rebuildCache({ fileIds, type: 'full' });
      setOperation(
        null,
        `Cache rebuild started for ${fileCount} file(s) (Job: ${jobId.slice(-8)})`
      );
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

  // Handle item click with selection logic and navigation
  const handleItemClick = useCallback((fileId: string, e: React.MouseEvent) => {
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
    const navState: NavigationOrigin = {
      from: 'library',
      libraryId: selectedLibrary?.id,
      libraryName: isAllLibraries ? 'All Libraries' : selectedLibrary?.name,
    };
    navigate(`/issue/${fileId}`, { state: navState });
  }, [lastSelectedFileId, selectRange, selectFile, onFileSelect, navigate, selectedLibrary, isAllLibraries]);

  const handleItemDoubleClick = useCallback((fileId: string) => {
    onFileDoubleClick?.(fileId);
  }, [onFileDoubleClick]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, fileId: string) => {
    if (e.key === 'Enter') {
      onFileDoubleClick?.(fileId);
    } else if (e.key === ' ') {
      e.preventDefault();
      selectFile(fileId, true);
    }
  }, [onFileDoubleClick, selectFile]);

  // Handle right-click context menu
  const handleRowContextMenu = useCallback((e: React.MouseEvent, fileId: string) => {
    handleContextMenu(e, fileId, () => {
      if (!selectedFiles.has(fileId)) {
        selectFile(fileId, false);
      }
    });
  }, [handleContextMenu, selectedFiles, selectFile]);

  // Handle context menu action
  const handleMenuAction = useCallback((action: MenuItemPreset | string) => {
    closeMenu();

    const fileId = menuState.fileId;
    if (!fileId) return;

    // Get target file IDs (selected files if the clicked file is selected, otherwise just the clicked file)
    const targetIds = selectedFiles.has(fileId) ? Array.from(selectedFiles) : [fileId];

    switch (action) {
      case 'read':
        handleRead(fileId);
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
      case 'restore':
        handleFileAction('Restore');
        break;
      case 'quarantine':
        handleFileAction('Quarantine');
        break;
      case 'delete':
        handleFileAction('Delete');
        break;
    }
  }, [closeMenu, menuState.fileId, handleRead, onFetchMetadata, onEditMetadata, selectedFiles, openRenameDialog, handleRebuildCache, handleFileAction]);

  // Determine menu items - filter out actions without handlers
  const menuItems: MenuItemPreset[] = EXTENDED_MENU_ITEMS.filter(item => {
    if (item === 'fetchMetadata' && !onFetchMetadata) return false;
    if (item === 'editMetadata' && !onEditMetadata) return false;
    return true;
  });

  if (!selectedLibrary && !isAllLibraries) {
    return (
      <div className="list-view-empty">
        <div className="empty-state">
          <h2>Welcome to Helixio</h2>
          <p>Select a library from the sidebar to view your comics.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="list-view" ref={scrollTargetRef}>
      {/* Loading State */}
      {loadingFiles && <Spinner message="Loading comics..." />}

      {/* Error State */}
      {filesError && <div className="error-message">{filesError}</div>}

      {/* Empty State */}
      {!loadingFiles && files.length === 0 && (
        <div className="empty-state">
          <p>No comics found in this location</p>
        </div>
      )}

      {/* List Header */}
      {files.length > 0 && (
        <div className="list-header">
          <div className="list-header-checkbox">
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
            />
          </div>
          <div className="list-header-cover" />
          <div className="list-header-title">Title</div>
          <div className="list-header-series">Series</div>
          <div className="list-header-size">Size</div>
          <div className="list-header-progress">Progress</div>
        </div>
      )}

      {/* List Items */}
      {files.length > 0 && (
        <div className="list-container">
          {Array.from(groupFiles(files, groupField).entries()).map(([groupName, groupedFiles]) => {
            // Get seriesId from first file for linking (only when grouping by series)
            const seriesId = groupField === 'series' ? groupedFiles[0]?.seriesId : null;
            const groupFileIds = groupedFiles.map((f) => f.id);

            return (
            <div key={groupName || 'all'} className="list-group">
              {groupField !== 'none' && groupName && (
                <div className="list-group-header">
                  <GroupSelectCheckbox
                    groupFileIds={groupFileIds}
                    selectedFileIds={selectedFiles}
                    onSelectAll={(ids) => selectFiles(ids, true)}
                    onDeselectAll={(ids) => selectFiles(ids, false)}
                    hasAnySelection={selectedFiles.size > 0}
                  />
                  {groupField === 'series' && seriesId ? (
                    <h3
                      className="list-group-title list-group-title--link"
                      onClick={() => navigate(`/series/${seriesId}`)}
                      role="link"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && navigate(`/series/${seriesId}`)}
                    >
                      {groupName}
                    </h3>
                  ) : (
                    <h3 className="list-group-title">{groupName}</h3>
                  )}
                  <span className="list-group-count">{groupedFiles.length}</span>
                </div>
              )}
              {groupedFiles.map((file, index) => {
                const isSelected = selectedFiles.has(file.id);
                const progress = readingProgress[file.id];
                const progressPercent =
                  progress && progress.totalPages > 0
                    ? Math.round((progress.currentPage / progress.totalPages) * 100)
                    : 0;
                const isInProgress = progress && progress.currentPage > 0 && !progress.completed;
                const isCompleted = progress?.completed;

                // Extract display name (without extension)
                const displayName = file.filename.replace(/\.cb[rz7t]$/i, '');

                return (
                  <div
                    key={file.id}
                    className={`list-item ${isSelected ? 'selected' : ''}`}
                    style={{ '--item-index': index } as React.CSSProperties}
                    onClick={(e) => handleItemClick(file.id, e)}
                    onDoubleClick={() => handleItemDoubleClick(file.id)}
                    onContextMenu={(e) => handleRowContextMenu(e, file.id)}
                    onKeyDown={(e) => handleKeyDown(e, file.id)}
                    tabIndex={0}
                    role="button"
                    aria-selected={isSelected}
                  >
                    {/* Checkbox */}
                    <div className="list-item-checkbox">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          selectFile(file.id, true);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>

                    {/* Cover Thumbnail */}
                    <ListCover fileId={file.id} filename={file.filename} />

                    {/* Title & Metadata */}
                    <div className="list-item-title">
                      <span className="list-item-name" title={file.filename}>
                        {displayName}
                      </span>
                      {file.metadata?.writer && (
                        <span className="list-item-creator">{file.metadata.writer}</span>
                      )}
                    </div>

                    {/* Series Info */}
                    <div className="list-item-series">
                      {file.metadata?.series ? (
                        <>
                          <span className="series-name">{file.metadata.series}</span>
                          {file.metadata.number && (
                            <span className="series-number">#{file.metadata.number}</span>
                          )}
                        </>
                      ) : (
                        <span className="series-unknown">-</span>
                      )}
                    </div>

                    {/* File Size */}
                    <div className="list-item-size">{formatFileSize(file.size)}</div>

                    {/* Reading Progress */}
                    <div className="list-item-progress">
                      {isCompleted ? (
                        <span className="progress-completed" title="Completed">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                          </svg>
                          Read
                        </span>
                      ) : isInProgress ? (
                        <div className="progress-bar-container" title={`${progressPercent}% complete`}>
                          <div className="progress-bar">
                            <div
                              className="progress-bar-fill"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                          <span className="progress-text">{progressPercent}%</span>
                        </div>
                      ) : (
                        <span className="progress-unread">New</span>
                      )}
                    </div>

                    {/* Selection indicator */}
                    {isSelected && <div className="list-item-selection-glow" />}
                  </div>
                );
              })}
            </div>
            );
          })}
        </div>
      )}

      {/* Context Menu - using shared component */}
      {menuState.isOpen && menuState.position && (
        <ContextMenu
          position={menuState.position}
          items={menuItems}
          selectedCount={selectedFiles.size}
          onAction={handleMenuAction}
          onClose={closeMenu}
        />
      )}

      {/* Rename Dialog */}
      {renameDialog && (
        <div className="modal-overlay" onClick={() => setRenameDialog(null)}>
          <div className="modal rename-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Rename File</h3>
              <button className="modal-close" onClick={() => setRenameDialog(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <label htmlFor="rename-input-list">New filename:</label>
              <input
                id="rename-input-list"
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
              <button className="btn-secondary" onClick={() => setRenameDialog(null)}>
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
