/**
 * DetailHeroSection Component
 *
 * A shared wrapper component that provides:
 * - Dynamic gradient backdrop extracted from cover colors
 * - Container for two-column grid layout
 * - CSS custom properties for hero colors passed to children
 *
 * Used by both IssueDetailPage and SeriesDetailPage for consistent
 * cinematic hero styling.
 */

import { useMemo, CSSProperties, ReactNode } from 'react';
import { useDominantColor } from '../../hooks/useDominantColor';
import './DetailHeroSection.css';

// =============================================================================
// Types
// =============================================================================

export interface DetailHeroSectionProps {
  /** Cover image URL for color extraction */
  coverUrl: string | null;
  /** Content to render inside the hero section */
  children: ReactNode;
  /** Additional class name */
  className?: string;
}

// =============================================================================
// Main Component
// =============================================================================

export function DetailHeroSection({
  coverUrl,
  children,
  className = '',
}: DetailHeroSectionProps) {
  // Extract dominant color from cover
  const { color: dominantColor, rgb } = useDominantColor(coverUrl);

  // Generate CSS custom properties for the gradient
  const heroStyle = useMemo((): CSSProperties => {
    if (rgb) {
      return {
        '--hero-color-r': rgb.r,
        '--hero-color-g': rgb.g,
        '--hero-color-b': rgb.b,
      } as CSSProperties;
    }
    return {};
  }, [rgb]);

  return (
    <section
      className={`detail-hero-section ${dominantColor ? 'detail-hero-section--has-color' : ''} ${className}`}
      style={heroStyle}
    >
      {/* Gradient backdrop */}
      <div className="detail-hero-section__backdrop" aria-hidden="true">
        <div className="detail-hero-section__gradient" />
        <div className="detail-hero-section__noise" />
      </div>

      {/* Content container */}
      <div className="detail-hero-section__content">
        {children}
      </div>
    </section>
  );
}

export default DetailHeroSection;
