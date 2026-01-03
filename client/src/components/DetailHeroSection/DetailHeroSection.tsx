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
import { computeAccessibleTitleColor } from '../../utils/color';
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
  // Extract dominant color and accent color from cover
  const { color: dominantColor, rgb, accentRgb } = useDominantColor(coverUrl);

  // Generate CSS custom properties for the gradient and title tint
  const heroStyle = useMemo((): CSSProperties => {
    if (!rgb) {
      return {};
    }

    // Compute accessible title color with:
    // - WCAG AA contrast (4.5:1 minimum)
    // - Hue separation from background (45° minimum)
    // - Warm white fallback for grayscale covers
    const titleTint = computeAccessibleTitleColor(accentRgb, rgb, {
      minContrast: 4.5,
      minHueDistance: 45,
    });

    return {
      // Background gradient colors
      '--hero-color-r': rgb.r,
      '--hero-color-g': rgb.g,
      '--hero-color-b': rgb.b,
      // Title tint colors (accessible)
      '--hero-title-r': titleTint.r,
      '--hero-title-g': titleTint.g,
      '--hero-title-b': titleTint.b,
    } as CSSProperties;
  }, [rgb, accentRgb]);

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
