/**
 * FileList Component
 *
 * Table view of files with sorting, selection, and actions.
 */

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import {
  deleteFile,
  quarantineFile,
  restoreFile,
  bulkDeleteFiles,
  bulkQuarantineFiles,
  renameFile,
  rebuildCache,
} from '../../services/api.service';
import { formatFileSize } from '../../utils/format';
import { getTitleDisplay } from '../../utils/titleDisplay';
import { useConfirmModal } from '../ConfirmModal';

import type { ComicFile } from '../../services/api.service';

interface FileListProps {
  onFetchMetadata?: (fileIds: string[]) => void;
  onEditMetadata?: (fileIds: string[]) => void;
  filteredFiles?: ComicFile[];
  compact?: boolean;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

function getStatusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case 'indexed':
      return { label: 'Indexed', className: 'badge-success' };
    case 'pending':
      return { label: 'Pending', className: 'badge-warning' };
    case 'orphaned':
      return { label: 'Orphaned', className: 'badge-error' };
    case 'quarantined':
      return { label: 'Quarantined', className: 'badge-danger' };
    default:
      return { label: status, className: 'badge-default' };
  }
}

export function FileList({ onFetchMetadata, onEditMetadata, filteredFiles, compact = false }: FileListProps) {
  const navigate = useNavigate();
  const {
    files: contextFiles,
    selectedFiles,
    loadingFiles,
    filesError,
    sortField,
    sortOrder,
    statusFilter,
    selectedLibrary,
    isAllLibraries,
    selectFile,
    selectRange,
    selectAllFiles,
    clearSelection,
    setSort,
    setStatusFilter,
    refreshFiles,
    setOperation,
    lastSelectedFileId,
    preferFilenameOverMetadata,
  } = useApp();
  const confirm = useConfirmModal();

  // Use filtered files if provided, otherwise use context files
  const files = filteredFiles ?? contextFiles;

  const scrollTargetRef = useRef<HTMLDivElement>(null);

  // Open reader for a file
  const handleRead = (fileId: string) => {
    const file = files.find((f) => f.id === fileId);
    const filename = file?.filename || 'Comic';
    navigate(`/read/${fileId}?filename=${encodeURIComponent(filename)}`);
  };

  // Handle double-click to open reader
  const handleRowDoubleClick = (fileId: string) => {
    handleRead(fileId);
  };

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    fileId: string;
  } | null>(null);

  const [renameDialog, setRenameDialog] = useState<{
    fileId: string;
    currentFilename: string;
    newFilename: string;
  } | null>(null);

  const renameInputRef = useRef<HTMLInputElement>(null);

  // Focus and select filename (without extension) when rename dialog opens
  useEffect(() => {
    if (renameDialog && renameInputRef.current) {
      const input = renameInputRef.current;
      input.focus();
      // Select filename without extension
      const lastDot = renameDialog.newFilename.lastIndexOf('.');
      if (lastDot > 0) {
        input.setSelectionRange(0, lastDot);
      } else {
        input.select();
      }
    }
  }, [renameDialog]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSort(field, sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(field, 'asc');
    }
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) return '⇅';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  const handleRowClick = (fileId: string, e: React.MouseEvent) => {
    // Handle shift-click for range selection
    if (e.shiftKey && lastSelectedFileId) {
      selectRange(lastSelectedFileId, fileId);
      return;
    }

    // If there's already a selection, add to it (multi-select mode)
    // Unless clicking on an already-selected item without modifier keys (deselect others)
    const hasSelection = selectedFiles.size > 0;
    const isAlreadySelected = selectedFiles.has(fileId);
    const hasModifier = e.ctrlKey || e.metaKey;

    // Use multi-select if: modifier key held, OR there's existing selection and clicking unselected item
    const useMulti = hasModifier || (hasSelection && !isAlreadySelected);
    selectFile(fileId, useMulti);
  };

  const handleContextMenu = (e: React.MouseEvent, fileId: string) => {
    e.preventDefault();
    if (!selectedFiles.has(fileId)) {
      selectFile(fileId, false);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, fileId });
  };

  const closeContextMenu = () => setContextMenu(null);

  const handleAction = async (action: string) => {
    closeContextMenu();

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
        // Restore only works on single files
        for (const id of fileIds) {
          await restoreFile(id);
        }
      }

      setOperation(null, `${action} completed`);
      clearSelection();
      await refreshFiles();
      setTimeout(() => setOperation(null), 2000);
    } catch (err) {
      setOperation(null, `${action} failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setTimeout(() => setOperation(null), 3000);
    }
  };

  const openRenameDialog = () => {
    closeContextMenu();
    const fileIds = Array.from(selectedFiles);
    if (fileIds.length !== 1) return; // Only rename single files

    const file = files.find((f) => f.id === fileIds[0]);
    if (!file) return;

    setRenameDialog({
      fileId: file.id,
      currentFilename: file.filename,
      newFilename: file.filename,
    });
  };

  const handleRename = async () => {
    if (!renameDialog) return;

    const { fileId, currentFilename, newFilename } = renameDialog;

    // Validate
    if (!newFilename.trim()) {
      return;
    }

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
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRename();
    } else if (e.key === 'Escape') {
      setRenameDialog(null);
    }
  };

  const handleRebuildCache = async () => {
    closeContextMenu();
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
  };

  // Click outside to close context menu
  const handlePageClick = () => {
    if (contextMenu) closeContextMenu();
  };

  if (!selectedLibrary && !isAllLibraries) {
    return (
      <div className="file-list-empty">
        <div className="empty-state">
          <h2>Welcome to Helixio</h2>
          <p>Select a library from the sidebar to view your comics.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`file-list ${compact ? 'file-list-compact' : ''}`} onClick={handlePageClick} ref={scrollTargetRef}>
      {/* Loading/Error States */}
      {loadingFiles && (
        <div className="loading-overlay">
          <div className="spinner" />
          Loading files...
        </div>
      )}

      {filesError && <div className="error-message">{filesError}</div>}

      {/* Table */}
      {!loadingFiles && files.length === 0 ? (
        <div className="empty-state">
          <p>No files found</p>
          {statusFilter && (
            <button
              className="btn-secondary"
              onClick={() => setStatusFilter(null)}
            >
              Clear Filter
            </button>
          )}
        </div>
      ) : (
        <div className="table-container">
          <table className="file-table">
            <thead>
              <tr>
                <th className="col-checkbox">
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
                </th>
                <th
                  className="col-filename sortable"
                  onClick={() => handleSort('filename')}
                >
                  Filename {getSortIcon('filename')}
                </th>
                <th className="col-title">
                  Title
                </th>
                <th
                  className="col-size sortable"
                  onClick={() => handleSort('size')}
                >
                  Size {getSortIcon('size')}
                </th>
                <th
                  className="col-status sortable"
                  onClick={() => handleSort('status')}
                >
                  Status {getSortIcon('status')}
                </th>
                <th
                  className="col-modified sortable"
                  onClick={() => handleSort('modifiedAt')}
                >
                  Modified {getSortIcon('modifiedAt')}
                </th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => {
                const isSelected = selectedFiles.has(file.id);
                const statusBadge = getStatusBadge(file.status);
                const { primaryTitle } = getTitleDisplay(file, {
                  preferFilename: preferFilenameOverMetadata,
                });

                return (
                  <tr
                    key={file.id}
                    className={isSelected ? 'selected' : ''}
                    onClick={(e) => handleRowClick(file.id, e)}
                    onDoubleClick={() => handleRowDoubleClick(file.id)}
                    onContextMenu={(e) => handleContextMenu(e, file.id)}
                  >
                    <td className="col-checkbox">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation();
                          // Always use multi-select mode for checkboxes to allow toggling individual items
                          selectFile(file.id, true);
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="col-filename">
                      <span className="file-icon">
                        {file.filename.endsWith('.cbz') ? '📦' : '📄'}
                      </span>
                      <span className="file-name" title={file.relativePath}>
                        {file.filename}
                      </span>
                    </td>
                    <td className="col-title">
                      <span className="file-title" title={primaryTitle}>
                        {primaryTitle}
                      </span>
                    </td>
                    <td className="col-size">{formatFileSize(file.size)}</td>
                    <td className="col-status">
                      <span className={`badge ${statusBadge.className}`}>
                        {statusBadge.label}
                      </span>
                    </td>
                    <td className="col-modified">
                      {formatDate(file.modifiedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {selectedFiles.size === 1 && (
            <button
              onClick={() => {
                closeContextMenu();
                handleRead(contextMenu.fileId);
              }}
            >
              Read
            </button>
          )}
          {onFetchMetadata && (
            <button
              onClick={() => {
                closeContextMenu();
                onFetchMetadata(Array.from(selectedFiles));
              }}
            >
              Fetch Metadata{selectedFiles.size > 1 ? ` (${selectedFiles.size})` : ''}
            </button>
          )}
          {onEditMetadata && selectedFiles.size > 0 && (
            <button
              onClick={() => {
                closeContextMenu();
                onEditMetadata(Array.from(selectedFiles));
              }}
            >
              Edit Metadata{selectedFiles.size > 1 ? ` (${selectedFiles.size})` : ''}
            </button>
          )}
          {(onFetchMetadata || onEditMetadata) && (
            <div className="context-menu-divider" />
          )}
          {selectedFiles.size === 1 && (
            <button onClick={openRenameDialog}>Rename</button>
          )}
          <button onClick={() => handleAction('Restore')}>
            Restore from Quarantine
          </button>
          <button onClick={() => handleAction('Quarantine')}>
            Move to Quarantine
          </button>
          <div className="context-menu-divider" />
          <button onClick={handleRebuildCache}>
            Rebuild Cover & Page Cache{selectedFiles.size > 1 ? ` (${selectedFiles.size})` : ''}
          </button>
          <div className="context-menu-divider" />
          <button className="danger" onClick={() => handleAction('Delete')}>
            Delete Permanently
          </button>
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
              <label htmlFor="rename-input">New filename:</label>
              <input
                id="rename-input"
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
