import { Router } from 'express';
import * as achievementsService from '../services/achievements.service.js';

const router = Router();

/**
 * GET /api/achievements
 * Get all achievements with user progress
 */
router.get('/', async (_req, res) => {
  try {
    const achievements = await achievementsService.getAllAchievementsWithProgress();
    res.json(achievements);
  } catch (error) {
    console.error('Error fetching achievements:', error);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

/**
 * GET /api/achievements/summary
 * Get achievement summary statistics
 */
router.get('/summary', async (_req, res) => {
  try {
    const summary = await achievementsService.getAchievementSummary();
    res.json(summary);
  } catch (error) {
    console.error('Error fetching achievement summary:', error);
    res.status(500).json({ error: 'Failed to fetch achievement summary' });
  }
});

/**
 * GET /api/achievements/categories
 * Get all categories with counts
 */
router.get('/categories', async (_req, res) => {
  try {
    const categories = await achievementsService.getCategoriesWithCounts();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

/**
 * GET /api/achievements/unlocked
 * Get user's unlocked achievements
 */
router.get('/unlocked', async (_req, res) => {
  try {
    const unlocked = await achievementsService.getUnlockedAchievements();
    res.json(unlocked);
  } catch (error) {
    console.error('Error fetching unlocked achievements:', error);
    res.status(500).json({ error: 'Failed to fetch unlocked achievements' });
  }
});

/**
 * GET /api/achievements/recent
 * Get recently unlocked achievements (for notifications)
 */
router.get('/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const recent = await achievementsService.getRecentUnlocks(limit);
    res.json(recent);
  } catch (error) {
    console.error('Error fetching recent achievements:', error);
    res.status(500).json({ error: 'Failed to fetch recent achievements' });
  }
});

/**
 * GET /api/achievements/category/:category
 * Get achievements by category
 */
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const achievements = await achievementsService.getAchievementsByCategory(category);
    res.json(achievements);
  } catch (error) {
    console.error('Error fetching category achievements:', error);
    res.status(500).json({ error: 'Failed to fetch category achievements' });
  }
});

/**
 * POST /api/achievements/mark-notified
 * Mark achievements as notified
 */
router.post('/mark-notified', async (req, res): Promise<void> => {
  try {
    const { achievementIds } = req.body;
    if (!Array.isArray(achievementIds)) {
      res.status(400).json({ error: 'achievementIds must be an array' });
      return;
    }
    await achievementsService.markAchievementsNotified(achievementIds);
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking achievements notified:', error);
    res.status(500).json({ error: 'Failed to mark achievements notified' });
  }
});

/**
 * POST /api/achievements/seed
 * Seed achievements from config (admin endpoint)
 * Body: { achievements: AchievementSeedData[] }
 */
router.post('/seed', async (req, res): Promise<void> => {
  try {
    const { achievements } = req.body;
    if (!achievements || !Array.isArray(achievements)) {
      res.status(400).json({ error: 'achievements array is required in request body' });
      return;
    }
    await achievementsService.seedAchievements(achievements);
    res.json({ success: true, message: `Seeded ${achievements.length} achievements` });
  } catch (error) {
    console.error('Error seeding achievements:', error);
    res.status(500).json({ error: 'Failed to seed achievements' });
  }
});

export default router;
