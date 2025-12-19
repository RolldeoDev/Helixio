/**
 * Thumbnail Strip Component
 *
 * Horizontal scrollable strip of page thumbnails for quick navigation.
 * Shows current position and allows clicking to jump to any page.
 */

import { useRef, useEffect } from 'react';
import { useReader } from './ReaderContext';
import { getThumbnailUrl } from '../../services/api.service';

interface ThumbnailStripProps {
  visible: boolean;
}

export function ThumbnailStrip({ visible }: ThumbnailStripProps) {
  const { state, goToPage, isBookmarked, isLandscape } = useReader();
  const stripRef = useRef<HTMLDivElement>(null);
  const currentThumbRef = useRef<HTMLButtonElement>(null);

  // Scroll current thumbnail into view when page changes
  useEffect(() => {
    if (currentThumbRef.current && stripRef.current) {
      const strip = stripRef.current;
      const thumb = currentThumbRef.current;

      const thumbLeft = thumb.offsetLeft;
      const thumbWidth = thumb.offsetWidth;
      const stripWidth = strip.clientWidth;

      // Center the current thumbnail in the strip
      const targetScroll = thumbLeft - (stripWidth / 2) + (thumbWidth / 2);

      strip.scrollTo({
        left: targetScroll,
        behavior: 'smooth',
      });
    }
  }, [state.currentPage]);

  const handleClick = (pageIndex: number) => {
    goToPage(pageIndex);
  };

  return (
    <div className={`thumbnail-strip ${visible ? 'visible' : 'hidden'}`}>
      <div className="thumbnail-strip-inner" ref={stripRef}>
        {state.pages.map((page, index) => {
          const isCurrent = index === state.currentPage;
          const isBookmark = isBookmarked(index);
          const isWide = isLandscape(index);

          return (
            <button
              key={page.path}
              ref={isCurrent ? currentThumbRef : undefined}
              className={`thumbnail-item ${isCurrent ? 'current' : ''} ${isBookmark ? 'bookmarked' : ''} ${isWide ? 'landscape' : ''}`}
              onClick={() => handleClick(index)}
              title={`Page ${index + 1}${isBookmark ? ' (Bookmarked)' : ''}${isWide ? ' (Spread)' : ''}`}
            >
              <img
                src={getThumbnailUrl(state.fileId, index + 1)}
                alt={`Page ${index + 1}`}
                loading="lazy"
                decoding="async"
              />
              <span className="thumbnail-number">{index + 1}</span>
              {isBookmark && (
                <span className="thumbnail-bookmark-indicator" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
