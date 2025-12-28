/**
 * API Keys Routes
 *
 * Endpoints for managing API keys for programmatic access.
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware.js';
import { logError } from '../services/logger.service.js';
import {
  createApiKey,
  listUserApiKeys,
  getApiKey,
  updateApiKey,
  revokeApiKey,
  rotateApiKey,
  getApiKeyUsage,
  listAllApiKeys,
  adminRevokeApiKey,
  getSystemApiKeyStats,
} from '../services/api-key.service.js';
import {
  API_SCOPES,
  SCOPE_PRESETS,
  SCOPE_CATEGORIES,
  getAvailableScopesForRole,
} from '../services/api-key-scopes.js';

const router = Router();

// =============================================================================
// User API Key Management
// =============================================================================

/**
 * GET /api/api-keys
 * List all API keys for the current user
 */
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const keys = await listUserApiKeys(req.user!.id);
    res.json({
      success: true,
      data: { keys },
    });
  } catch (error) {
    logError('api-keys-route', error, { action: 'list-keys' });
    res.status(500).json({
      success: false,
      error: 'Failed to list API keys',
    });
  }
});

/**
 * POST /api/api-keys
 * Create a new API key
 */
router.post('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, expiresAt, ipWhitelist, scopes, libraryIds, rateLimitTier } = req.body;

    // Validate required fields
    if (!name || typeof name !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Name is required',
      });
      return;
    }

    if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
      res.status(400).json({
        success: false,
        error: 'At least one scope is required',
      });
      return;
    }

    const result = await createApiKey(
      {
        userId: req.user!.id,
        name,
        description,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        ipWhitelist: ipWhitelist || undefined,
        scopes,
        libraryIds: libraryIds || undefined,
        rateLimitTier,
      },
      req.user!.role as 'admin' | 'user' | 'guest'
    );

    res.status(201).json({
      success: true,
      data: {
        key: result.key, // Only shown once!
        info: result.info,
      },
      message: 'API key created. Save this key now - it will not be shown again.',
    });
  } catch (error) {
    logError('api-keys-route', error, { action: 'create-key' });
    const message = error instanceof Error ? error.message : 'Failed to create API key';
    res.status(400).json({
      success: false,
      error: message,
    });
  }
});

/**
 * GET /api/api-keys/scopes
 * Get available scopes for the current user
 */
router.get('/scopes', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const availableScopes = getAvailableScopesForRole(
      req.user!.role as 'admin' | 'user' | 'guest'
    );

    res.json({
      success: true,
      data: {
        scopes: API_SCOPES,
        availableScopes,
        presets: SCOPE_PRESETS,
        categories: SCOPE_CATEGORIES,
      },
    });
  } catch (error) {
    logError('api-keys-route', error, { action: 'get-scopes' });
    res.status(500).json({
      success: false,
      error: 'Failed to get scopes',
    });
  }
});

/**
 * GET /api/api-keys/:keyId
 * Get details of a specific API key
 */
router.get('/:keyId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const keyId = req.params.keyId as string;
    const key = await getApiKey(keyId, req.user!.id);

    if (!key) {
      res.status(404).json({
        success: false,
        error: 'API key not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { key },
    });
  } catch (error) {
    logError('api-keys-route', error, { action: 'get-key' });
    res.status(500).json({
      success: false,
      error: 'Failed to get API key',
    });
  }
});

/**
 * PATCH /api/api-keys/:keyId
 * Update an API key
 */
router.patch('/:keyId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const keyId = req.params.keyId as string;
    const { name, description, ipWhitelist, scopes, libraryIds, isActive } = req.body;

    const key = await updateApiKey(
      keyId,
      req.user!.id,
      req.user!.role as 'admin' | 'user' | 'guest',
      { name, description, ipWhitelist, scopes, libraryIds, isActive }
    );

    res.json({
      success: true,
      data: { key },
    });
  } catch (error) {
    logError('api-keys-route', error, { action: 'update-key' });
    const message = error instanceof Error ? error.message : 'Failed to update API key';
    res.status(400).json({
      success: false,
      error: message,
    });
  }
});

/**
 * DELETE /api/api-keys/:keyId
 * Revoke an API key
 */
router.delete('/:keyId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const keyId = req.params.keyId as string;
    const { reason } = req.body;

    await revokeApiKey(keyId, req.user!.id, reason);

    res.json({
      success: true,
      message: 'API key revoked',
    });
  } catch (error) {
    logError('api-keys-route', error, { action: 'revoke-key' });
    const message = error instanceof Error ? error.message : 'Failed to revoke API key';
    res.status(400).json({
      success: false,
      error: message,
    });
  }
});

/**
 * POST /api/api-keys/:keyId/rotate
 * Rotate an API key (revoke and create new with same settings)
 */
router.post('/:keyId/rotate', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const keyId = req.params.keyId as string;

    const result = await rotateApiKey(
      keyId,
      req.user!.id,
      req.user!.role as 'admin' | 'user' | 'guest'
    );

    res.json({
      success: true,
      data: {
        key: result.key, // Only shown once!
        info: result.info,
      },
      message: 'API key rotated. Save this new key now - it will not be shown again.',
    });
  } catch (error) {
    logError('api-keys-route', error, { action: 'rotate-key' });
    const message = error instanceof Error ? error.message : 'Failed to rotate API key';
    res.status(400).json({
      success: false,
      error: message,
    });
  }
});

/**
 * GET /api/api-keys/:keyId/usage
 * Get usage statistics for an API key
 */
router.get('/:keyId/usage', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const keyId = req.params.keyId as string;
    const days = parseInt(req.query.days as string) || 30;

    // Verify ownership first
    const key = await getApiKey(keyId, req.user!.id);
    if (!key) {
      res.status(404).json({
        success: false,
        error: 'API key not found',
      });
      return;
    }

    const usage = await getApiKeyUsage(key.id, days);

    res.json({
      success: true,
      data: { usage },
    });
  } catch (error) {
    logError('api-keys-route', error, { action: 'get-usage' });
    res.status(500).json({
      success: false,
      error: 'Failed to get usage statistics',
    });
  }
});

// =============================================================================
// Admin API Key Management
// =============================================================================

/**
 * GET /api/api-keys/admin/all
 * List all API keys across all users (admin only)
 */
router.get('/admin/all', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const keys = await listAllApiKeys();
    res.json({
      success: true,
      data: { keys },
    });
  } catch (error) {
    logError('api-keys-route', error, { action: 'admin-list-keys' });
    res.status(500).json({
      success: false,
      error: 'Failed to list API keys',
    });
  }
});

/**
 * GET /api/api-keys/admin/stats
 * Get system-wide API key statistics (admin only)
 */
router.get('/admin/stats', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await getSystemApiKeyStats();
    res.json({
      success: true,
      data: { stats },
    });
  } catch (error) {
    logError('api-keys-route', error, { action: 'admin-get-stats' });
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics',
    });
  }
});

/**
 * DELETE /api/api-keys/admin/:keyId
 * Admin revoke any API key
 */
router.delete('/admin/:keyId', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const keyId = req.params.keyId as string;
    const { reason } = req.body;

    await adminRevokeApiKey(keyId, reason);

    res.json({
      success: true,
      message: 'API key revoked by admin',
    });
  } catch (error) {
    logError('api-keys-route', error, { action: 'admin-revoke-key' });
    const message = error instanceof Error ? error.message : 'Failed to revoke API key';
    res.status(400).json({
      success: false,
      error: message,
    });
  }
});

export default router;
