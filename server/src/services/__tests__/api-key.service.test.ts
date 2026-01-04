/**
 * API Key Service Tests
 *
 * Comprehensive tests for API key management including:
 * - Key generation and hashing
 * - CRUD operations
 * - Validation and authentication
 * - IP whitelisting
 * - Scope and library access checks
 * - Admin operations
 * - Cleanup functions
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import {
  createMockPrismaClient,
  createMockUser,
  createMockApiKey,
  createMockApiKeyUsageLog,
  createMockLibrary,
} from './__mocks__/prisma.mock.js';

// =============================================================================
// Environment Setup - Must be done before imports that use API_KEY_SECRET
// =============================================================================

const originalEnv = process.env.API_KEY_SECRET;
process.env.API_KEY_SECRET = 'test-secret-key-for-unit-tests-32chars!';

// =============================================================================
// Mock Setup
// =============================================================================

const mockPrisma = createMockPrismaClient();

// Mock the database service to return our mock Prisma client
vi.mock('../database.service.js', () => ({
  getDatabase: () => mockPrisma,
}));

// Import after mocking
const {
  createApiKey,
  validateApiKey,
  updateApiKeyUsage,
  logApiKeyRequest,
  listUserApiKeys,
  getApiKey,
  updateApiKey,
  revokeApiKey,
  rotateApiKey,
  getApiKeyUsage,
  listAllApiKeys,
  adminRevokeApiKey,
  getSystemApiKeyStats,
  cleanupExpiredKeys,
  isIpAllowed,
  hasScope,
  hasLibraryAccess,
} = await import('../api-key.service.js');

// =============================================================================
// Test Helpers
// =============================================================================

function resetMocks() {
  Object.values(mockPrisma).forEach((model) => {
    if (typeof model === 'object' && model !== null) {
      Object.values(model).forEach((method) => {
        if (typeof method === 'function' && 'mockClear' in method) {
          (method as ReturnType<typeof vi.fn>).mockClear();
        }
      });
    }
  });
}

function createValidMockApiKey(overrides: Parameters<typeof createMockApiKey>[0] = {}) {
  return createMockApiKey({
    id: 'key-1',
    userId: 'user-1',
    name: 'Test Key',
    scopes: '["library:read","progress:read"]',
    isActive: true,
    ...overrides,
  });
}

function createActiveUser(overrides: Parameters<typeof createMockUser>[0] = {}) {
  return createMockUser({
    id: 'user-1',
    isActive: true,
    role: 'user',
    ...overrides,
  });
}

// =============================================================================
// Tests
// =============================================================================

describe('API Key Service', () => {
  afterAll(() => {
    // Restore original environment
    if (originalEnv === undefined) {
      delete process.env.API_KEY_SECRET;
    } else {
      process.env.API_KEY_SECRET = originalEnv;
    }
  });

  beforeEach(() => {
    resetMocks();
  });

  afterEach(() => {
    resetMocks();
  });

  // ==========================================================================
  // createApiKey Tests
  // ==========================================================================

  describe('createApiKey', () => {
    it('creates key with minimal input (name and scopes)', async () => {
      const result = await createApiKey(
        {
          userId: 'user-1',
          name: 'My API Key',
          scopes: ['library:read'],
        },
        'user'
      );

      expect(result.key).toMatch(/^hlx_/);
      expect(result.info).toBeDefined();
      expect(result.info.name).toBe('My API Key');
      expect(result.info.scopes).toContain('library:read');
      expect(mockPrisma.apiKey.create).toHaveBeenCalled();
    });

    it('creates key with all optional fields', async () => {
      mockPrisma.library.findMany.mockResolvedValueOnce([
        createMockLibrary({ id: 'lib-1' }),
      ]);

      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const result = await createApiKey(
        {
          userId: 'user-1',
          name: 'Full Key',
          description: 'A complete API key',
          expiresAt,
          ipWhitelist: ['192.168.1.1'],
          scopes: ['library:read', 'library:write'],
          libraryIds: ['lib-1'],
          rateLimitTier: 'elevated',
        },
        'user'
      );

      expect(result.info.description).toBe('A complete API key');
      expect(result.info.rateLimitTier).toBe('elevated');
    });

    it('returns raw key only on creation', async () => {
      const result = await createApiKey(
        {
          userId: 'user-1',
          name: 'Test Key',
          scopes: ['library:read'],
        },
        'user'
      );

      // Raw key should be returned
      expect(result.key).toBeTruthy();
      expect(result.key.length).toBeGreaterThan(10);

      // Info should not contain the raw key or hash
      expect(result.info).not.toHaveProperty('keyHash');
      expect(result.info).not.toHaveProperty('key');
    });

    it('stores hashed key, not raw key', async () => {
      const result = await createApiKey(
        {
          userId: 'user-1',
          name: 'Test Key',
          scopes: ['library:read'],
        },
        'user'
      );

      // Check what was passed to create
      const createCall = mockPrisma.apiKey.create.mock.calls[0]?.[0];
      expect(createCall?.data.keyHash).toBeDefined();
      expect(createCall?.data.keyHash).not.toBe(result.key);
    });

    it('throws error when name is missing', async () => {
      await expect(
        createApiKey(
          {
            userId: 'user-1',
            name: '',
            scopes: ['library:read'],
          },
          'user'
        )
      ).rejects.toThrow('API key name is required');
    });

    it('throws error when name is too long', async () => {
      await expect(
        createApiKey(
          {
            userId: 'user-1',
            name: 'a'.repeat(101),
            scopes: ['library:read'],
          },
          'user'
        )
      ).rejects.toThrow('API key name must be 100 characters or less');
    });

    it('throws error when no valid scopes provided', async () => {
      await expect(
        createApiKey(
          {
            userId: 'user-1',
            name: 'Test Key',
            scopes: [],
          },
          'user'
        )
      ).rejects.toThrow('At least one valid scope is required');
    });

    it('throws error when all scopes are invalid', async () => {
      await expect(
        createApiKey(
          {
            userId: 'user-1',
            name: 'Test Key',
            scopes: ['invalid:scope', 'another:fake'],
          },
          'user'
        )
      ).rejects.toThrow('At least one valid scope is required');
    });

    it('admin can create admin-scoped keys', async () => {
      const result = await createApiKey(
        {
          userId: 'user-1',
          name: 'Admin Key',
          scopes: ['admin:users', 'library:read'],
        },
        'admin'
      );

      expect(result.info.scopes).toContain('admin:users');
    });

    it('non-admin cannot create admin-scoped keys', async () => {
      await expect(
        createApiKey(
          {
            userId: 'user-1',
            name: 'Admin Key',
            scopes: ['admin:users', 'library:read'],
          },
          'user'
        )
      ).rejects.toThrow('Admin scopes require admin role');
    });

    it('throws error for invalid library IDs', async () => {
      mockPrisma.library.findMany.mockResolvedValueOnce([]);

      await expect(
        createApiKey(
          {
            userId: 'user-1',
            name: 'Test Key',
            scopes: ['library:read'],
            libraryIds: ['nonexistent-lib'],
          },
          'user'
        )
      ).rejects.toThrow('One or more library IDs are invalid');
    });

    it('throws error for invalid IP whitelist format', async () => {
      await expect(
        createApiKey(
          {
            userId: 'user-1',
            name: 'Test Key',
            scopes: ['library:read'],
            ipWhitelist: ['not-an-ip'],
          },
          'user'
        )
      ).rejects.toThrow(/Invalid IP address or CIDR/);
    });

    it('accepts valid CIDR notation', async () => {
      const result = await createApiKey(
        {
          userId: 'user-1',
          name: 'Test Key',
          scopes: ['library:read'],
          ipWhitelist: ['192.168.1.0/24'],
        },
        'user'
      );

      expect(result.info.ipWhitelist).toContain('192.168.1.0/24');
    });

    it('generated key starts with hlx_', async () => {
      const result = await createApiKey(
        {
          userId: 'user-1',
          name: 'Test Key',
          scopes: ['library:read'],
        },
        'user'
      );

      expect(result.key).toMatch(/^hlx_/);
    });

    it('key prefix is first 12 characters', async () => {
      const result = await createApiKey(
        {
          userId: 'user-1',
          name: 'Test Key',
          scopes: ['library:read'],
        },
        'user'
      );

      expect(result.info.keyPrefix).toBe(result.key.substring(0, 12));
    });
  });

  // ==========================================================================
  // validateApiKey Tests
  // ==========================================================================

  describe('validateApiKey', () => {
    it('returns null for invalid format (no hlx_ prefix)', async () => {
      const result = await validateApiKey('invalidkey123');
      expect(result).toBeNull();
    });

    it('returns null for empty key', async () => {
      const result = await validateApiKey('');
      expect(result).toBeNull();
    });

    it('returns null for non-existent key', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce(null);

      const result = await validateApiKey('hlx_nonexistentkey123456');
      expect(result).toBeNull();
    });

    it('returns null for inactive key', async () => {
      const mockKey = createValidMockApiKey({ isActive: false });
      const mockUser = createActiveUser();
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce({
        ...mockKey,
        user: mockUser,
      });

      const result = await validateApiKey('hlx_validformatkey12345');
      expect(result).toBeNull();
    });

    it('returns null for expired key', async () => {
      const mockKey = createValidMockApiKey({
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
      });
      const mockUser = createActiveUser();
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce({
        ...mockKey,
        user: mockUser,
      });

      const result = await validateApiKey('hlx_validformatkey12345');
      expect(result).toBeNull();
    });

    it('returns null for inactive user', async () => {
      const mockKey = createValidMockApiKey();
      const mockUser = createActiveUser({ isActive: false });
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce({
        ...mockKey,
        user: mockUser,
      });

      const result = await validateApiKey('hlx_validformatkey12345');
      expect(result).toBeNull();
    });

    it('returns validation result for valid key', async () => {
      const mockKey = createValidMockApiKey();
      const mockUser = createActiveUser();
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce({
        ...mockKey,
        user: mockUser,
      });

      const result = await validateApiKey('hlx_validformatkey12345');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('key-1');
      expect(result?.userId).toBe('user-1');
      expect(result?.scopes).toContain('library:read');
    });

    it('returns user info with validation', async () => {
      const mockKey = createValidMockApiKey();
      const mockUser = createActiveUser({ username: 'testuser' });
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce({
        ...mockKey,
        user: mockUser,
      });

      const result = await validateApiKey('hlx_validformatkey12345');

      expect(result?.user).toBeDefined();
      expect(result?.user.username).toBe('testuser');
    });

    it('parses libraryIds from JSON', async () => {
      const mockKey = createValidMockApiKey({
        libraryIds: '["lib-1","lib-2"]',
      });
      const mockUser = createActiveUser();
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce({
        ...mockKey,
        user: mockUser,
      });

      const result = await validateApiKey('hlx_validformatkey12345');

      expect(result?.libraryIds).toEqual(['lib-1', 'lib-2']);
    });

    it('returns null libraryIds when not set', async () => {
      const mockKey = createValidMockApiKey({ libraryIds: null });
      const mockUser = createActiveUser();
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce({
        ...mockKey,
        user: mockUser,
      });

      const result = await validateApiKey('hlx_validformatkey12345');

      expect(result?.libraryIds).toBeNull();
    });
  });

  // ==========================================================================
  // listUserApiKeys Tests
  // ==========================================================================

  describe('listUserApiKeys', () => {
    it('returns all keys for user', async () => {
      mockPrisma.apiKey.findMany.mockResolvedValueOnce([
        createValidMockApiKey({ id: 'key-1', name: 'Key 1' }),
        createValidMockApiKey({ id: 'key-2', name: 'Key 2' }),
      ]);

      const result = await listUserApiKeys('user-1');

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe('Key 1');
      expect(result[1]?.name).toBe('Key 2');
    });

    it('returns empty array for user with no keys', async () => {
      mockPrisma.apiKey.findMany.mockResolvedValueOnce([]);

      const result = await listUserApiKeys('user-1');

      expect(result).toEqual([]);
    });

    it('queries with correct userId', async () => {
      await listUserApiKeys('user-123');

      expect(mockPrisma.apiKey.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  // ==========================================================================
  // getApiKey Tests
  // ==========================================================================

  describe('getApiKey', () => {
    it('returns key for owner', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce(
        createValidMockApiKey({ id: 'key-1', name: 'My Key' })
      );

      const result = await getApiKey('key-1', 'user-1');

      expect(result).not.toBeNull();
      expect(result?.name).toBe('My Key');
    });

    it('returns null for non-existent key', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce(null);

      const result = await getApiKey('nonexistent', 'user-1');

      expect(result).toBeNull();
    });

    it('queries with both keyId and userId', async () => {
      await getApiKey('key-1', 'user-1');

      expect(mockPrisma.apiKey.findFirst).toHaveBeenCalledWith({
        where: { id: 'key-1', userId: 'user-1' },
      });
    });
  });

  // ==========================================================================
  // updateApiKey Tests
  // ==========================================================================

  describe('updateApiKey', () => {
    it('updates name', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce(
        createValidMockApiKey()
      );
      mockPrisma.apiKey.update.mockResolvedValueOnce(
        createValidMockApiKey({ name: 'Updated Name' })
      );

      const result = await updateApiKey('key-1', 'user-1', 'user', {
        name: 'Updated Name',
      });

      expect(result.name).toBe('Updated Name');
    });

    it('updates description', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce(
        createValidMockApiKey()
      );
      mockPrisma.apiKey.update.mockResolvedValueOnce(
        createValidMockApiKey({ description: 'New description' })
      );

      const result = await updateApiKey('key-1', 'user-1', 'user', {
        description: 'New description',
      });

      expect(result.description).toBe('New description');
    });

    it('updates IP whitelist', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce(
        createValidMockApiKey()
      );
      mockPrisma.apiKey.update.mockResolvedValueOnce(
        createValidMockApiKey({ ipWhitelist: '["10.0.0.1"]' })
      );

      const result = await updateApiKey('key-1', 'user-1', 'user', {
        ipWhitelist: ['10.0.0.1'],
      });

      expect(result.ipWhitelist).toContain('10.0.0.1');
    });

    it('validates scopes on update', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce(
        createValidMockApiKey()
      );

      await expect(
        updateApiKey('key-1', 'user-1', 'user', {
          scopes: [],
        })
      ).rejects.toThrow('At least one valid scope is required');
    });

    it('validates library IDs on update', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce(
        createValidMockApiKey()
      );
      mockPrisma.library.findMany.mockResolvedValueOnce([]);

      await expect(
        updateApiKey('key-1', 'user-1', 'user', {
          libraryIds: ['nonexistent'],
        })
      ).rejects.toThrow('One or more library IDs are invalid');
    });

    it('updates isActive status', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce(
        createValidMockApiKey()
      );
      mockPrisma.apiKey.update.mockResolvedValueOnce(
        createValidMockApiKey({ isActive: false })
      );

      const result = await updateApiKey('key-1', 'user-1', 'user', {
        isActive: false,
      });

      expect(result.isActive).toBe(false);
    });

    it('throws error for non-existent key', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce(null);

      await expect(
        updateApiKey('nonexistent', 'user-1', 'user', { name: 'New Name' })
      ).rejects.toThrow('API key not found');
    });

    it('user cannot add admin scopes', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce(
        createValidMockApiKey()
      );

      await expect(
        updateApiKey('key-1', 'user-1', 'user', {
          scopes: ['admin:users'],
        })
      ).rejects.toThrow('Admin scopes require admin role');
    });

    it('throws error for empty name', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce(
        createValidMockApiKey()
      );

      await expect(
        updateApiKey('key-1', 'user-1', 'user', { name: '' })
      ).rejects.toThrow('API key name is required');
    });
  });

  // ==========================================================================
  // revokeApiKey Tests
  // ==========================================================================

  describe('revokeApiKey', () => {
    it('revokes own key', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce(
        createValidMockApiKey()
      );

      await revokeApiKey('key-1', 'user-1');

      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'key-1' },
          data: expect.objectContaining({
            isActive: false,
            revokedAt: expect.any(Date),
          }),
        })
      );
    });

    it('throws error for non-existent key', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce(null);

      await expect(revokeApiKey('nonexistent', 'user-1')).rejects.toThrow(
        'API key not found'
      );
    });

    it('sets revoked reason if provided', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce(
        createValidMockApiKey()
      );

      await revokeApiKey('key-1', 'user-1', 'No longer needed');

      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            revokedReason: 'No longer needed',
          }),
        })
      );
    });

    it('sets revokedAt timestamp', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce(
        createValidMockApiKey()
      );
      const beforeRevoke = new Date();

      await revokeApiKey('key-1', 'user-1');

      const updateCall = mockPrisma.apiKey.update.mock.calls[0]?.[0];
      const revokedAt = updateCall?.data.revokedAt as Date;
      expect(revokedAt.getTime()).toBeGreaterThanOrEqual(beforeRevoke.getTime());
    });
  });

  // ==========================================================================
  // rotateApiKey Tests
  // ==========================================================================

  describe('rotateApiKey', () => {
    it('creates new key with same settings', async () => {
      const originalKey = createValidMockApiKey({
        name: 'Original Key',
        description: 'Original description',
        scopes: '["library:read","progress:read"]',
      });
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce(originalKey);

      const result = await rotateApiKey('key-1', 'user-1', 'user');

      expect(result.key).toMatch(/^hlx_/);
      expect(result.info.name).toBe('Original Key');
    });

    it('revokes old key', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce(
        createValidMockApiKey()
      );

      await rotateApiKey('key-1', 'user-1', 'user');

      // First update call should be to revoke old key
      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'key-1' },
          data: expect.objectContaining({
            isActive: false,
            revokedReason: 'Rotated',
          }),
        })
      );
    });

    it('new key has same scopes', async () => {
      const originalKey = createValidMockApiKey({
        scopes: '["library:read","files:read"]',
      });
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce(originalKey);

      const result = await rotateApiKey('key-1', 'user-1', 'user');

      expect(result.info.scopes).toContain('library:read');
      expect(result.info.scopes).toContain('files:read');
    });

    it('throws error for non-existent key', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce(null);

      await expect(rotateApiKey('nonexistent', 'user-1', 'user')).rejects.toThrow(
        'API key not found'
      );
    });

    it('preserves library restrictions', async () => {
      const originalKey = createValidMockApiKey({
        libraryIds: '["lib-1","lib-2"]',
      });
      mockPrisma.apiKey.findFirst.mockResolvedValueOnce(originalKey);
      mockPrisma.library.findMany.mockResolvedValueOnce([
        createMockLibrary({ id: 'lib-1' }),
        createMockLibrary({ id: 'lib-2' }),
      ]);

      const result = await rotateApiKey('key-1', 'user-1', 'user');

      expect(result.info.libraryIds).toContain('lib-1');
      expect(result.info.libraryIds).toContain('lib-2');
    });
  });

  // ==========================================================================
  // updateApiKeyUsage Tests
  // ==========================================================================

  describe('updateApiKeyUsage', () => {
    it('increments usage count', async () => {
      await updateApiKeyUsage('key-1', '192.168.1.1');

      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'key-1' },
          data: expect.objectContaining({
            usageCount: { increment: 1 },
          }),
        })
      );
    });

    it('sets lastUsedAt', async () => {
      await updateApiKeyUsage('key-1', '192.168.1.1');

      const updateCall = mockPrisma.apiKey.update.mock.calls[0]?.[0];
      expect(updateCall?.data.lastUsedAt).toBeInstanceOf(Date);
    });

    it('sets lastUsedIp', async () => {
      await updateApiKeyUsage('key-1', '10.0.0.1');

      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lastUsedIp: '10.0.0.1',
          }),
        })
      );
    });
  });

  // ==========================================================================
  // logApiKeyRequest Tests
  // ==========================================================================

  describe('logApiKeyRequest', () => {
    it('creates log entry', async () => {
      await logApiKeyRequest(
        'key-1',
        '/api/libraries',
        'GET',
        200,
        '192.168.1.1',
        'Mozilla/5.0',
        50
      );

      expect(mockPrisma.apiKeyUsageLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          apiKeyId: 'key-1',
          endpoint: '/api/libraries',
          method: 'GET',
          statusCode: 200,
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          durationMs: 50,
        }),
      });
    });

    it('handles null user agent', async () => {
      await logApiKeyRequest(
        'key-1',
        '/api/test',
        'POST',
        201,
        '127.0.0.1',
        null
      );

      expect(mockPrisma.apiKeyUsageLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userAgent: null,
        }),
      });
    });
  });

  // ==========================================================================
  // getApiKeyUsage Tests
  // ==========================================================================

  describe('getApiKeyUsage', () => {
    it('returns usage stats', async () => {
      mockPrisma.apiKeyUsageLog.count.mockResolvedValue(100);
      mockPrisma.apiKeyUsageLog.findMany
        .mockResolvedValueOnce([
          createMockApiKeyUsageLog({ endpoint: '/api/test' }),
          createMockApiKeyUsageLog({ endpoint: '/api/test' }),
        ])
        .mockResolvedValueOnce([
          createMockApiKeyUsageLog({ endpoint: '/api/test' }),
        ]);

      const result = await getApiKeyUsage('key-1', 30);

      expect(result.totalRequests).toBe(100);
      expect(result.topEndpoints).toBeDefined();
      expect(result.recentRequests).toBeDefined();
    });

    it('respects days parameter', async () => {
      mockPrisma.apiKeyUsageLog.count.mockResolvedValue(0);
      mockPrisma.apiKeyUsageLog.findMany.mockResolvedValue([]);

      await getApiKeyUsage('key-1', 7);

      // Should query with cutoff based on days parameter
      expect(mockPrisma.apiKeyUsageLog.count).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Admin Functions Tests
  // ==========================================================================

  describe('listAllApiKeys', () => {
    it('returns all users keys', async () => {
      mockPrisma.apiKey.findMany.mockResolvedValueOnce([
        {
          ...createValidMockApiKey({ id: 'key-1' }),
          user: createActiveUser({ id: 'user-1', username: 'user1' }),
        },
        {
          ...createValidMockApiKey({ id: 'key-2', userId: 'user-2' }),
          user: createActiveUser({ id: 'user-2', username: 'user2' }),
        },
      ]);

      const result = await listAllApiKeys();

      expect(result).toHaveLength(2);
      expect(result[0]?.user.username).toBe('user1');
      expect(result[1]?.user.username).toBe('user2');
    });

    it('includes user info', async () => {
      mockPrisma.apiKey.findMany.mockResolvedValueOnce([
        {
          ...createValidMockApiKey(),
          user: createActiveUser({ displayName: 'Test User' }),
        },
      ]);

      const result = await listAllApiKeys();

      expect(result[0]?.user).toBeDefined();
      expect(result[0]?.user.displayName).toBe('Test User');
    });
  });

  describe('adminRevokeApiKey', () => {
    it('revokes any key', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValueOnce(
        createValidMockApiKey({ userId: 'other-user' })
      );

      await adminRevokeApiKey('key-1', 'Admin action');

      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'key-1' },
          data: expect.objectContaining({
            isActive: false,
            revokedReason: 'Admin action',
          }),
        })
      );
    });

    it('throws error for non-existent key', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValueOnce(null);

      await expect(adminRevokeApiKey('nonexistent')).rejects.toThrow(
        'API key not found'
      );
    });

    it('uses default reason if not provided', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValueOnce(
        createValidMockApiKey()
      );

      await adminRevokeApiKey('key-1');

      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            revokedReason: 'Revoked by admin',
          }),
        })
      );
    });
  });

  describe('getSystemApiKeyStats', () => {
    it('returns correct counts', async () => {
      mockPrisma.apiKey.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(8)  // active
        .mockResolvedValueOnce(1)  // expired
        .mockResolvedValueOnce(2); // revoked
      mockPrisma.apiKeyUsageLog.count
        .mockResolvedValueOnce(100)  // 24h
        .mockResolvedValueOnce(500)  // 7d
        .mockResolvedValueOnce(2000); // 30d

      const result = await getSystemApiKeyStats();

      expect(result.totalKeys).toBe(10);
      expect(result.activeKeys).toBe(8);
      expect(result.expiredKeys).toBe(1);
      expect(result.revokedKeys).toBe(2);
      expect(result.requestsLast24h).toBe(100);
      expect(result.requestsLast7d).toBe(500);
      expect(result.requestsLast30d).toBe(2000);
    });
  });

  // ==========================================================================
  // cleanupExpiredKeys Tests
  // ==========================================================================

  describe('cleanupExpiredKeys', () => {
    it('returns cleanup counts', async () => {
      mockPrisma.apiKey.deleteMany.mockResolvedValueOnce({ count: 5 });
      mockPrisma.apiKeyUsageLog.deleteMany.mockResolvedValueOnce({ count: 100 });

      const result = await cleanupExpiredKeys(30, 90);

      expect(result.keysDeleted).toBe(5);
      expect(result.logsDeleted).toBe(100);
    });

    it('uses default retention periods', async () => {
      mockPrisma.apiKey.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.apiKeyUsageLog.deleteMany.mockResolvedValueOnce({ count: 0 });

      await cleanupExpiredKeys();

      expect(mockPrisma.apiKey.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.apiKeyUsageLog.deleteMany).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // isIpAllowed Tests
  // ==========================================================================

  describe('isIpAllowed', () => {
    it('returns false for undefined IP', () => {
      expect(isIpAllowed(undefined, ['192.168.1.1'])).toBe(false);
    });

    it('returns true for empty whitelist', () => {
      expect(isIpAllowed('192.168.1.1', [])).toBe(true);
    });

    it('returns true for matching IP', () => {
      expect(isIpAllowed('192.168.1.1', ['192.168.1.1'])).toBe(true);
    });

    it('returns false for non-matching IP', () => {
      expect(isIpAllowed('192.168.1.1', ['10.0.0.1'])).toBe(false);
    });

    it('handles IPv4-mapped IPv6 addresses', () => {
      expect(isIpAllowed('::ffff:192.168.1.1', ['192.168.1.1'])).toBe(true);
    });

    it('handles CIDR notation', () => {
      // Simplified CIDR matching in the implementation
      expect(isIpAllowed('192.168.1.5', ['192.168.1.0/24'])).toBe(true);
    });
  });

  // ==========================================================================
  // hasScope Tests
  // ==========================================================================

  describe('hasScope', () => {
    it('returns true when scope exists', () => {
      expect(hasScope(['library:read', 'progress:read'], 'library:read')).toBe(true);
    });

    it('returns false when scope does not exist', () => {
      expect(hasScope(['library:read'], 'library:write')).toBe(false);
    });

    it('returns false for empty scopes', () => {
      expect(hasScope([], 'library:read')).toBe(false);
    });
  });

  // ==========================================================================
  // hasLibraryAccess Tests
  // ==========================================================================

  describe('hasLibraryAccess', () => {
    it('returns true when libraryIds is null (all libraries)', () => {
      expect(hasLibraryAccess(null, 'any-lib')).toBe(true);
    });

    it('returns true when library is in list', () => {
      expect(hasLibraryAccess(['lib-1', 'lib-2'], 'lib-1')).toBe(true);
    });

    it('returns false when library is not in list', () => {
      expect(hasLibraryAccess(['lib-1', 'lib-2'], 'lib-3')).toBe(false);
    });

    it('returns false for empty library list', () => {
      expect(hasLibraryAccess([], 'lib-1')).toBe(false);
    });
  });
});
