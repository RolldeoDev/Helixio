/**
 * SearchResult Component
 *
 * Individual result item in the global search dropdown.
 * Displays thumbnail, title, subtitle, and type badge.
 */

import { getCoverUrl, getSeriesCoverUrl, type GlobalSearchResult } from '../../services/api.service';

interface SearchResultProps {
  result: GlobalSearchResult;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}

// Type badge icons (inline SVG for simplicity)
const SeriesIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/>
  </svg>
);

const IssueIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
  </svg>
);

const CreatorIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
  </svg>
);

// Placeholder icon for creators (no thumbnail)
const PlaceholderIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" opacity="0.4">
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
  </svg>
);

export function SearchResult({ result, isSelected, onClick, onMouseEnter }: SearchResultProps) {
  // Get thumbnail URL based on type
  const getThumbnailUrl = (): string | null => {
    if (result.thumbnailType === 'none' || !result.thumbnailId) {
      return null;
    }
    if (result.thumbnailType === 'series') {
      return getSeriesCoverUrl(result.thumbnailId);
    }
    return getCoverUrl(result.thumbnailId);
  };

  const thumbnailUrl = getThumbnailUrl();

  // Get type icon
  const TypeIcon = result.type === 'series' ? SeriesIcon : result.type === 'issue' ? IssueIcon : CreatorIcon;

  return (
    <button
      className={`search-result ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      type="button"
    >
      <div className="search-result-thumbnail">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={(e) => {
              // Hide broken images
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="search-result-placeholder">
            <PlaceholderIcon />
          </div>
        )}
      </div>
      <div className="search-result-content">
        <span className="search-result-title">{result.title}</span>
        {result.subtitle && (
          <span className="search-result-subtitle">{result.subtitle}</span>
        )}
      </div>
      <span className={`search-result-badge badge-${result.type}`}>
        <TypeIcon />
        <span>{result.type}</span>
      </span>
    </button>
  );
}
