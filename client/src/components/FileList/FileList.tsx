/**
 * FileList Component
 *
 * Virtualized table view of files using TanStack Table v8 with sorting, selection,
 * column resizing, column reordering, and column visibility toggle.
 *
 * Performance optimizations:
 * - Row virtualization: only renders visible rows (~50 instead of 4000+)
 * - Resize mode 'onEnd': columns only update after resize completes
 * - RAF-throttled scroll handling
 * - CSS transforms for GPU-accelerated row positioning
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type Row,
  type ColumnResizeMode,
  type SortingState,
} from '@tanstack/react-table';
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
import { useConfirmModal } from '../ConfirmModal';
import { columns } from './columns';
import { useColumnPersistence } from './hooks/useColumnPersistence';

import type { ComicFile } from '../../services/api.service';

// Extend TanStack Table's meta type to include our custom props
declare module '@tanstack/react-table' {
  interface TableMeta<TData> {
    compact?: boolean;
  }
}

// Row height for virtualization (must match CSS)
const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 32;
const OVERSCAN = 10; // Extra rows to render above/below viewport

interface FileListProps {
  onFetchMetadata?: (fileIds: string[]) => void;
  onEditMetadata?: (fileIds: string[]) => void;
  filteredFiles?: ComicFile[];
  compact?: boolean;
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
  } = useApp();
  const confirm = useConfirmModal();

  // Use filtered files if provided, otherwise use context files
  const files = filteredFiles ?? contextFiles;

  // Virtualization state
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const rafRef = useRef<number | null>(null);

  // Column persistence (sizes, order, visibility)
  const {
    columnSizing,
    columnOrder,
    columnVisibility,
    onColumnSizingChange,
    onColumnOrderChange,
    onColumnVisibilityChange,
  } = useColumnPersistence(compact);

  // Column visibility menu state
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const columnMenuRef = useRef<HTMLDivElement>(null);

  // Close column menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) {
        setShowColumnMenu(false);
      }
    };
    if (showColumnMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColumnMenu]);

  // Convert AppContext sort state to TanStack sorting state
  const sorting: SortingState = useMemo(() => {
    if (!sortField) return [];
    return [{ id: sortField, desc: sortOrder === 'desc' }];
  }, [sortField, sortOrder]);

  // Handle sorting changes
  const handleSortingChange = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      const newSorting = typeof updater === 'function' ? updater(sorting) : updater;
      const firstSort = newSorting[0];
      if (firstSort) {
        setSort(firstSort.id, firstSort.desc ? 'desc' : 'asc');
      }
    },
    [sorting, setSort]
  );

  // TanStack Table instance - use 'onEnd' mode for better resize performance
  const table = useReactTable({
    data: files,
    columns,
    state: {
      sorting,
      columnSizing,
      columnOrder,
      columnVisibility,
    },
    onSortingChange: handleSortingChange,
    onColumnSizingChange,
    onColumnOrderChange,
    onColumnVisibilityChange,
    columnResizeMode: 'onEnd' as ColumnResizeMode, // Only update after resize ends
    enableColumnResizing: true,
    enableSorting: true,
    enableHiding: true,
    manualSorting: true, // Sorting handled by API/AppContext
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    meta: {
      compact,
    },
  });

  // Calculate visible row range for virtualization
  const visibleRange = useMemo(() => {
    const startIndex = Math.floor(scrollTop / ROW_HEIGHT);
    const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT);

    return {
      start: Math.max(0, startIndex - OVERSCAN),
      end: Math.min(files.length - 1, startIndex + visibleCount + OVERSCAN),
    };
  }, [scrollTop, containerHeight, files.length]);

  // Get rows to render
  const allRows = table.getRowModel().rows;
  const virtualRows = useMemo(() => {
    return allRows.slice(visibleRange.start, visibleRange.end + 1);
  }, [allRows, visibleRange]);

  // Total height for scroll area
  const totalHeight = files.length * ROW_HEIGHT;

  // Handle scroll with RAF throttling
  const handleScroll = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (container) {
        setScrollTop(container.scrollTop);
      }
      rafRef.current = null;
    });
  }, []);

  // Set up container resize observer and scroll handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateHeight = () => {
      setContainerHeight(container.clientHeight - HEADER_HEIGHT);
    };

    updateHeight();

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(container);

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      resizeObserver.disconnect();
      container.removeEventListener('scroll', handleScroll);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [handleScroll]);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    fileId: string;
  } | null>(null);

  // Rename dialog state
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

  // Handle row click with selection logic
  const handleRowClick = useCallback((row: Row<ComicFile>, e: React.MouseEvent) => {
    const fileId = row.original.id;

    // Handle shift-click for range selection
    if (e.shiftKey && lastSelectedFileId) {
      selectRange(lastSelectedFileId, fileId);
      return;
    }

    // Multi-select logic
    const hasSelection = selectedFiles.size > 0;
    const isAlreadySelected = selectedFiles.has(fileId);
    const hasModifier = e.ctrlKey || e.metaKey;
    const useMulti = hasModifier || (hasSelection && !isAlreadySelected);
    selectFile(fileId, useMulti);
  }, [lastSelectedFileId, selectedFiles, selectRange, selectFile]);

  // Handle double-click to open reader
  const handleRowDoubleClick = useCallback((fileId: string) => {
    handleRead(fileId);
  }, [handleRead]);

  // Handle context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, fileId: string) => {
    e.preventDefault();
    if (!selectedFiles.has(fileId)) {
      selectFile(fileId, false);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, fileId });
  }, [selectedFiles, selectFile]);

  const closeContextMenu = () => setContextMenu(null);

  // Handle bulk actions
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

  // Open rename dialog
  const openRenameDialog = () => {
    closeContextMenu();
    const fileIds = Array.from(selectedFiles);
    if (fileIds.length !== 1) return;

    const file = files.find((f) => f.id === fileIds[0]);
    if (!file) return;

    setRenameDialog({
      fileId: file.id,
      currentFilename: file.filename,
      newFilename: file.filename,
    });
  };

  // Handle rename
  const handleRename = async () => {
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
      setOperation(null, `Rename failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
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

  // Handle rebuild cache
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
      setOperation(null, `Cache rebuild failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setTimeout(() => setOperation(null), 3000);
    }
  };

  // Click outside to close context menu
  const handlePageClick = () => {
    if (contextMenu) closeContextMenu();
  };

  // Handle select all checkbox
  const handleSelectAllChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      selectAllFiles();
    } else {
      clearSelection();
    }
  };

  // Handle individual row checkbox
  const handleRowCheckboxChange = (fileId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    selectFile(fileId, true);
  };

  // Check if all files are selected
  const isAllSelected = selectedFiles.size === files.length && files.length > 0;
  const isSomeSelected = selectedFiles.size > 0 && selectedFiles.size < files.length;

  // Empty state
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

  const isResizing = table.getState().columnSizingInfo.isResizingColumn;
  // Get delta width during resize for visual feedback
  const deltaOffset = table.getState().columnSizingInfo.deltaOffset ?? 0;

  return (
    <div
      className={`file-list ${compact ? 'file-list-compact' : ''} ${isResizing ? 'isResizing' : ''}`}
      onClick={handlePageClick}
    >
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
            <button className="btn-secondary" onClick={() => setStatusFilter(null)}>
              Clear Filter
            </button>
          )}
        </div>
      ) : (
        <div className="table-container" ref={containerRef}>
          {/* Column visibility toggle button */}
          {compact && (
            <div className="table-toolbar" ref={columnMenuRef}>
              <button
                className="btn-icon column-toggle-btn"
                onClick={() => setShowColumnMenu(!showColumnMenu)}
                title="Toggle columns"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <path d="M12 3v18M3 12h18" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
              {showColumnMenu && (
                <div className="column-visibility-menu">
                  <div className="column-visibility-header">Show Columns</div>
                  {table.getAllLeafColumns()
                    .filter((col) => col.getCanHide())
                    .map((column) => (
                      <label key={column.id} className="column-visibility-item">
                        <input
                          type="checkbox"
                          checked={column.getIsVisible()}
                          onChange={column.getToggleVisibilityHandler()}
                        />
                        <span>{column.id.charAt(0).toUpperCase() + column.id.slice(1)}</span>
                      </label>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Header row using same flex layout as body rows */}
          <div className="virtual-header">
            {table.getHeaderGroups().map((headerGroup) => (
              <div key={headerGroup.id} className="virtual-header-row">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const isSorted = header.column.getIsSorted();
                  const isColumnResizing = header.column.getIsResizing();

                  // Special handling for select column
                  if (header.id === 'select') {
                    return (
                      <div
                        key={header.id}
                        className="virtual-header-cell col-checkbox"
                        style={{ width: header.getSize() }}
                      >
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = isSomeSelected;
                          }}
                          onChange={handleSelectAllChange}
                        />
                      </div>
                    );
                  }

                  return (
                    <div
                      key={header.id}
                      className={`virtual-header-cell col-${header.id} ${canSort ? 'sortable' : ''}`}
                      style={{
                        width: isColumnResizing
                          ? header.getSize() + deltaOffset
                          : header.getSize(),
                      }}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <span className="th-content">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && (
                          <span className="sort-icon">
                            {isSorted === 'asc' ? '↑' : isSorted === 'desc' ? '↓' : '⇅'}
                          </span>
                        )}
                      </span>
                      {header.column.getCanResize() && (
                        <div
                          className={`resizer ${isColumnResizing ? 'isResizing' : ''}`}
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Virtualized body with absolute positioning */}
          <div
            className="virtual-table-body"
            style={{ height: totalHeight, position: 'relative' }}
          >
            {virtualRows.map((row) => {
              const isSelected = selectedFiles.has(row.original.id);
              const rowIndex = row.index;

              return (
                <div
                  key={row.id}
                  className={`virtual-row ${isSelected ? 'selected' : ''}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: ROW_HEIGHT,
                    transform: `translateY(${rowIndex * ROW_HEIGHT}px)`,
                  }}
                  onClick={(e) => handleRowClick(row, e)}
                  onDoubleClick={() => handleRowDoubleClick(row.original.id)}
                  onContextMenu={(e) => handleContextMenu(e, row.original.id)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const isColumnResizing = cell.column.getIsResizing();

                    // Special handling for select column
                    if (cell.column.id === 'select') {
                      return (
                        <div
                          key={cell.id}
                          className="virtual-cell col-checkbox"
                          style={{ width: cell.column.getSize() }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => handleRowCheckboxChange(row.original.id, e)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      );
                    }

                    return (
                      <div
                        key={cell.id}
                        className={`virtual-cell col-${cell.column.id}`}
                        style={{
                          width: isColumnResizing
                            ? cell.column.getSize() + deltaOffset
                            : cell.column.getSize(),
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
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
          <div className="modal rename-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Rename File</h3>
              <button className="modal-close" onClick={() => setRenameDialog(null)}>
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
                onChange={(e) => setRenameDialog({ ...renameDialog, newFilename: e.target.value })}
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
