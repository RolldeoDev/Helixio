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
import { createSubtleTint, rgbToHsl } from '../../utils/color';
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

    // Calculate adaptive tint strength based on accent saturation
    // More saturated colors get stronger tint (up to 60%), less saturated get weaker (30%)
    let titleTint = { r: 255, g: 255, b: 255 };
    if (accentRgb) {
      const accentHsl = rgbToHsl(accentRgb);
      // Map saturation 0-1 to tint strength 0.30-0.60
      const tintStrength = 0.30 + (accentHsl.s * 0.30);
      titleTint = createSubtleTint(accentRgb, tintStrength);
    }

    return {
      // Background gradient colors
      '--hero-color-r': rgb.r,
      '--hero-color-g': rgb.g,
      '--hero-color-b': rgb.b,
      // Title tint colors
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
