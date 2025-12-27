/**
 * Achievements Service Tests
 *
 * Comprehensive tests for the achievements system including:
 * - Seeding achievements
 * - Getting achievements with progress
 * - Filtering by category
 * - Unlocking achievements
 * - Progress tracking
 * - Summary statistics
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  seedAchievements,
  getAllAchievementsWithProgress,
  getAchievementsByCategory,
  getUnlockedAchievements,
  getRecentUnlocks,
  markAchievementsNotified,
  getAchievementSummary,
  checkAndUpdateAchievements,
  getCategoriesWithCounts,
  getCategoryInfo,
  CATEGORY_INFO,
  type AchievementSeedData,
  type UserStats,
} from '../achievements.service.js';

// =============================================================================
// Mock Prisma Client
// =============================================================================

const mockAchievements = [
  {
    id: 'ach-1',
    key: 'pages_100',
    name: 'First Steps',
    description: 'Read 100 pages',
    category: 'page_milestones',
    stars: 1,
    iconName: 'book',
    threshold: 100,
    minRequired: null,
    createdAt: new Date(),
    userAchievements: [],
  },
  {
    id: 'ach-2',
    key: 'pages_1000',
    name: 'Bookworm',
    description: 'Read 1,000 pages',
    category: 'page_milestones',
    stars: 2,
    iconName: 'book',
    threshold: 1000,
    minRequired: null,
    createdAt: new Date(),
    userAchievements: [],
  },
  {
    id: 'ach-3',
    key: 'comics_10',
    name: 'Getting Hooked',
    description: 'Complete 10 comics',
    category: 'comic_completions',
    stars: 1,
    iconName: 'check-circle',
    threshold: 10,
    minRequired: null,
    createdAt: new Date(),
    userAchievements: [],
  },
  {
    id: 'ach-4',
    key: 'streak_7',
    name: 'Week Warrior',
    description: '7 day streak',
    category: 'reading_streaks',
    stars: 1,
    iconName: 'flame',
    threshold: 7,
    minRequired: null,
    createdAt: new Date(),
    userAchievements: [],
  },
];

const mockUserAchievements = [
  {
    id: 'ua-1',
    achievementId: 'ach-1',
    progress: 100,
    unlockedAt: new Date('2025-01-15'),
    notified: true,
    achievement: mockAchievements[0],
  },
];

// Use vi.hoisted to create mock in hoisted context (before module imports)
const { mockPrisma, MockPrismaClient } = vi.hoisted(() => {
  const mockPrisma = {
    achievement: {
      count: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    userAchievement: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
  };

  // Create a mock class that returns mockPrisma when instantiated
  const MockPrismaClient = class {
    achievement = mockPrisma.achievement;
    userAchievement = mockPrisma.userAchievement;
  };

  return { mockPrisma, MockPrismaClient };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: MockPrismaClient,
}));

// =============================================================================
// Test Setup
// =============================================================================

describe('AchievementsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // CATEGORY_INFO Tests
  // ===========================================================================

  describe('CATEGORY_INFO', () => {
    it('should have all 25 categories defined', () => {
      const expectedCategories = [
        'page_milestones', 'comic_completions', 'reading_streaks', 'reading_time',
        'author_aficionado', 'artist_appreciation', 'genre_explorer', 'character_collector',
        'publisher_champion', 'series_completionist', 'collection_size', 'team_player',
        'decade_explorer', 'story_arc_explorer', 'format_variety', 'manga_international',
        'binge_reading', 'reading_pace', 'discovery', 'special_achievements',
        'age_rating', 'location_explorer', 'bookmarks_notes', 'sessions',
        'collection_completion',
      ];

      expect(Object.keys(CATEGORY_INFO)).toHaveLength(25);
      expectedCategories.forEach(cat => {
        expect(CATEGORY_INFO).toHaveProperty(cat);
      });
    });

    it('should have name, icon, and description for each category', () => {
      Object.entries(CATEGORY_INFO).forEach(([key, info]) => {
        expect(info).toHaveProperty('name');
        expect(info).toHaveProperty('icon');
        expect(info).toHaveProperty('description');
        expect(typeof info.name).toBe('string');
        expect(typeof info.icon).toBe('string');
        expect(typeof info.description).toBe('string');
        expect(info.name.length).toBeGreaterThan(0);
        expect(info.icon.length).toBeGreaterThan(0);
      });
    });
  });

  // ===========================================================================
  // getCategoryInfo Tests
  // ===========================================================================

  describe('getCategoryInfo', () => {
    it('should return CATEGORY_INFO object', () => {
      const result = getCategoryInfo();
      expect(result).toBe(CATEGORY_INFO);
    });
  });

  // ===========================================================================
  // seedAchievements Tests
  // ===========================================================================

  describe('seedAchievements', () => {
    it('should skip seeding when called without data and achievements exist', async () => {
      mockPrisma.achievement.count.mockResolvedValue(530);

      await seedAchievements();

      expect(mockPrisma.achievement.count).toHaveBeenCalled();
      expect(mockPrisma.achievement.upsert).not.toHaveBeenCalled();
    });

    it('should not call upsert when called without data and no achievements exist', async () => {
      mockPrisma.achievement.count.mockResolvedValue(0);

      await seedAchievements();

      expect(mockPrisma.achievement.count).toHaveBeenCalled();
      expect(mockPrisma.achievement.upsert).not.toHaveBeenCalled();
    });

    it('should seed achievements when data is provided', async () => {
      const seedData: AchievementSeedData[] = [
        {
          key: 'pages_100',
          name: 'First Steps',
          description: 'Read 100 pages',
          category: 'page_milestones',
          stars: 1,
          icon: 'book',
          threshold: 100,
        },
        {
          key: 'pages_1000',
          name: 'Bookworm',
          description: 'Read 1,000 pages',
          category: 'page_milestones',
          stars: 2,
          icon: 'book',
          threshold: 1000,
          minRequired: 500,
        },
      ];

      mockPrisma.achievement.upsert.mockResolvedValue({});

      await seedAchievements(seedData);

      expect(mockPrisma.achievement.upsert).toHaveBeenCalledTimes(2);
      expect(mockPrisma.achievement.upsert).toHaveBeenCalledWith({
        where: { key: 'pages_100' },
        update: expect.objectContaining({ name: 'First Steps' }),
        create: expect.objectContaining({
          key: 'pages_100',
          name: 'First Steps',
          minRequired: null,
        }),
      });
      expect(mockPrisma.achievement.upsert).toHaveBeenCalledWith({
        where: { key: 'pages_1000' },
        update: expect.objectContaining({ name: 'Bookworm' }),
        create: expect.objectContaining({
          key: 'pages_1000',
          minRequired: 500,
        }),
      });
    });
  });

  // ===========================================================================
  // getAllAchievementsWithProgress Tests
  // ===========================================================================

  describe('getAllAchievementsWithProgress', () => {
    it('should return all achievements with progress data', async () => {
      const achievementsWithUserData = mockAchievements.map((a, i) => ({
        ...a,
        userAchievements: i === 0 ? [mockUserAchievements[0]] : [],
      }));
      mockPrisma.achievement.findMany.mockResolvedValue(achievementsWithUserData);

      const result = await getAllAchievementsWithProgress();

      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({
        id: 'ach-1',
        key: 'pages_100',
        name: 'First Steps',
        description: 'Read 100 pages',
        category: 'page_milestones',
        stars: 1,
        iconName: 'book',
        threshold: 100,
        minRequired: null,
        progress: 100,
        unlockedAt: mockUserAchievements[0]!.unlockedAt,
        isUnlocked: true,
      });
    });

    it('should show isUnlocked=false for achievements without userAchievement', async () => {
      mockPrisma.achievement.findMany.mockResolvedValue(mockAchievements);

      const result = await getAllAchievementsWithProgress();

      result.forEach(a => {
        expect(a.isUnlocked).toBe(false);
        expect(a.progress).toBe(0);
        expect(a.unlockedAt).toBeNull();
      });
    });

    it('should order by category and stars', async () => {
      mockPrisma.achievement.findMany.mockResolvedValue(mockAchievements);

      await getAllAchievementsWithProgress();

      expect(mockPrisma.achievement.findMany).toHaveBeenCalledWith({
        include: { userAchievements: true },
        orderBy: [{ category: 'asc' }, { stars: 'asc' }],
      });
    });
  });

  // ===========================================================================
  // getAchievementsByCategory Tests
  // ===========================================================================

  describe('getAchievementsByCategory', () => {
    it('should filter achievements by category', async () => {
      const pageMilestones = mockAchievements.filter(
        a => a.category === 'page_milestones'
      );
      mockPrisma.achievement.findMany.mockResolvedValue(pageMilestones);

      const result = await getAchievementsByCategory('page_milestones');

      expect(mockPrisma.achievement.findMany).toHaveBeenCalledWith({
        where: { category: 'page_milestones' },
        include: { userAchievements: true },
        orderBy: [{ stars: 'asc' }],
      });
      expect(result).toHaveLength(2);
      result.forEach(a => {
        expect(a.category).toBe('page_milestones');
      });
    });

    it('should return empty array for unknown category', async () => {
      mockPrisma.achievement.findMany.mockResolvedValue([]);

      const result = await getAchievementsByCategory('unknown_category');

      expect(result).toHaveLength(0);
    });
  });

  // ===========================================================================
  // getUnlockedAchievements Tests
  // ===========================================================================

  describe('getUnlockedAchievements', () => {
    it('should return only unlocked achievements', async () => {
      mockPrisma.userAchievement.findMany.mockResolvedValue(mockUserAchievements);

      const result = await getUnlockedAchievements();

      expect(mockPrisma.userAchievement.findMany).toHaveBeenCalledWith({
        where: { unlockedAt: { not: null } },
        include: { achievement: true },
        orderBy: { unlockedAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0]!.isUnlocked).toBe(true);
    });

    it('should return empty array when no achievements unlocked', async () => {
      mockPrisma.userAchievement.findMany.mockResolvedValue([]);

      const result = await getUnlockedAchievements();

      expect(result).toHaveLength(0);
    });
  });

  // ===========================================================================
  // getRecentUnlocks Tests
  // ===========================================================================

  describe('getRecentUnlocks', () => {
    it('should return unnotified recently unlocked achievements', async () => {
      const unnotified = [{
        ...mockUserAchievements[0],
        notified: false,
      }];
      mockPrisma.userAchievement.findMany.mockResolvedValue(unnotified);

      const result = await getRecentUnlocks(5);

      expect(mockPrisma.userAchievement.findMany).toHaveBeenCalledWith({
        where: {
          unlockedAt: { not: null },
          notified: false,
        },
        include: { achievement: true },
        orderBy: { unlockedAt: 'desc' },
        take: 5,
      });
      expect(result).toHaveLength(1);
    });

    it('should respect limit parameter', async () => {
      mockPrisma.userAchievement.findMany.mockResolvedValue([]);

      await getRecentUnlocks(10);

      expect(mockPrisma.userAchievement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 })
      );
    });

    it('should use default limit of 5', async () => {
      mockPrisma.userAchievement.findMany.mockResolvedValue([]);

      await getRecentUnlocks();

      expect(mockPrisma.userAchievement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 5 })
      );
    });
  });

  // ===========================================================================
  // markAchievementsNotified Tests
  // ===========================================================================

  describe('markAchievementsNotified', () => {
    it('should mark specified achievements as notified', async () => {
      mockPrisma.userAchievement.updateMany.mockResolvedValue({ count: 2 });

      await markAchievementsNotified(['ach-1', 'ach-2']);

      expect(mockPrisma.userAchievement.updateMany).toHaveBeenCalledWith({
        where: { achievementId: { in: ['ach-1', 'ach-2'] } },
        data: { notified: true },
      });
    });

    it('should handle empty array', async () => {
      mockPrisma.userAchievement.updateMany.mockResolvedValue({ count: 0 });

      await markAchievementsNotified([]);

      expect(mockPrisma.userAchievement.updateMany).toHaveBeenCalledWith({
        where: { achievementId: { in: [] } },
        data: { notified: true },
      });
    });
  });

  // ===========================================================================
  // getAchievementSummary Tests
  // ===========================================================================

  describe('getAchievementSummary', () => {
    it('should return correct summary statistics', async () => {
      mockPrisma.achievement.findMany.mockResolvedValue(mockAchievements);
      mockPrisma.userAchievement.findMany.mockResolvedValue(mockUserAchievements);

      const result = await getAchievementSummary();

      expect(result.totalAchievements).toBe(4);
      expect(result.unlockedCount).toBe(1);
      expect(result.totalStars).toBe(5); // 1+2+1+1
      expect(result.earnedStars).toBe(1); // Only ach-1 unlocked
      expect(result.categoryCounts).toHaveProperty('page_milestones');
      expect(result.categoryCounts.page_milestones).toEqual({
        total: 2,
        unlocked: 1,
      });
      expect(result.recentUnlocks).toHaveLength(1);
    });

    it('should return zeros when no achievements exist', async () => {
      mockPrisma.achievement.findMany.mockResolvedValue([]);
      mockPrisma.userAchievement.findMany.mockResolvedValue([]);

      const result = await getAchievementSummary();

      expect(result.totalAchievements).toBe(0);
      expect(result.unlockedCount).toBe(0);
      expect(result.totalStars).toBe(0);
      expect(result.earnedStars).toBe(0);
    });

    it('should initialize all categories in categoryCounts', async () => {
      mockPrisma.achievement.findMany.mockResolvedValue([]);
      mockPrisma.userAchievement.findMany.mockResolvedValue([]);

      const result = await getAchievementSummary();

      Object.keys(CATEGORY_INFO).forEach(cat => {
        expect(result.categoryCounts).toHaveProperty(cat);
        expect(result.categoryCounts[cat]).toEqual({ total: 0, unlocked: 0 });
      });
    });
  });

  // ===========================================================================
  // getCategoriesWithCounts Tests
  // ===========================================================================

  describe('getCategoriesWithCounts', () => {
    it('should return all categories with counts', async () => {
      mockPrisma.achievement.findMany.mockResolvedValue(mockAchievements);
      mockPrisma.userAchievement.findMany.mockResolvedValue(mockUserAchievements);

      const result = await getCategoriesWithCounts();

      expect(result).toHaveLength(25);
      const pageMilestones = result.find(c => c.key === 'page_milestones');
      expect(pageMilestones).toEqual({
        key: 'page_milestones',
        name: 'Page Milestones',
        icon: 'book',
        description: 'Reading volume achievements',
        total: 2,
        unlocked: 1,
      });
    });

    it('should include all category info fields', async () => {
      mockPrisma.achievement.findMany.mockResolvedValue([]);
      mockPrisma.userAchievement.findMany.mockResolvedValue([]);

      const result = await getCategoriesWithCounts();

      result.forEach(category => {
        expect(category).toHaveProperty('key');
        expect(category).toHaveProperty('name');
        expect(category).toHaveProperty('icon');
        expect(category).toHaveProperty('description');
        expect(category).toHaveProperty('total');
        expect(category).toHaveProperty('unlocked');
        expect(typeof category.total).toBe('number');
        expect(typeof category.unlocked).toBe('number');
      });
    });
  });

  // ===========================================================================
  // checkAndUpdateAchievements Tests
  // ===========================================================================

  describe('checkAndUpdateAchievements', () => {
    const baseStats: UserStats = {
      pagesTotal: 0,
      comicsTotal: 0,
      comicsCompleted: 0,
      currentStreak: 0,
      longestStreak: 0,
      totalReadingTime: 0,
      uniqueWriters: 0,
      uniquePencillers: 0,
      uniqueInkers: 0,
      uniqueColorists: 0,
      uniqueGenres: 0,
      uniqueCharacters: 0,
      uniquePublishers: 0,
      seriesCompleted: 0,
      seriesStarted: 0,
      collectionSize: 0,
      uniqueTeams: 0,
      uniqueDecades: 0,
      sessionsTotal: 0,
      maxPagesDay: 0,
      maxComicsDay: 0,
      maxTimeDay: 0,
    };

    it('should unlock achievement when threshold is met', async () => {
      mockPrisma.achievement.findMany.mockResolvedValue([mockAchievements[0]]);
      mockPrisma.userAchievement.upsert.mockResolvedValue({
        id: 'ua-new',
        achievementId: 'ach-1',
        progress: 100,
        unlockedAt: new Date(),
        notified: false,
      });

      const stats = { ...baseStats, pagesTotal: 150 };
      const result = await checkAndUpdateAchievements(stats);

      expect(result).toHaveLength(1);
      expect(result[0]!.key).toBe('pages_100');
      expect(result[0]!.isUnlocked).toBe(true);
      expect(mockPrisma.userAchievement.upsert).toHaveBeenCalledWith({
        where: { achievementId: 'ach-1' },
        update: { progress: 100, unlockedAt: expect.any(Date) },
        create: {
          achievementId: 'ach-1',
          progress: 100,
          unlockedAt: expect.any(Date),
          notified: false,
        },
      });
    });

    it('should update progress when below threshold', async () => {
      mockPrisma.achievement.findMany.mockResolvedValue([mockAchievements[0]]);
      mockPrisma.userAchievement.upsert.mockResolvedValue({
        id: 'ua-new',
        achievementId: 'ach-1',
        progress: 50,
        unlockedAt: null,
        notified: false,
      });

      const stats = { ...baseStats, pagesTotal: 50 };
      const result = await checkAndUpdateAchievements(stats);

      expect(result).toHaveLength(0); // Not unlocked
      expect(mockPrisma.userAchievement.upsert).toHaveBeenCalledWith({
        where: { achievementId: 'ach-1' },
        update: { progress: 50 },
        create: {
          achievementId: 'ach-1',
          progress: 50,
          unlockedAt: null,
          notified: false,
        },
      });
    });

    it('should skip already unlocked achievements', async () => {
      const unlockedAchievement = {
        ...mockAchievements[0],
        userAchievements: [{
          id: 'ua-1',
          achievementId: 'ach-1',
          progress: 100,
          unlockedAt: new Date(),
          notified: true,
        }],
      };
      mockPrisma.achievement.findMany.mockResolvedValue([unlockedAchievement]);

      const stats = { ...baseStats, pagesTotal: 200 };
      const result = await checkAndUpdateAchievements(stats);

      expect(result).toHaveLength(0);
      expect(mockPrisma.userAchievement.upsert).not.toHaveBeenCalled();
    });

    it('should skip achievements when minRequired is not met', async () => {
      const achievementWithMinRequired = {
        ...mockAchievements[1],
        minRequired: 500,
        userAchievements: [],
      };
      mockPrisma.achievement.findMany.mockResolvedValue([achievementWithMinRequired]);

      const stats = { ...baseStats, pagesTotal: 300 }; // Below minRequired of 500
      const result = await checkAndUpdateAchievements(stats);

      expect(result).toHaveLength(0);
      expect(mockPrisma.userAchievement.upsert).not.toHaveBeenCalled();
    });

    it('should use correct stat for each category', async () => {
      const streakAchievement = {
        ...mockAchievements[3],
        userAchievements: [],
      };
      mockPrisma.achievement.findMany.mockResolvedValue([streakAchievement]);
      mockPrisma.userAchievement.upsert.mockResolvedValue({
        id: 'ua-new',
        achievementId: 'ach-4',
        progress: 100,
        unlockedAt: new Date(),
        notified: false,
      });

      const stats = { ...baseStats, longestStreak: 10 };
      const result = await checkAndUpdateAchievements(stats);

      expect(result).toHaveLength(1);
      expect(result[0]!.key).toBe('streak_7');
    });
  });
});

// =============================================================================
// Type Tests
// =============================================================================

describe('Achievement Types', () => {
  it('should have correct AchievementWithProgress structure', () => {
    const achievement: import('../achievements.service.js').AchievementWithProgress = {
      id: 'test-id',
      key: 'test_key',
      name: 'Test Achievement',
      description: 'Test description',
      category: 'page_milestones',
      stars: 3,
      iconName: 'star',
      threshold: 100,
      minRequired: null,
      progress: 50,
      unlockedAt: null,
      isUnlocked: false,
    };

    expect(achievement.id).toBe('test-id');
    expect(achievement.stars).toBeGreaterThanOrEqual(1);
    expect(achievement.stars).toBeLessThanOrEqual(5);
  });

  it('should have correct AchievementSummary structure', () => {
    const summary: import('../achievements.service.js').AchievementSummary = {
      totalAchievements: 530,
      unlockedCount: 10,
      totalStars: 1590,
      earnedStars: 25,
      categoryCounts: {
        page_milestones: { total: 20, unlocked: 2 },
      },
      recentUnlocks: [],
    };

    expect(summary.totalAchievements).toBeGreaterThan(0);
    expect(summary.unlockedCount).toBeLessThanOrEqual(summary.totalAchievements);
    expect(summary.earnedStars).toBeLessThanOrEqual(summary.totalStars);
  });

  it('should have correct UserStats structure', () => {
    const stats: import('../achievements.service.js').UserStats = {
      pagesTotal: 5000,
      comicsTotal: 200,
      comicsCompleted: 180,
      currentStreak: 7,
      longestStreak: 30,
      totalReadingTime: 100,
      uniqueWriters: 50,
      uniquePencillers: 40,
      uniqueInkers: 30,
      uniqueColorists: 25,
      uniqueGenres: 10,
      uniqueCharacters: 200,
      uniquePublishers: 15,
      seriesCompleted: 20,
      seriesStarted: 50,
      collectionSize: 500,
      uniqueTeams: 30,
      uniqueDecades: 5,
      sessionsTotal: 100,
      maxPagesDay: 200,
      maxComicsDay: 10,
      maxTimeDay: 480,
    };

    expect(stats.pagesTotal).toBeGreaterThanOrEqual(0);
    expect(stats.comicsCompleted).toBeLessThanOrEqual(stats.comicsTotal);
    expect(stats.currentStreak).toBeLessThanOrEqual(stats.longestStreak);
  });
});
