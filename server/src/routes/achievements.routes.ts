import { Router } from 'express';
import * as achievementsService from '../services/achievements.service.js';
import { logError } from '../services/logger.service.js';
import { initializeUserSSE } from '../services/sse.service.js';
import { optionalAuth } from '../middleware/auth.middleware.js';

const router = Router();

// Apply optional auth to all routes - this populates req.user if authenticated
router.use(optionalAuth);

/**
 * GET /api/achievements/stream
 * SSE endpoint for real-time achievement notifications
 */
router.get('/stream', (req, res) => {
  // Require authentication for SSE stream
  if (!req.user?.id) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  initializeUserSSE(res, req.user.id);
});

/**
 * GET /api/achievements
 * Get all achievements with user progress
 */
router.get('/', async (req, res) => {
  if (!req.user?.id) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const userId = req.user.id;
    const achievements = await achievementsService.getAllAchievementsWithProgress(userId);
    res.json(achievements);
  } catch (error) {
    logError('achievements', error, { action: 'get-all-achievements' });
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
});

/**
 * GET /api/achievements/summary
 * Get achievement summary statistics
 */
router.get('/summary', async (req, res) => {
  if (!req.user?.id) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const userId = req.user.id;
    const summary = await achievementsService.getAchievementSummary(userId);
    res.json(summary);
  } catch (error) {
    logError('achievements', error, { action: 'get-summary' });
    res.status(500).json({ error: 'Failed to fetch achievement summary' });
  }
});

/**
 * GET /api/achievements/categories
 * Get all categories with counts
 */
router.get('/categories', async (req, res) => {
  if (!req.user?.id) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const userId = req.user.id;
    const categories = await achievementsService.getCategoriesWithCounts(userId);
    res.json(categories);
  } catch (error) {
    logError('achievements', error, { action: 'get-categories' });
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

/**
 * GET /api/achievements/unlocked
 * Get user's unlocked achievements
 */
router.get('/unlocked', async (req, res) => {
  if (!req.user?.id) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const userId = req.user.id;
    const unlocked = await achievementsService.getUnlockedAchievements(userId);
    res.json(unlocked);
  } catch (error) {
    logError('achievements', error, { action: 'get-unlocked' });
    res.status(500).json({ error: 'Failed to fetch unlocked achievements' });
  }
});

/**
 * GET /api/achievements/recent
 * Get recently unlocked achievements (for notifications)
 */
router.get('/recent', async (req, res) => {
  if (!req.user?.id) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit as string) || 5;
    const recent = await achievementsService.getRecentUnlocks(userId, limit);
    res.json(recent);
  } catch (error) {
    logError('achievements', error, { action: 'get-recent' });
    res.status(500).json({ error: 'Failed to fetch recent achievements' });
  }
});

/**
 * GET /api/achievements/category/:category
 * Get achievements by category
 */
router.get('/category/:category', async (req, res) => {
  if (!req.user?.id) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const userId = req.user.id;
    const { category } = req.params;
    const achievements = await achievementsService.getAchievementsByCategory(userId, category);
    res.json(achievements);
  } catch (error) {
    logError('achievements', error, { action: 'get-by-category' });
    res.status(500).json({ error: 'Failed to fetch category achievements' });
  }
});

/**
 * POST /api/achievements/mark-notified
 * Mark achievements as notified
 */
router.post('/mark-notified', async (req, res): Promise<void> => {
  if (!req.user?.id) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const userId = req.user.id;
    const { achievementIds } = req.body;
    if (!Array.isArray(achievementIds)) {
      res.status(400).json({ error: 'achievementIds must be an array' });
      return;
    }
    await achievementsService.markAchievementsNotified(userId, achievementIds);
    res.json({ success: true });
  } catch (error) {
    logError('achievements', error, { action: 'mark-notified' });
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
    logError('achievements', error, { action: 'seed' });
    res.status(500).json({ error: 'Failed to seed achievements' });
  }
});

export default router;
