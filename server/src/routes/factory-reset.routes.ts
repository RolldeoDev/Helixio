/**
 * Factory Reset Routes
 *
 * API endpoints for factory reset operations:
 * - GET /api/factory-reset/preview/:level - Get preview of what will be deleted
 * - POST /api/factory-reset - Perform factory reset
 *
 * CRITICAL: These are destructive operations. The frontend must implement
 * multi-step confirmation with random phrase verification.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { FactoryResetService, ResetLevel } from '../services/factory-reset.service.js';
import { createServiceLogger } from '../services/logger.service.js';
import { validateBody } from '../middleware/validation.middleware.js';
import {
  sendSuccess,
  sendBadRequest,
  sendInternalError,
  asyncHandler,
} from '../middleware/response.middleware.js';
import { requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

// All factory reset routes require admin authentication
router.use(requireAdmin);
const logger = createServiceLogger('factory-reset-routes');

// =============================================================================
// Schemas
// =============================================================================

const PerformResetSchema = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  clearKeychain: z.boolean().optional().default(false),
  confirmPhrase: z.string().min(1, 'Confirmation phrase is required'),
});

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /api/factory-reset/preview/:level
 * Get a preview of what will be deleted at the specified reset level
 */
router.get(
  '/preview/:level',
  asyncHandler(async (req: Request, res: Response) => {
    const levelStr = req.params.level;
    if (!levelStr) {
      return sendBadRequest(res, 'Reset level is required.');
    }

    const levelParam = parseInt(levelStr, 10);

    // Validate level parameter
    if (![1, 2, 3].includes(levelParam)) {
      return sendBadRequest(res, 'Invalid reset level. Must be 1, 2, or 3.');
    }

    const level = levelParam as ResetLevel;

    try {
      const preview = await FactoryResetService.getResetPreview(level);
      logger.info({ level }, 'Factory reset preview requested');
      sendSuccess(res, { preview });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error, level }, 'Failed to get reset preview');
      sendInternalError(res, `Failed to get reset preview: ${message}`);
    }
  })
);

/**
 * POST /api/factory-reset
 * Perform factory reset at the specified level
 *
 * Requires confirmation phrase for validation (frontend must generate and verify)
 */
router.post(
  '/',
  validateBody(PerformResetSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { level, clearKeychain, confirmPhrase } = req.body;

    // Validate confirmation phrase format (must be 3 words, letters only)
    const words = confirmPhrase.trim().split(/\s+/);
    if (words.length !== 3) {
      return sendBadRequest(
        res,
        'Invalid confirmation phrase format. Must be exactly 3 words.'
      );
    }

    for (const word of words) {
      if (!/^[a-zA-Z]+$/.test(word)) {
        return sendBadRequest(
          res,
          'Invalid confirmation phrase format. Words must contain only letters.'
        );
      }
    }

    logger.warn(
      { level, clearKeychain },
      'Factory reset initiated - THIS IS A DESTRUCTIVE OPERATION'
    );

    try {
      const result = await FactoryResetService.performReset({
        level,
        clearKeychain,
      });

      if (result.success) {
        logger.info(
          {
            level,
            deletedItems: result.deletedItems,
            clearedTables: result.clearedTables,
            freedBytes: result.freedBytes,
          },
          'Factory reset completed successfully'
        );

        sendSuccess(res, {
          success: true,
          message: `Factory reset (level ${level}) completed successfully`,
          deletedItems: result.deletedItems,
          clearedTables: result.clearedTables,
          freedBytes: result.freedBytes,
          freedMB: Math.round(result.freedBytes / (1024 * 1024) * 100) / 100,
          requiresRestart: result.requiresRestart,
        });

        // Trigger server restart for Level 3 reset
        // Wait for response to be fully sent before exit
        // Docker's restart policy (or process manager) will restart the server
        if (result.requiresRestart) {
          res.on('finish', () => {
            logger.warn('Response sent, scheduling restart...');
            setTimeout(() => {
              logger.info('Exiting process for restart after factory reset');
              process.exit(0);
            }, 1000);
          });
        }
      } else {
        logger.error(
          { level, error: result.error },
          'Factory reset failed'
        );

        sendInternalError(res, result.error || 'Factory reset failed');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error, level }, 'Factory reset threw an exception');
      sendInternalError(res, `Factory reset failed: ${message}`);
    }
  })
);

/**
 * GET /api/factory-reset/levels
 * Get information about all reset levels
 */
router.get(
  '/levels',
  asyncHandler(async (_req: Request, res: Response) => {
    const levels = [
      {
        level: 1,
        name: 'Clear Cache',
        severity: 'warning',
        description: 'Remove cached data to free up disk space',
        details: [
          'Cover images (will be re-extracted on next view)',
          'Thumbnail images',
          'Cached series metadata from APIs',
          'API response cache',
        ],
        preserves: [
          'Reading progress and history',
          'Achievements and collections',
          'Libraries and series data',
          'Settings and API keys',
        ],
      },
      {
        level: 2,
        name: 'Clear Reading Data',
        severity: 'danger',
        description: 'Remove all reading progress and user data',
        details: [
          'Everything in Level 1',
          'Reading progress for all comics',
          'Reading history and statistics',
          'Achievements and progress',
          'Collections (Favorites, Want to Read, custom)',
        ],
        preserves: [
          'Libraries and series structure',
          'Comic metadata',
          'Settings and API keys',
        ],
      },
      {
        level: 3,
        name: 'Full Factory Reset',
        severity: 'critical',
        description: 'Completely reset Helixio to initial state',
        details: [
          'Everything in Level 2',
          'Entire database (libraries, series, files)',
          'Configuration file (settings)',
          'Application logs',
          'Optional: API keys from OS keychain',
        ],
        preserves: [
          'Your comic files (NEVER touched)',
          'Library folder structure on disk',
        ],
      },
    ];

    sendSuccess(res, { levels });
  })
);

export default router;
