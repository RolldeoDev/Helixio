/**
 * Filter Presets Routes
 *
 * API endpoints for filter preset management:
 * - CRUD operations for filter presets
 * - Usage tracking (which collections use a preset)
 * - Duplicate presets
 * - Migrate local storage presets to database
 *
 * All routes require authentication as presets are user-scoped.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { logError, logInfo } from '../services/logger.service.js';
import {
  getFilterPresets,
  getFilterPreset,
  createFilterPreset,
  updateFilterPreset,
  deleteFilterPreset,
  getPresetUsage,
  canDeletePreset,
  duplicatePreset,
  migrateLocalPresets,
  type SmartFilter,
} from '../services/filter-preset.service.js';

const router = Router();

// All filter preset routes require authentication
router.use(requireAuth);

// =============================================================================
// Filter Preset CRUD
// =============================================================================

/**
 * GET /api/filter-presets
 * Get all filter presets accessible to the current user (own + global)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const includeGlobal = req.query.includeGlobal !== 'false';

    const presets = await getFilterPresets(userId, { includeGlobal });

    res.json({ presets });
  } catch (error) {
    logError('filter-presets.routes', error, { operation: 'getFilterPresets' });
    res.status(500).json({
      error: 'Failed to get filter presets',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/filter-presets/:id
 * Get a single filter preset by ID
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const id = req.params.id!;

    const preset = await getFilterPreset(id, userId);

    if (!preset) {
      res.status(404).json({
        error: 'Preset not found',
        message: 'The requested filter preset does not exist or is not accessible',
      });
      return;
    }

    res.json({ preset });
  } catch (error) {
    logError('filter-presets.routes', error, { operation: 'getFilterPreset' });
    res.status(500).json({
      error: 'Failed to get filter preset',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/filter-presets
 * Create a new filter preset
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';
    const {
      name,
      description,
      icon,
      filterDefinition,
      sortBy,
      sortOrder,
      isGlobal,
    } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({
        error: 'Invalid name',
        message: 'Name is required and must be a non-empty string',
      });
      return;
    }

    if (!filterDefinition || typeof filterDefinition !== 'object') {
      res.status(400).json({
        error: 'Invalid filter definition',
        message: 'Filter definition is required and must be an object',
      });
      return;
    }

    const preset = await createFilterPreset(
      userId,
      {
        name: name.trim(),
        description,
        icon,
        filterDefinition: filterDefinition as SmartFilter,
        sortBy,
        sortOrder,
        isGlobal,
      },
      isAdmin
    );

    logInfo('filter-presets.routes', 'Created filter preset', {
      presetId: preset.id,
      name: preset.name,
      userId,
      isGlobal: preset.isGlobal,
    });

    res.status(201).json({ preset });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      res.status(409).json({
        error: 'Duplicate name',
        message: error.message,
      });
      return;
    }

    logError('filter-presets.routes', error, { operation: 'createFilterPreset' });
    res.status(500).json({
      error: 'Failed to create filter preset',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/filter-presets/:id
 * Update a filter preset
 * Returns affected collection count for confirmation
 */
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';
    const id = req.params.id!;
    const { name, description, icon, filterDefinition, sortBy, sortOrder } =
      req.body;

    const result = await updateFilterPreset(
      id,
      userId,
      {
        name: name?.trim(),
        description,
        icon,
        filterDefinition: filterDefinition as SmartFilter | undefined,
        sortBy,
        sortOrder,
      },
      isAdmin
    );

    logInfo('filter-presets.routes', 'Updated filter preset', {
      presetId: id,
      userId,
      affectedCollections: result.affectedCollections,
    });

    res.json({
      preset: result.preset,
      affectedCollections: result.affectedCollections,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Preset not found',
          message: error.message,
        });
        return;
      }
      if (error.message.includes('Not authorized')) {
        res.status(403).json({
          error: 'Forbidden',
          message: error.message,
        });
        return;
      }
      if (error.message.includes('already exists')) {
        res.status(409).json({
          error: 'Duplicate name',
          message: error.message,
        });
        return;
      }
    }

    logError('filter-presets.routes', error, { operation: 'updateFilterPreset' });
    res.status(500).json({
      error: 'Failed to update filter preset',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/filter-presets/:id
 * Delete a filter preset
 * Fails if preset is in use by any collections
 */
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';
    const id = req.params.id!;

    await deleteFilterPreset(id, userId, isAdmin);

    logInfo('filter-presets.routes', 'Deleted filter preset', {
      presetId: id,
      userId,
    });

    res.status(204).send();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Preset not found',
          message: error.message,
        });
        return;
      }
      if (error.message.includes('Not authorized')) {
        res.status(403).json({
          error: 'Forbidden',
          message: error.message,
        });
        return;
      }
      if (error.message.includes('Cannot delete')) {
        res.status(409).json({
          error: 'Preset in use',
          message: error.message,
        });
        return;
      }
    }

    logError('filter-presets.routes', error, { operation: 'deleteFilterPreset' });
    res.status(500).json({
      error: 'Failed to delete filter preset',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Usage & Actions
// =============================================================================

/**
 * GET /api/filter-presets/:id/usage
 * Get collections that use this preset
 */
router.get('/:id/usage', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const id = req.params.id!;

    const usage = await getPresetUsage(id, userId);

    res.json(usage);
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        error: 'Preset not found',
        message: error.message,
      });
      return;
    }

    logError('filter-presets.routes', error, { operation: 'getPresetUsage' });
    res.status(500).json({
      error: 'Failed to get preset usage',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/filter-presets/:id/can-delete
 * Check if a preset can be deleted (not in use)
 */
router.get('/:id/can-delete', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const id = req.params.id!;

    const result = await canDeletePreset(id, userId);

    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        error: 'Preset not found',
        message: error.message,
      });
      return;
    }

    logError('filter-presets.routes', error, { operation: 'canDeletePreset' });
    res.status(500).json({
      error: 'Failed to check preset delete status',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/filter-presets/:id/duplicate
 * Duplicate a preset with a new name
 */
router.post('/:id/duplicate', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const id = req.params.id!;
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({
        error: 'Invalid name',
        message: 'Name is required and must be a non-empty string',
      });
      return;
    }

    const preset = await duplicatePreset(id, userId, name.trim());

    logInfo('filter-presets.routes', 'Duplicated filter preset', {
      sourceId: id,
      newId: preset.id,
      name: preset.name,
      userId,
    });

    res.status(201).json({ preset });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Preset not found',
          message: error.message,
        });
        return;
      }
      if (error.message.includes('already exists')) {
        res.status(409).json({
          error: 'Duplicate name',
          message: error.message,
        });
        return;
      }
    }

    logError('filter-presets.routes', error, { operation: 'duplicatePreset' });
    res.status(500).json({
      error: 'Failed to duplicate filter preset',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/filter-presets/migrate-local
 * Migrate local storage presets to database
 */
router.post('/migrate-local', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { presets } = req.body;

    if (!Array.isArray(presets)) {
      res.status(400).json({
        error: 'Invalid presets',
        message: 'Presets must be an array',
      });
      return;
    }

    const result = await migrateLocalPresets(userId, presets);

    logInfo('filter-presets.routes', 'Migrated local presets', {
      userId,
      migrated: result.migrated,
      skipped: result.skipped,
      errors: result.errors.length,
    });

    res.json(result);
  } catch (error) {
    logError('filter-presets.routes', error, { operation: 'migrateLocalPresets' });
    res.status(500).json({
      error: 'Failed to migrate presets',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
