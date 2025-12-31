/**
 * Reader Preset Routes
 *
 * API endpoints for reader preset management:
 * - List all presets (bundled + system + user)
 * - CRUD for presets
 * - Apply preset to library/series/issue
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  getAllPresets,
  getPresetById,
  createPreset,
  updatePreset,
  deletePreset,
  getPresetsGrouped,
  extractSettingsFromPreset,
  CreatePresetInput,
  UpdatePresetInput,
} from '../services/reader-preset.service.js';
import {
  applyPresetToLibrary,
  applyPresetToSeries,
  applyPresetToIssue,
  applyPresetToCollection,
} from '../services/reader-settings.service.js';
import { getDatabase } from '../services/database.service.js';
import { logError } from '../services/logger.service.js';

const router = Router();

// =============================================================================
// Preset Listing
// =============================================================================

/**
 * GET /api/reader-presets
 * Get all presets (bundled + system + user's own)
 * Query params: ?grouped=true to get presets grouped by type
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const grouped = req.query.grouped === 'true';

    if (grouped) {
      const presets = await getPresetsGrouped(userId);
      res.json(presets);
    } else {
      const presets = await getAllPresets(userId);
      res.json(presets);
    }
  } catch (error) {
    logError('reader-preset', error, { action: 'get-reader-presets' });
    res.status(500).json({
      error: 'Failed to get reader presets',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/reader-presets/:id
 * Get a single preset by ID
 */
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const preset = await getPresetById(id!);

    if (!preset) {
      res.status(404).json({ error: 'Preset not found' });
      return;
    }

    res.json(preset);
  } catch (error) {
    logError('reader-preset', error, { action: 'get-reader-preset' });
    res.status(500).json({
      error: 'Failed to get reader preset',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Preset CRUD
// =============================================================================

/**
 * POST /api/reader-presets
 * Create a new preset
 * - If isSystem=true, requires admin role
 * - If userId is provided, creates a user preset
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const input = req.body as CreatePresetInput;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    // Only admins can create system presets
    if (input.isSystem && !isAdmin) {
      res.status(403).json({ error: 'Only admins can create system presets' });
      return;
    }

    const preset = await createPreset(input, userId);
    res.status(201).json(preset);
  } catch (error) {
    logError('reader-preset', error, { action: 'create-reader-preset' });
    res.status(400).json({
      error: 'Failed to create reader preset',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/reader-presets/:id
 * Update an existing preset
 */
router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const input = req.body as UpdatePresetInput;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    const preset = await updatePreset(id!, input, userId, isAdmin);
    res.json(preset);
  } catch (error) {
    logError('reader-preset', error, { action: 'update-reader-preset' });

    // Handle specific error types
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
    } else if (message.includes('cannot be modified') || message.includes('Only admins')) {
      res.status(403).json({ error: message });
    } else {
      res.status(400).json({ error: 'Failed to update reader preset', message });
    }
  }
});

/**
 * DELETE /api/reader-presets/:id
 * Delete a preset
 */
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    await deletePreset(id!, userId, isAdmin);
    res.json({ success: true });
  } catch (error) {
    logError('reader-preset', error, { action: 'delete-reader-preset' });

    // Handle specific error types
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
    } else if (message.includes('cannot be deleted') || message.includes('Only admins')) {
      res.status(403).json({ error: message });
    } else {
      res.status(400).json({ error: 'Failed to delete reader preset', message });
    }
  }
});

// =============================================================================
// Apply Preset
// =============================================================================

/**
 * POST /api/reader-presets/:id/apply/library/:libraryId
 * Apply a preset to a library
 */
router.post('/:id/apply/library/:libraryId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, libraryId } = req.params;

    // Get the preset
    const preset = await getPresetById(id!);
    if (!preset) {
      res.status(404).json({ error: 'Preset not found' });
      return;
    }

    // Extract settings and apply
    const settings = extractSettingsFromPreset(preset);
    await applyPresetToLibrary(libraryId!, preset.id, preset.name, settings);

    res.json({ success: true, message: `Preset "${preset.name}" applied to library` });
  } catch (error) {
    logError('reader-preset', error, { action: 'apply-preset-to-library' });
    res.status(400).json({
      error: 'Failed to apply preset to library',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/reader-presets/:id/apply/series/:seriesId
 * Apply a preset to a series
 */
router.post('/:id/apply/series/:seriesId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, seriesId } = req.params;

    // Get the preset
    const preset = await getPresetById(id!);
    if (!preset) {
      res.status(404).json({ error: 'Preset not found' });
      return;
    }

    // Extract settings and apply
    const settings = extractSettingsFromPreset(preset);
    await applyPresetToSeries(seriesId!, preset.id, preset.name, settings);

    res.json({ success: true, message: `Preset "${preset.name}" applied to series` });
  } catch (error) {
    logError('reader-preset', error, { action: 'apply-preset-to-series' });
    res.status(400).json({
      error: 'Failed to apply preset to series',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/reader-presets/:id/apply/issue/:fileId
 * Apply a preset to an issue (file)
 */
router.post('/:id/apply/issue/:fileId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, fileId } = req.params;

    // Get the preset
    const preset = await getPresetById(id!);
    if (!preset) {
      res.status(404).json({ error: 'Preset not found' });
      return;
    }

    // Extract settings and apply
    const settings = extractSettingsFromPreset(preset);
    await applyPresetToIssue(fileId!, preset.id, preset.name, settings);

    res.json({ success: true, message: `Preset "${preset.name}" applied to issue` });
  } catch (error) {
    logError('reader-preset', error, { action: 'apply-preset-to-issue' });
    res.status(400).json({
      error: 'Failed to apply preset to issue',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/reader-presets/:id/apply/collection/:collectionId
 * Apply a preset to a collection (links preset, does not copy settings)
 */
router.post('/:id/apply/collection/:collectionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id, collectionId } = req.params;
    const userId = req.user!.id;

    // Verify user owns the collection
    const db = getDatabase();
    const collection = await db.collection.findFirst({
      where: { id: collectionId, userId },
    });
    if (!collection) {
      res.status(404).json({ error: 'Collection not found or access denied' });
      return;
    }

    // Get the preset
    const preset = await getPresetById(id!);
    if (!preset) {
      res.status(404).json({ error: 'Preset not found' });
      return;
    }

    // Apply preset to collection (links to preset)
    await applyPresetToCollection(collectionId!, preset.id);

    res.json({ success: true, message: `Preset "${preset.name}" applied to collection` });
  } catch (error) {
    logError('reader-preset', error, { action: 'apply-preset-to-collection' });
    res.status(400).json({
      error: 'Failed to apply preset to collection',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/reader-presets/collection/:collectionId
 * Remove preset from a collection (clear the link)
 */
router.delete('/collection/:collectionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { collectionId } = req.params;
    const userId = req.user!.id;

    // Verify user owns the collection
    const db = getDatabase();
    const collection = await db.collection.findFirst({
      where: { id: collectionId, userId },
    });
    if (!collection) {
      res.status(404).json({ error: 'Collection not found or access denied' });
      return;
    }

    // Clear preset from collection
    await applyPresetToCollection(collectionId!, null);

    res.json({ success: true, message: 'Preset removed from collection' });
  } catch (error) {
    logError('reader-preset', error, { action: 'remove-preset-from-collection' });
    res.status(400).json({
      error: 'Failed to remove preset from collection',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
