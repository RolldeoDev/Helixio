/**
 * Discover Section
 *
 * Browse random unread comics with category filtering.
 * Features:
 * - Category pills for filtering by genre/publisher
 * - Grid of random unread comics
 * - Refresh button to get new random selection
 * - "See All" links to filtered library view
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { SectionHeader } from './SectionHeader';
import { ComicCarousel, ComicCarouselItem } from './ComicCarousel';
import {
  getDiscoverComics,
  DiscoverComic,
} from '../../services/api.service';

// =============================================================================
// Types
// =============================================================================

interface DiscoverSectionProps {
  libraryId?: string;
  onItemClick?: (fileId: string) => void;
}

type CategoryFilter = 'all' | string;

// Common categories/genres to filter by
const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'superhero', label: 'Superhero' },
  { id: 'horror', label: 'Horror' },
  { id: 'sci-fi', label: 'Sci-Fi' },
  { id: 'fantasy', label: 'Fantasy' },
  { id: 'crime', label: 'Crime' },
  { id: 'indie', label: 'Indie' },
];

// =============================================================================
// Helpers
// =============================================================================

/**
 * Convert DiscoverComic to ComicCarouselItem
 */
function toCardItem(comic: DiscoverComic): ComicCarouselItem {
  return {
    fileId: comic.fileId,
    filename: comic.filename,
  };
}

// =============================================================================
// Component
// =============================================================================

export function DiscoverSection({
  libraryId,
  onItemClick,
}: DiscoverSectionProps) {
  const [comics, setComics] = useState<DiscoverComic[]>([]);
  const [filteredComics, setFilteredComics] = useState<DiscoverComic[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchComics = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await getDiscoverComics(24, libraryId);
      setComics(data.comics);
      setFilteredComics(data.comics);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load discover comics');
      console.error('Error fetching discover comics:', err);
    } finally {
      setIsLoading(false);
    }
  }, [libraryId]);

  useEffect(() => {
    fetchComics();
  }, [fetchComics]);

  // Filter comics when category changes
  useEffect(() => {
    if (selectedCategory === 'all') {
      setFilteredComics(comics);
    } else {
      // Filter by genre/publisher containing the category
      const filtered = comics.filter((comic) => {
        const genre = comic.series?.toLowerCase() || '';
        const publisher = comic.publisher?.toLowerCase() || '';
        const category = selectedCategory.toLowerCase();
        return genre.includes(category) || publisher.includes(category);
      });
      setFilteredComics(filtered.length > 0 ? filtered : comics);
    }
  }, [selectedCategory, comics]);

  // Handle category change
  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId);
  };

  // Handle refresh
  const handleRefresh = () => {
    fetchComics();
  };

  // Loading state
  if (isLoading) {
    return (
      <section className="home-section">
        <SectionHeader title="Discover" />
        <div className="discover-pills">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className={`discover-pill ${cat.id === 'all' ? 'active' : ''}`}
              disabled
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div className="discover-grid">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="skeleton skeleton-card" />
          ))}
        </div>
      </section>
    );
  }

  // Error state
  if (error) {
    return (
      <section className="home-section">
        <SectionHeader title="Discover" />
        <div className="home-empty-state">
          <svg className="home-empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h3 className="home-empty-state-title">Couldn't load comics</h3>
          <p className="home-empty-state-text">{error}</p>
          <button
            onClick={fetchComics}
            className="home-refresh-btn"
            style={{
              marginTop: 'var(--spacing-md)',
              padding: 'var(--spacing-sm) var(--spacing-lg)',
              background: 'var(--color-primary)',
              color: 'var(--color-bg)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Try Again
          </button>
        </div>
      </section>
    );
  }

  // Empty state
  if (comics.length === 0) {
    return (
      <section className="home-section">
        <SectionHeader title="Discover" />
        <div className="home-empty-state">
          <svg className="home-empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <h3 className="home-empty-state-title">Nothing to discover yet</h3>
          <p className="home-empty-state-text">
            Add comics to your library to start discovering new reads.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="home-section">
      <div className="discover-header">
        <SectionHeader
          title="Discover"
          subtitle={`${filteredComics.length} to explore`}
          seeAllLink="/library?status=unread"
        />
      </div>

      {/* Category Pills */}
      <div className="discover-pills">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className={`discover-pill ${selectedCategory === cat.id ? 'active' : ''}`}
            onClick={() => handleCategoryChange(cat.id)}
          >
            {cat.label}
          </button>
        ))}
        <Link to="/library" className="discover-pill discover-pill-link">
          Browse All
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>
      </div>

      {/* Discover Carousel */}
      <ComicCarousel
        items={filteredComics.map(toCardItem)}
        onItemClick={onItemClick}
        cardSize="small"
      />

      {/* Refresh Button */}
      <div className="discover-actions">
        <button
          onClick={handleRefresh}
          className="discover-refresh-btn"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Show me something new
        </button>
      </div>
    </section>
  );
}
