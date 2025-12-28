/**
 * API Keys Routes Tests
 *
 * Tests for the API keys REST API endpoints.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

// Mock the auth middleware
vi.mock('../../middleware/auth.middleware.js', () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    // Simulate authenticated user
    req.user = {
      id: 'user-1',
      username: 'testuser',
      email: 'test@example.com',
      displayName: 'Test User',
      avatarUrl: null,
      role: 'user',
      isActive: true,
      profilePrivate: false,
      hideReadingStats: false,
      createdAt: new Date(),
      lastLoginAt: null,
    };
    next();
  },
  requireAdmin: (req: Request, res: Response, next: NextFunction) => {
    // Simulate admin check
    if (req.user?.role !== 'admin') {
      req.user = {
        id: 'admin-1',
        username: 'admin',
        email: 'admin@example.com',
        displayName: 'Admin User',
        avatarUrl: null,
        role: 'admin',
        isActive: true,
        profilePrivate: false,
        hideReadingStats: false,
        createdAt: new Date(),
        lastLoginAt: null,
      };
    }
    next();
  },
}));

// Mock the logger
vi.mock('../../services/logger.service.js', () => ({
  logError: vi.fn(),
}));

// Mock the api-key service
vi.mock('../../services/api-key.service.js', () => ({
  createApiKey: vi.fn(),
  listUserApiKeys: vi.fn(),
  getApiKey: vi.fn(),
  updateApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
  rotateApiKey: vi.fn(),
  getApiKeyUsage: vi.fn(),
  listAllApiKeys: vi.fn(),
  adminRevokeApiKey: vi.fn(),
  getSystemApiKeyStats: vi.fn(),
}));

// Import routes and mocked service after mocking
import apiKeysRoutes from '../api-keys.routes.js';
import * as apiKeyService from '../../services/api-key.service.js';

// Create typed mock reference
const mockService = apiKeyService as unknown as {
  createApiKey: ReturnType<typeof vi.fn>;
  listUserApiKeys: ReturnType<typeof vi.fn>;
  getApiKey: ReturnType<typeof vi.fn>;
  updateApiKey: ReturnType<typeof vi.fn>;
  revokeApiKey: ReturnType<typeof vi.fn>;
  rotateApiKey: ReturnType<typeof vi.fn>;
  getApiKeyUsage: ReturnType<typeof vi.fn>;
  listAllApiKeys: ReturnType<typeof vi.fn>;
  adminRevokeApiKey: ReturnType<typeof vi.fn>;
  getSystemApiKeyStats: ReturnType<typeof vi.fn>;
};

// =============================================================================
// Test Helpers
// =============================================================================

function createMockApiKeyInfo(overrides: Record<string, unknown> = {}) {
  return {
    id: 'key-1',
    userId: 'user-1',
    name: 'Test Key',
    description: null,
    keyPrefix: 'hlx_test1234',
    scopes: ['library:read'],
    libraryIds: null,
    expiresAt: null,
    ipWhitelist: null,
    rateLimitTier: 'standard',
    isActive: true,
    lastUsedAt: null,
    lastUsedIp: null,
    usageCount: 0,
    createdAt: new Date(),
    revokedAt: null,
    revokedReason: null,
    ...overrides,
  };
}

// =============================================================================
// Test Setup
// =============================================================================

describe('API Keys Routes', () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/api-keys', apiKeysRoutes);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ===========================================================================
  // GET /api/api-keys
  // ===========================================================================

  describe('GET /api/api-keys', () => {
    it('returns user keys', async () => {
      const mockKeys = [
        createMockApiKeyInfo({ id: 'key-1', name: 'Key 1' }),
        createMockApiKeyInfo({ id: 'key-2', name: 'Key 2' }),
      ];
      mockService.listUserApiKeys.mockResolvedValue(mockKeys);

      const response = await request(app).get('/api/api-keys');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.keys).toHaveLength(2);
      expect(mockService.listUserApiKeys).toHaveBeenCalledWith('user-1');
    });

    it('returns empty array when no keys exist', async () => {
      mockService.listUserApiKeys.mockResolvedValue([]);

      const response = await request(app).get('/api/api-keys');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.keys).toEqual([]);
    });

    it('handles errors gracefully', async () => {
      mockService.listUserApiKeys.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/api-keys');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to list API keys');
    });
  });

  // ===========================================================================
  // POST /api/api-keys
  // ===========================================================================

  describe('POST /api/api-keys', () => {
    it('creates key with valid input', async () => {
      const mockResult = {
        key: 'hlx_newkey123456789',
        info: createMockApiKeyInfo({ name: 'New Key' }),
      };
      mockService.createApiKey.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/api-keys')
        .send({
          name: 'New Key',
          scopes: ['library:read'],
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.key).toBe('hlx_newkey123456789');
      expect(response.body.data.info.name).toBe('New Key');
    });

    it('returns raw key in response', async () => {
      const mockResult = {
        key: 'hlx_secretkey12345678',
        info: createMockApiKeyInfo(),
      };
      mockService.createApiKey.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/api-keys')
        .send({
          name: 'Test Key',
          scopes: ['library:read'],
        });

      expect(response.body.data.key).toMatch(/^hlx_/);
    });

    it('returns 400 for missing name', async () => {
      const response = await request(app)
        .post('/api/api-keys')
        .send({
          scopes: ['library:read'],
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Name is required');
    });

    it('returns 400 for missing scopes', async () => {
      const response = await request(app)
        .post('/api/api-keys')
        .send({
          name: 'Test Key',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('At least one scope is required');
    });

    it('returns 400 for empty scopes array', async () => {
      const response = await request(app)
        .post('/api/api-keys')
        .send({
          name: 'Test Key',
          scopes: [],
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('At least one scope is required');
    });

    it('returns 400 for invalid scopes (service error)', async () => {
      mockService.createApiKey.mockRejectedValue(
        new Error('At least one valid scope is required')
      );

      const response = await request(app)
        .post('/api/api-keys')
        .send({
          name: 'Test Key',
          scopes: ['invalid:scope'],
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  // ===========================================================================
  // GET /api/api-keys/scopes
  // ===========================================================================

  describe('GET /api/api-keys/scopes', () => {
    it('returns available scopes', async () => {
      const response = await request(app).get('/api/api-keys/scopes');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.scopes).toBeDefined();
      expect(response.body.data.availableScopes).toBeDefined();
    });

    it('returns presets', async () => {
      const response = await request(app).get('/api/api-keys/scopes');

      expect(response.body.data.presets).toBeDefined();
      expect(response.body.data.presets['read-only']).toBeDefined();
    });

    it('returns categories', async () => {
      const response = await request(app).get('/api/api-keys/scopes');

      expect(response.body.data.categories).toBeDefined();
      expect(response.body.data.categories.Library).toBeDefined();
    });
  });

  // ===========================================================================
  // GET /api/api-keys/:keyId
  // ===========================================================================

  describe('GET /api/api-keys/:keyId', () => {
    it('returns key details', async () => {
      mockService.getApiKey.mockResolvedValue(
        createMockApiKeyInfo({ name: 'My Key' })
      );

      const response = await request(app).get('/api/api-keys/key-1');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.key.name).toBe('My Key');
    });

    it('returns 404 for non-existent key', async () => {
      mockService.getApiKey.mockResolvedValue(null);

      const response = await request(app).get('/api/api-keys/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('API key not found');
    });
  });

  // ===========================================================================
  // PATCH /api/api-keys/:keyId
  // ===========================================================================

  describe('PATCH /api/api-keys/:keyId', () => {
    it('updates key', async () => {
      mockService.updateApiKey.mockResolvedValue(
        createMockApiKeyInfo({ name: 'Updated Name' })
      );

      const response = await request(app)
        .patch('/api/api-keys/key-1')
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.key.name).toBe('Updated Name');
    });

    it('validates update fields', async () => {
      mockService.updateApiKey.mockRejectedValue(
        new Error('API key name is required')
      );

      const response = await request(app)
        .patch('/api/api-keys/key-1')
        .send({ name: '' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('returns 400 for other user key', async () => {
      mockService.updateApiKey.mockRejectedValue(
        new Error('API key not found')
      );

      const response = await request(app)
        .patch('/api/api-keys/other-key')
        .send({ name: 'New Name' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  // ===========================================================================
  // DELETE /api/api-keys/:keyId
  // ===========================================================================

  describe('DELETE /api/api-keys/:keyId', () => {
    it('revokes key', async () => {
      mockService.revokeApiKey.mockResolvedValue(undefined);

      const response = await request(app).delete('/api/api-keys/key-1');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('API key revoked');
    });

    it('returns 400 for non-existent key', async () => {
      mockService.revokeApiKey.mockRejectedValue(
        new Error('API key not found')
      );

      const response = await request(app).delete('/api/api-keys/nonexistent');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  // ===========================================================================
  // POST /api/api-keys/:keyId/rotate
  // ===========================================================================

  describe('POST /api/api-keys/:keyId/rotate', () => {
    it('rotates key', async () => {
      const mockResult = {
        key: 'hlx_newrotatedkey123',
        info: createMockApiKeyInfo({ name: 'Rotated Key' }),
      };
      mockService.rotateApiKey.mockResolvedValue(mockResult);

      const response = await request(app).post('/api/api-keys/key-1/rotate');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.key).toBe('hlx_newrotatedkey123');
    });

    it('returns new raw key', async () => {
      const mockResult = {
        key: 'hlx_freshkey12345678',
        info: createMockApiKeyInfo(),
      };
      mockService.rotateApiKey.mockResolvedValue(mockResult);

      const response = await request(app).post('/api/api-keys/key-1/rotate');

      expect(response.body.data.key).toMatch(/^hlx_/);
    });

    it('returns 400 for other user key', async () => {
      mockService.rotateApiKey.mockRejectedValue(
        new Error('API key not found')
      );

      const response = await request(app).post('/api/api-keys/other-key/rotate');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  // ===========================================================================
  // GET /api/api-keys/:keyId/usage
  // ===========================================================================

  describe('GET /api/api-keys/:keyId/usage', () => {
    it('returns usage stats', async () => {
      mockService.getApiKey.mockResolvedValue(createMockApiKeyInfo());
      mockService.getApiKeyUsage.mockResolvedValue({
        totalRequests: 100,
        requestsLast24h: 10,
        requestsLast7d: 50,
        requestsLast30d: 100,
        topEndpoints: [],
        recentRequests: [],
      });

      const response = await request(app).get('/api/api-keys/key-1/usage');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.usage.totalRequests).toBe(100);
    });

    it('supports days parameter', async () => {
      mockService.getApiKey.mockResolvedValue(createMockApiKeyInfo());
      mockService.getApiKeyUsage.mockResolvedValue({
        totalRequests: 50,
        requestsLast24h: 10,
        requestsLast7d: 50,
        requestsLast30d: 50,
        topEndpoints: [],
        recentRequests: [],
      });

      const response = await request(app).get('/api/api-keys/key-1/usage?days=7');

      expect(response.status).toBe(200);
      expect(mockService.getApiKeyUsage).toHaveBeenCalledWith('key-1', 7);
    });

    it('returns 404 for non-existent key', async () => {
      mockService.getApiKey.mockResolvedValue(null);

      const response = await request(app).get('/api/api-keys/nonexistent/usage');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('API key not found');
    });
  });

  // ===========================================================================
  // Admin Endpoints
  // ===========================================================================

  describe('GET /api/api-keys/admin/all', () => {
    it('returns all keys (admin)', async () => {
      mockService.listAllApiKeys.mockResolvedValue([
        { ...createMockApiKeyInfo(), user: { id: 'user-1', username: 'user1' } },
        { ...createMockApiKeyInfo({ id: 'key-2' }), user: { id: 'user-2', username: 'user2' } },
      ]);

      const response = await request(app).get('/api/api-keys/admin/all');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.keys).toHaveLength(2);
    });
  });

  describe('GET /api/api-keys/admin/stats', () => {
    it('returns system stats (admin)', async () => {
      mockService.getSystemApiKeyStats.mockResolvedValue({
        totalKeys: 10,
        activeKeys: 8,
        expiredKeys: 1,
        revokedKeys: 1,
        requestsLast24h: 100,
        requestsLast7d: 500,
        requestsLast30d: 2000,
      });

      const response = await request(app).get('/api/api-keys/admin/stats');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.stats.totalKeys).toBe(10);
    });
  });

  describe('DELETE /api/api-keys/admin/:keyId', () => {
    it('revokes any key (admin)', async () => {
      mockService.adminRevokeApiKey.mockResolvedValue(undefined);

      const response = await request(app)
        .delete('/api/api-keys/admin/key-1')
        .send({ reason: 'Admin action' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('API key revoked by admin');
    });

    it('returns 400 for non-existent key', async () => {
      mockService.adminRevokeApiKey.mockRejectedValue(
        new Error('API key not found')
      );

      const response = await request(app).delete('/api/api-keys/admin/nonexistent');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});
