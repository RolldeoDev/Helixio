/**
 * Rating Utilities
 *
 * Standardized conversion functions for external ratings display.
 * All external ratings are normalized to 0-10 internally, but displayed on a 0-5 star scale.
 */

/**
 * Convert a 0-10 normalized rating to a 0-5 star scale
 * @param normalizedValue - Rating on 0-10 scale
 * @returns Rating on 0-5 scale, rounded to 1 decimal place
 */
export function toStarRating(normalizedValue: number): number {
  const starRating = normalizedValue / 2;
  return Math.round(starRating * 10) / 10;
}

/**
 * Format a star rating for display (e.g., "4.1")
 * @param normalizedValue - Rating on 0-10 scale
 * @returns Formatted string on 0-5 scale
 */
export function formatStarRating(normalizedValue: number): string {
  return toStarRating(normalizedValue).toFixed(1);
}

/**
 * Render star characters for a rating
 * @param normalizedValue - Rating on 0-10 scale
 * @returns String of star characters (e.g., "★★★★☆")
 */
export function renderStarCharacters(normalizedValue: number): string {
  const starRating = normalizedValue / 2;
  const fullStars = Math.floor(starRating);
  const hasHalfStar = (starRating % 1) >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return '★'.repeat(fullStars) + (hasHalfStar ? '½' : '') + '☆'.repeat(emptyStars);
}

/**
 * Render star characters for a user rating (0.5-5.0 scale with 0.5 increments)
 * @param rating - Rating on 0-5 scale (e.g., 3.5)
 * @returns String of star characters (e.g., "★★★½☆")
 */
export function renderUserStarCharacters(rating: number): string {
  const fullStars = Math.floor(rating);
  const hasHalfStar = (rating % 1) >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return '★'.repeat(fullStars) + (hasHalfStar ? '½' : '') + '☆'.repeat(emptyStars);
}
