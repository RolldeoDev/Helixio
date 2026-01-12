/**
 * Folder Routes
 *
 * API endpoints for materialized folder hierarchy:
 * - Root folders for a library
 * - Folder children (lazy loading)
 * - Folder tree (batch loading)
 * - Folder by path (deep linking)
 * - Folder breadcrumbs (ancestors)
 * - All folders (flat list for pickers)
 * - Admin endpoints (recalculate counts)
 */

import { Router, Request, Response } from 'express';
import {
  getRootFolders,
  getFolderChildren,
  getFolderById,
  getFolderByPath,
  getFolderAncestors,
  getFolderTree,
  getAllFolders,
  recalculateLibraryCounts,
} from '../services/folder/index.js';
import { getDatabase } from '../services/database.service.js';
import { createServiceLogger } from '../services/logger.service.js';
import {
  sendSuccess,
  sendBadRequest,
  sendNotFound,
  asyncHandler,
} from '../middleware/response.middleware.js';
import { cachePresets } from '../middleware/cache.middleware.js';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();
const logger = createServiceLogger('folder-routes');

// All folder routes require authentication
router.use(requireAuth);

// =============================================================================
// Library-Scoped Folder Endpoints
// =============================================================================

/**
 * GET /api/libraries/:libraryId/folders
 * Get root-level folders for a library (depth = 0)
 *
 * Replaces the legacy folder cache endpoint with materialized folder data.
 */
router.get(
  '/libraries/:libraryId/folders',
  cachePresets.stable,
  asyncHandler(async (req: Request, res: Response) => {
    const { libraryId } = req.params;

    if (!libraryId) {
      sendBadRequest(res, 'Library ID is required');
      return;
    }

    // Verify library exists
    const db = getDatabase();
    const library = await db.library.findUnique({
      where: { id: libraryId },
      select: { id: true },
    });

    if (!library) {
      sendNotFound(res, 'Library not found');
      return;
    }

    const folders = await getRootFolders(libraryId);

    logger.debug(
      { libraryId, folderCount: folders.length },
      'Retrieved root folders'
    );

    sendSuccess(res, { folders });
  })
);

/**
 * GET /api/libraries/:libraryId/folders/by-path
 * Lookup a specific folder by its path
 *
 * Query params:
 * - path: The relative folder path (e.g., "Comics/Marvel/2024")
 */
router.get(
  '/libraries/:libraryId/folders/by-path',
  cachePresets.stable,
  asyncHandler(async (req: Request, res: Response) => {
    const { libraryId } = req.params;
    const path = req.query.path as string;

    if (!libraryId) {
      sendBadRequest(res, 'Library ID is required');
      return;
    }

    if (!path) {
      sendBadRequest(res, 'Path query parameter is required');
      return;
    }

    const folder = await getFolderByPath(libraryId, path);

    if (!folder) {
      sendNotFound(res, 'Folder not found');
      return;
    }

    sendSuccess(res, { folder });
  })
);

/**
 * GET /api/libraries/:libraryId/folders/all
 * Get all folders for a library as a flat list
 *
 * Query params:
 * - includeEmpty: Include folders with no files (default: false)
 *
 * Useful for folder pickers, move dialogs, etc.
 */
router.get(
  '/libraries/:libraryId/folders/all',
  cachePresets.stable,
  asyncHandler(async (req: Request, res: Response) => {
    const { libraryId } = req.params;
    const includeEmpty = req.query.includeEmpty === 'true';

    if (!libraryId) {
      sendBadRequest(res, 'Library ID is required');
      return;
    }

    const folders = await getAllFolders(libraryId, { includeEmpty });

    logger.debug(
      { libraryId, folderCount: folders.length, includeEmpty },
      'Retrieved all folders'
    );

    sendSuccess(res, { folders });
  })
);

// =============================================================================
// Folder-Specific Endpoints
// =============================================================================

/**
 * GET /api/folders/:folderId
 * Get a single folder by ID
 */
