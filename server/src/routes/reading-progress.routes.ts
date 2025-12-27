/**
 * Reading Progress Routes
 *
 * API endpoints for reading progress tracking:
 * - Get/update progress
 * - Manage bookmarks
 * - Continue reading
 *
 * All routes require authentication as reading progress is user-scoped.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { logError } from '../services/logger.service.js';
import {
  getProgress,
  updateProgress,
  markCompleted,
  markIncomplete,
  deleteProgress,
  addBookmark,
  removeBookmark,
  getBookmarks,
  getContinueReading,
  getLibraryProgress,
  getLibraryReadingStats,
  getAdjacentFiles,
} from '../services/reading-progress.service.js';

const router = Router();

// All reading progress routes require authentication
router.use(requireAuth);

// =============================================================================
// Continue Reading (must come before :fileId routes)
// =============================================================================

/**
 * GET /api/reading-progress/continue-reading
 * Get recently read files that are in progress
 */
router.get('/continue-reading', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 3;
    const libraryId = req.query.libraryId as string | undefined;

    const items = await getContinueReading(userId, limit, libraryId);
    res.json({ items });
  } catch (error) {
    logError('reading-progress', error, { action: 'get-continue-reading' });
    res.status(500).json({
      error: 'Failed to get continue reading',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/reading-progress/library/:libraryId
 * Get all reading progress for a library
 */
router.get('/library/:libraryId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const progressMap = await getLibraryProgress(userId, req.params.libraryId!);
    const progress = Object.fromEntries(progressMap);
    res.json({ progress });
  } catch (error) {
    logError('reading-progress', error, { action: 'get-library-progress' });
    res.status(500).json({
      error: 'Failed to get library progress',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/reading-progress/library/:libraryId/stats
 * Get reading statistics for a library
 */
router.get('/library/:libraryId/stats', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const stats = await getLibraryReadingStats(userId, req.params.libraryId!);
    res.json(stats);
  } catch (error) {
    logError('reading-progress', error, { action: 'get-library-reading-stats' });
    res.status(500).json({
      error: 'Failed to get library reading stats',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Progress CRUD
// =============================================================================

/**
 * GET /api/reading-progress/:fileId
 * Get reading progress for a file
 */
router.get('/:fileId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const progress = await getProgress(userId, req.params.fileId!);

    if (!progress) {
      res.json({
        fileId: req.params.fileId,
        currentPage: 0,
        totalPages: 0,
        completed: false,
        bookmarks: [],
        lastReadAt: null,
      });
      return;
    }

    res.json(progress);
  } catch (error) {
    logError('reading-progress', error, { action: 'get-progress' });
    res.status(500).json({
      error: 'Failed to get reading progress',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/reading-progress/:fileId
 * Update reading progress for a file
 */
router.put('/:fileId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { currentPage, totalPages, completed } = req.body as {
      currentPage: number;
      totalPages?: number;
      completed?: boolean;
    };

    if (typeof currentPage !== 'number' || currentPage < 0) {
      res.status(400).json({ error: 'currentPage must be a non-negative number' });
      return;
    }

    const progress = await updateProgress(userId, req.params.fileId!, {
      currentPage,
      totalPages,
      completed,
    });

    res.json(progress);
  } catch (error) {
    logError('reading-progress', error, { action: 'update-progress' });
    res.status(500).json({
      error: 'Failed to update reading progress',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/reading-progress/:fileId/complete
 * Mark a file as completed
 */
router.post('/:fileId/complete', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const progress = await markCompleted(userId, req.params.fileId!);
    res.json(progress);
  } catch (error) {
    logError('reading-progress', error, { action: 'mark-completed' });
    res.status(500).json({
      error: 'Failed to mark as completed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/reading-progress/:fileId/incomplete
 * Mark a file as not completed
 */
router.post('/:fileId/incomplete', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const progress = await markIncomplete(userId, req.params.fileId!);
    res.json(progress);
  } catch (error) {
    logError('reading-progress', error, { action: 'mark-incomplete' });
    res.status(500).json({
      error: 'Failed to mark as incomplete',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/reading-progress/:fileId
 * Delete reading progress for a file
 */
router.delete('/:fileId', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    await deleteProgress(userId, req.params.fileId!);
    res.json({ success: true });
  } catch (error) {
    logError('reading-progress', error, { action: 'delete-progress' });
    res.status(500).json({
      error: 'Failed to delete reading progress',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/reading-progress/:fileId/adjacent
 * Get adjacent files (prev/next) in the same series
 * Note: This doesn't need userId as it's based on file organization, not reading progress
 */
router.get('/:fileId/adjacent', async (req: Request, res: Response) => {
  try {
    const adjacent = await getAdjacentFiles(req.params.fileId!);
    res.json(adjacent);
  } catch (error) {
    logError('reading-progress', error, { action: 'get-adjacent-files' });
    res.status(500).json({
      error: 'Failed to get adjacent files',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Bookmarks
// =============================================================================

/**
 * GET /api/reading-progress/:fileId/bookmarks
 * Get all bookmarks for a file
 */
router.get('/:fileId/bookmarks', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const bookmarks = await getBookmarks(userId, req.params.fileId!);
    res.json({ bookmarks });
  } catch (error) {
    logError('reading-progress', error, { action: 'get-bookmarks' });
    res.status(500).json({
      error: 'Failed to get bookmarks',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/reading-progress/:fileId/bookmarks
 * Add a bookmark
 */
router.post('/:fileId/bookmarks', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { pageIndex } = req.body as { pageIndex: number };

    if (typeof pageIndex !== 'number' || pageIndex < 0) {
      res.status(400).json({ error: 'pageIndex must be a non-negative number' });
      return;
    }

    const progress = await addBookmark(userId, req.params.fileId!, pageIndex);
    res.json(progress);
  } catch (error) {
    logError('reading-progress', error, { action: 'add-bookmark' });
    res.status(500).json({
      error: 'Failed to add bookmark',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/reading-progress/:fileId/bookmarks/:pageIndex
 * Remove a bookmark
 */
router.delete('/:fileId/bookmarks/:pageIndex', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const pageIndex = parseInt(req.params.pageIndex!, 10);

    if (isNaN(pageIndex) || pageIndex < 0) {
      res.status(400).json({ error: 'pageIndex must be a non-negative number' });
      return;
    }

    const progress = await removeBookmark(userId, req.params.fileId!, pageIndex);
    res.json(progress);
  } catch (error) {
    logError('reading-progress', error, { action: 'remove-bookmark' });
    res.status(500).json({
      error: 'Failed to remove bookmark',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
