/**
 * Virtual Grid View Component
 *
 * A virtualized grid view for displaying large numbers of comics efficiently.
 * Only renders items that are visible in the viewport.
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';
import { useVirtualGrid } from '../../hooks/useVirtualGrid';
import { getLibraryReadingProgress } from '../../services/api.service';
import { CoverCard } from '../CoverCard';
import type { ComicFile } from '../../services/api.service';
import './VirtualGrid.css';

// =============================================================================
// Types
// =============================================================================

interface VirtualGridViewProps {
  files: ComicFile[];
  onFileSelect?: (fileId: string) => void;
  onFileDoubleClick?: (fileId: string) => void;
  onFetchMetadata?: (fileIds: string[]) => void;
}

// =============================================================================
// Main Component
// =============================================================================

export function VirtualGridView({
  files,
  onFileSelect,
  onFileDoubleClick,
  onFetchMetadata,
}: VirtualGridViewProps) {
  const navigate = useNavigate();
  const { selectedFiles, selectedLibrary, selectFile, selectRange, clearSelection, lastSelectedFileId } = useApp();

  // Grid configuration - responsive item sizes
  const itemWidth = 180;
  const itemHeight = 280;
  const gap = 16;

  const { virtualItems, totalHeight, containerRef, columns } = useVirtualGrid(files, {
    itemWidth,
    itemHeight,
    gap,
    overscan: 4,
  });

  // Reading progress state
  const [readingProgress, setReadingProgress] = useState<Record<string, { currentPage: number; totalPages: number; completed: boolean }>>({});

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

  const handleItemClick = useCallback((fileId: string, e: React.MouseEvent) => {
    // Handle shift-click for range selection
    if (e.shiftKey && lastSelectedFileId) {
      selectRange(lastSelectedFileId, fileId);
      onFileSelect?.(fileId);
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
    onFileSelect?.(fileId);
  }, [selectFile, selectRange, selectedFiles, lastSelectedFileId, onFileSelect]);

  const handleItemDoubleClick = useCallback((fileId: string) => {
    if (onFileDoubleClick) {
      onFileDoubleClick(fileId);
    } else {
      const file = files.find(f => f.id === fileId);
      const filename = file?.filename || 'Comic';
      navigate(`/read/${fileId}?filename=${encodeURIComponent(filename)}`);
    }
  }, [files, navigate, onFileDoubleClick]);

  // Handle selection change from CoverCard
  const handleSelectionChange = useCallback((fileId: string, _selected: boolean) => {
    selectFile(fileId, true);
  }, [selectFile]);

  if (files.length === 0) {
    return (
      <div className="vgrid-empty">
        <p>No comics found</p>
      </div>
    );
  }

  return (
    <div className="vgrid-container">
      {/* Toolbar */}
      <div className="vgrid-toolbar">
        <span className="vgrid-count">{files.length} comics</span>
        {selectedFiles.size > 0 && (
          <div className="vgrid-toolbar-actions">
            {onFetchMetadata && (
              <button
                className="btn-primary"
                onClick={() => onFetchMetadata(Array.from(selectedFiles))}
              >
                Fetch Metadata ({selectedFiles.size})
              </button>
            )}
            <button className="btn-ghost" onClick={clearSelection}>
              Clear ({selectedFiles.size})
            </button>
          </div>
        )}
      </div>

      {/* Virtual Grid */}
      <div
        ref={containerRef}
        className="vgrid-scroll-container"
      >
        <div
          className="vgrid-content"
          style={{
            height: totalHeight,
            width: columns * (itemWidth + gap) - gap,
          }}
        >
          {virtualItems.map(({ item, index, style }) => (
            <div
              key={item.id}
              className="vgrid-item-wrapper"
              style={style}
              data-index={index}
            >
              <CoverCard
                file={item}
                progress={readingProgress[item.id]}
                variant="grid"
                size="medium"
                selectable={true}
                isSelected={selectedFiles.has(item.id)}
                checkboxVisibility="hover"
                contextMenuEnabled={false}
                showInfo={true}
                showSeries={true}
                showIssueNumber={true}
                onClick={handleItemClick}
                onDoubleClick={handleItemDoubleClick}
                onSelectionChange={handleSelectionChange}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
