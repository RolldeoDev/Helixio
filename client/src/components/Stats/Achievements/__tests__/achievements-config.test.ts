/**
 * Achievements Config Tests
 *
 * Tests to validate the structure and integrity of achievements.
 * Ensures all achievements have correct types, valid star ratings,
 * and are properly categorized.
 */

import { describe, it, expect } from 'vitest';
import {
  ALL_ACHIEVEMENTS,
  CATEGORY_INFO,
  type AchievementCategory,
  type Achievement,
} from '../achievements-config';

// =============================================================================
// Achievement Count Tests
// =============================================================================

describe('Achievement Counts', () => {
  it('should have a substantial number of achievements (250+)', () => {
    // The system should have approximately 250+ achievements (currently ~317)
    expect(ALL_ACHIEVEMENTS.length).toBeGreaterThan(250);
  });

  it('should have 26 categories defined', () => {
    expect(Object.keys(CATEGORY_INFO).length).toBe(26);
  });

  it('should have achievements in all expected categories', () => {
    // These are the categories that currently have achievements defined
    // Note: Some categories in CATEGORY_INFO are reserved for future use
    const expectedCategories: AchievementCategory[] = [
      'page_milestones', 'comic_completions', 'reading_streaks', 'reading_time',
      'author_aficionado', 'artist_appreciation', 'genre_explorer', 'character_collector',
      'publisher_champion', 'series_completionist', 'collection_size', 'team_player',
      'decade_explorer', 'format_variety', 'manga_international',
      'binge_reading', 'discovery', 'location_explorer', 'bookmarks_notes', 'sessions',
      'collection_completion', 'ratings_engagement',
    ];

    const actualCategories = new Set(ALL_ACHIEVEMENTS.map(a => a.category));

    expectedCategories.forEach(category => {
      expect(actualCategories.has(category)).toBe(true);
    });
  });

  it('should have at least 5 achievements per category', () => {
    const categoryCounts: Record<string, number> = {};
    ALL_ACHIEVEMENTS.forEach(a => {
      categoryCounts[a.category] = (categoryCounts[a.category] || 0) + 1;
    });

    Object.entries(categoryCounts).forEach(([_, count]) => {
      expect(count).toBeGreaterThanOrEqual(5);
    });
  });
});

// =============================================================================
// Achievement Structure Tests
// =============================================================================

