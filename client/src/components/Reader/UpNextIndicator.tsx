/**
 * Up Next Indicator Component
 *
 * Shows the next item in the reading queue when nearing the end of a comic.
 */

import { useState, useEffect } from 'react';
import {
  getNextAfterInQueue,
  getCoverUrl,
  QueueItem,
} from '../../services/api.service';

interface UpNextIndicatorProps {
  currentFileId: string;
  currentPage: number;
  totalPages: number;
  onNavigate: (fileId: string) => void;
  visible?: boolean;
}

export function UpNextIndicator({
  currentFileId,
  currentPage,
  totalPages,
  onNavigate,
  visible = true,
}: UpNextIndicatorProps) {
  const [nextItem, setNextItem] = useState<QueueItem | null>(null);

  // Only show when near the end of the comic (last 3 pages)
  const isNearEnd = totalPages > 0 && currentPage >= totalPages - 3;

  useEffect(() => {
    if (!isNearEnd || !visible) {
      setNextItem(null);
      return;
    }

    const fetchNext = async () => {
      try {
        const next = await getNextAfterInQueue(currentFileId);
        setNextItem(next);
      } catch {
        // Silently fail - just don't show indicator
        setNextItem(null);
      }
    };

    fetchNext();
  }, [currentFileId, isNearEnd, visible]);

  if (!nextItem || !isNearEnd || !visible) return null;

  return (
    <div
      className="up-next-indicator"
      onClick={() => onNavigate(nextItem.fileId)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onNavigate(nextItem.fileId);
        }
      }}
    >
      <div className="up-next-cover">
        <img
          src={getCoverUrl(nextItem.fileId)}
          alt=""
          loading="lazy"
        />
      </div>
      <div className="up-next-info">
        <span className="up-next-label">Up Next</span>
        <span className="up-next-filename" title={nextItem.filename}>
          {nextItem.filename}
        </span>
      </div>
    </div>
  );
}
