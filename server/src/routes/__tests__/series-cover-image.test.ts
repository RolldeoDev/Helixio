/**
 * Series Cover Image Endpoint Tests
 *
 * Tests the GET /api/series/:id/cover-image endpoint which returns
 * pre-computed series covers using server-side resolution.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

// =============================================================================
// Mocks
// =============================================================================

const mockDb = {
  series: {
    findUnique: vi.fn(),
  },
  comicFile: {
    findUnique: vi.fn(),
  },
};

vi.mock('../../services/database.service.js', () => ({
  getDatabase: vi.fn(() => mockDb),
}));

vi.mock('../../services/logger.service.js', () => ({
  createServiceLogger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

const mockGetSeriesCoverData = vi.fn();
const mockRecalculateSeriesCover = vi.fn();

vi.mock('../../services/cover.service.js', () => ({
  getSeriesCoverData: (hash: string, webp: boolean) => mockGetSeriesCoverData(hash, webp),
  recalculateSeriesCover: (seriesId: string) => mockRecalculateSeriesCover(seriesId),
}));

// Import routes after mocking
import seriesRoutes from '../series.routes.js';

// =============================================================================
// Test Setup
// =============================================================================

describe('Series Cover Image Endpoint', () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/series', seriesRoutes);
  });

  // =============================================================================
  // GET /api/series/:id/cover-image
  // =============================================================================

  describe('GET /api/series/:id/cover-image', () => {
    it('should return 404 when series does not exist', async () => {
      mockDb.series.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/series/nonexistent/cover-image')
        .expect(404);

      expect(response.body.error).toBe('Series not found');
    });

    it('should return 404 when series has no cover (resolvedCoverSource = none)', async () => {
      mockDb.series.findUnique.mockResolvedValue({
        resolvedCoverHash: null,
        resolvedCoverSource: 'none',
        resolvedCoverFileId: null,
        coverSource: 'auto',
        coverHash: null,
        coverFileId: null,
      });

      const response = await request(app)
        .get('/api/series/series-1/cover-image')
        .expect(404);

      expect(response.body.error).toBe('No cover available');
    });

    it('should redirect 302 to file cover for firstIssue source', async () => {
      mockDb.series.findUnique.mockResolvedValue({
        resolvedCoverHash: 'hash123',
        resolvedCoverSource: 'firstIssue',
        resolvedCoverFileId: 'file-1',
        coverSource: 'auto',
        coverHash: null,
        coverFileId: null,
      });
      // Mock file exists check
      mockDb.comicFile.findUnique.mockResolvedValue({ id: 'file-1' });

      const response = await request(app)
        .get('/api/series/series-1/cover-image')
        .expect(302);

      expect(response.headers.location).toBe('/api/covers/file-1');
    });

    it('should redirect 302 to file cover for user source', async () => {
      mockDb.series.findUnique.mockResolvedValue({
        resolvedCoverHash: 'hash456',
        resolvedCoverSource: 'user',
        resolvedCoverFileId: 'file-2',
        coverSource: 'user',
        coverHash: null,
        coverFileId: 'file-2',
      });
      // Mock file exists check
      mockDb.comicFile.findUnique.mockResolvedValue({ id: 'file-2' });

      const response = await request(app)
        .get('/api/series/series-1/cover-image')
        .expect(302);

      expect(response.headers.location).toBe('/api/covers/file-2');
    });

    it('should serve image data for api source with cache headers', async () => {
      const mockImageData = Buffer.from('fake-image-data');

      mockDb.series.findUnique.mockResolvedValue({
        resolvedCoverHash: 'apihash789',
        resolvedCoverSource: 'api',
        resolvedCoverFileId: null,
        coverSource: 'api',
        coverHash: 'apihash789',
        coverFileId: null,
      });

      mockGetSeriesCoverData.mockResolvedValue({
        data: mockImageData,
        contentType: 'image/webp',
        blurPlaceholder: 'data:image/webp;base64,abc123',
      });

      const response = await request(app)
        .get('/api/series/series-1/cover-image')
        .set('Accept', 'image/webp,image/*')
        .expect(200);

      expect(response.headers['content-type']).toBe('image/webp');
      expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(response.headers['etag']).toBe('"apihash789"');
      expect(response.headers['x-blur-placeholder']).toBe('data:image/webp;base64,abc123');
      expect(response.body).toEqual(mockImageData);
      expect(mockGetSeriesCoverData).toHaveBeenCalledWith('apihash789', true);
    });

    it('should return 404 when api cover file is missing', async () => {
      mockDb.series.findUnique.mockResolvedValue({
        resolvedCoverHash: 'missinghash',
        resolvedCoverSource: 'api',
        resolvedCoverFileId: null,
        coverSource: 'api',
        coverHash: 'missinghash',
        coverFileId: null,
      });

      mockGetSeriesCoverData.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/series/series-1/cover-image')
        .expect(404);

      expect(response.body.error).toBe('Cover file not found');
    });

    it('should fallback to legacy resolution when resolved fields are null', async () => {
      // Series hasn't been backfilled yet - resolved fields are null
      mockDb.series.findUnique.mockResolvedValue({
        resolvedCoverHash: null,
        resolvedCoverSource: null,
        resolvedCoverFileId: null,
        coverSource: 'user',
        coverHash: null,
        coverFileId: 'fallback-file-1',
      });
      // Mock file exists check
      mockDb.comicFile.findUnique.mockResolvedValue({ id: 'fallback-file-1' });

      const response = await request(app)
        .get('/api/series/series-1/cover-image')
        .expect(302);

      expect(response.headers.location).toBe('/api/covers/fallback-file-1');
    });

    it('should fallback to api cover when resolved is null but coverHash exists', async () => {
      const mockImageData = Buffer.from('fallback-image');

      mockDb.series.findUnique.mockResolvedValue({
        resolvedCoverHash: null,
        resolvedCoverSource: null,
        resolvedCoverFileId: null,
        coverSource: 'auto',
        coverHash: 'fallbackhash',
        coverFileId: null,
      });

      mockGetSeriesCoverData.mockResolvedValue({
        data: mockImageData,
        contentType: 'image/jpeg',
      });

      const response = await request(app)
        .get('/api/series/series-1/cover-image')
        .expect(200);

      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(mockGetSeriesCoverData).toHaveBeenCalledWith('fallbackhash', false);
    });

    it('should request JPEG when Accept header does not include webp', async () => {
      const mockImageData = Buffer.from('jpeg-data');

      mockDb.series.findUnique.mockResolvedValue({
        resolvedCoverHash: 'jpeghash',
        resolvedCoverSource: 'api',
        resolvedCoverFileId: null,
        coverSource: 'api',
        coverHash: 'jpeghash',
        coverFileId: null,
      });

      mockGetSeriesCoverData.mockResolvedValue({
        data: mockImageData,
        contentType: 'image/jpeg',
      });

      await request(app)
        .get('/api/series/series-1/cover-image')
        .set('Accept', 'image/jpeg,image/*')
        .expect(200);

      expect(mockGetSeriesCoverData).toHaveBeenCalledWith('jpeghash', false);
    });
  });
});
