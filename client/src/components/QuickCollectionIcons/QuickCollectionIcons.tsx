/**
 * QuickCollectionIcons
 *
 * Heart (Favorite) and Bookmark (Want to Read) toggle buttons.
 * Used in series headers and issue detail pages for quick collection access.
 */

import { useState, useCallback, useEffect } from 'react';
import { useCollections } from '../../contexts/CollectionsContext';
import { getCollectionsForItem } from '../../services/api.service';
import './QuickCollectionIcons.css';

interface QuickCollectionIconsProps {
  seriesId?: string;
  fileId?: string;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export function QuickCollectionIcons({
  seriesId,
  fileId,
  size = 'medium',
  className = '',
}: QuickCollectionIconsProps) {
  const {
    toggleFavorite,
    toggleWantToRead,
    favoritesId,
    wantToReadId,
  } = useCollections();

  const [favorite, setFavorite] = useState(false);
  const [wantToRead, setWantToRead] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [wantToReadLoading, setWantToReadLoading] = useState(false);

  // Fetch initial state
  useEffect(() => {
    async function fetchMemberships() {
      if (!seriesId && !fileId) return;

      try {
        setIsLoading(true);
        const result = await getCollectionsForItem(seriesId, fileId);
        const collectionIds = new Set(result.collections.map((c) => c.id));

        setFavorite(favoritesId ? collectionIds.has(favoritesId) : false);
        setWantToRead(wantToReadId ? collectionIds.has(wantToReadId) : false);
      } catch (err) {
        console.error('Error fetching collection memberships:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchMemberships();
  }, [seriesId, fileId, favoritesId, wantToReadId]);

  const handleToggleFavorite = useCallback(async () => {
    if (favoriteLoading) return;

    setFavoriteLoading(true);
    try {
      const added = await toggleFavorite(seriesId, fileId);
      setFavorite(added);
    } finally {
      setFavoriteLoading(false);
    }
  }, [seriesId, fileId, toggleFavorite, favoriteLoading]);

  const handleToggleWantToRead = useCallback(async () => {
    if (wantToReadLoading) return;

    setWantToReadLoading(true);
    try {
      const added = await toggleWantToRead(seriesId, fileId);
      setWantToRead(added);
    } finally {
      setWantToReadLoading(false);
    }
  }, [seriesId, fileId, toggleWantToRead, wantToReadLoading]);

  if (isLoading) {
    return (
      <div className={`quick-collection-icons quick-collection-icons--${size} ${className}`}>
        <span className="quick-collection-icon loading" />
        <span className="quick-collection-icon loading" />
      </div>
    );
  }

  return (
    <div className={`quick-collection-icons quick-collection-icons--${size} ${className}`}>
      <button
        className={`quick-collection-icon ${favorite ? 'active' : ''} ${favoriteLoading ? 'loading' : ''}`}
        onClick={handleToggleFavorite}
        disabled={favoriteLoading}
        aria-label={favorite ? 'Remove from Favorites' : 'Add to Favorites'}
        title={favorite ? 'Remove from Favorites' : 'Add to Favorites'}
      >
        <svg
          viewBox="0 0 24 24"
          fill={favorite ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>
      <button
        className={`quick-collection-icon ${wantToRead ? 'active' : ''} ${wantToReadLoading ? 'loading' : ''}`}
        onClick={handleToggleWantToRead}
        disabled={wantToReadLoading}
        aria-label={wantToRead ? 'Remove from Want to Read' : 'Add to Want to Read'}
        title={wantToRead ? 'Remove from Want to Read' : 'Add to Want to Read'}
      >
        <svg
          viewBox="0 0 24 24"
          fill={wantToRead ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    </div>
  );
}
