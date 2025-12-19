/**
 * Reading Queue Component
 *
 * Displays the reading queue in the reader.
 * Shows upcoming comics with drag-and-drop reordering.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getReadingQueue,
  removeFromReadingQueue,
  moveInQueue,
  clearReadingQueue,
  getCoverUrl,
  QueueItem,
  QueueStatus,
} from '../../services/api.service';

interface ReadingQueueProps {
  visible: boolean;
  currentFileId?: string;
  onNavigateToFile?: (fileId: string) => void;
  onClose?: () => void;
}

export function ReadingQueue({
  visible,
  currentFileId,
  onNavigateToFile,
  onClose,
}: ReadingQueueProps) {
  const [queue, setQueue] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Fetch queue data
  const fetchQueue = useCallback(async () => {
    try {
      setError(null);
      const data = await getReadingQueue();
      setQueue(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      fetchQueue();
    }
  }, [visible, fetchQueue]);

  // Remove item from queue
  const handleRemove = async (fileId: string) => {
    try {
      await removeFromReadingQueue(fileId);
      fetchQueue();
    } catch (err) {
      console.error('Failed to remove from queue:', err);
    }
  };

  // Clear entire queue
  const handleClear = async () => {
    if (!confirm('Clear the entire reading queue?')) return;
    try {
      await clearReadingQueue();
      fetchQueue();
    } catch (err) {
      console.error('Failed to clear queue:', err);
    }
  };

  // Navigate to a queued item
  const handleNavigate = (item: QueueItem) => {
    if (onNavigateToFile) {
      onNavigateToFile(item.fileId);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, fileId: string) => {
    setDraggedItem(fileId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', fileId);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);

    if (!draggedItem) return;

    try {
      await moveInQueue(draggedItem, targetIndex);
      fetchQueue();
    } catch (err) {
      console.error('Failed to reorder queue:', err);
    }

    setDraggedItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverIndex(null);
  };

  if (!visible) return null;

  return (
    <div className="reading-queue">
      <div className="reading-queue-header">
        <h3>Reading Queue</h3>
        <div className="reading-queue-actions">
          {queue && queue.totalCount > 0 && (
            <button
              className="btn-icon"
              onClick={handleClear}
              title="Clear queue"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          )}
          {onClose && (
            <button className="btn-icon" onClick={onClose} title="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="reading-queue-content">
        {loading && (
          <div className="reading-queue-loading">
            <div className="reader-loading-spinner small" />
          </div>
        )}

        {error && (
          <div className="reading-queue-error">
            <p>{error}</p>
            <button onClick={fetchQueue}>Retry</button>
          </div>
        )}

        {!loading && !error && queue && queue.totalCount === 0 && (
          <div className="reading-queue-empty">
            <p>No items in queue</p>
            <p className="hint">Add comics to your queue from the library view</p>
          </div>
        )}

        {!loading && !error && queue && queue.totalCount > 0 && (
          <ul className="reading-queue-list">
            {queue.items.map((item, index) => (
              <li
                key={item.id}
                className={`reading-queue-item ${
                  item.fileId === currentFileId ? 'current' : ''
                } ${draggedItem === item.fileId ? 'dragging' : ''} ${
                  dragOverIndex === index ? 'drag-over' : ''
                }`}
                draggable
                onDragStart={(e) => handleDragStart(e, item.fileId)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
              >
                <div className="queue-item-position">{index + 1}</div>
                <div className="queue-item-cover">
                  <img
                    src={getCoverUrl(item.fileId)}
                    alt=""
                    loading="lazy"
                  />
                </div>
                <div className="queue-item-info">
                  <div className="queue-item-filename" title={item.filename}>
                    {item.filename}
                  </div>
                  {item.progress !== undefined && item.progress > 0 && (
                    <div className="queue-item-progress">
                      <div
                        className="progress-bar"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="queue-item-actions">
                  <button
                    className="btn-icon"
                    onClick={() => handleNavigate(item)}
                    title="Read now"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </button>
                  <button
                    className="btn-icon"
                    onClick={() => handleRemove(item.fileId)}
                    title="Remove from queue"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="reading-queue-footer">
        {queue && queue.totalCount > 0 && (
          <span>{queue.totalCount} item{queue.totalCount !== 1 ? 's' : ''} in queue</span>
        )}
      </div>
    </div>
  );
}
