/**
 * CollectionMetadataStats Component
 *
 * Displays collection statistics as a row of stat pills.
 */

import './CollectionMetadataStats.css';

export interface CollectionMetadataStatsProps {
  /** Number of series in the collection */
  seriesCount: number;
  /** Number of individual issues in the collection */
  issueCount: number;
  /** Whether this is a smart collection */
  isSmart: boolean;
  /** Scope of the smart filter */
  smartScope?: 'series' | 'files' | null;
  /** When the last item was added (ISO date string) */
  lastItemAddedAt?: string | null;
  /** Additional CSS class */
  className?: string;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function CollectionMetadataStats({
  seriesCount,
  issueCount,
  isSmart,
  smartScope,
  lastItemAddedAt,
  className = '',
}: CollectionMetadataStatsProps) {
  return (
    <div className={`collection-metadata-stats ${className}`}>
      {/* Series count */}
      <div className="collection-metadata-stats__stat">
        <svg className="collection-metadata-stats__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        <span className="collection-metadata-stats__value">{seriesCount}</span>
        <span className="collection-metadata-stats__label">
          {seriesCount === 1 ? 'Series' : 'Series'}
        </span>
      </div>

      {/* Issue count */}
      <div className="collection-metadata-stats__stat">
        <svg className="collection-metadata-stats__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span className="collection-metadata-stats__value">{issueCount}</span>
        <span className="collection-metadata-stats__label">
          {issueCount === 1 ? 'Issue' : 'Issues'}
        </span>
      </div>

      {/* Smart indicator */}
      {isSmart && (
        <div className="collection-metadata-stats__stat collection-metadata-stats__stat--smart">
          <svg className="collection-metadata-stats__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </svg>
          <span className="collection-metadata-stats__label">
            Smart {smartScope === 'files' ? '(Issues)' : '(Series)'}
          </span>
        </div>
      )}

      {/* Last added */}
      {lastItemAddedAt && (
        <div className="collection-metadata-stats__stat collection-metadata-stats__stat--date">
          <svg className="collection-metadata-stats__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span className="collection-metadata-stats__label">
            Added {formatDate(lastItemAddedAt)}
          </span>
        </div>
      )}
    </div>
  );
}
