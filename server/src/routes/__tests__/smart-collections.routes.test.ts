/**
 * Smart Collections Routes Tests
 *
 * Tests for smart collection API endpoints:
 * - POST /:id/smart/refresh - Refresh smart collection
 * - PUT /:id/smart/filter - Update smart filter
 * - POST /:id/smart/convert - Convert to smart collection
 * - DELETE /:id/smart - Convert back to regular collection
 * - POST /:id/smart/whitelist - Toggle whitelist
 * - POST /:id/smart/blacklist - Toggle blacklist
 * - GET /:id/smart/overrides - Get whitelist/blacklist items
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

// Mock the auth middleware FIRST before any imports
vi.mock('../../middleware/auth.middleware.js', () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => {
    (_req as Request & { user: { id: string } }).user = {
      id: 'user-1',
      username: 'testuser',
      email: 'test@test.com',
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
  optionalAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

// Mock the smart collection service
const mockRefreshSmartCollection = vi.fn();
const mockUpdateSmartFilter = vi.fn();
const mockConvertToSmartCollection = vi.fn();
const mockConvertToRegularCollection = vi.fn();
const mockToggleWhitelist = vi.fn();
const mockToggleBlacklist = vi.fn();
const mockGetSmartCollectionOverrides = vi.fn();

vi.mock('../../services/smart-collection.service.js', () => ({
  refreshSmartCollection: mockRefreshSmartCollection,
  updateSmartFilter: mockUpdateSmartFilter,
  convertToSmartCollection: mockConvertToSmartCollection,
  convertToRegularCollection: mockConvertToRegularCollection,
  toggleWhitelist: mockToggleWhitelist,
  toggleBlacklist: mockToggleBlacklist,
  getSmartCollectionOverrides: mockGetSmartCollectionOverrides,
}));

// Mock collection service
vi.mock('../../services/collection/index.js', () => ({
  getCollections: vi.fn().mockResolvedValue([]),
  getCollection: vi.fn().mockResolvedValue(null),
  getCollectionExpanded: vi.fn().mockResolvedValue(null),
  createCollection: vi.fn().mockResolvedValue({ id: 'col-1', name: 'Test' }),
  updateCollection: vi.fn().mockResolvedValue({ id: 'col-1', name: 'Test' }),
  deleteCollection: vi.fn().mockResolvedValue(undefined),
  addItemsToCollection: vi.fn().mockResolvedValue([]),
  removeItemsFromCollection: vi.fn().mockResolvedValue(0),
  reorderItems: vi.fn().mockResolvedValue(undefined),
  getCollectionsForItem: vi.fn().mockResolvedValue([]),
  toggleSystemCollection: vi.fn().mockResolvedValue({ added: true }),
  ensureSystemCollections: vi.fn().mockResolvedValue(undefined),
  getSystemCollection: vi.fn().mockResolvedValue(null),
  regenerateMosaicSync: vi.fn().mockResolvedValue(undefined),
}));

// Mock cover service
vi.mock('../../services/cover.service.js', () => ({
  generateCollectionMosaicCover: vi.fn().mockResolvedValue(null),
  saveCollectionMosaicCover: vi.fn().mockResolvedValue({ success: true }),
  deleteCollectionCover: vi.fn().mockResolvedValue(undefined),
  getCollectionCoverPath: vi.fn().mockResolvedValue(null),
  uploadCollectionCover: vi.fn().mockResolvedValue({ success: true }),
  setCollectionCoverFromUrl: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock logger service
vi.mock('../../services/logger.service.js', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logDebug: vi.fn(),
  createServiceLogger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock database service for routes that need it
vi.mock('../../services/database.service.js', () => ({
  getDatabase: vi.fn(() => ({
    collection: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
    },
  })),
}));

// Import router after mocks
const { default: collectionsRouter } = await import('../collections.routes.js');

// Create test app
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/collections', collectionsRouter);
  return app;
}

describe('Smart Collections Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  // =============================================================================
  // POST /:id/smart/refresh
  // =============================================================================

  describe('POST /:id/smart/refresh', () => {
    it('should refresh smart collection and return counts', async () => {
      mockRefreshSmartCollection.mockResolvedValue({ added: 5, removed: 2 });

      const response = await request(app)
        .post('/api/collections/col-1/smart/refresh')
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        added: 5,
        removed: 2,
      });
      expect(mockRefreshSmartCollection).toHaveBeenCalledWith('col-1', 'user-1');
    });

    it('should return 400 for missing collection ID', async () => {
      const response = await request(app)
        .post('/api/collections//smart/refresh')
        .expect(404); // Express returns 404 for empty path segments
    });

    it('should return 404 when collection not found', async () => {
      mockRefreshSmartCollection.mockRejectedValue(new Error('Smart collection not found'));

      const response = await request(app)
        .post('/api/collections/nonexistent/smart/refresh')
        .expect(404);

      expect(response.body.error).toBe('Smart collection not found');
    });

    it('should return 500 on unexpected error', async () => {
      mockRefreshSmartCollection.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/api/collections/col-1/smart/refresh')
        .expect(500);

      expect(response.body.error).toBe('Failed to refresh smart collection');
    });
  });

  // =============================================================================
  // PUT /:id/smart/filter
  // =============================================================================

  describe('PUT /:id/smart/filter', () => {
    const validFilter = {
      id: 'test-filter',
      rootOperator: 'AND',
      groups: [
        {
          id: 'group-1',
          operator: 'AND',
          conditions: [
            { id: 'cond-1', field: 'publisher', comparison: 'equals', value: 'Marvel' },
          ],
        },
      ],
    };

    it('should update smart filter', async () => {
      mockUpdateSmartFilter.mockResolvedValue(undefined);

      const response = await request(app)
        .put('/api/collections/col-1/smart/filter')
        .send({ filter: validFilter, scope: 'series' })
        .expect(200);

      expect(response.body).toEqual({ success: true });
      expect(mockUpdateSmartFilter).toHaveBeenCalledWith('col-1', 'user-1', validFilter, 'series');
    });

    it('should return 400 for missing filter', async () => {
      const response = await request(app)
        .put('/api/collections/col-1/smart/filter')
        .send({ scope: 'series' })
        .expect(400);

      expect(response.body.error).toBe('Filter and scope are required');
    });

    it('should return 400 for missing scope', async () => {
      const response = await request(app)
        .put('/api/collections/col-1/smart/filter')
        .send({ filter: validFilter })
        .expect(400);

      expect(response.body.error).toBe('Filter and scope are required');
    });

    it('should return 404 when collection not found', async () => {
      mockUpdateSmartFilter.mockRejectedValue(new Error('Collection not found'));

      const response = await request(app)
        .put('/api/collections/nonexistent/smart/filter')
        .send({ filter: validFilter, scope: 'series' })
        .expect(404);

      expect(response.body.error).toBe('Collection not found');
    });
  });

  // =============================================================================
  // POST /:id/smart/convert
  // =============================================================================

  describe('POST /:id/smart/convert', () => {
    const validFilter = {
      id: 'test-filter',
      rootOperator: 'AND',
      groups: [],
    };

    it('should convert to smart collection', async () => {
      mockConvertToSmartCollection.mockResolvedValue({ added: 10, removed: 0 });

      const response = await request(app)
        .post('/api/collections/col-1/smart/convert')
        .send({ filter: validFilter, scope: 'series' })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        added: 10,
        removed: 0,
      });
      expect(mockConvertToSmartCollection).toHaveBeenCalledWith('col-1', 'user-1', validFilter, 'series');
    });

    it('should return 400 for missing filter', async () => {
      const response = await request(app)
        .post('/api/collections/col-1/smart/convert')
        .send({ scope: 'series' })
        .expect(400);

      expect(response.body.error).toBe('Filter and scope are required');
    });

    it('should return 400 for missing scope', async () => {
      const response = await request(app)
        .post('/api/collections/col-1/smart/convert')
        .send({ filter: validFilter })
        .expect(400);

      expect(response.body.error).toBe('Filter and scope are required');
    });

    it('should support files scope', async () => {
      mockConvertToSmartCollection.mockResolvedValue({ added: 5, removed: 0 });

      const response = await request(app)
        .post('/api/collections/col-1/smart/convert')
        .send({ filter: validFilter, scope: 'files' })
        .expect(200);

      expect(mockConvertToSmartCollection).toHaveBeenCalledWith('col-1', 'user-1', validFilter, 'files');
    });
  });

  // =============================================================================
  // DELETE /:id/smart
  // =============================================================================

  describe('DELETE /:id/smart', () => {
    it('should convert back to regular collection', async () => {
      mockConvertToRegularCollection.mockResolvedValue(undefined);

      const response = await request(app)
        .delete('/api/collections/col-1/smart')
        .expect(200);

      expect(response.body).toEqual({ success: true });
      expect(mockConvertToRegularCollection).toHaveBeenCalledWith('col-1', 'user-1');
    });

    it('should return 404 when collection not found', async () => {
      mockConvertToRegularCollection.mockRejectedValue(new Error('Collection not found'));

      const response = await request(app)
        .delete('/api/collections/nonexistent/smart')
        .expect(404);

      expect(response.body.error).toBe('Collection not found');
    });

    it('should return 500 on unexpected error', async () => {
      mockConvertToRegularCollection.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .delete('/api/collections/col-1/smart')
        .expect(500);

      expect(response.body.error).toBe('Failed to convert to regular collection');
    });
  });

  // =============================================================================
  // POST /:id/smart/whitelist
  // =============================================================================

  describe('POST /:id/smart/whitelist', () => {
    it('should toggle whitelist for series', async () => {
      mockToggleWhitelist.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/collections/col-1/smart/whitelist')
        .send({ seriesId: 'series-1' })
        .expect(200);

      expect(response.body).toMatchObject({ success: true, isWhitelisted: true });
      expect(mockToggleWhitelist).toHaveBeenCalledWith('col-1', 'user-1', 'series-1', undefined);
    });

    it('should toggle whitelist for file', async () => {
      mockToggleWhitelist.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/collections/col-1/smart/whitelist')
        .send({ fileId: 'file-1' })
        .expect(200);

      expect(response.body).toMatchObject({ success: true, isWhitelisted: true });
      expect(mockToggleWhitelist).toHaveBeenCalledWith('col-1', 'user-1', undefined, 'file-1');
    });

    it('should return 400 when neither seriesId nor fileId provided', async () => {
      const response = await request(app)
        .post('/api/collections/col-1/smart/whitelist')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Either seriesId or fileId is required');
    });

    it('should return false when toggling off whitelist', async () => {
      mockToggleWhitelist.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/collections/col-1/smart/whitelist')
        .send({ seriesId: 'series-1' })
        .expect(200);

      expect(response.body).toMatchObject({ success: true, isWhitelisted: false });
    });

    it('should return 404 when collection not found', async () => {
      mockToggleWhitelist.mockRejectedValue(new Error('Smart collection not found'));

      const response = await request(app)
        .post('/api/collections/nonexistent/smart/whitelist')
        .send({ seriesId: 'series-1' })
        .expect(404);

      expect(response.body.error).toBe('Smart collection not found');
    });
  });

  // =============================================================================
  // POST /:id/smart/blacklist
  // =============================================================================

  describe('POST /:id/smart/blacklist', () => {
    it('should toggle blacklist for series', async () => {
      mockToggleBlacklist.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/collections/col-1/smart/blacklist')
        .send({ seriesId: 'series-1' })
        .expect(200);

      expect(response.body).toMatchObject({ success: true, isBlacklisted: true });
      expect(mockToggleBlacklist).toHaveBeenCalledWith('col-1', 'user-1', 'series-1', undefined);
    });

    it('should toggle blacklist for file', async () => {
      mockToggleBlacklist.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/collections/col-1/smart/blacklist')
        .send({ fileId: 'file-1' })
        .expect(200);

      expect(response.body).toMatchObject({ success: true, isBlacklisted: true });
      expect(mockToggleBlacklist).toHaveBeenCalledWith('col-1', 'user-1', undefined, 'file-1');
    });

    it('should return 400 when neither seriesId nor fileId provided', async () => {
      const response = await request(app)
        .post('/api/collections/col-1/smart/blacklist')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Either seriesId or fileId is required');
    });

    it('should return false when toggling off blacklist', async () => {
      mockToggleBlacklist.mockResolvedValue(false);

      const response = await request(app)
        .post('/api/collections/col-1/smart/blacklist')
        .send({ seriesId: 'series-1' })
        .expect(200);

      expect(response.body).toMatchObject({ success: true, isBlacklisted: false });
    });
  });

  // =============================================================================
  // GET /:id/smart/overrides
  // =============================================================================

  describe('GET /:id/smart/overrides', () => {
    it('should return whitelist and blacklist items', async () => {
      mockGetSmartCollectionOverrides.mockResolvedValue({
        whitelist: [{ seriesId: 'series-1' }, { fileId: 'file-1' }],
        blacklist: [{ seriesId: 'series-2' }],
      });

      const response = await request(app)
        .get('/api/collections/col-1/smart/overrides')
        .expect(200);

      expect(response.body).toEqual({
        whitelist: [{ seriesId: 'series-1' }, { fileId: 'file-1' }],
        blacklist: [{ seriesId: 'series-2' }],
      });
      expect(mockGetSmartCollectionOverrides).toHaveBeenCalledWith('col-1', 'user-1');
    });

    it('should return empty arrays when no overrides', async () => {
      mockGetSmartCollectionOverrides.mockResolvedValue({
        whitelist: [],
        blacklist: [],
      });

      const response = await request(app)
        .get('/api/collections/col-1/smart/overrides')
        .expect(200);

      expect(response.body).toEqual({
        whitelist: [],
        blacklist: [],
      });
    });

    it('should return 404 when collection not found', async () => {
      mockGetSmartCollectionOverrides.mockRejectedValue(new Error('Smart collection not found'));

      const response = await request(app)
        .get('/api/collections/nonexistent/smart/overrides')
        .expect(404);

      expect(response.body.error).toBe('Smart collection not found');
    });
  });

  // =============================================================================
  // Edge Cases and Error Handling
  // =============================================================================

  describe('Edge Cases', () => {
    it('should handle complex filter structures', async () => {
      mockConvertToSmartCollection.mockResolvedValue({ added: 0, removed: 0 });

      const complexFilter = {
        id: 'complex',
        rootOperator: 'OR',
        groups: [
          {
            id: 'g1',
            operator: 'AND',
            conditions: [
              { id: 'c1', field: 'publisher', comparison: 'equals', value: 'Marvel' },
              { id: 'c2', field: 'year', comparison: 'greater_than', value: '2000' },
            ],
          },
          {
            id: 'g2',
            operator: 'OR',
            conditions: [
              { id: 'c3', field: 'publisher', comparison: 'equals', value: 'DC' },
              { id: 'c4', field: 'readStatus', comparison: 'equals', value: 'completed' },
            ],
          },
        ],
      };

      const response = await request(app)
        .post('/api/collections/col-1/smart/convert')
        .send({ filter: complexFilter, scope: 'series' })
        .expect(200);

      expect(mockConvertToSmartCollection).toHaveBeenCalledWith('col-1', 'user-1', complexFilter, 'series');
    });

    it('should handle empty filter groups', async () => {
      mockConvertToSmartCollection.mockResolvedValue({ added: 0, removed: 0 });

      const emptyFilter = {
        id: 'empty',
        rootOperator: 'AND',
        groups: [],
      };

      const response = await request(app)
        .post('/api/collections/col-1/smart/convert')
        .send({ filter: emptyFilter, scope: 'series' })
        .expect(200);
    });

    it('should handle filter with date comparisons', async () => {
      mockUpdateSmartFilter.mockResolvedValue(undefined);

      const dateFilter = {
        id: 'date-filter',
        rootOperator: 'AND',
        groups: [
          {
            id: 'g1',
            operator: 'AND',
            conditions: [
              { id: 'c1', field: 'dateAdded', comparison: 'within_days', value: '30' },
              { id: 'c2', field: 'lastReadAt', comparison: 'after', value: '2024-01-01' },
            ],
          },
        ],
      };

      const response = await request(app)
        .put('/api/collections/col-1/smart/filter')
        .send({ filter: dateFilter, scope: 'series' })
        .expect(200);
    });

    it('should handle filter with between comparison', async () => {
      mockUpdateSmartFilter.mockResolvedValue(undefined);

      const betweenFilter = {
        id: 'between-filter',
        rootOperator: 'AND',
        groups: [
          {
            id: 'g1',
            operator: 'AND',
            conditions: [
              { id: 'c1', field: 'year', comparison: 'between', value: '2000', value2: '2020' },
            ],
          },
        ],
      };

      const response = await request(app)
        .put('/api/collections/col-1/smart/filter')
        .send({ filter: betweenFilter, scope: 'files' })
        .expect(200);
    });
  });
});
