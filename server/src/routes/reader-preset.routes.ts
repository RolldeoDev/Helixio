/**
 * Reader Preset Routes
 *
 * API endpoints for reader preset management:
 * - List all presets (bundled + system + user)
 * - CRUD for presets
 * - Apply preset to library/series/issue
 */

import { Router, Request, Response } from 'express';
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
} from '../services/reader-settings.service.js';

const router = Router();

// =============================================================================
// Preset Listing
// =============================================================================

/**
 * GET /api/reader-presets
 * Get all presets (bundled + system + user's own)
 * Query params: ?grouped=true to get presets grouped by type
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // TODO: Get userId from auth context when auth is implemented
    const userId = req.query.userId as string | undefined;
    const grouped = req.query.grouped === 'true';

    if (grouped) {
      const presets = await getPresetsGrouped(userId);
      res.json(presets);
    } else {
      const presets = await getAllPresets(userId);
      res.json(presets);
    }
  } catch (error) {
    console.error('Error getting reader presets:', error);
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
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const preset = await getPresetById(id!);

    if (!preset) {
      res.status(404).json({ error: 'Preset not found' });
      return;
    }

    res.json(preset);
  } catch (error) {
    console.error('Error getting reader preset:', error);
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
router.post('/', async (req: Request, res: Response) => {
  try {
    const input = req.body as CreatePresetInput;
    // TODO: Get userId and isAdmin from auth context
    const userId = req.body.userId as string | undefined;
    const isAdmin = req.body.isAdmin as boolean | undefined;

    // Only admins can create system presets
    if (input.isSystem && !isAdmin) {
      res.status(403).json({ error: 'Only admins can create system presets' });
      return;
    }

    const preset = await createPreset(input, userId);
    res.status(201).json(preset);
  } catch (error) {
    console.error('Error creating reader preset:', error);
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
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const input = req.body as UpdatePresetInput;
    // TODO: Get userId and isAdmin from auth context
    const userId = req.body.userId as string | undefined;
    const isAdmin = req.body.isAdmin as boolean | undefined;

    const preset = await updatePreset(id!, input, userId, isAdmin);
    res.json(preset);
  } catch (error) {
    console.error('Error updating reader preset:', error);

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
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // TODO: Get userId and isAdmin from auth context
    const userId = req.query.userId as string | undefined;
    const isAdmin = req.query.isAdmin === 'true';

    await deletePreset(id!, userId, isAdmin);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting reader preset:', error);

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
router.post('/:id/apply/library/:libraryId', async (req: Request, res: Response) => {
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
    console.error('Error applying preset to library:', error);
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
router.post('/:id/apply/series/:seriesId', async (req: Request, res: Response) => {
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
    console.error('Error applying preset to series:', error);
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
router.post('/:id/apply/issue/:fileId', async (req: Request, res: Response) => {
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
    console.error('Error applying preset to issue:', error);
    res.status(400).json({
      error: 'Failed to apply preset to issue',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
