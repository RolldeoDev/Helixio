/**
 * Rating Utilities Tests
 *
 * Tests for rating conversion and formatting utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  toStarRating,
  formatStarRating,
  renderStarCharacters,
  renderUserStarCharacters,
} from '../ratings';

// =============================================================================
// toStarRating Tests
// =============================================================================

describe('toStarRating', () => {
  it('should convert 0 to 0', () => {
    expect(toStarRating(0)).toBe(0);
  });

  it('should convert 5 to 2.5', () => {
    expect(toStarRating(5)).toBe(2.5);
  });

  it('should convert 10 to 5', () => {
    expect(toStarRating(10)).toBe(5);
  });

  it('should convert 7 to 3.5', () => {
    expect(toStarRating(7)).toBe(3.5);
  });

  it('should round 3.33 to 1.7', () => {
    expect(toStarRating(3.33)).toBe(1.7);
  });

  it('should handle 0.1 precision', () => {
    expect(toStarRating(0.2)).toBe(0.1);
  });

  it('should convert 8 to 4', () => {
    expect(toStarRating(8)).toBe(4);
  });

  it('should round 9.9 to 5', () => {
    expect(toStarRating(9.9)).toBe(5);
  });

  it('should round 6.66 to 3.3', () => {
    expect(toStarRating(6.66)).toBe(3.3);
  });
});

// =============================================================================
// formatStarRating Tests
// =============================================================================

describe('formatStarRating', () => {
  it('should format 0 as "0.0"', () => {
    expect(formatStarRating(0)).toBe('0.0');
  });

  it('should format 5 as "2.5"', () => {
    expect(formatStarRating(5)).toBe('2.5');
  });

  it('should format 10 as "5.0"', () => {
    expect(formatStarRating(10)).toBe('5.0');
  });

  it('should format 7 as "3.5"', () => {
    expect(formatStarRating(7)).toBe('3.5');
  });

  it('should format 3.33 as "1.7"', () => {
    expect(formatStarRating(3.33)).toBe('1.7');
  });

  it('should format 8 as "4.0"', () => {
    expect(formatStarRating(8)).toBe('4.0');
  });
});

// =============================================================================
// renderStarCharacters Tests (0-10 scale input)
// =============================================================================

describe('renderStarCharacters', () => {
  it('should render 0 as all empty stars', () => {
    expect(renderStarCharacters(0)).toBe('☆☆☆☆☆');
  });

  it('should render 2 as one full star', () => {
    expect(renderStarCharacters(2)).toBe('★☆☆☆☆');
  });

  it('should render 5 as two full + half star', () => {
    expect(renderStarCharacters(5)).toBe('★★½☆☆');
  });

  it('should render 7 as three full + half star', () => {
    expect(renderStarCharacters(7)).toBe('★★★½☆');
  });

  it('should render 10 as all full stars', () => {
    expect(renderStarCharacters(10)).toBe('★★★★★');
  });

  it('should render 1 as half star only', () => {
    expect(renderStarCharacters(1)).toBe('½☆☆☆☆');
  });

  it('should render 4 as two full stars', () => {
    expect(renderStarCharacters(4)).toBe('★★☆☆☆');
  });

  it('should render 6 as three full stars', () => {
    expect(renderStarCharacters(6)).toBe('★★★☆☆');
  });

  it('should render 8 as four full stars', () => {
    expect(renderStarCharacters(8)).toBe('★★★★☆');
  });

  it('should render 9 as four full + half star', () => {
    expect(renderStarCharacters(9)).toBe('★★★★½');
  });

  it('should render 3 as one full + half star', () => {
    expect(renderStarCharacters(3)).toBe('★½☆☆☆');
  });
});

// =============================================================================
// renderUserStarCharacters Tests (0.5-5.0 scale input)
// =============================================================================

describe('renderUserStarCharacters', () => {
  it('should render 0.5 as half star', () => {
    expect(renderUserStarCharacters(0.5)).toBe('½☆☆☆☆');
  });

  it('should render 1.0 as one full star', () => {
    expect(renderUserStarCharacters(1.0)).toBe('★☆☆☆☆');
  });

  it('should render 1.5 as one full + half star', () => {
    expect(renderUserStarCharacters(1.5)).toBe('★½☆☆☆');
  });

  it('should render 2.0 as two full stars', () => {
    expect(renderUserStarCharacters(2.0)).toBe('★★☆☆☆');
  });

  it('should render 2.5 as two full + half star', () => {
    expect(renderUserStarCharacters(2.5)).toBe('★★½☆☆');
  });

  it('should render 3.0 as three full stars', () => {
    expect(renderUserStarCharacters(3.0)).toBe('★★★☆☆');
  });

  it('should render 3.5 as three full + half star', () => {
    expect(renderUserStarCharacters(3.5)).toBe('★★★½☆');
  });

  it('should render 4.0 as four full stars', () => {
    expect(renderUserStarCharacters(4.0)).toBe('★★★★☆');
  });

  it('should render 4.5 as four full + half star', () => {
    expect(renderUserStarCharacters(4.5)).toBe('★★★★½');
  });

  it('should render 5.0 as all full stars', () => {
    expect(renderUserStarCharacters(5.0)).toBe('★★★★★');
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  describe('toStarRating precision', () => {
    it('should handle small decimals correctly', () => {
      // 0.01 / 2 = 0.005, rounds to 0.0
      expect(toStarRating(0.01)).toBe(0);
    });

    it('should handle repeating decimals', () => {
      // 1/3 * 10 = 3.333... / 2 = 1.666..., rounds to 1.7
      expect(toStarRating(10 / 3)).toBe(1.7);
    });
  });

  describe('renderStarCharacters half-star threshold', () => {
    it('should show half star at exactly 0.5 of a star', () => {
      // 1 on 0-10 scale = 0.5 stars
      expect(renderStarCharacters(1)).toBe('½☆☆☆☆');
    });

    it('should show half star when remainder is exactly 0.5', () => {
      // 3 on 0-10 scale = 1.5 stars
      expect(renderStarCharacters(3)).toBe('★½☆☆☆');
    });
  });

  describe('renderUserStarCharacters boundary values', () => {
    it('should handle 0 (edge case - not typically used)', () => {
      // 0 has no half, no full stars
      expect(renderUserStarCharacters(0)).toBe('☆☆☆☆☆');
    });
  });
});
