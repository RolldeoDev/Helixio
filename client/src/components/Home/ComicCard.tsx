/**
 * Comic Card Component
 *
 * Reusable card for displaying comics with:
 * - Cover image with lazy loading
 * - Progress bar for in-progress items
 * - Completed checkmark badge
 * - Speech bubble badge for recommendations
 * - Hover animations
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCoverUrl } from '../../services/api.service';
import { CompletedBadge } from '../Progress';

// =============================================================================
// Types
// =============================================================================

export interface ComicCardItem {
  fileId: string;
  filename: string;
  progress?: number;
  completed?: boolean;
  badge?: string;
  badgeType?: 'primary' | 'success' | 'warning' | 'info';
  series?: string | null;
  number?: string | null;
}

interface ComicCardProps {
  item: ComicCardItem;
  onClick?: (fileId: string) => void;
  size?: 'small' | 'medium' | 'large';
}

// =============================================================================
// Component
// =============================================================================

export function ComicCard({ item, onClick, size = 'medium' }: ComicCardProps) {
  const navigate = useNavigate();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const handleClick = () => {
    if (onClick) {
      onClick(item.fileId);
    } else {
      navigate(`/read/${item.fileId}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  // Get display title (strip extension)
  const displayTitle = item.filename.replace(/\.cb[rz7t]$/i, '');

  // Get size class
  const sizeClass = size === 'small' ? 'comic-card-sm' : size === 'large' ? 'comic-card-lg' : '';

  return (
    <div
      className={`comic-card ${sizeClass}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Badge */}
      {item.badge && (
        <div className={`comic-card-badge comic-card-badge-${item.badgeType || 'primary'}`}>
          {item.badge}
        </div>
      )}

      {/* Cover */}
      <div className="comic-card-cover">
        {!imageError && (
          <img
            src={getCoverUrl(item.fileId)}
            alt={displayTitle}
            loading="lazy"
            decoding="async"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
            style={{ opacity: imageLoaded ? 1 : 0 }}
          />
        )}

        {/* Fallback for error or loading */}
        {(imageError || !imageLoaded) && (
          <div className="comic-card-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
        )}

        {/* Progress bar */}
        {item.progress !== undefined && item.progress > 0 && !item.completed && (
          <div className="comic-card-progress">
            <div
              className="comic-card-progress-fill"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        )}

        {/* Completed checkmark */}
        {item.completed && (
          <CompletedBadge size="sm" className="comic-card-completed" />
        )}
      </div>

      {/* Info */}
      <div className="comic-card-info">
        <h3 className="comic-card-title" title={displayTitle}>
          {displayTitle}
        </h3>
        <div className="comic-card-meta">
          {item.number && (
            <span className="comic-card-issue">#{item.number}</span>
          )}
          {item.progress !== undefined && !item.completed && (
            <span>{Math.round(item.progress)}%</span>
          )}
          {item.completed && (
            <span style={{ color: 'var(--color-success)' }}>Completed</span>
          )}
        </div>
      </div>
    </div>
  );
}
