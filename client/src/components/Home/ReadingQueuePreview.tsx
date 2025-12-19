/**
 * Reading Queue Preview
 *
 * Compact preview of the reading queue for the home page.
 * Shows the next few items in the queue with a "View All" link.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SectionHeader } from './SectionHeader';
import { getReadingQueue, QueueItem } from '../../services/api.service';

// =============================================================================
// Types
// =============================================================================

interface ReadingQueuePreviewProps {
  maxItems?: number;
}

// =============================================================================
// Component
// =============================================================================

export function ReadingQueuePreview({ maxItems = 5 }: ReadingQueuePreviewProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await getReadingQueue();
      setItems(data.items.slice(0, maxItems));
      setTotalCount(data.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load queue');
      console.error('Error fetching reading queue:', err);
    } finally {
      setIsLoading(false);
    }
  }, [maxItems]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  // Handle item click
  const handleItemClick = (fileId: string) => {
    navigate(`/read/${fileId}`);
  };

  // Don't render if loading or error or empty
  if (isLoading) {
    return (
      <section className="home-section">
        <SectionHeader title="Up Next" />
        <div className="queue-preview">
          {[1, 2, 3].map((i) => (
            <div key={i} className="queue-preview-item skeleton" style={{ height: '60px' }} />
          ))}
        </div>
      </section>
    );
  }

  if (error || items.length === 0) {
    return null; // Don't show queue section if empty or error
  }

  return (
    <section className="home-section">
      <SectionHeader
        title="Up Next"
        subtitle={totalCount > maxItems ? `${totalCount} in queue` : undefined}
        seeAllLink="/lists/queue"
      />

      <div className="queue-preview">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="queue-preview-item"
            onClick={() => handleItemClick(item.fileId)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                handleItemClick(item.fileId);
              }
            }}
          >
            <div className="queue-preview-position">{index + 1}</div>
            <div className="queue-preview-cover">
              <img
                src={`/api/covers/${item.fileId}`}
                alt={item.filename}
                loading="lazy"
              />
            </div>
            <div className="queue-preview-info">
              <h4 className="queue-preview-title">
                {item.filename.replace(/\.cb[rz7t]$/i, '')}
              </h4>
              {item.progress !== undefined && item.progress > 0 && (
                <div className="queue-preview-progress">
                  <div
                    className="queue-preview-progress-fill"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              )}
            </div>
            <div className="queue-preview-action">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
          </div>
        ))}
      </div>

      {totalCount > maxItems && (
        <div className="queue-preview-footer">
          <Link to="/lists/queue" className="queue-preview-view-all">
            View all {totalCount} items
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        </div>
      )}
    </section>
  );
}
