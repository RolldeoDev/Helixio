/**
 * Comic Carousel Component
 *
 * Horizontal scrollable carousel for displaying comic cards with:
 * - Smooth scroll behavior
 * - Navigation arrows (desktop)
 * - Scroll snap for mobile
 * - Fade edges to indicate scrollability
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import { CoverCard, type CoverCardFile, type MenuItemPreset } from '../CoverCard';
import { CollectionPickerModal } from '../CollectionPickerModal';
import { markAsCompleted, markAsIncomplete } from '../../services/api.service';

// =============================================================================
// Types
// =============================================================================

export interface ComicCarouselItem {
  fileId: string;
  filename: string;
  coverHash?: string | null;
  progress?: number;
  completed?: boolean;
  badge?: string;
  badgeType?: 'primary' | 'success' | 'warning' | 'info';
  series?: string | null;
  number?: string | null;
  title?: string | null;
}

interface ComicCarouselProps {
  items: ComicCarouselItem[];
  onItemClick?: (fileId: string) => void;
  onItemsChange?: () => void;
  cardSize?: 'small' | 'medium' | 'large';
  showNavigation?: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function ComicCarousel({
  items,
  onItemClick,
  onItemsChange,
  cardSize = 'medium',
  showNavigation = true,
}: ComicCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [collectionPickerFileIds, setCollectionPickerFileIds] = useState<string[]>([]);

  // Menu items for carousel context menu
  const menuItems: MenuItemPreset[] = ['read', 'markRead', 'markUnread', 'addToCollection'];

  // Handle context menu action
  const handleMenuAction = useCallback(async (action: MenuItemPreset | string, fileId: string) => {
    switch (action) {
      case 'read':
        onItemClick?.(fileId);
        break;
      case 'markRead':
        try {
          await markAsCompleted(fileId);
          onItemsChange?.();
        } catch (err) {
          console.error('Failed to mark as read:', err);
        }
        break;
      case 'markUnread':
        try {
          await markAsIncomplete(fileId);
          onItemsChange?.();
        } catch (err) {
          console.error('Failed to mark as unread:', err);
        }
        break;
      case 'addToCollection':
        setCollectionPickerFileIds([fileId]);
        break;
    }
  }, [onItemClick, onItemsChange]);

  // Check scroll position to update arrow visibility
  const updateScrollState = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    const { scrollLeft, scrollWidth, clientWidth } = track;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    updateScrollState();
    track.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);

    return () => {
      track.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState, items]);

  // Scroll by one "page" worth of items
  const scroll = (direction: 'left' | 'right') => {
    const track = trackRef.current;
    if (!track) return;

    const scrollAmount = track.clientWidth * 0.8;
    track.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="comic-carousel">
      {/* Left arrow */}
      {showNavigation && canScrollLeft && (
        <button
          className="comic-carousel-nav prev"
          onClick={() => scroll('left')}
          aria-label="Scroll left"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      {/* Track */}
      <div className="comic-carousel-track" ref={trackRef}>
        {items.map((item, index) => {
          // Convert ComicCarouselItem to CoverCardFile format
          const file: CoverCardFile = {
            id: item.fileId,
            filename: item.filename,
            coverHash: item.coverHash,
            metadata: {
              series: item.series,
              number: item.number,
              title: item.title,
            },
          };

          // Convert progress percentage to page-based format
          const progressData = item.progress !== undefined
            ? {
                currentPage: item.progress,
                totalPages: 100,
                completed: item.completed ?? false,
              }
            : undefined;

          return (
            <CoverCard
              key={item.fileId}
              file={file}
              progress={progressData}
              variant="carousel"
              size={cardSize}
              selectable={false}
              contextMenuEnabled={true}
              menuItems={menuItems}
              showInfo={true}
              showSeriesAsSubtitle={true}
              showIssueNumber={!!item.number}
              badge={item.badge ? { text: item.badge, type: item.badgeType } : undefined}
              onClick={() => onItemClick?.(item.fileId)}
              onMenuAction={handleMenuAction}
              animationIndex={index}
            />
          );
        })}
      </div>

      {/* Right arrow */}
      {showNavigation && canScrollRight && (
        <button
          className="comic-carousel-nav next"
          onClick={() => scroll('right')}
          aria-label="Scroll right"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

      {/* Collection Picker Modal */}
      <CollectionPickerModal
        isOpen={collectionPickerFileIds.length > 0}
        onClose={() => setCollectionPickerFileIds([])}
        fileIds={collectionPickerFileIds}
      />
    </div>
  );
}
