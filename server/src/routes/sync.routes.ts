/**
 * Sync Routes
 *
 * Handles cloud sync operations for multi-device progress synchronization.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import * as syncService from '../services/sync.service.js';
import { logError } from '../services/logger.service.js';

const router = Router();

// Apply authentication to all routes
router.use(requireAuth);

// =============================================================================
// Device Management
// =============================================================================

/**
 * Register a device for sync
 * POST /api/sync/devices
 */
router.post('/devices', async (req: Request, res: Response) => {
  try {
    const { deviceId, deviceName } = req.body;

    // Generate device ID if not provided
    const actualDeviceId = deviceId || syncService.generateDeviceId();

    const device = await syncService.registerDevice(
      req.user!.id,
      actualDeviceId,
      deviceName
    );

    res.json({ device });
  } catch (error) {
    logError('sync', error, { action: 'register-device' });
    res.status(500).json({ error: 'Failed to register device' });
  }
});

/**
 * List registered devices
 * GET /api/sync/devices
 */
router.get('/devices', async (req: Request, res: Response) => {
  try {
    const devices = await syncService.getDevices(req.user!.id);
    res.json({ devices });
  } catch (error) {
    logError('sync', error, { action: 'list-devices' });
    res.status(500).json({ error: 'Failed to list devices' });
  }
});

/**
 * Remove a device
 * DELETE /api/sync/devices/:deviceId
 */
router.delete('/devices/:deviceId', async (req: Request, res: Response) => {
  try {
    const deviceId = req.params.deviceId;
    if (!deviceId) {
      res.status(400).json({ error: 'Device ID required' });
      return;
    }
    await syncService.removeDevice(req.user!.id, deviceId);
    res.json({ success: true });
  } catch (error) {
    logError('sync', error, { action: 'remove-device' });
    res.status(500).json({ error: 'Failed to remove device' });
  }
});

// =============================================================================
// Sync Operations
// =============================================================================

/**
 * Pull changes from server
 * GET /api/sync/pull
 *
 * Query params:
 * - deviceId: Device identifier
 * - sinceVersion: Version to get changes since (0 for initial sync)
 * - limit: Max number of changes to return (default 100)
 */
router.get('/pull', async (req: Request, res: Response) => {
  try {
    const deviceId = req.query.deviceId as string;
    const sinceVersion = parseInt(req.query.sinceVersion as string) || 0;
    const limit = parseInt(req.query.limit as string) || 100;

    if (!deviceId) {
      res.status(400).json({ error: 'Device ID required' });
      return;
    }

    const result = await syncService.pullChanges(
      req.user!.id,
      deviceId,
      sinceVersion,
      Math.min(limit, 1000) // Cap at 1000
    );

    res.json(result);
  } catch (error) {
    logError('sync', error, { action: 'pull-changes' });
    res.status(500).json({ error: 'Failed to pull changes' });
  }
});

/**
 * Push changes to server
 * POST /api/sync/push
 *
 * Body:
 * - deviceId: Device identifier
 * - expectedVersion: Last known server version
 * - changes: Array of changes to push
 */
router.post('/push', async (req: Request, res: Response) => {
  try {
    const { deviceId, expectedVersion, changes } = req.body;

    if (!deviceId) {
      res.status(400).json({ error: 'Device ID required' });
      return;
    }

    if (typeof expectedVersion !== 'number') {
      res.status(400).json({ error: 'Expected version required' });
      return;
    }

    if (!Array.isArray(changes)) {
      res.status(400).json({ error: 'Changes must be an array' });
      return;
    }

    // Validate changes
    for (const change of changes) {
      if (!change.entityType || !change.entityId || !change.changeType) {
        res.status(400).json({ error: 'Invalid change format' });
        return;
      }

      if (!['progress', 'bookmark', 'annotation', 'settings'].includes(change.entityType)) {
        res.status(400).json({ error: 'Invalid entity type' });
        return;
      }

      if (!['create', 'update', 'delete'].includes(change.changeType)) {
        res.status(400).json({ error: 'Invalid change type' });
        return;
      }
    }

    const result = await syncService.pushChanges(
      req.user!.id,
      deviceId,
      changes,
      expectedVersion
    );

    if (!result.success) {
      res.status(409).json({
        error: 'Conflict detected',
        ...result,
      });
      return;
    }

    res.json(result);
  } catch (error) {
    logError('sync', error, { action: 'push-changes' });
    res.status(500).json({ error: 'Failed to push changes' });
  }
});

/**
 * Get full sync state (for initial sync)
 * GET /api/sync/state
 */
router.get('/state', async (req: Request, res: Response) => {
  try {
    const state = await syncService.getFullState(req.user!.id);
    res.json(state);
  } catch (error) {
    logError('sync', error, { action: 'get-state' });
    res.status(500).json({ error: 'Failed to get sync state' });
  }
});

/**
 * Generate a new device ID
 * GET /api/sync/device-id
 */
router.get('/device-id', (_req: Request, res: Response) => {
  const deviceId = syncService.generateDeviceId();
  res.json({ deviceId });
});

export default router;
