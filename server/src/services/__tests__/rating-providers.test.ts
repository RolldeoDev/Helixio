/**
 * Rating Providers Type Utilities Tests
 *
 * Tests for the utility functions in rating-providers/types.ts:
 * - normalizeRating()
 * - formatRatingDisplay()
 * - getSourceDisplayName()
 * - calculateExpirationDate()
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizeRating,
  formatRatingDisplay,
  getSourceDisplayName,
  calculateExpirationDate,
  RATING_TTL_MS,
  type RatingSource,
} from '../rating-providers/types.js';

describe('Rating Provider Utilities', () => {
  // =============================================================================
  // normalizeRating
  // =============================================================================

  describe('normalizeRating', () => {
    it('should normalize a 5-point scale to 0-10', () => {
      expect(normalizeRating(4, 5)).toBe(8);
      expect(normalizeRating(2.5, 5)).toBe(5);
      expect(normalizeRating(5, 5)).toBe(10);
      expect(normalizeRating(0, 5)).toBe(0);
    });

    it('should normalize a 10-point scale to 0-10 (identity)', () => {
      expect(normalizeRating(7.5, 10)).toBe(7.5);
      expect(normalizeRating(10, 10)).toBe(10);
      expect(normalizeRating(0, 10)).toBe(0);
    });

    it('should normalize a 100-point scale to 0-10', () => {
      expect(normalizeRating(85, 100)).toBe(8.5);
      expect(normalizeRating(100, 100)).toBe(10);
      expect(normalizeRating(50, 100)).toBe(5);
    });

    it('should round to 2 decimal places', () => {
      expect(normalizeRating(3.333, 5)).toBe(6.67);
      expect(normalizeRating(1, 3)).toBe(3.33);
    });

    it('should return 0 for invalid scale (0 or negative)', () => {
      expect(normalizeRating(5, 0)).toBe(0);
      expect(normalizeRating(5, -10)).toBe(0);
    });

    it('should handle fractional ratings', () => {
      expect(normalizeRating(3.7, 5)).toBe(7.4);
      expect(normalizeRating(8.25, 10)).toBe(8.25);
    });
  });

  // =============================================================================
  // formatRatingDisplay
  // =============================================================================

  describe('formatRatingDisplay', () => {
    it('should format percentage ratings (scale 100)', () => {
      expect(formatRatingDisplay(85, 100)).toBe('85%');
      expect(formatRatingDisplay(85.5, 100)).toBe('86%');
      expect(formatRatingDisplay(100, 100)).toBe('100%');
      expect(formatRatingDisplay(0, 100)).toBe('0%');
    });

    it('should format 5-point scale ratings', () => {
      expect(formatRatingDisplay(4, 5)).toBe('4.0/5');
      expect(formatRatingDisplay(4.5, 5)).toBe('4.5/5');
      expect(formatRatingDisplay(3.75, 5)).toBe('3.8/5');
    });

    it('should format 10-point scale ratings', () => {
      expect(formatRatingDisplay(7.5, 10)).toBe('7.5/10');
      expect(formatRatingDisplay(10, 10)).toBe('10.0/10');
      expect(formatRatingDisplay(8.333, 10)).toBe('8.3/10');
    });

    it('should handle non-standard scales', () => {
      expect(formatRatingDisplay(3, 4)).toBe('3.0/4');
      expect(formatRatingDisplay(7, 7)).toBe('7.0/7');
    });
  });

  // =============================================================================
  // getSourceDisplayName
  // =============================================================================

  describe('getSourceDisplayName', () => {
    it('should return correct display name for ComicBookRoundup', () => {
      expect(getSourceDisplayName('comicbookroundup')).toBe('Comic Book Roundup');
    });

    it('should return correct display name for LeagueOfComicGeeks', () => {
      expect(getSourceDisplayName('leagueofcomicgeeks')).toBe('League of Comic Geeks');
    });

    it('should return correct display name for ComicVine', () => {
      expect(getSourceDisplayName('comicvine')).toBe('ComicVine');
    });

    it('should return correct display name for Metron', () => {
      expect(getSourceDisplayName('metron')).toBe('Metron');
    });

    it('should return correct display name for AniList', () => {
      expect(getSourceDisplayName('anilist')).toBe('AniList');
    });

    it('should return source name itself for unknown sources', () => {
      // Type assertion needed for unknown source
      expect(getSourceDisplayName('unknown' as RatingSource)).toBe('unknown');
    });
  });

  // =============================================================================
  // calculateExpirationDate
  // =============================================================================

  describe('calculateExpirationDate', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should use default TTL (7 days)', () => {
      const expiration = calculateExpirationDate();
      const expected = new Date('2024-01-22T12:00:00Z');
      expect(expiration.getTime()).toBe(expected.getTime());
    });

    it('should use custom TTL when provided', () => {
      const oneDay = 24 * 60 * 60 * 1000;
      const expiration = calculateExpirationDate(oneDay);
      const expected = new Date('2024-01-16T12:00:00Z');
      expect(expiration.getTime()).toBe(expected.getTime());
    });

    it('should handle zero TTL', () => {
      const expiration = calculateExpirationDate(0);
      const expected = new Date('2024-01-15T12:00:00Z');
      expect(expiration.getTime()).toBe(expected.getTime());
    });

    it('should handle 30-day TTL', () => {
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      const expiration = calculateExpirationDate(thirtyDays);
      const expected = new Date('2024-02-14T12:00:00Z');
      expect(expiration.getTime()).toBe(expected.getTime());
    });
  });

  // =============================================================================
  // RATING_TTL_MS constant
  // =============================================================================

  describe('RATING_TTL_MS', () => {
    it('should be 7 days in milliseconds', () => {
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      expect(RATING_TTL_MS).toBe(sevenDaysMs);
      expect(RATING_TTL_MS).toBe(604800000);
    });
  });
});