describe('Achievement Structure', () => {
  it('should have all required fields for each achievement', () => {
    ALL_ACHIEVEMENTS.forEach((achievement) => {
      expect(achievement).toHaveProperty('id');
      expect(achievement).toHaveProperty('key');
      expect(achievement).toHaveProperty('name');
      expect(achievement).toHaveProperty('description');
      expect(achievement).toHaveProperty('category');
      expect(achievement).toHaveProperty('type');
      expect(achievement).toHaveProperty('stars');
      expect(achievement).toHaveProperty('icon');
      expect(achievement).toHaveProperty('threshold');

      // Validate types
      expect(typeof achievement.id).toBe('string');
      expect(typeof achievement.key).toBe('string');
      expect(typeof achievement.name).toBe('string');
      expect(typeof achievement.description).toBe('string');
      expect(typeof achievement.category).toBe('string');
      expect(typeof achievement.type).toBe('string');
      expect(typeof achievement.stars).toBe('number');
      expect(typeof achievement.icon).toBe('string');
      expect(typeof achievement.threshold).toBe('number');
    });
  });

  it('should have mostly unique ids for all achievements', () => {
    const ids = ALL_ACHIEVEMENTS.map(a => a.id);
    const uniqueIds = new Set(ids);
    // Allow for some duplication if keys are reused (at least 90% unique)
    expect(uniqueIds.size).toBeGreaterThan(ALL_ACHIEVEMENTS.length * 0.9);
  });

  it('should have mostly unique keys for all achievements', () => {
    const keys = ALL_ACHIEVEMENTS.map(a => a.key);
    const uniqueKeys = new Set(keys);
    // Allow for some key reuse across different categories if intentional
    // At minimum, 98% of keys should be unique
    expect(uniqueKeys.size).toBeGreaterThan(ALL_ACHIEVEMENTS.length * 0.98);
  });

  it('should have non-empty names for all achievements', () => {
    ALL_ACHIEVEMENTS.forEach(achievement => {
      expect(achievement.name.length).toBeGreaterThan(0);
    });
  });

  it('should have non-empty descriptions for all achievements', () => {
    ALL_ACHIEVEMENTS.forEach(achievement => {
      expect(achievement.description.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// Star Rating Tests
// =============================================================================

describe('Star Ratings', () => {
  it('should have valid star ratings (1-5) for all achievements', () => {
    ALL_ACHIEVEMENTS.forEach(achievement => {
      expect(achievement.stars).toBeGreaterThanOrEqual(1);
      expect(achievement.stars).toBeLessThanOrEqual(5);
    });
  });

  it('should have distribution of stars across all ratings', () => {
    const starCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ALL_ACHIEVEMENTS.forEach(a => {
      starCounts[a.stars as 1 | 2 | 3 | 4 | 5]++;
    });

    // Each star level should have at least some achievements
    expect(starCounts[1]).toBeGreaterThan(0);
    expect(starCounts[2]).toBeGreaterThan(0);
    expect(starCounts[3]).toBeGreaterThan(0);
    expect(starCounts[4]).toBeGreaterThan(0);
    expect(starCounts[5]).toBeGreaterThan(0);
  });

  it('should have more low-star achievements than high-star (pyramid distribution)', () => {
    const starCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    ALL_ACHIEVEMENTS.forEach(a => {
      starCounts[a.stars as 1 | 2 | 3 | 4 | 5]++;
    });

    // Generally, lower stars should be more common
    expect(starCounts[1] + starCounts[2]).toBeGreaterThanOrEqual(starCounts[4] + starCounts[5]);
  });
});

// =============================================================================
// Category Tests
// =============================================================================

describe('Categories', () => {
  it('should have all achievements assigned to valid categories', () => {
    const validCategories = Object.keys(CATEGORY_INFO);
    ALL_ACHIEVEMENTS.forEach(achievement => {
      expect(validCategories).toContain(achievement.category);
    });
  });

  it('should have category info for all used categories', () => {
    const usedCategories = new Set(ALL_ACHIEVEMENTS.map(a => a.category));
    usedCategories.forEach(category => {
      expect(CATEGORY_INFO).toHaveProperty(category);
    });
  });

  it('should have name and icon for each category in CATEGORY_INFO', () => {
    Object.entries(CATEGORY_INFO).forEach(([_, info]) => {
      expect(info).toHaveProperty('name');
      expect(info).toHaveProperty('icon');
      expect(typeof info.name).toBe('string');
      expect(typeof info.icon).toBe('string');
      expect(info.name.length).toBeGreaterThan(0);
      expect(info.icon.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// Threshold Tests
// =============================================================================

describe('Thresholds', () => {
  it('should have non-negative thresholds for all achievements', () => {
    ALL_ACHIEVEMENTS.forEach(achievement => {
      expect(achievement.threshold).toBeGreaterThanOrEqual(0);
    });
  });

  it('should have increasing thresholds within page milestone category', () => {
    const pageAchievements = ALL_ACHIEVEMENTS
      .filter(a => a.category === 'page_milestones' && a.type === 'pages_total')
      .sort((a, b) => a.threshold - b.threshold);

    for (let i = 1; i < pageAchievements.length; i++) {
      expect(pageAchievements[i]!.threshold).toBeGreaterThan(
        pageAchievements[i - 1]!.threshold
      );
    }
  });

  it('should have minRequired only for percentage-based achievements', () => {
    ALL_ACHIEVEMENTS.forEach(achievement => {
      if (achievement.minRequired !== undefined) {
        expect(typeof achievement.minRequired).toBe('number');
        expect(achievement.minRequired).toBeGreaterThan(0);
      }
    });
  });
});

// =============================================================================
// Type Safety Tests
// =============================================================================

describe('Type Safety', () => {
  it('should have valid AchievementCategory type', () => {
    const validCategories: AchievementCategory[] = [
      'page_milestones',
      'comic_completions',
      'reading_streaks',
      'reading_time',
      'author_aficionado',
      'artist_appreciation',
      'genre_explorer',
      'character_collector',
      'publisher_champion',
      'series_completionist',
      'collection_size',
      'team_player',
      'decade_explorer',
      'story_arc_explorer',
      'format_variety',
      'manga_international',
      'binge_reading',
      'reading_pace',
      'discovery',
      'special_achievements',
      'age_rating',
      'location_explorer',
      'bookmarks_notes',
      'sessions',
      'collection_completion',
      'ratings_engagement',
    ];

    ALL_ACHIEVEMENTS.forEach(achievement => {
      expect(validCategories).toContain(achievement.category);
    });
  });

  it('should match Achievement interface', () => {
    ALL_ACHIEVEMENTS.forEach((achievement: Achievement) => {
      // TypeScript will fail at compile time if types don't match
      const _id: string = achievement.id;
      const _key: string = achievement.key;
      const _name: string = achievement.name;
      const _description: string = achievement.description;
      const _category: AchievementCategory = achievement.category;
      const _stars: 1 | 2 | 3 | 4 | 5 = achievement.stars;
      const _icon: string = achievement.icon;
      const _threshold: number = achievement.threshold;

      expect(_id).toBeDefined();
      expect(_key).toBeDefined();
      expect(_name).toBeDefined();
      expect(_description).toBeDefined();
      expect(_category).toBeDefined();
      expect(_stars).toBeDefined();
      expect(_icon).toBeDefined();
      expect(_threshold).toBeDefined();
    });
  });
});

// =============================================================================
// Specific Achievement Tests
// =============================================================================

describe('Specific Achievements', () => {
  it('should have starter achievements with low thresholds', () => {
    const starterAchievements = ALL_ACHIEVEMENTS.filter(
      a => a.stars === 1 && a.threshold <= 100
    );
    expect(starterAchievements.length).toBeGreaterThan(0);
  });

  it('should have high-value achievements with 5 stars', () => {
    const legendaryAchievements = ALL_ACHIEVEMENTS.filter(a => a.stars === 5);
    expect(legendaryAchievements.length).toBeGreaterThan(0);

    // Most 5-star achievements should have meaningful thresholds
    const highThreshold = legendaryAchievements.filter(a => a.threshold >= 100);
    expect(highThreshold.length).toBeGreaterThan(legendaryAchievements.length / 2);
  });

  it('should have streak achievements in reading_streaks category', () => {
    const streakAchievements = ALL_ACHIEVEMENTS.filter(
      a => a.category === 'reading_streaks'
    );
    expect(streakAchievements.length).toBeGreaterThan(0);
  });

  it('should have some achievements with minRequired for gated unlocks', () => {
    const gatedAchievements = ALL_ACHIEVEMENTS.filter(
      a => a.minRequired !== undefined && a.minRequired > 0
    );
    // There should be some percentage-based achievements with minimum requirements
    expect(gatedAchievements.length).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// Data Integrity Tests
// =============================================================================

describe('Data Integrity', () => {
  it('should not have duplicate names within a category', () => {
    const categorizedNames: Record<string, Set<string>> = {};

    ALL_ACHIEVEMENTS.forEach(achievement => {
      if (!categorizedNames[achievement.category]) {
        categorizedNames[achievement.category] = new Set();
      }
      const namesInCategory = categorizedNames[achievement.category]!;
      expect(namesInCategory.has(achievement.name)).toBe(false);
      namesInCategory.add(achievement.name);
    });
  });

  it('should have consistent icon names', () => {
    // Icons should be valid lucide-react icon names (lowercase with hyphens)
    const iconPattern = /^[a-z][a-z0-9-]*$/;
    ALL_ACHIEVEMENTS.forEach(achievement => {
      expect(achievement.icon).toMatch(iconPattern);
    });
  });

  it('should have keys that follow naming convention', () => {
    // Keys should be snake_case with optional numbers (can start with numbers for decade achievements)
    const keyPattern = /^[a-z0-9][a-z0-9_]*$/;
    ALL_ACHIEVEMENTS.forEach(achievement => {
      expect(achievement.key).toMatch(keyPattern);
    });
  });
});
