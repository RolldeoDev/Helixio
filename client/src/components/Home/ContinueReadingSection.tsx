/**
 * Continue Reading Section
 *
 * Displays in-progress comics in a horizontal carousel.
 * Features:
 * - ComicCarousel with progress indicators
 * - Empty state when no in-progress items
 * - Loading skeleton state
 */

import { SectionHeader } from './SectionHeader';
import { ComicCarousel, ComicCarouselItem } from './ComicCarousel';
import { SkeletonCard } from '../LoadingState';
import { ContinueReadingItem } from '../../services/api.service';

// =============================================================================
// Types
// =============================================================================

interface ContinueReadingSectionProps {
  items: ContinueReadingItem[];
  isLoading?: boolean;
  onItemClick?: (fileId: string) => void;
  onItemsChange?: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function ContinueReadingSection({
  items,
  isLoading,
  onItemClick,
  onItemsChange,
}: ContinueReadingSectionProps) {
  // Convert ContinueReadingItem to ComicCarouselItem
  const cardItems: ComicCarouselItem[] = items.map((item) => ({
    fileId: item.fileId,
    filename: item.filename,
    coverHash: item.coverHash,
    progress: item.progress,
    completed: false,
    series: item.series,
    number: item.number,
    title: item.title,
  }));

  // Loading state
  if (isLoading) {
    return (
      <section className="home-section">
        <SectionHeader title="Continue Reading" />
        <div className="comic-carousel">
          <div className="comic-carousel-track">
            {[1, 2, 3, 4, 5].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Empty state
  if (items.length === 0) {
    return (
      <section className="home-section">
        <SectionHeader title="Continue Reading" />
        <div className="home-empty-state">
          <svg className="home-empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <h3 className="home-empty-state-title">No comics in progress</h3>
          <p className="home-empty-state-text">
            Start reading something from your library to see it here.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="home-section">
      <SectionHeader
        title="Continue Reading"
        subtitle={`${items.length} in progress`}
        seeAllLink="/library?status=reading"
      />
      <ComicCarousel items={cardItems} onItemClick={onItemClick} onItemsChange={onItemsChange} />
    </section>
  );
}
