/**
 * Achievements Routes API Tests
 *
 * Tests for the achievements REST API endpoints.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

// Mock the achievements service
vi.mock('../../services/achievements.service.js', () => ({
  getAllAchievementsWithProgress: vi.fn(),
  getAchievementSummary: vi.fn(),
  getCategoriesWithCounts: vi.fn(),
  getUnlockedAchievements: vi.fn(),
  getRecentUnlocks: vi.fn(),
  getAchievementsByCategory: vi.fn(),
  markAchievementsNotified: vi.fn(),
  seedAchievements: vi.fn(),
}));

// Import routes and mocked service after mocking
import achievementsRoutes from '../achievements.routes.js';
import * as achievementsService from '../../services/achievements.service.js';

// Create typed mock reference
const mockService = achievementsService as unknown as {
  getAllAchievementsWithProgress: ReturnType<typeof vi.fn>;
  getAchievementSummary: ReturnType<typeof vi.fn>;
  getCategoriesWithCounts: ReturnType<typeof vi.fn>;
  getUnlockedAchievements: ReturnType<typeof vi.fn>;
  getRecentUnlocks: ReturnType<typeof vi.fn>;
  getAchievementsByCategory: ReturnType<typeof vi.fn>;
  markAchievementsNotified: ReturnType<typeof vi.fn>;
  seedAchievements: ReturnType<typeof vi.fn>;
};

// Mock user ID for tests
const MOCK_USER_ID = 'user-test-123';

// =============================================================================
// Test Setup
// =============================================================================

describe('Achievements Routes', () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    // Add mock user middleware (simulates authenticated user)
    app.use((req, _res, next) => {
      req.user = {
        id: MOCK_USER_ID,
        username: 'testuser',
        email: null,
        displayName: null,
        avatarUrl: null,
        role: 'user',
        isActive: true,
        profilePrivate: false,
        hideReadingStats: false,
        setupComplete: true,
        permissions: '{}',
        createdAt: new Date(),
        lastLoginAt: null,
        lastActiveAt: null,
      };
      next();
    });
    app.use('/api/achievements', achievementsRoutes);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // GET /api/achievements
  // ===========================================================================

  describe('GET /api/achievements', () => {
    it('should return all achievements with progress', async () => {
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
          progress: 50,
          unlockedAt: null,
          isUnlocked: false,
        },
      ];
      mockService.getAllAchievementsWithProgress.mockResolvedValue(mockAchievements);

      const response = await request(app).get('/api/achievements');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockAchievements);
      expect(mockService.getAllAchievementsWithProgress).toHaveBeenCalledWith(MOCK_USER_ID);
    });

    it('should handle errors gracefully', async () => {
      mockService.getAllAchievementsWithProgress.mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app).get('/api/achievements');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch achievements' });
    });
  });

  // ===========================================================================
  // GET /api/achievements/summary
  // ===========================================================================

  describe('GET /api/achievements/summary', () => {
    it('should return achievement summary', async () => {
      const mockSummary = {
        totalAchievements: 530,
        unlockedCount: 10,
        totalStars: 1590,
        earnedStars: 25,
        categoryCounts: {
          page_milestones: { total: 20, unlocked: 2 },
        },
        recentUnlocks: [],
      };
      mockService.getAchievementSummary.mockResolvedValue(mockSummary);

      const response = await request(app).get('/api/achievements/summary');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockSummary);
      expect(mockService.getAchievementSummary).toHaveBeenCalledWith(MOCK_USER_ID);
    });

    it('should handle errors gracefully', async () => {
      mockService.getAchievementSummary.mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app).get('/api/achievements/summary');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch achievement summary' });
    });
  });

  // ===========================================================================
  // GET /api/achievements/categories
  // ===========================================================================

  describe('GET /api/achievements/categories', () => {
    it('should return all categories with counts', async () => {
      const mockCategories = [
        {
          key: 'page_milestones',
          name: 'Page Milestones',
          icon: 'book',
          description: 'Reading volume achievements',
          total: 20,
          unlocked: 5,
        },
      ];
      mockService.getCategoriesWithCounts.mockResolvedValue(mockCategories);

      const response = await request(app).get('/api/achievements/categories');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockCategories);
      expect(mockService.getCategoriesWithCounts).toHaveBeenCalledWith(MOCK_USER_ID);
    });

    it('should handle errors gracefully', async () => {
      mockService.getCategoriesWithCounts.mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app).get('/api/achievements/categories');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch categories' });
    });
  });

  // ===========================================================================
  // GET /api/achievements/unlocked
  // ===========================================================================

  describe('GET /api/achievements/unlocked', () => {
    it('should return unlocked achievements', async () => {
      const mockUnlocked = [
        {
          id: 'ach-1',
          key: 'pages_100',
          name: 'First Steps',
          isUnlocked: true,
          unlockedAt: '2025-01-15T00:00:00.000Z',
        },
      ];
      mockService.getUnlockedAchievements.mockResolvedValue(mockUnlocked);

      const response = await request(app).get('/api/achievements/unlocked');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockUnlocked);
      expect(mockService.getUnlockedAchievements).toHaveBeenCalledWith(MOCK_USER_ID);
    });

    it('should handle errors gracefully', async () => {
      mockService.getUnlockedAchievements.mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app).get('/api/achievements/unlocked');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch unlocked achievements' });
    });
  });

  // ===========================================================================
  // GET /api/achievements/recent
  // ===========================================================================

  describe('GET /api/achievements/recent', () => {
    it('should return recent unlocks with default limit', async () => {
      const mockRecent = [
        { id: 'ach-1', key: 'pages_100', name: 'First Steps' },
      ];
      mockService.getRecentUnlocks.mockResolvedValue(mockRecent);

      const response = await request(app).get('/api/achievements/recent');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockRecent);
      expect(mockService.getRecentUnlocks).toHaveBeenCalledWith(MOCK_USER_ID, 5);
    });

    it('should respect limit query parameter', async () => {
      mockService.getRecentUnlocks.mockResolvedValue([]);

      const response = await request(app).get('/api/achievements/recent?limit=10');

      expect(response.status).toBe(200);
      expect(mockService.getRecentUnlocks).toHaveBeenCalledWith(MOCK_USER_ID, 10);
    });

    it('should handle invalid limit gracefully', async () => {
      mockService.getRecentUnlocks.mockResolvedValue([]);

      const response = await request(app).get('/api/achievements/recent?limit=invalid');

      expect(response.status).toBe(200);
      expect(mockService.getRecentUnlocks).toHaveBeenCalledWith(MOCK_USER_ID, 5); // Falls back to default
    });

    it('should handle errors gracefully', async () => {
      mockService.getRecentUnlocks.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/achievements/recent');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch recent achievements' });
    });
  });

  // ===========================================================================
  // GET /api/achievements/category/:category
  // ===========================================================================

  describe('GET /api/achievements/category/:category', () => {
    it('should return achievements for a specific category', async () => {
      const mockCategoryAchievements = [
        { id: 'ach-1', key: 'pages_100', category: 'page_milestones' },
        { id: 'ach-2', key: 'pages_1000', category: 'page_milestones' },
      ];
      mockService.getAchievementsByCategory.mockResolvedValue(mockCategoryAchievements);

      const response = await request(app).get('/api/achievements/category/page_milestones');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockCategoryAchievements);
      expect(mockService.getAchievementsByCategory).toHaveBeenCalledWith(MOCK_USER_ID, 'page_milestones');
    });

    it('should handle errors gracefully', async () => {
      mockService.getAchievementsByCategory.mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app).get('/api/achievements/category/page_milestones');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to fetch category achievements' });
    });
  });

  // ===========================================================================
  // POST /api/achievements/mark-notified
  // ===========================================================================

  describe('POST /api/achievements/mark-notified', () => {
    it('should mark achievements as notified', async () => {
      mockService.markAchievementsNotified.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/achievements/mark-notified')
        .send({ achievementIds: ['ach-1', 'ach-2'] });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true });
      expect(mockService.markAchievementsNotified).toHaveBeenCalledWith(MOCK_USER_ID, ['ach-1', 'ach-2']);
    });

    it('should return 400 if achievementIds is not an array', async () => {
      const response = await request(app)
        .post('/api/achievements/mark-notified')
        .send({ achievementIds: 'not-an-array' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'achievementIds must be an array' });
      expect(mockService.markAchievementsNotified).not.toHaveBeenCalled();
    });

    it('should return 400 if achievementIds is missing', async () => {
      const response = await request(app)
        .post('/api/achievements/mark-notified')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'achievementIds must be an array' });
    });

    it('should handle errors gracefully', async () => {
      mockService.markAchievementsNotified.mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app)
        .post('/api/achievements/mark-notified')
        .send({ achievementIds: ['ach-1'] });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to mark achievements notified' });
    });
  });

  // ===========================================================================
  // POST /api/achievements/seed
  // ===========================================================================

  describe('POST /api/achievements/seed', () => {
    it('should seed achievements from provided data', async () => {
      const seedData = [
        {
          key: 'pages_100',
          name: 'First Steps',
          description: 'Read 100 pages',
          category: 'page_milestones',
          stars: 1,
          icon: 'book',
          threshold: 100,
        },
      ];
      mockService.seedAchievements.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/achievements/seed')
        .send({ achievements: seedData });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Seeded 1 achievements',
      });
      expect(mockService.seedAchievements).toHaveBeenCalledWith(seedData);
    });

    it('should return 400 if achievements is not an array', async () => {
      const response = await request(app)
        .post('/api/achievements/seed')
        .send({ achievements: 'not-an-array' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'achievements array is required in request body' });
      expect(mockService.seedAchievements).not.toHaveBeenCalled();
    });

    it('should return 400 if achievements is missing', async () => {
      const response = await request(app)
        .post('/api/achievements/seed')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'achievements array is required in request body' });
    });

    it('should handle errors gracefully', async () => {
      mockService.seedAchievements.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/achievements/seed')
        .send({ achievements: [] });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to seed achievements' });
    });
  });
});
