/**
 * Metadata Approval Routes
 *
 * API endpoints for the multi-step metadata approval workflow.
 */

import { Router, Request, Response } from 'express';
import {
  MetadataApproval,
  type ApprovalSession,
} from '../services/metadata-approval.service.js';
import { SeriesCache } from '../services/series-cache.service.js';
import { getDatabase } from '../services/database.service.js';
import { logError } from '../services/logger.service.js';

const router = Router();

// =============================================================================
// Session Management
// =============================================================================

/**
 * POST /api/metadata-approval/indexed-files
 * Check which files from a list have already been searched with external metadata.
 * A file is considered "searched" if it has a comicVineId or metronId in its metadata.
 * Body: { fileIds: string[] }
 */
router.post('/indexed-files', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileIds } = req.body as { fileIds: string[] };

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'fileIds must be a non-empty array of file IDs',
      });
      return;
    }

    const prisma = getDatabase();

    // Query the database for the files and their metadata
    // A file is "indexed with metadata" if it has a comicVineId or metronId
    const files = await prisma.comicFile.findMany({
      where: {
        id: { in: fileIds },
      },
      select: {
        id: true,
        filename: true,
        metadata: {
          select: {
            comicVineId: true,
            metronId: true,
          },
        },
      },
    });

    // Build the response - check if file has external metadata IDs
    const indexedFileIds = files
      .filter((f) => f.metadata?.comicVineId || f.metadata?.metronId)
      .map((f) => f.id);

    const filesWithStatus = files.map((f) => ({
      id: f.id,
      filename: f.filename,
      isIndexed: !!(f.metadata?.comicVineId || f.metadata?.metronId),
    }));

    res.json({
      indexedCount: indexedFileIds.length,
      indexedFileIds,
      files: filesWithStatus,
    });
  } catch (err) {
    logError('metadata-approval', err, { action: 'check-indexed-files' });
    res.status(500).json({
      error: 'Failed to check indexed files',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/metadata-approval/sessions
 * Create a new approval session for the given files (non-streaming).
 * Body: { fileIds: string[], useLLMCleanup?: boolean }
 */
router.post('/sessions', async (req: Request, res: Response): Promise<void> => {
  try {
    const { fileIds, useLLMCleanup } = req.body;

    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'fileIds must be a non-empty array of file IDs',
      });
      return;
    }

    const session = await MetadataApproval.createSession(fileIds, {
      useLLMCleanup: useLLMCleanup === true,
    });

    res.status(201).json(sessionToResponse(session));
  } catch (err) {
    logError('metadata-approval', err, { action: 'create-session' });
    res.status(500).json({
      error: 'Failed to create session',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/metadata-approval/sessions/stream
 * Create a new approval session with SSE progress streaming.
 * Body: { fileIds: string[], useLLMCleanup?: boolean }
 * Returns: Server-Sent Events stream with progress updates
 */
router.post('/sessions/stream', async (req: Request, res: Response): Promise<void> => {
  const { fileIds, useLLMCleanup } = req.body;

  if (!Array.isArray(fileIds) || fileIds.length === 0) {
    res.status(400).json({
      error: 'Invalid request',
      message: 'fileIds must be a non-empty array of file IDs',
    });
    return;
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  // Helper to send SSE event
  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Progress callback
  const onProgress = (message: string, detail?: string) => {
    sendEvent('progress', { message, detail, timestamp: new Date().toISOString() });
  };

  try {
    // Create session with progress callback
    const session = await MetadataApproval.createSessionWithProgress(
      fileIds,
      { useLLMCleanup: useLLMCleanup === true },
      onProgress
    );

    // Send completion event with session data
    sendEvent('complete', {
      sessionId: session.id,
      status: session.status,
      useLLMCleanup: session.useLLMCleanup,
      fileCount: session.fileIds.length,
      seriesGroupCount: session.seriesGroups.length,
      currentSeriesIndex: session.currentSeriesIndex,
      currentSeriesGroup: session.seriesGroups[session.currentSeriesIndex] || null,
      expiresAt: session.expiresAt,
    });
  } catch (err) {
    sendEvent('error', {
      error: 'Failed to create session',
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    res.end();
  }
});

/**
 * GET /api/metadata-approval/sessions/:id
 * Get the current state of an approval session.
 */
router.get('/sessions/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ error: 'Session ID is required' });
      return;
    }
    const session = MetadataApproval.getSession(id);

    if (!session) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }

    res.json(sessionToResponse(session));
  } catch (err) {
    logError('metadata-approval', err, { action: 'get-session' });
    res.status(500).json({
      error: 'Failed to get session',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * DELETE /api/metadata-approval/sessions/:id
 * Cancel and delete a session.
 */
router.delete('/sessions/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id!;
    const deleted = MetadataApproval.deleteSession(id);

    if (!deleted) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    res.json({ success: true, message: 'Session cancelled' });
  } catch (err) {
    logError('metadata-approval', err, { action: 'delete-session' });
    res.status(500).json({
      error: 'Failed to delete session',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Series Approval (Phase 1)
// =============================================================================

/**
 * POST /api/metadata-approval/sessions/:id/series/search
 * Re-search for series with a custom query.
 * Body: { query: string }
 */
router.post('/sessions/:id/series/search', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id!;
    const { query } = req.body;

    if (typeof query !== 'string' || !query.trim()) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'query must be a non-empty string',
      });
      return;
    }

    const results = await MetadataApproval.searchSeriesCustom(id, query.trim());

    res.json({
      query: query.trim(),
      results,
      resultCount: results.length,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Session not found') {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    logError('metadata-approval', err, { action: 'search-series' });
    res.status(500).json({
      error: 'Failed to search series',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/metadata-approval/sessions/:id/series/approve
 * Approve the selected series and advance to the next.
 * Body: { seriesId: string, issueMatchingSeriesId?: string }
 * - seriesId: Series to use for series-level metadata (name, publisher, etc.)
 * - issueMatchingSeriesId: Series to use for issue matching (optional, defaults to seriesId)
 */
router.post('/sessions/:id/series/approve', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id!;
    const { seriesId, issueMatchingSeriesId } = req.body;

    if (typeof seriesId !== 'string' || !seriesId) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'seriesId is required',
      });
      return;
    }

    const result = await MetadataApproval.approveSeries(id, seriesId, issueMatchingSeriesId);
    const session = MetadataApproval.getSession(id);

    res.json({
      success: true,
      hasMoreSeries: result.hasMore,
      nextSeriesIndex: result.nextIndex,
      status: session?.status,
      currentSeriesGroup: session?.seriesGroups[result.nextIndex] || null,
      // If we're now in file_review, include file changes summary
      ...(session?.status === 'file_review' && {
        fileChangesSummary: {
          total: session.fileChanges.length,
          matched: session.fileChanges.filter((fc) => fc.status === 'matched').length,
          unmatched: session.fileChanges.filter((fc) => fc.status === 'unmatched').length,
          rejected: session.fileChanges.filter((fc) => fc.status === 'rejected').length,
        },
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Session not found') {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    logError('metadata-approval', err, { action: 'approve-series' });
    res.status(500).json({
      error: 'Failed to approve series',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/metadata-approval/sessions/:id/series/skip
 * Skip the current series and advance to the next.
 */
router.post('/sessions/:id/series/skip', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id!;

    const result = await MetadataApproval.skipSeries(id);
    const session = MetadataApproval.getSession(id);

    res.json({
      success: true,
      hasMoreSeries: result.hasMore,
      nextSeriesIndex: result.nextIndex,
      status: session?.status,
      currentSeriesGroup: session?.seriesGroups[result.nextIndex] || null,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Session not found') {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    logError('metadata-approval', err, { action: 'skip-series' });
    res.status(500).json({
      error: 'Failed to skip series',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/metadata-approval/sessions/:id/series/:index/reset
 * Reset a series group to allow re-selection.
 * Used when user realizes they selected the wrong series during file review.
 */
router.post('/sessions/:id/series/:index/reset', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id!;
    const index = parseInt(req.params.index!, 10);

    if (isNaN(index) || index < 0) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'index must be a non-negative integer',
      });
      return;
    }

    const session = await MetadataApproval.resetSeriesGroup(id, index);

    res.json({
      success: true,
      status: session.status,
      currentSeriesIndex: session.currentSeriesIndex,
      currentSeriesGroup: session.seriesGroups[session.currentSeriesIndex] || null,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Session not found') {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    if (err instanceof Error && err.message === 'Series group not found') {
      res.status(404).json({ error: 'Series group not found' });
      return;
    }
    logError('metadata-approval', err, { action: 'reset-series-group' });
    res.status(500).json({
      error: 'Failed to reset series group',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// File Review (Phase 2)
// =============================================================================

/**
 * GET /api/metadata-approval/sessions/:id/files
 * Get all file changes for the session.
 */
router.get('/sessions/:id/files', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id!;
    const session = MetadataApproval.getSession(id);

    if (!session) {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }

    if (session.status !== 'file_review' && session.status !== 'applying' && session.status !== 'complete') {
      res.status(400).json({
        error: 'Invalid state',
        message: `Session is in ${session.status} state, file changes are not yet available`,
      });
      return;
    }

    res.json({
      status: session.status,
      fileChanges: session.fileChanges,
      summary: {
        total: session.fileChanges.length,
        matched: session.fileChanges.filter((fc) => fc.status === 'matched').length,
        unmatched: session.fileChanges.filter((fc) => fc.status === 'unmatched').length,
        manual: session.fileChanges.filter((fc) => fc.status === 'manual').length,
        rejected: session.fileChanges.filter((fc) => fc.status === 'rejected').length,
      },
    });
  } catch (err) {
    logError('metadata-approval', err, { action: 'get-file-changes' });
    res.status(500).json({
      error: 'Failed to get file changes',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * GET /api/metadata-approval/sessions/:id/files/:fileId/available-issues
 * Get all available issues for manual selection for a specific file.
 * Returns cached issues from the file's series group.
 */
router.get('/sessions/:id/files/:fileId/available-issues', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id!;
    const fileId = req.params.fileId!;

    const result = await MetadataApproval.getAvailableIssuesForFile(id, fileId);

    res.json({
      success: true,
      seriesName: result.seriesName,
      source: result.source,
      sourceId: result.sourceId,
      issues: result.issues,
      totalCount: result.totalCount,
      currentMatchedIssueId: result.currentMatchedIssueId,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Session not found') {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    if (err instanceof Error && err.message === 'File not found in session') {
      res.status(404).json({ error: 'File not found in session' });
      return;
    }
    if (err instanceof Error && err.message === 'Series group not found for file') {
      res.status(404).json({ error: 'Series group not found for file' });
      return;
    }
    if (err instanceof Error && err.message === 'No series selected for this group') {
      res.status(400).json({ error: 'No series selected for this group' });
      return;
    }
    logError('metadata-approval', err, { action: 'get-available-issues' });
    res.status(500).json({
      error: 'Failed to get available issues',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/metadata-approval/sessions/:id/files/match
 * Manually select an issue for a file.
 * Body: { fileId: string, issueSource: string, issueId: string }
 */
router.post('/sessions/:id/files/match', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id!;
    const { fileId, issueSource, issueId } = req.body;

    if (!fileId || !issueSource || !issueId) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'fileId, issueSource, and issueId are required',
      });
      return;
    }

    const fileChange = await MetadataApproval.manualSelectIssue(
      id,
      fileId,
      issueSource as 'comicvine' | 'metron',
      issueId
    );

    res.json({
      success: true,
      fileChange,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Session not found') {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    logError('metadata-approval', err, { action: 'match-file' });
    res.status(500).json({
      error: 'Failed to match file',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * PATCH /api/metadata-approval/sessions/:id/files/:fileId/fields
 * Update field approvals for a file.
 * Body: { [fieldName]: { approved?: boolean, editedValue?: string | number } }
 */
router.patch('/sessions/:id/files/:fileId/fields', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id!;
    const fileId = req.params.fileId!;
    const fieldUpdates = req.body;

    if (!fieldUpdates || typeof fieldUpdates !== 'object') {
      res.status(400).json({
        error: 'Invalid request',
        message: 'Request body must be an object of field updates',
      });
      return;
    }

    const fileChange = MetadataApproval.updateFieldApprovals(id, fileId, fieldUpdates);

    res.json({
      success: true,
      fileChange,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Session not found') {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    logError('metadata-approval', err, { action: 'update-fields' });
    res.status(500).json({
      error: 'Failed to update fields',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/metadata-approval/sessions/:id/files/:fileId/regenerate-rename
 * Regenerate the rename preview based on current field values.
 * Used when fields that affect the rename template are edited.
 * Body: { fields: Record<string, string | number | null> }
 */
router.post('/sessions/:id/files/:fileId/regenerate-rename', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id!;
    const fileId = req.params.fileId!;
    const { fields } = req.body as { fields: Record<string, string | number | null> };

    if (!fields || typeof fields !== 'object') {
      res.status(400).json({
        error: 'Invalid request',
        message: 'fields must be an object of field values',
      });
      return;
    }

    const renameField = await MetadataApproval.regenerateRenamePreview(id, fileId, fields);

    res.json({
      success: true,
      renameField,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Session not found') {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    if (err instanceof Error && err.message === 'File not found in session') {
      res.status(404).json({ error: 'File not found in session' });
      return;
    }
    logError('metadata-approval', err, { action: 'regenerate-rename' });
    res.status(500).json({
      error: 'Failed to regenerate rename preview',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/metadata-approval/sessions/:id/files/:fileId/reject
 * Reject an entire file (no changes will be applied).
 */
router.post('/sessions/:id/files/:fileId/reject', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id!;
    const fileId = req.params.fileId!;

    const fileChange = MetadataApproval.rejectFile(id, fileId);

    res.json({
      success: true,
      fileChange,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Session not found') {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    logError('metadata-approval', err, { action: 'reject-file' });
    res.status(500).json({
      error: 'Failed to reject file',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/metadata-approval/sessions/:id/files/accept-all
 * Accept all files and all field changes.
 */
router.post('/sessions/:id/files/accept-all', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id!;

    MetadataApproval.acceptAllFiles(id);
    const session = MetadataApproval.getSession(id);

    res.json({
      success: true,
      fileChanges: session?.fileChanges,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Session not found') {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    logError('metadata-approval', err, { action: 'accept-all-files' });
    res.status(500).json({
      error: 'Failed to accept all',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/metadata-approval/sessions/:id/files/reject-all
 * Reject all files.
 */
router.post('/sessions/:id/files/reject-all', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id!;

    MetadataApproval.rejectAllFiles(id);
    const session = MetadataApproval.getSession(id);

    res.json({
      success: true,
      fileChanges: session?.fileChanges,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Session not found') {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    logError('metadata-approval', err, { action: 'reject-all-files' });
    res.status(500).json({
      error: 'Failed to reject all',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/metadata-approval/sessions/:id/files/:fileId/move
 * Move a file to a different series group.
 * Body: { targetSeriesGroupIndex: number }
 */
router.post('/sessions/:id/files/:fileId/move', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id!;
    const fileId = req.params.fileId!;
    const { targetSeriesGroupIndex } = req.body;

    if (typeof targetSeriesGroupIndex !== 'number') {
      res.status(400).json({
        error: 'Invalid request',
        message: 'targetSeriesGroupIndex must be a number',
      });
      return;
    }

    const fileChange = await MetadataApproval.moveFileToSeriesGroup(id, fileId, targetSeriesGroupIndex);
    const session = MetadataApproval.getSession(id);

    res.json({
      success: true,
      fileChange,
      seriesGroups: session?.seriesGroups.map((g, index) => ({
        index,
        displayName: g.displayName,
        fileCount: g.fileIds.length,
        status: g.status,
        selectedSeries: g.selectedSeries
          ? {
              name: g.selectedSeries.name,
              startYear: g.selectedSeries.startYear,
            }
          : null,
      })),
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Session not found') {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    if (err instanceof Error && err.message === 'File not found in any series group') {
      res.status(404).json({ error: 'File not found in session' });
      return;
    }
    if (err instanceof Error && err.message === 'Invalid target series group index') {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof Error && err.message === 'File is already in this series group') {
      res.status(400).json({ error: err.message });
      return;
    }
    logError('metadata-approval', err, { action: 'move-file-to-series-group' });
    res.status(500).json({
      error: 'Failed to move file',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Apply Changes (Phase 3)
// =============================================================================

/**
 * POST /api/metadata-approval/sessions/:id/apply
 * Apply all approved changes to files.
 */
router.post('/sessions/:id/apply', async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id!;

    const result = await MetadataApproval.applyChanges(id);

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'Session not found') {
      res.status(404).json({ error: 'Session not found or expired' });
      return;
    }
    logError('metadata-approval', err, { action: 'apply-changes' });
    res.status(500).json({
      error: 'Failed to apply changes',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Series Cache Management
// =============================================================================

/**
 * GET /api/metadata-approval/cache/stats
 * Get series cache statistics.
 */
router.get('/cache/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await SeriesCache.getCacheStats();

    res.json({
      totalEntries: stats.totalEntries,
      totalSizeMb: Math.round(stats.totalSizeBytes / 1024 / 1024 * 100) / 100,
      entriesWithIssues: stats.entriesWithIssues,
      bySource: stats.bySource,
      oldestEntry: stats.oldestEntry,
      newestEntry: stats.newestEntry,
    });
  } catch (err) {
    logError('metadata-approval', err, { action: 'get-cache-stats' });
    res.status(500).json({
      error: 'Failed to get cache stats',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/metadata-approval/cache/clean
 * Clean up expired cache entries.
 */
router.post('/cache/clean', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await SeriesCache.cleanExpired();

    res.json({
      success: true,
      deleted: result.deleted,
      freedMb: Math.round(result.freedBytes / 1024 / 1024 * 100) / 100,
    });
  } catch (err) {
    logError('metadata-approval', err, { action: 'clean-cache' });
    res.status(500).json({
      error: 'Failed to clean cache',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/**
 * POST /api/metadata-approval/cache/clear
 * Clear entire series cache.
 */
router.post('/cache/clear', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await SeriesCache.clearAll();

    res.json({
      success: true,
      deleted: result.deleted,
      freedMb: Math.round(result.freedBytes / 1024 / 1024 * 100) / 100,
    });
  } catch (err) {
    logError('metadata-approval', err, { action: 'clear-cache' });
    res.status(500).json({
      error: 'Failed to clear cache',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

// =============================================================================
// Helpers
// =============================================================================

/**
 * Convert session to API response format
 */
function sessionToResponse(session: ApprovalSession) {
  return {
    sessionId: session.id,
    status: session.status,
    useLLMCleanup: session.useLLMCleanup,
    fileCount: session.fileIds.length,
    seriesGroups: session.seriesGroups.map((g) => ({
      displayName: g.displayName,
      fileCount: g.fileIds.length,
      filenames: g.filenames.slice(0, 5), // First 5 for preview
      status: g.status,
      searchResults: g.searchResults,
      selectedSeries: g.selectedSeries,
    })),
    currentSeriesIndex: session.currentSeriesIndex,
    currentSeriesGroup: session.seriesGroups[session.currentSeriesIndex]
      ? {
          displayName: session.seriesGroups[session.currentSeriesIndex]!.displayName,
          query: session.seriesGroups[session.currentSeriesIndex]!.query,
          fileCount: session.seriesGroups[session.currentSeriesIndex]!.fileIds.length,
          filenames: session.seriesGroups[session.currentSeriesIndex]!.filenames,
          status: session.seriesGroups[session.currentSeriesIndex]!.status,
          searchResults: session.seriesGroups[session.currentSeriesIndex]!.searchResults,
          selectedSeries: session.seriesGroups[session.currentSeriesIndex]!.selectedSeries,
        }
      : null,
    ...(session.status === 'file_review' && {
      fileChangesSummary: {
        total: session.fileChanges.length,
        matched: session.fileChanges.filter((fc) => fc.status === 'matched').length,
        unmatched: session.fileChanges.filter((fc) => fc.status === 'unmatched').length,
        manual: session.fileChanges.filter((fc) => fc.status === 'manual').length,
        rejected: session.fileChanges.filter((fc) => fc.status === 'rejected').length,
      },
    }),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt,
  };
}

export default router;
