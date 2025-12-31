/**
 * Continue Reading Section
 *
 * Displays in-progress comics and "next up" issues in a horizontal carousel.
 * Features:
 * - ComicCarousel with progress indicators for in-progress items
 * - "Up Next" badge for next-up items from series with reading history
 * - Empty state when no items
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
  // Count items by type for subtitle
  const inProgressCount = items.filter((i) => i.itemType === 'in_progress').length;
  const nextUpCount = items.filter((i) => i.itemType === 'next_up').length;

  // Build dynamic subtitle
  let subtitle = '';
  if (inProgressCount > 0 && nextUpCount > 0) {
    subtitle = `${inProgressCount} in progress, ${nextUpCount} up next`;
  } else if (inProgressCount > 0) {
    subtitle = `${inProgressCount} in progress`;
  } else if (nextUpCount > 0) {
    subtitle = `${nextUpCount} up next`;
  }

  // Convert ContinueReadingItem to ComicCarouselItem
  // In-progress items show progress bar, next-up items show "Up Next" badge
  const cardItems: ComicCarouselItem[] = items.map((item) => ({
    fileId: item.fileId,
    filename: item.filename,
    coverHash: item.coverHash,
    progress: item.itemType === 'in_progress' ? item.progress : undefined,
    completed: false,
    badge: item.itemType === 'next_up' ? 'Up Next' : undefined,
    badgeType: item.itemType === 'next_up' ? 'info' : undefined,
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
        subtitle={subtitle}
        seeAllLink="/library?status=reading"
      />
      <ComicCarousel items={cardItems} onItemClick={onItemClick} onItemsChange={onItemsChange} />
    </section>
  );
}
