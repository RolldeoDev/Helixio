/**
 * Rating Color Utilities
 *
 * Generates theme-aware colors for rating displays using HSL interpolation.
 * Maps rating values (0-10) to a red→yellow→green gradient with subtle,
 * non-distracting colors appropriate for badges and indicators.
 *
 * Color curve:
 * - 0-4: Distinctly red (hue 0-10°)
 * - 4-6: Transition red to yellow (hue 10-60°)
 * - 6-10: Transition yellow to green (hue 60-120°)
 */

/**
 * Calculate hue for a rating using a non-linear curve.
 * Keeps low ratings (< 4) distinctly red, then transitions through yellow to green.
 */
function getRatingHue(rating: number): number {
  const clamped = Math.max(0, Math.min(10, rating));

  if (clamped < 4) {
    // 0-4: Stay very red (hue 0-10°)
    return (clamped / 4) * 10;
  } else if (clamped < 6) {
    // 4-6: Transition from red to yellow (hue 10-60°)
    return 10 + ((clamped - 4) / 2) * 50;
  } else {
    // 6-10: Transition from yellow to green (hue 60-120°)
    return 60 + ((clamped - 6) / 4) * 60;
  }
}

/**
 * Get background color for a rating badge.
 * Uses HSL interpolation with non-linear hue curve.
 *
 * @param rating - Rating value (0-10 scale)
 * @param theme - Current theme mode ('dark' or 'light')
 * @returns HSL color string for background
 */
export function getRatingBgColor(
  rating: number,
  theme: 'dark' | 'light'
): string {
  const hue = getRatingHue(rating);

  // Subtle colors: lower saturation, adjusted lightness per theme
  // Dark theme: darker backgrounds that don't glow
  // Light theme: lighter, pastel-like backgrounds
  const saturation = theme === 'dark' ? 40 : 50;
  const lightness = theme === 'dark' ? 22 : 88;

  return `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`;
}

/**
 * Get text color for a rating badge.
 * Uses the same hue as background but with higher saturation and
 * appropriate lightness for readability.
 *
 * @param rating - Rating value (0-10 scale)
 * @param theme - Current theme mode ('dark' or 'light')
 * @returns HSL color string for text
 */
export function getRatingTextColor(
  rating: number,
  theme: 'dark' | 'light'
): string {
  const hue = getRatingHue(rating);

  // Higher saturation for text to ensure it stands out
  // Dark theme: lighter text on dark background
  // Light theme: darker text on light background
  const saturation = theme === 'dark' ? 55 : 65;
  const lightness = theme === 'dark' ? 72 : 28;

  return `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`;
}

/**
 * Get both background and text colors for a rating.
 * Convenience function that returns both colors in one call.
 *
 * @param rating - Rating value (0-10 scale)
 * @param theme - Current theme mode ('dark' or 'light')
 * @returns Object with backgroundColor and color properties
 */
export function getRatingColors(
  rating: number,
  theme: 'dark' | 'light'
): { backgroundColor: string; color: string } {
  return {
    backgroundColor: getRatingBgColor(rating, theme),
    color: getRatingTextColor(rating, theme),
  };
}

/**
 * Convert a 0-5 star rating to 0-10 scale for color calculation.
 * Useful when displaying star ratings with colored badges.
 *
 * @param starRating - Rating value (0-5 scale)
 * @returns Rating value (0-10 scale)
 */
export function starRatingToTen(starRating: number): number {
  return starRating * 2;
}
