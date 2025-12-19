/**
 * Continue Reading Component
 *
 * Shows recently read comics that are in progress with visual progress bars.
 * Includes "Up Next" suggestions based on series context.
 * Displayed in the sidebar for quick access.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getContinueReading,
  getCoverUrl,
  ContinueReadingItem,
  markAsCompleted,
  markAsIncomplete,
  deleteReadingProgress,
  addToReadingQueue,
} from '../../services/api.service';
import { useApp } from '../../contexts/AppContext';

interface ContinueReadingProps {
  libraryId?: string;
  limit?: number;
}

// Format time since last read
function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Get progress color based on percentage
function getProgressColor(progress: number): string {
  if (progress >= 90) return 'var(--color-success, #22c55e)';
  if (progress >= 50) return 'var(--color-accent, #3b82f6)';
  return 'var(--color-warning, #f59e0b)';
}

export function ContinueReading({ libraryId, limit = 5 }: ContinueReadingProps) {
  const navigate = useNavigate();
  const { libraries, selectLibrary, selectFolder } = useApp();
  const [items, setItems] = useState<ContinueReadingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: ContinueReadingItem;
  } | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      setError(null);
      const response = await getContinueReading(limit, libraryId);
      setItems(response.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [limit, libraryId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Split items into currently reading (most recent) and up next
  const { currentItem, upNextItems } = useMemo(() => {
    if (items.length === 0) return { currentItem: null, upNextItems: [] };
    return {
      currentItem: items[0],
      upNextItems: items.slice(1),
    };
  }, [items]);

  // Don't render if no items and not loading
  if (!loading && items.length === 0) {
    return null;
  }

  const handleItemClick = (item: ContinueReadingItem) => {
    navigate(`/read/${item.fileId}`);
  };

  const handleContextMenu = (e: React.MouseEvent, item: ContinueReadingItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  const closeContextMenu = () => setContextMenu(null);

  const handleMarkCompleted = async () => {
    if (!contextMenu) return;
    const { item } = contextMenu;
    closeContextMenu();
    try {
      await markAsCompleted(item.fileId);
      // Remove from list since it's now completed
      setItems((prev) => prev.filter((i) => i.fileId !== item.fileId));
    } catch (err) {
      console.error('Failed to mark as completed:', err);
    }
  };

  const handleMarkUnread = async () => {
    if (!contextMenu) return;
    const { item } = contextMenu;
    closeContextMenu();
    try {
      // Reset progress to page 0 and mark as incomplete
      await markAsIncomplete(item.fileId);
      // Remove from continue reading list since it's now unread (page 0)
      setItems((prev) => prev.filter((i) => i.fileId !== item.fileId));
    } catch (err) {
      console.error('Failed to mark as unread:', err);
    }
  };

  const handleRemoveFromList = async () => {
    if (!contextMenu) return;
    const { item } = contextMenu;
    closeContextMenu();
    try {
      // Delete reading progress entirely
      await deleteReadingProgress(item.fileId);
      setItems((prev) => prev.filter((i) => i.fileId !== item.fileId));
    } catch (err) {
      console.error('Failed to remove from continue reading:', err);
    }
  };

  const handleAddToQueue = async () => {
    if (!contextMenu) return;
    const { item } = contextMenu;
    closeContextMenu();
    try {
      await addToReadingQueue(item.fileId);
    } catch (err) {
      console.error('Failed to add to queue:', err);
    }
  };

  const handleShowInLibrary = () => {
    if (!contextMenu) return;
    const { item } = contextMenu;
    closeContextMenu();

    // Find the library and select it
    const library = libraries.find((l) => l.id === item.libraryId);
    if (library) {
      selectLibrary(library);
      // Extract the folder path from relativePath (everything except the filename)
      const folderPath = item.relativePath.includes('/')
        ? item.relativePath.substring(0, item.relativePath.lastIndexOf('/'))
        : null;
      // Use setTimeout to ensure library is selected first
      setTimeout(() => {
        selectFolder(folderPath);
      }, 0);
    }
  };

  return (
    <div className="continue-reading">
      <button
        className="continue-reading-header"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="continue-reading-title">Continue Reading</span>
        <span className={`continue-reading-chevron ${collapsed ? 'collapsed' : ''}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {!collapsed && (
        <div className="continue-reading-content">
          {loading && (
            <div className="continue-reading-loading">Loading...</div>
          )}

          {error && (
            <div className="continue-reading-error">{error}</div>
          )}

          {!loading && !error && currentItem && (
            <>
              {/* Current Reading - Featured Item */}
              <div
                className="continue-reading-current"
                onClick={() => handleItemClick(currentItem)}
                onContextMenu={(e) => handleContextMenu(e, currentItem)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    handleItemClick(currentItem);
                  }
                }}
              >
                <div className="continue-reading-current-cover">
                  <img
                    src={getCoverUrl(currentItem.fileId)}
                    alt=""
                    loading="lazy"
                  />
                  <div className="continue-reading-current-overlay">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
                <div className="continue-reading-current-info">
                  <span className="continue-reading-current-filename" title={currentItem.filename}>
                    {currentItem.filename.replace(/\.cb[rz7t]$/i, '')}
                  </span>
                  <div className="continue-reading-current-meta">
                    <span className="continue-reading-current-page">
                      Page {currentItem.currentPage + 1}/{currentItem.totalPages}
                    </span>
                    <span className="continue-reading-current-time">
                      {formatTimeAgo(currentItem.lastReadAt)}
                    </span>
                  </div>
                  <div className="continue-reading-progress-container">
                    <div className="continue-reading-progress-track">
                      <div
                        className="continue-reading-progress-fill"
                        style={{
                          width: `${currentItem.progress}%`,
                          backgroundColor: getProgressColor(currentItem.progress)
                        }}
                      />
                    </div>
                    <span className="continue-reading-progress-text">
                      {Math.round(currentItem.progress)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Up Next List */}
              {upNextItems.length > 0 && (
                <div className="continue-reading-upnext">
                  <div className="continue-reading-upnext-header">Up Next</div>
                  <ul className="continue-reading-list">
                    {upNextItems.map((item) => (
                      <li
                        key={item.fileId}
                        className="continue-reading-item"
                        onClick={() => handleItemClick(item)}
                        onContextMenu={(e) => handleContextMenu(e, item)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            handleItemClick(item);
                          }
                        }}
                      >
                        <div className="continue-reading-cover">
                          <img
                            src={getCoverUrl(item.fileId)}
                            alt=""
                            loading="lazy"
                          />
                          <div
                            className="continue-reading-progress-bar"
                            style={{
                              width: `${item.progress}%`,
                              backgroundColor: getProgressColor(item.progress)
                            }}
                          />
                        </div>
                        <div className="continue-reading-info">
                          <span className="continue-reading-filename" title={item.filename}>
                            {item.filename.replace(/\.cb[rz7t]$/i, '')}
                          </span>
                          <div className="continue-reading-meta">
                            <span className="continue-reading-page">
                              {item.currentPage + 1}/{item.totalPages}
                            </span>
                            <span className="continue-reading-progress-badge">
                              {Math.round(item.progress)}%
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div
            className="context-menu-backdrop"
            onClick={closeContextMenu}
          />
          <div
            className="context-menu"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button
              onClick={() => {
                closeContextMenu();
                handleItemClick(contextMenu.item);
              }}
            >
              Continue Reading
            </button>
            <button onClick={handleAddToQueue}>
              Add to Queue
            </button>
            <button onClick={handleShowInLibrary}>
              Show in Library
            </button>
            <div className="context-menu-divider" />
            <button onClick={handleMarkCompleted}>
              Mark as Completed
            </button>
            <button onClick={handleMarkUnread}>
              Mark as Unread
            </button>
            <div className="context-menu-divider" />
            <button onClick={handleRemoveFromList} className="danger">
              Remove from Continue Reading
            </button>
          </div>
        </>
      )}
    </div>
  );
}
