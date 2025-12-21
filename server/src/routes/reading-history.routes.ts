/**
 * Reading History Routes
 *
 * API endpoints for reading history and statistics:
 * - Session tracking (start, update, end)
 * - History queries
 * - Statistics
 */

import { Router, Request, Response } from 'express';
import {
  startSession,
  updateSession,
  endSession,
  getRecentHistory,
  getFileHistory,
  clearFileHistory,
  clearAllHistory,
  getStats,
  getAllTimeStats,
} from '../services/reading-history.service.js';

const router = Router();

// =============================================================================
// Session Management
// =============================================================================

/**
 * POST /api/reading-history/session/start
 * Start a new reading session
 */
router.post('/session/start', async (req: Request, res: Response) => {
  try {
    const { fileId, startPage } = req.body as {
      fileId: string;
      startPage?: number;
    };

    if (!fileId) {
      res.status(400).json({ error: 'fileId is required' });
      return;
    }

    const sessionId = await startSession(fileId, startPage);
    res.json({ sessionId });
  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({
      error: 'Failed to start session',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/reading-history/session/:sessionId
 * Update a reading session with current progress
 */
router.put('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { currentPage, confirmedPagesRead } = req.body as {
      currentPage: number;
      confirmedPagesRead?: number;
    };

    if (typeof currentPage !== 'number') {
      res.status(400).json({ error: 'currentPage is required' });
      return;
    }

    await updateSession(sessionId!, currentPage, confirmedPagesRead);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating session:', error);
    res.status(500).json({
      error: 'Failed to update session',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/reading-history/session/:sessionId/end
 * End a reading session
 */
router.post('/session/:sessionId/end', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { endPage, completed, confirmedPagesRead } = req.body as {
      endPage: number;
      completed?: boolean;
      confirmedPagesRead?: number;
    };

    if (typeof endPage !== 'number') {
      res.status(400).json({ error: 'endPage is required' });
      return;
    }

    const session = await endSession(sessionId!, endPage, completed, confirmedPagesRead);
    res.json(session);
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({
      error: 'Failed to end session',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// History Queries
// =============================================================================

/**
 * GET /api/reading-history
 * Get recent reading history
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const libraryId = req.query.libraryId as string | undefined;

    const history = await getRecentHistory(limit, libraryId);
    res.json({ items: history });
  } catch (error) {
    console.error('Error getting reading history:', error);
    res.status(500).json({
      error: 'Failed to get reading history',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/reading-history/file/:fileId
 * Get reading history for a specific file
 */
router.get('/file/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const history = await getFileHistory(fileId!);
    res.json({ sessions: history });
  } catch (error) {
    console.error('Error getting file history:', error);
    res.status(500).json({
      error: 'Failed to get file history',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/reading-history/file/:fileId
 * Clear history for a file
 */
router.delete('/file/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    await clearFileHistory(fileId!);
    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing file history:', error);
    res.status(500).json({
      error: 'Failed to clear file history',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/reading-history
 * Clear all history
 */
router.delete('/', async (req: Request, res: Response) => {
  try {
    await clearAllHistory();
    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing history:', error);
    res.status(500).json({
      error: 'Failed to clear history',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Statistics
// =============================================================================

/**
 * GET /api/reading-history/stats
 * Get daily statistics for a date range
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : undefined;
    const endDate = req.query.endDate
      ? new Date(req.query.endDate as string)
      : undefined;

    const stats = await getStats(startDate, endDate);
    res.json({ stats });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      error: 'Failed to get stats',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/reading-history/stats/all-time
 * Get all-time statistics
 */
router.get('/stats/all-time', async (req: Request, res: Response) => {
  try {
    const stats = await getAllTimeStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting all-time stats:', error);
    res.status(500).json({
      error: 'Failed to get all-time stats',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
