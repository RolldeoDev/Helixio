/**
 * PageEditorModal Component
 *
 * Modal for editing pages in a comic archive (CBZ).
 * Supports deletion and reordering with drag-and-drop.
 */

import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useVirtualGrid } from '../../hooks/useVirtualGrid';
import { useConfirmModal } from '../ConfirmModal';
import { useToast } from '../../contexts/ToastContext';
import { usePageEditorState } from './usePageEditorState';
import type { PageEditorModalProps, PageInfo } from './types';
import './PageEditorModal.css';

const API_BASE = '/api';

function getPageImageUrl(fileId: string, pagePath: string): string {
  return `${API_BASE}/archives/${fileId}/page/${encodeURIComponent(pagePath)}`;
}

export function PageEditorModal({
  fileId,
  filename,
  isOpen,
  onClose,
  onSave,
}: PageEditorModalProps) {
  const confirm = useConfirmModal();
  const { addToast } = useToast();

  const {
    state,
    pendingChanges,
    selectPage,
    selectAll,
    clearSelection,
    markForDeletion,
    moveSelection,
    reorderPages,
    saveChanges,
    resetChanges,
  } = usePageEditorState(fileId);

  // Drag-and-drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Preview state
  const [previewPage, setPreviewPage] = useState<PageInfo | null>(null);

  // Filter out deleted pages for display
  const visiblePages = state.pages.filter(
    (page) => !state.deletedIndices.has(page.index)
  );

  // Virtual grid for performance
  const {
    virtualItems,
    totalHeight,
    containerRef,
  } = useVirtualGrid(visiblePages, {
    itemWidth: 160,
    itemHeight: 240,
    gap: 16,
    overscan: 4,
    paddingLeft: 16,
    paddingTop: 16,
    horizontalPadding: 32,
  });

  // Delete with confirmation - defined before useEffect that uses it
  const handleDeleteWithConfirmation = useCallback(async () => {
    const count = state.selectedIndices.size;
    if (count === 0) return;

    const confirmed = await confirm({
      title: 'Delete Pages',
      message: `Are you sure you want to delete ${count} page${count > 1 ? 's' : ''}? This change is permanent and cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (confirmed) {
      markForDeletion();
    }
  }, [state.selectedIndices.size, confirm, markForDeletion]);

  // Keyboard handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case 'Delete':
        case 'Backspace':
          if (state.selectedIndices.size > 0) {
            e.preventDefault();
            handleDeleteWithConfirmation();
          }
          break;

        case 'ArrowUp':
          if (state.selectedIndices.size > 0) {
            e.preventDefault();
            moveSelection('up');
          }
          break;

        case 'ArrowDown':
          if (state.selectedIndices.size > 0) {
            e.preventDefault();
            moveSelection('down');
          }
          break;

        case 'a':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            selectAll();
          }
          break;

        case 'Escape':
          e.preventDefault();
          handleClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, state.selectedIndices, handleDeleteWithConfirmation, moveSelection, selectAll]);

  // Drag handlers
  const handleDragStart = useCallback((index: number, e: React.DragEvent) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Store the index for drop handling
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleDragOver = useCallback((index: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((targetIndex: number, e: React.DragEvent) => {
    e.preventDefault();
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!isNaN(fromIndex) && fromIndex !== targetIndex) {
      reorderPages(fromIndex, targetIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [reorderPages]);

  // Close handler with unsaved changes warning
  const handleClose = useCallback(async () => {
    if (pendingChanges.hasChanges) {
      const confirmed = await confirm({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Are you sure you want to close?',
        confirmText: 'Discard Changes',
        variant: 'danger',
      });
      if (!confirmed) return;
    }
    resetChanges();
    onClose();
  }, [pendingChanges.hasChanges, confirm, resetChanges, onClose]);

  // Save handler
  const handleSave = useCallback(async () => {
    // Check for bookmarks warning
    if (state.modifiability?.hasBookmarks) {
      const confirmed = await confirm({
        title: 'Bookmarks Warning',
        message: `This file has ${state.modifiability.bookmarkPages.length} bookmark(s). Page changes may affect bookmark positions. Continue?`,
        confirmText: 'Continue',
        variant: 'warning',
      });
      if (!confirmed) return;
    }

    // Check if archive needs conversion
    if (state.modifiability && !state.modifiability.isModifiable) {
      if (state.modifiability.canConvert) {
        const confirmed = await confirm({
          title: 'Convert Archive',
          message: `This ${state.modifiability.format.toUpperCase()} archive must be converted to CBZ before editing. Convert and continue?`,
          confirmText: 'Convert',
          variant: 'warning',
        });
        if (!confirmed) return;

        // TODO: Implement conversion API call
        addToast('error', 'Archive conversion not yet implemented');
        return;
      } else {
        addToast('error', state.modifiability.reason || 'Archive cannot be modified');
        return;
      }
    }

    const success = await saveChanges();
    if (success) {
      addToast(
        'success',
        `Saved: ${pendingChanges.summary.deletedCount} deleted, ${pendingChanges.summary.reorderedCount} reordered`
      );
      onSave?.();
      onClose();
    }
  }, [state.modifiability, confirm, saveChanges, pendingChanges.summary, addToast, onSave, onClose]);

  // Page click handler
  const handlePageClick = useCallback((page: PageInfo, e: React.MouseEvent) => {
    // Find index in visible pages
    const visibleIndex = visiblePages.findIndex((p) => p.path === page.path);
    if (visibleIndex !== -1) {
      selectPage(visibleIndex, e);
    }
  }, [visiblePages, selectPage]);

  // Don't render if not open
  if (!isOpen) return null;

  const modalContent = (
    <div className="page-editor-modal-overlay" onClick={handleClose}>
      <div className="page-editor-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="page-editor-header">
          <div className="header-left">
            <h2>Edit Pages</h2>
            <span className="filename" title={filename}>
              {filename}
            </span>
          </div>
          <div className="header-right">
            <button
              className="btn-icon"
              onClick={handleClose}
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Error message */}
        {state.error && (
          <div className="error-banner">
            <span className="error-icon">⚠️</span>
            <span>{state.error}</span>
          </div>
        )}

        {/* Toolbar */}
        <div className="page-editor-toolbar">
          <div className="toolbar-left">
            <span className="page-count">
              {visiblePages.length} pages
              {state.deletedIndices.size > 0 && (
                <span className="deleted-count">
                  ({state.deletedIndices.size} marked for deletion)
                </span>
              )}
            </span>
            {state.selectedIndices.size > 0 && (
              <span className="selection-count">
                {state.selectedIndices.size} selected
              </span>
            )}
            <span className="selection-hint">
              Shift+click for range, {typeof navigator !== 'undefined' && navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}+click to toggle
            </span>
          </div>
          <div className="toolbar-right">
            <button
              className="btn-ghost btn-sm"
              onClick={selectAll}
              disabled={state.isLoading}
            >
              Select All
            </button>
            <button
              className="btn-ghost btn-sm"
              onClick={clearSelection}
              disabled={state.selectedIndices.size === 0}
            >
              Clear
            </button>
            <div className="toolbar-separator" />
            <button
              className="btn-ghost btn-sm"
              onClick={() => moveSelection('front')}
              disabled={state.selectedIndices.size === 0}
              title="Move to front"
            >
              ⏮ Front
            </button>
            <button
              className="btn-ghost btn-sm"
              onClick={() => moveSelection('up')}
              disabled={state.selectedIndices.size === 0}
              title="Move back (←)"
            >
              ← Back
            </button>
            <button
              className="btn-ghost btn-sm"
              onClick={() => moveSelection('down')}
              disabled={state.selectedIndices.size === 0}
              title="Move forward (→)"
            >
              → Forward
            </button>
            <button
              className="btn-ghost btn-sm"
              onClick={() => moveSelection('back')}
              disabled={state.selectedIndices.size === 0}
              title="Move to back"
            >
              ⏭ Back
            </button>
            <div className="toolbar-separator" />
            <button
              className="btn-danger btn-sm"
              onClick={handleDeleteWithConfirmation}
              disabled={state.selectedIndices.size === 0}
              title="Delete selected (Del/Backspace)"
            >
              🗑 Delete
            </button>
          </div>
        </div>

        {/* Loading state */}
        {state.isLoading ? (
          <div className="page-editor-loading">
            <div className="spinner" />
            <span>Preparing pages...</span>
          </div>
        ) : (
          /* Grid content */
          <div
            className="page-editor-content"
            ref={containerRef}
          >
            <div
              className="page-grid-container"
              style={{ height: totalHeight + 32 }}
            >
              {virtualItems.map(({ item: page, index, style }) => {
                const isSelected = state.selectedIndices.has(index);
                const isDragging = draggedIndex === index;
                const isDragOver = dragOverIndex === index;

                return (
                  <div
                    key={page.path}
                    className={`page-item ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
                    style={style}
                    onClick={(e) => handlePageClick(page, e)}
                    onDoubleClick={() => setPreviewPage(page)}
                    draggable
                    onDragStart={(e) => handleDragStart(index, e)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => handleDragOver(index, e)}
                    onDrop={(e) => handleDrop(index, e)}
                  >
                    <div className="page-thumbnail">
                      <img
                        src={getPageImageUrl(fileId, page.path)}
                        alt={`Page ${index + 1}`}
                        loading="lazy"
                        decoding="async"
                      />
                      {isSelected && (
                        <div className="selection-overlay">
                          <span className="checkmark">✓</span>
                        </div>
                      )}
                    </div>
                    <div className="page-info">
                      <span className="page-number">Page {index + 1}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="page-editor-footer">
          <div className="footer-left">
            {pendingChanges.hasChanges ? (
              <span className="changes-summary">
                {pendingChanges.summary.deletedCount > 0 && (
                  <span className="change-item delete">
                    {pendingChanges.summary.deletedCount} to delete
                  </span>
                )}
                {pendingChanges.summary.reorderedCount > 0 && (
                  <span className="change-item reorder">
                    {pendingChanges.summary.reorderedCount} to reorder
                  </span>
                )}
              </span>
            ) : (
              <span className="no-changes">No changes</span>
            )}
          </div>
          <div className="footer-right">
            <button className="btn-ghost" onClick={handleClose}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={!pendingChanges.hasChanges || state.isSaving}
            >
              {state.isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {/* Preview modal */}
      {previewPage && (
        <div className="page-preview-modal" onClick={() => setPreviewPage(null)}>
          <div className="preview-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="btn-icon close-btn"
              onClick={() => setPreviewPage(null)}
            >
              ✕
            </button>
            <img
              src={getPageImageUrl(fileId, previewPage.path)}
              alt={`Page ${previewPage.index + 1}`}
            />
            <div className="preview-info">
              Page {previewPage.index + 1} of {visiblePages.length}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(modalContent, document.body);
}
