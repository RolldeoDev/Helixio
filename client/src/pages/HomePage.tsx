/**
 * Home Page
 *
 * The default reading-focused view for Helixio. Features:
 * - Welcome header with library scope toggle
 * - Hero section with current reading and quick stats
 * - Continue reading carousel
 * - Recommendations (series continuations, similar content, recently added)
 * - Discover section with category browsing
 * - Reading queue preview
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getContinueReading,
  getAllTimeReadingStats,
  ContinueReadingItem,
  AllTimeStats,
} from '../services/api.service';
import {
  HomeHeader,
  HomeHero,
  ContinueReadingSection,
  RecommendedSection,
  DiscoverSection,
  ReadingQueuePreview,
} from '../components/Home';
import type { LibraryScope } from '../components/Home';
import '../components/Home/Home.css';

// =============================================================================
// Main Component
// =============================================================================

export function HomePage() {
  const navigate = useNavigate();

  // Library scope state
  const [libraryScope, setLibraryScope] = useState<LibraryScope>('all');

  // Data states
  const [continueReading, setContinueReading] = useState<ContinueReadingItem[]>([]);
  const [allTimeStats, setAllTimeStats] = useState<AllTimeStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get the effective library ID for API calls
  const effectiveLibraryId = libraryScope === 'all' ? undefined : libraryScope;

  // Fetch home page data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [continueReadingRes, statsRes] = await Promise.all([
        getContinueReading(8, effectiveLibraryId),
        getAllTimeReadingStats(),
      ]);

      setContinueReading(continueReadingRes.items);
      setAllTimeStats(statsRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load home page data');
      console.error('Error fetching home page data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [effectiveLibraryId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle comic click
  const handleComicClick = (fileId: string) => {
    navigate(`/read/${fileId}`);
  };

  // Get featured item (first in continue reading)
  const featuredItem = continueReading.length > 0 ? continueReading[0] : null;
  const remainingItems = continueReading.slice(1);

  return (
    <div className={`home-page ${isLoading ? 'loading' : ''}`}>
      {/* Header with welcome and library toggle */}
      <HomeHeader
        libraryScope={libraryScope}
        onLibraryScopeChange={setLibraryScope}
      />

      {/* Error State */}
      {error && (
        <div className="home-empty-state home-section">
          <svg className="home-empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <h3 className="home-empty-state-title">Something went wrong</h3>
          <p className="home-empty-state-text">{error}</p>
          <button
            onClick={fetchData}
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
      )}

      {/* Hero Section with featured reading and stats */}
      {!error && (
        <HomeHero
          featuredItem={featuredItem ?? null}
          stats={allTimeStats}
          isLoading={isLoading}
        />
      )}

      {/* Continue Reading Section */}
      {!error && (
        <ContinueReadingSection
          items={remainingItems}
          isLoading={isLoading}
          onItemClick={handleComicClick}
        />
      )}

      {/* Recommendations Section */}
      {!error && (
        <RecommendedSection
          libraryId={effectiveLibraryId}
          onItemClick={handleComicClick}
        />
      )}

      {/* Discover Section */}
      {!error && (
        <DiscoverSection
          libraryId={effectiveLibraryId}
          onItemClick={handleComicClick}
        />
      )}

      {/* Reading Queue Preview */}
      {!error && <ReadingQueuePreview maxItems={5} />}
    </div>
  );
}

export default HomePage;
