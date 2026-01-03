/**
 * Confidence Color Utilities
 *
 * Generates theme-aware colors for confidence/similarity displays.
 * Maps confidence percentages (0-100) to color thresholds:
 * - Green (high): >= 60%
 * - Yellow (medium): 40-59%
 * - Red (low): < 40%
 */

export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Determine confidence level from a percentage value.
 *
 * @param percentage - Confidence percentage (0-100)
 * @returns Confidence level: 'high', 'medium', or 'low'
 */
export function getConfidenceLevel(percentage: number): ConfidenceLevel {
  if (percentage >= 60) return 'high';
  if (percentage >= 40) return 'medium';
  return 'low';
}

/**
 * Get background color for a confidence badge.
 *
 * @param percentage - Confidence percentage (0-100)
 * @param theme - Current theme mode ('dark' or 'light')
 * @returns HSL color string for background
 */
export function getConfidenceBgColor(
  percentage: number,
  theme: 'dark' | 'light'
): string {
  const level = getConfidenceLevel(percentage);

  const hues = {
    high: 120,   // Green
    medium: 45,  // Yellow/Orange
    low: 0,      // Red
  };

  const hue = hues[level];
  const saturation = theme === 'dark' ? 35 : 45;
  const lightness = theme === 'dark' ? 22 : 88;

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Get text color for a confidence badge.
 *
 * @param percentage - Confidence percentage (0-100)
 * @param theme - Current theme mode ('dark' or 'light')
 * @returns HSL color string for text
 */
export function getConfidenceTextColor(
  percentage: number,
  theme: 'dark' | 'light'
): string {
  const level = getConfidenceLevel(percentage);

  const hues = {
    high: 120,
    medium: 45,
    low: 0,
  };

  const hue = hues[level];
  const saturation = theme === 'dark' ? 50 : 60;
  const lightness = theme === 'dark' ? 70 : 30;

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Get both background and text colors for a confidence percentage.
 *
 * @param percentage - Confidence percentage (0-100)
 * @param theme - Current theme mode ('dark' or 'light')
 * @returns Object with backgroundColor and color properties
 */
export function getConfidenceColors(
  percentage: number,
  theme: 'dark' | 'light'
): { backgroundColor: string; color: string } {
  return {
    backgroundColor: getConfidenceBgColor(percentage, theme),
    color: getConfidenceTextColor(percentage, theme),
  };
}
