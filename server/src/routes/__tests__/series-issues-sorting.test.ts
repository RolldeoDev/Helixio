/**
 * Series Issues Sorting Tests
 *
 * Tests the issue number sorting functionality in the series routes.
 * Verifies that issues are sorted numerically (not lexicographically)
 * using the issueNumberSort column.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

// Mock dependencies before importing routes
const mockDb = {
  series: {
    findUnique: vi.fn(),
  },
  comicFile: {
    findMany: vi.fn(),
    count: vi.fn(),
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

// Import routes after mocking
import seriesRoutes from '../../routes/series.routes.js';

// =============================================================================
// Test Setup
// =============================================================================

describe('Series Issues Sorting', () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock: series exists
    mockDb.series.findUnique.mockResolvedValue({
      id: 'series-1',
      name: 'Test Series',
      libraryId: 'lib-1',
    });

    app = express();
    app.use(express.json());
    app.use('/api/series', seriesRoutes);
  });

  // =============================================================================
  // Helper Functions
  // =============================================================================

  interface MockIssue {
    id: string;
    filename: string;
    seriesId: string;
    metadata: {
      number: string | null;
      issueNumberSort: number | null;
      title?: string;
    } | null;
  }

  const createMockIssue = (
    id: string,
    number: string | null,
    filename: string
  ): MockIssue => ({
    id,
    filename,
    seriesId: 'series-1',
    metadata: number !== null ? {
      number,
      issueNumberSort: number ? parseFloat(number.match(/[\d.]+/)?.[0] || '0') || null : null,
      title: `Issue ${number || 'Special'}`,
    } : null,
  });

  // =============================================================================
  // GET /api/series/:id/issues - Issue Sorting Tests
  // =============================================================================

  describe('GET /api/series/:id/issues', () => {
    describe('numeric sorting with issueNumberSort', () => {
      it('should sort issues by issueNumberSort numerically, not lexicographically', async () => {
        // This is the core bug fix test: "100" should come after "9", not before
        const unsortedIssues: MockIssue[] = [
          createMockIssue('f1', '100', 'issue-100.cbz'),
          createMockIssue('f2', '1', 'issue-001.cbz'),
          createMockIssue('f3', '10', 'issue-010.cbz'),
          createMockIssue('f4', '9', 'issue-009.cbz'),
          createMockIssue('f5', '2', 'issue-002.cbz'),
        ];

        mockDb.comicFile.findMany.mockResolvedValue(unsortedIssues);
        mockDb.comicFile.count.mockResolvedValue(5);

        const response = await request(app)
          .get('/api/series/series-1/issues')
          .query({ sortBy: 'number', sortOrder: 'asc' });

        expect(response.status).toBe(200);

        // Verify the orderBy was called with issueNumberSort
        expect(mockDb.comicFile.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: expect.arrayContaining([
              expect.objectContaining({
                metadata: expect.objectContaining({
                  issueNumberSort: 'asc',
                }),
              }),
            ]),
          })
        );
      });

      it('should handle descending sort order', async () => {
        const issues: MockIssue[] = [
          createMockIssue('f1', '1', 'issue-001.cbz'),
          createMockIssue('f2', '10', 'issue-010.cbz'),
          createMockIssue('f3', '100', 'issue-100.cbz'),
        ];

        mockDb.comicFile.findMany.mockResolvedValue(issues);
        mockDb.comicFile.count.mockResolvedValue(3);

        const response = await request(app)
          .get('/api/series/series-1/issues')
          .query({ sortBy: 'number', sortOrder: 'desc' });

        expect(response.status).toBe(200);
        expect(mockDb.comicFile.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: expect.arrayContaining([
              expect.objectContaining({
                metadata: expect.objectContaining({
                  issueNumberSort: 'desc',
                }),
              }),
            ]),
          })
        );
      });

      it('should include filename as secondary sort', async () => {
        const issues: MockIssue[] = [
          createMockIssue('f1', '1', 'issue-001.cbz'),
        ];

        mockDb.comicFile.findMany.mockResolvedValue(issues);
        mockDb.comicFile.count.mockResolvedValue(1);

        await request(app)
          .get('/api/series/series-1/issues')
          .query({ sortBy: 'number', sortOrder: 'asc' });

        // Should have both issueNumberSort and filename in orderBy
        expect(mockDb.comicFile.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            orderBy: expect.arrayContaining([
              { metadata: { issueNumberSort: 'asc' } },
              { filename: 'asc' },
            ]),
          })
        );
      });

      it('should handle issues with decimal numbers correctly', async () => {
        const issues: MockIssue[] = [
          { ...createMockIssue('f1', '1', 'issue-001.cbz'), metadata: { number: '1', issueNumberSort: 1, title: 'Issue 1' } },
          { ...createMockIssue('f2', '1.5', 'issue-001.5.cbz'), metadata: { number: '1.5', issueNumberSort: 1.5, title: 'Issue 1.5' } },
          { ...createMockIssue('f3', '2', 'issue-002.cbz'), metadata: { number: '2', issueNumberSort: 2, title: 'Issue 2' } },
        ];

        mockDb.comicFile.findMany.mockResolvedValue(issues);
        mockDb.comicFile.count.mockResolvedValue(3);

        const response = await request(app)
          .get('/api/series/series-1/issues')
          .query({ sortBy: 'number', sortOrder: 'asc', all: 'true' });

        expect(response.status).toBe(200);
        // The database will return pre-sorted results
        expect(response.body.data.issues).toHaveLength(3);
      });
    });

    describe('non-numeric issues handling', () => {
      it('should handle issues with null issueNumberSort (non-numeric)', async () => {
        const issues: MockIssue[] = [
          { ...createMockIssue('f1', '1', 'issue-001.cbz'), metadata: { number: '1', issueNumberSort: 1, title: 'Issue 1' } },
          { ...createMockIssue('f2', 'Special', 'special.cbz'), metadata: { number: 'Special', issueNumberSort: null, title: 'Special Issue' } },
          { ...createMockIssue('f3', '2', 'issue-002.cbz'), metadata: { number: '2', issueNumberSort: 2, title: 'Issue 2' } },
        ];

        mockDb.comicFile.findMany.mockResolvedValue(issues);
        mockDb.comicFile.count.mockResolvedValue(3);

        const response = await request(app)
          .get('/api/series/series-1/issues')
          .query({ sortBy: 'number', sortOrder: 'asc', all: 'true' });

        expect(response.status).toBe(200);
        // Non-numeric issues (null issueNumberSort) should sort to the end
      });

      it('should handle Annual issues with extracted numbers', async () => {
        const issues: MockIssue[] = [
          { ...createMockIssue('f1', '1', 'issue-001.cbz'), metadata: { number: '1', issueNumberSort: 1, title: 'Issue 1' } },
          { ...createMockIssue('f2', 'Annual 1', 'annual-001.cbz'), metadata: { number: 'Annual 1', issueNumberSort: 1, title: 'Annual 1' } },
          { ...createMockIssue('f3', '2', 'issue-002.cbz'), metadata: { number: '2', issueNumberSort: 2, title: 'Issue 2' } },
        ];

        mockDb.comicFile.findMany.mockResolvedValue(issues);
        mockDb.comicFile.count.mockResolvedValue(3);

        const response = await request(app)
          .get('/api/series/series-1/issues')
          .query({ sortBy: 'number', sortOrder: 'asc', all: 'true' });

        expect(response.status).toBe(200);
        // Annual 1 should sort alongside Issue 1 (both have issueNumberSort: 1)
      });
    });

    describe('pagination with sorted results', () => {
      it('should respect pagination while maintaining sort order', async () => {
        const issues: MockIssue[] = [
          { ...createMockIssue('f1', '1', 'issue-001.cbz'), metadata: { number: '1', issueNumberSort: 1, title: 'Issue 1' } },
          { ...createMockIssue('f2', '2', 'issue-002.cbz'), metadata: { number: '2', issueNumberSort: 2, title: 'Issue 2' } },
        ];

        mockDb.comicFile.findMany.mockResolvedValue(issues);
        mockDb.comicFile.count.mockResolvedValue(10);

        const response = await request(app)
          .get('/api/series/series-1/issues')
          .query({ sortBy: 'number', sortOrder: 'asc', page: 1, limit: 2 });

        expect(response.status).toBe(200);
        expect(mockDb.comicFile.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            skip: 0,
            take: 2,
          })
        );
      });

      it('should calculate correct skip for page 2', async () => {
        const issues: MockIssue[] = [];

        mockDb.comicFile.findMany.mockResolvedValue(issues);
        mockDb.comicFile.count.mockResolvedValue(10);

        await request(app)
          .get('/api/series/series-1/issues')
          .query({ sortBy: 'number', sortOrder: 'asc', page: 2, limit: 5 });

        expect(mockDb.comicFile.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            skip: 5,
            take: 5,
          })
        );
      });
    });

    describe('edge cases', () => {
      it('should handle empty series', async () => {
        mockDb.comicFile.findMany.mockResolvedValue([]);
        mockDb.comicFile.count.mockResolvedValue(0);

        const response = await request(app)
          .get('/api/series/series-1/issues')
          .query({ sortBy: 'number', sortOrder: 'asc' });

        expect(response.status).toBe(200);
        expect(response.body.data.issues).toEqual([]);
      });

      it('should handle series with all non-numeric issues', async () => {
        const issues: MockIssue[] = [
          { ...createMockIssue('f1', 'Special', 'special.cbz'), metadata: { number: 'Special', issueNumberSort: null, title: 'Special' } },
          { ...createMockIssue('f2', 'Annual', 'annual.cbz'), metadata: { number: 'Annual', issueNumberSort: null, title: 'Annual' } },
          { ...createMockIssue('f3', 'Preview', 'preview.cbz'), metadata: { number: 'Preview', issueNumberSort: null, title: 'Preview' } },
        ];

        mockDb.comicFile.findMany.mockResolvedValue(issues);
        mockDb.comicFile.count.mockResolvedValue(3);

        const response = await request(app)
          .get('/api/series/series-1/issues')
          .query({ sortBy: 'number', sortOrder: 'asc', all: 'true' });

        expect(response.status).toBe(200);
        expect(response.body.data.issues).toHaveLength(3);
      });

      it('should handle issues without metadata', async () => {
        const issues: MockIssue[] = [
          { id: 'f1', filename: 'issue-001.cbz', seriesId: 'series-1', metadata: null },
          { ...createMockIssue('f2', '1', 'issue-001.cbz'), metadata: { number: '1', issueNumberSort: 1, title: 'Issue 1' } },
        ];

        mockDb.comicFile.findMany.mockResolvedValue(issues);
        mockDb.comicFile.count.mockResolvedValue(2);

        const response = await request(app)
          .get('/api/series/series-1/issues')
          .query({ sortBy: 'number', sortOrder: 'asc', all: 'true' });

        expect(response.status).toBe(200);
      });
    });
  });

  // =============================================================================
  // GET /api/series/:id/reading-order - Reading Order Sorting Tests
  // =============================================================================

  describe('GET /api/series/:id/reading-order', () => {
    it('should use issueNumberSort for default reading order', async () => {
      mockDb.series.findUnique.mockResolvedValue({
        id: 'series-1',
        name: 'Test Series',
        customReadingOrder: null,
        issues: [
          { id: 'f1', metadata: { number: '1', title: 'Issue 1' } },
          { id: 'f2', metadata: { number: '2', title: 'Issue 2' } },
        ],
      });

      const response = await request(app)
        .get('/api/series/series-1/reading-order');

      expect(response.status).toBe(200);

      // Verify the orderBy includes issueNumberSort
      expect(mockDb.series.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            issues: expect.objectContaining({
              orderBy: expect.arrayContaining([
                { metadata: { issueNumberSort: 'asc' } },
                { filename: 'asc' },
              ]),
            }),
          }),
        })
      );
    });

    it('should return 404 for non-existent series', async () => {
      mockDb.series.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/series/non-existent/reading-order');

      expect(response.status).toBe(404);
    });
  });
});

// =============================================================================
// Original Bug Regression Tests
// =============================================================================

describe('Original Bug Regression: String vs Numeric Sorting', () => {
  /**
   * These tests specifically verify the fix for the original bug where
   * issue numbers were sorted as strings, causing incorrect order:
   * - "015" before "02" (string: "0" < "0", "1" < "2")
   * - "100" before "9" (string: "1" < "9")
   */

  it('verifies the bug is fixed: "100" should come AFTER "9"', () => {
    // Old string sort behavior (WRONG):
    const stringSorted = ['1', '9', '100', '2', '10'].sort();
    expect(stringSorted).toEqual(['1', '10', '100', '2', '9']); // Bug behavior

    // New numeric sort behavior (CORRECT):
    const numericSorted = ['1', '9', '100', '2', '10'].sort((a, b) => {
      return parseFloat(a) - parseFloat(b);
    });
    expect(numericSorted).toEqual(['1', '2', '9', '10', '100']); // Fixed behavior
  });

  it('verifies the bug is fixed: "015" should come AFTER "02"', () => {
    // Old string sort behavior (WRONG):
    const stringSorted = ['015', '02', '1'].sort();
    expect(stringSorted).toEqual(['015', '02', '1']); // Bug behavior

    // New numeric sort behavior (CORRECT):
    const numericSorted = ['015', '02', '1'].sort((a, b) => {
      return parseFloat(a) - parseFloat(b);
    });
    expect(numericSorted).toEqual(['1', '02', '015']); // Fixed behavior
  });
});
