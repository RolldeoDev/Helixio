/**
 * Reader Settings Routes
 *
 * API endpoints for reader settings management:
 * - Get/update global settings
 * - Library-level overrides
 * - Series-level overrides
 * - Resolved settings for specific files
 */

import { Router, Request, Response } from 'express';
import {
  getSettings,
  updateSettings,
  resetSettings,
  getSuggestedSettings,
  getLibrarySettings,
  updateLibrarySettings,
  deleteLibrarySettings,
  getSeriesSettings,
  updateSeriesSettings,
  deleteSeriesSettings,
  getResolvedSettings,
  getSeriesWithSettings,
  UpdateReaderSettingsInput,
  PartialReaderSettings,
} from '../services/reader-settings.service.js';

const router = Router();

// =============================================================================
// Settings CRUD
// =============================================================================

/**
 * GET /api/reader-settings
 * Get current reader settings
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch (error) {
    console.error('Error getting reader settings:', error);
    res.status(500).json({
      error: 'Failed to get reader settings',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/reader-settings
 * Update reader settings
 */
router.put('/', async (req: Request, res: Response) => {
  try {
    const input = req.body as UpdateReaderSettingsInput;
    const settings = await updateSettings(input);
    res.json(settings);
  } catch (error) {
    console.error('Error updating reader settings:', error);
    res.status(400).json({
      error: 'Failed to update reader settings',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/reader-settings/reset
 * Reset settings to defaults
 */
router.post('/reset', async (_req: Request, res: Response) => {
  try {
    const settings = await resetSettings();
    res.json(settings);
  } catch (error) {
    console.error('Error resetting reader settings:', error);
    res.status(500).json({
      error: 'Failed to reset reader settings',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/reader-settings/suggested/:libraryType
 * Get suggested settings for a library type
 */
router.get('/suggested/:libraryType', (req: Request, res: Response) => {
  try {
    const libraryType = req.params.libraryType as 'western' | 'manga';

    if (!['western', 'manga'].includes(libraryType)) {
      res.status(400).json({ error: 'Invalid library type' });
      return;
    }

    const suggested = getSuggestedSettings(libraryType);
    res.json(suggested);
  } catch (error) {
    console.error('Error getting suggested settings:', error);
    res.status(500).json({
      error: 'Failed to get suggested settings',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Library Settings (Overrides)
// =============================================================================

/**
 * GET /api/reader-settings/library/:libraryId
 * Get library-level settings overrides
 */
router.get('/library/:libraryId', async (req: Request, res: Response) => {
  try {
    const { libraryId } = req.params;
    const settings = await getLibrarySettings(libraryId!);
    res.json(settings || {});
  } catch (error) {
    console.error('Error getting library reader settings:', error);
    res.status(500).json({
      error: 'Failed to get library reader settings',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/reader-settings/library/:libraryId
 * Update library-level settings overrides
 */
router.put('/library/:libraryId', async (req: Request, res: Response) => {
  try {
    const { libraryId } = req.params;
    const input = req.body as PartialReaderSettings;
    const settings = await updateLibrarySettings(libraryId!, input);
    res.json(settings);
  } catch (error) {
    console.error('Error updating library reader settings:', error);
    res.status(400).json({
      error: 'Failed to update library reader settings',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/reader-settings/library/:libraryId
 * Delete library-level settings (revert to global defaults)
 */
router.delete('/library/:libraryId', async (req: Request, res: Response) => {
  try {
    const { libraryId } = req.params;
    await deleteLibrarySettings(libraryId!);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting library reader settings:', error);
    res.status(500).json({
      error: 'Failed to delete library reader settings',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Series Settings (Overrides)
// =============================================================================

/**
 * GET /api/reader-settings/series
 * Get all series that have custom settings
 */
router.get('/series', async (_req: Request, res: Response) => {
  try {
    const series = await getSeriesWithSettings();
    res.json(series);
  } catch (error) {
    console.error('Error getting series with settings:', error);
    res.status(500).json({
      error: 'Failed to get series with settings',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/reader-settings/series/:series
 * Get series-level settings overrides
 */
router.get('/series/:series', async (req: Request, res: Response) => {
  try {
    const { series } = req.params;
    const settings = await getSeriesSettings(series!);
    res.json(settings || {});
  } catch (error) {
    console.error('Error getting series reader settings:', error);
    res.status(500).json({
      error: 'Failed to get series reader settings',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/reader-settings/series/:series
 * Update series-level settings overrides
 */
router.put('/series/:series', async (req: Request, res: Response) => {
  try {
    const { series } = req.params;
    const input = req.body as PartialReaderSettings;
    const settings = await updateSeriesSettings(series!, input);
    res.json(settings);
  } catch (error) {
    console.error('Error updating series reader settings:', error);
    res.status(400).json({
      error: 'Failed to update series reader settings',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/reader-settings/series/:series
 * Delete series-level settings (revert to library/global defaults)
 */
router.delete('/series/:series', async (req: Request, res: Response) => {
  try {
    const { series } = req.params;
    await deleteSeriesSettings(series!);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting series reader settings:', error);
    res.status(500).json({
      error: 'Failed to delete series reader settings',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Resolved Settings
// =============================================================================

/**
 * GET /api/reader-settings/resolved/:fileId
 * Get fully resolved settings for a specific file (applies hierarchy)
 */
router.get('/resolved/:fileId', async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;
    const settings = await getResolvedSettings(fileId!);
    res.json(settings);
  } catch (error) {
    console.error('Error getting resolved reader settings:', error);
    res.status(500).json({
      error: 'Failed to get resolved reader settings',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