router.get(
  '/folders/:folderId',
  cachePresets.stable,
  asyncHandler(async (req: Request, res: Response) => {
    const { folderId } = req.params;

    if (!folderId) {
      sendBadRequest(res, 'Folder ID is required');
      return;
    }

    const folder = await getFolderById(folderId);

    if (!folder) {
      sendNotFound(res, 'Folder not found');
      return;
    }

    sendSuccess(res, { folder });
  })
);

/**
 * GET /api/folders/:folderId/children
 * Get immediate children of a folder (lazy loading)
 */
router.get(
  '/folders/:folderId/children',
  cachePresets.stable,
  asyncHandler(async (req: Request, res: Response) => {
    const { folderId } = req.params;

    if (!folderId) {
      sendBadRequest(res, 'Folder ID is required');
      return;
    }

    // Get parent folder info for response
    const folder = await getFolderById(folderId);

    if (!folder) {
      sendNotFound(res, 'Folder not found');
      return;
    }

    const children = await getFolderChildren(folderId);

    sendSuccess(res, {
      folder: {
        id: folder.id,
        name: folder.name,
        path: folder.path,
      },
      children,
    });
  })
);

/**
 * GET /api/folders/:folderId/tree
 * Get folder and descendants up to N levels deep
 *
 * Query params:
 * - depth: How many levels to fetch (default: 1, max: 5)
 *
 * Useful for pre-loading expanded sections.
 */
router.get(
  '/folders/:folderId/tree',
  cachePresets.stable,
  asyncHandler(async (req: Request, res: Response) => {
    const { folderId } = req.params;
    const depthParam = req.query.depth as string;
    const depth = Math.min(Math.max(parseInt(depthParam, 10) || 1, 1), 5);

    if (!folderId) {
      sendBadRequest(res, 'Folder ID is required');
      return;
    }

    const tree = await getFolderTree(folderId, depth);

    if (!tree) {
      sendNotFound(res, 'Folder not found');
      return;
    }

    sendSuccess(res, { folder: tree });
  })
);

/**
 * GET /api/folders/:folderId/breadcrumbs
 * Get ancestors from root to current folder
 */
router.get(
  '/folders/:folderId/breadcrumbs',
  cachePresets.stable,
  asyncHandler(async (req: Request, res: Response) => {
    const { folderId } = req.params;

    if (!folderId) {
      sendBadRequest(res, 'Folder ID is required');
      return;
    }

    // Get current folder
    const folder = await getFolderById(folderId);

    if (!folder) {
      sendNotFound(res, 'Folder not found');
      return;
    }

    // Get ancestors
    const ancestors = await getFolderAncestors(folderId);

    // Include current folder at the end
    const breadcrumbs = [
      ...ancestors.map((a) => ({
        id: a.id,
        name: a.name,
        path: a.path,
      })),
      {
        id: folder.id,
        name: folder.name,
        path: folder.path,
      },
    ];

    sendSuccess(res, { breadcrumbs });
  })
);

// =============================================================================
// Admin Endpoints
// =============================================================================

/**
 * POST /api/admin/folders/recalculate/:libraryId
 * Recalculate all folder counts for a library
 *
 * Use this if counts become inconsistent due to errors.
 */
router.post(
  '/admin/folders/recalculate/:libraryId',
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { libraryId } = req.params;

    if (!libraryId) {
      sendBadRequest(res, 'Library ID is required');
      return;
    }

    // Verify library exists
    const db = getDatabase();
    const library = await db.library.findUnique({
      where: { id: libraryId },
      select: { id: true, name: true },
    });

    if (!library) {
      sendNotFound(res, 'Library not found');
      return;
    }

    logger.info({ libraryId, libraryName: library.name }, 'Starting folder count recalculation');

    const startTime = Date.now();
    await recalculateLibraryCounts(libraryId);
    const duration = Date.now() - startTime;

    logger.info(
      { libraryId, libraryName: library.name, durationMs: duration },
      'Completed folder count recalculation'
    );

    sendSuccess(res, {
      message: 'Folder counts recalculated successfully',
      libraryId,
      libraryName: library.name,
      durationMs: duration,
    });
  })
);

export default router;
