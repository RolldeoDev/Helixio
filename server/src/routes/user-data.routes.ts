/**
 * User Data Routes
 *
 * API endpoints for user-specific ratings and reviews:
 * - Series ratings/notes/reviews
 * - Issue ratings/notes/reviews
 * - Rating aggregation
 * - Public reviews
 * - localStorage migration
 *
 * All routes require authentication as user data is user-scoped.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { logError } from '../services/logger.service.js';
import {
  getSeriesUserData,
  updateSeriesUserData,
  deleteSeriesUserData,
  getIssueUserData,
  updateIssueUserData,
  deleteIssueUserData,
  getSeriesAverageRating,
  getSeriesUserDataBatch,
  getIssuesUserDataBatch,
  migrateLocalStorageNotes,
  getSeriesPublicReviews,
  getIssuePublicReviews,
  UpdateUserDataInput,
  LocalStorageNote,
} from '../services/user-data.service.js';

const router = Router();

// All user data routes require authentication
router.use(requireAuth);

// =============================================================================
// Series User Data
// =============================================================================

/**
 * GET /api/user-data/series/:seriesId
 * Get user's data for a series (rating, notes, review)
 */
router.get('/series/:seriesId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { seriesId } = req.params;

    const data = await getSeriesUserData(userId, seriesId!);

    // Also get average rating from issues
    const ratingStats = await getSeriesAverageRating(userId, seriesId!);

    res.json({
      data: data || {
        rating: null,
        privateNotes: null,
        publicReview: null,
        reviewVisibility: 'private',
        ratedAt: null,
        reviewedAt: null,
      },
      ratingStats,
    });
  } catch (error) {
    logError('user-data', error, { action: 'get-series-user-data' });
    res.status(500).json({
      error: 'Failed to get series user data',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/user-data/series/:seriesId
 * Update user's data for a series
 */
router.put('/series/:seriesId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { seriesId } = req.params;
    const input = req.body as UpdateUserDataInput;

    // Validate input
    if (input.rating !== undefined && input.rating !== null) {
      if (typeof input.rating !== 'number' || input.rating < 0.5 || input.rating > 5) {
        res.status(400).json({ error: 'Rating must be a number between 0.5 and 5' });
        return;
      }
      // Validate 0.5 increments
      if ((input.rating * 2) % 1 !== 0) {
        res.status(400).json({ error: 'Rating must be in 0.5 increments' });
        return;
      }
    }

    if (input.reviewVisibility !== undefined && !['private', 'public'].includes(input.reviewVisibility)) {
      res.status(400).json({ error: 'reviewVisibility must be "private" or "public"' });
      return;
    }

    const data = await updateSeriesUserData(userId, seriesId!, input);

    // Also get updated average rating
    const ratingStats = await getSeriesAverageRating(userId, seriesId!);

    res.json({ data, ratingStats });
  } catch (error) {
    logError('user-data', error, { action: 'update-series-user-data' });
    res.status(500).json({
      error: 'Failed to update series user data',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/user-data/series/:seriesId
 * Delete user's data for a series
 */
router.delete('/series/:seriesId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { seriesId } = req.params;

    await deleteSeriesUserData(userId, seriesId!);

    res.json({ success: true });
  } catch (error) {
    logError('user-data', error, { action: 'delete-series-user-data' });
    res.status(500).json({
      error: 'Failed to delete series user data',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/user-data/series/:seriesId/average
 * Get average rating from issues in series
 */
router.get('/series/:seriesId/average', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { seriesId } = req.params;

    const ratingStats = await getSeriesAverageRating(userId, seriesId!);

    res.json(ratingStats);
  } catch (error) {
    logError('user-data', error, { action: 'get-series-average-rating' });
    res.status(500).json({
      error: 'Failed to get series average rating',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/user-data/series/:seriesId/reviews
 * Get public reviews for a series (multi-user)
 */
router.get('/series/:seriesId/reviews', async (req: Request, res: Response) => {
  try {
    const { seriesId } = req.params;

    const reviews = await getSeriesPublicReviews(seriesId!);

    res.json({ reviews });
  } catch (error) {
    logError('user-data', error, { action: 'get-series-public-reviews' });
    res.status(500).json({
      error: 'Failed to get series public reviews',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Issue User Data
// =============================================================================

/**
 * GET /api/user-data/issues/:fileId
 * Get user's data for an issue (rating, notes, review)
 */
router.get('/issues/:fileId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { fileId } = req.params;

    const data = await getIssueUserData(userId, fileId!);

    res.json({
      data: data || {
        rating: null,
        privateNotes: null,
        publicReview: null,
        reviewVisibility: 'private',
        ratedAt: null,
        reviewedAt: null,
        currentPage: 0,
        totalPages: 0,
        completed: false,
        lastReadAt: null,
      },
    });
  } catch (error) {
    logError('user-data', error, { action: 'get-issue-user-data' });
    res.status(500).json({
      error: 'Failed to get issue user data',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/user-data/issues/:fileId
 * Update user's data for an issue
 */
router.put('/issues/:fileId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { fileId } = req.params;
    const input = req.body as UpdateUserDataInput;

    // Validate input
    if (input.rating !== undefined && input.rating !== null) {
      if (typeof input.rating !== 'number' || input.rating < 0.5 || input.rating > 5) {
        res.status(400).json({ error: 'Rating must be a number between 0.5 and 5' });
        return;
      }
      // Validate 0.5 increments
      if ((input.rating * 2) % 1 !== 0) {
        res.status(400).json({ error: 'Rating must be in 0.5 increments' });
        return;
      }
    }

    if (input.reviewVisibility !== undefined && !['private', 'public'].includes(input.reviewVisibility)) {
      res.status(400).json({ error: 'reviewVisibility must be "private" or "public"' });
      return;
    }

    const data = await updateIssueUserData(userId, fileId!, input);

    res.json({ data });
  } catch (error) {
    logError('user-data', error, { action: 'update-issue-user-data' });
    res.status(500).json({
      error: 'Failed to update issue user data',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/user-data/issues/:fileId
 * Delete user's rating/review for an issue (keeps reading progress)
 */
router.delete('/issues/:fileId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { fileId } = req.params;

    await deleteIssueUserData(userId, fileId!);

    res.json({ success: true });
  } catch (error) {
    logError('user-data', error, { action: 'delete-issue-user-data' });
    res.status(500).json({
      error: 'Failed to delete issue user data',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/user-data/issues/:fileId/reviews
 * Get public reviews for an issue (multi-user)
 */
router.get('/issues/:fileId/reviews', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;

    const reviews = await getIssuePublicReviews(fileId!);

    res.json({ reviews });
  } catch (error) {
    logError('user-data', error, { action: 'get-issue-public-reviews' });
    res.status(500).json({
      error: 'Failed to get issue public reviews',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Batch Operations
// =============================================================================

/**
 * POST /api/user-data/series/batch
 * Get user data for multiple series at once
 */
router.post('/series/batch', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { seriesIds } = req.body as { seriesIds: string[] };

    if (!Array.isArray(seriesIds)) {
      res.status(400).json({ error: 'seriesIds must be an array' });
      return;
    }

    const dataMap = await getSeriesUserDataBatch(userId, seriesIds);
    const data = Object.fromEntries(dataMap);

    res.json({ data });
  } catch (error) {
    logError('user-data', error, { action: 'get-series-user-data-batch' });
    res.status(500).json({
      error: 'Failed to get series user data batch',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/user-data/issues/batch
 * Get user data for multiple issues at once
 */
router.post('/issues/batch', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { fileIds } = req.body as { fileIds: string[] };

    if (!Array.isArray(fileIds)) {
      res.status(400).json({ error: 'fileIds must be an array' });
      return;
    }

    const dataMap = await getIssuesUserDataBatch(userId, fileIds);
    const data = Object.fromEntries(dataMap);

    res.json({ data });
  } catch (error) {
    logError('user-data', error, { action: 'get-issues-user-data-batch' });
    res.status(500).json({
      error: 'Failed to get issues user data batch',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Migration
// =============================================================================

/**
 * POST /api/user-data/migrate-notes
 * Migrate localStorage notes to database
 */
router.post('/migrate-notes', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { notes } = req.body as { notes: LocalStorageNote[] };

    if (!Array.isArray(notes)) {
      res.status(400).json({ error: 'notes must be an array' });
      return;
    }

    const result = await migrateLocalStorageNotes(userId, notes);

    res.json(result);
  } catch (error) {
    logError('user-data', error, { action: 'migrate-notes' });
    res.status(500).json({
      error: 'Failed to migrate notes',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
