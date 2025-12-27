/**
 * Series Service Tests
 *
 * Comprehensive tests for Series CRUD operations, field locking,
 * alias management, progress tracking, and duplicate detection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrismaClient, createMockSeriesRecord, createMockComicFile } from './__mocks__/prisma.mock.js';

// =============================================================================
// Module Mocks
// =============================================================================

const mockDb = createMockPrismaClient();
vi.mock('../database.service.js', () => ({
  getDatabase: vi.fn(() => mockDb),
}));

// Mock series-metadata service
vi.mock('../series-metadata.service.js', () => ({
  readSeriesJson: vi.fn().mockResolvedValue({ success: false }),
  writeSeriesJson: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock cover service
vi.mock('../cover.service.js', () => ({
  downloadApiCover: vi.fn().mockResolvedValue({
    success: true,
    coverHash: 'mock-cover-hash-123',
  }),
}));

// =============================================================================
// Import after mocks
// =============================================================================

import {
  createSeries,
  getSeries,
  getSeriesByIdentity,
  getSeriesList,
  updateSeries,
  deleteSeries,
  searchSeries,
  lockField,
  unlockField,
  getFieldSources,
  addAlias,
  removeAlias,
  findSeriesByAlias,
  getSeriesProgress,
  updateSeriesProgress,
  mergeSeries,
  bulkRelinkFiles,
  getAllPublishers,
  getAllGenres,
  normalizeSeriesName,
  calculateNameSimilarity,
} from '../series/index.js';

// =============================================================================
// Tests
// =============================================================================

describe('Series Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // CRUD Operations
  // ===========================================================================

  describe('createSeries', () => {
    it('should create a new series', async () => {
      // New implementation uses findMany for case-insensitive check
      mockDb.series.findMany.mockResolvedValue([]);
      mockDb.series.create.mockResolvedValue(
        createMockSeriesRecord({ id: 'new-series-id' })
      );

      const series = await createSeries({
        name: 'Batman',
        publisher: 'DC Comics',
        startYear: 2011,
      });

      expect(mockDb.series.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Batman',
            publisher: 'DC Comics',
            startYear: 2011,
          }),
        })
      );
      expect(series.id).toBe('new-series-id');
    });

    it('should throw error if series already exists', async () => {
      // New implementation uses findMany for case-insensitive check
      mockDb.series.findMany.mockResolvedValue([
        createMockSeriesRecord({ name: 'Batman', publisher: 'DC Comics' })
      ]);

      await expect(
        createSeries({ name: 'Batman', publisher: 'DC Comics' })
      ).rejects.toThrow('already exists');
    });

    it('should allow same name with different publisher', async () => {
      // New implementation uses findMany for case-insensitive check
      mockDb.series.findMany.mockResolvedValue([]);
      mockDb.series.create.mockResolvedValue(
        createMockSeriesRecord({ name: 'Batman', publisher: 'Marvel Comics' })
      );

      await createSeries({ name: 'Batman', publisher: 'Marvel Comics' });

      expect(mockDb.series.create).toHaveBeenCalled();
    });

    it('should set default type to western', async () => {
      // New implementation uses findMany for case-insensitive check
      mockDb.series.findMany.mockResolvedValue([]);
      mockDb.series.create.mockResolvedValue(createMockSeriesRecord());

      await createSeries({ name: 'Batman' });

      expect(mockDb.series.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'western',
          }),
        })
      );
    });

    it('should restore soft-deleted series instead of throwing error', async () => {
      // When a soft-deleted series exists with same identity, it should be restored
      const softDeletedSeries = createMockSeriesRecord({
        name: 'Batman',
        publisher: 'DC Comics',
        deletedAt: new Date('2024-01-01'),
      });
      mockDb.series.findMany.mockResolvedValue([softDeletedSeries]);
      mockDb.series.update.mockResolvedValue({
        ...softDeletedSeries,
        deletedAt: null,
      });
      mockDb.collectionItem.updateMany.mockResolvedValue({ count: 0 });

      const series = await createSeries({ name: 'Batman', publisher: 'DC Comics' });

      expect(mockDb.series.update).toHaveBeenCalled();
      expect(series.deletedAt).toBeNull();
    });
  });

  describe('getSeries', () => {
    it('should return series with issue count and progress', async () => {
      mockDb.series.findUnique.mockResolvedValue({
        ...createMockSeriesRecord(),
        _count: { issues: 52 },
        progress: [{ userId: 'user-1', seriesId: 'series-1', totalOwned: 52, totalRead: 10 }],
      });

      const series = await getSeries('series-1');

      expect(series).not.toBeNull();
      expect(series?._count?.issues).toBe(52);
      // Progress is now an array since it's per-user
      const progress = Array.isArray(series?.progress) ? series.progress[0] : series?.progress;
      expect(progress?.totalRead).toBe(10);
    });

    it('should return null for non-existent series', async () => {
      mockDb.series.findUnique.mockResolvedValue(null);

      const series = await getSeries('non-existent');

      expect(series).toBeNull();
    });
  });

  describe('getSeriesByIdentity', () => {
    it('should find series by name and publisher (case-insensitive)', async () => {
      // New implementation uses findMany and filters in JS for case-insensitive matching
      mockDb.series.findMany.mockResolvedValue([
        createMockSeriesRecord({ name: 'Batman', publisher: 'DC Comics' })
      ]);

      const series = await getSeriesByIdentity('Batman', 2011, 'DC Comics');

      expect(series).not.toBeNull();
      expect(series?.name).toBe('Batman');
      expect(mockDb.series.findMany).toHaveBeenCalled();
    });

    it('should ignore year parameter (identity is name + publisher only)', async () => {
      // New implementation uses findMany and filters in JS for case-insensitive matching
      mockDb.series.findMany.mockResolvedValue([
        createMockSeriesRecord({ name: 'Batman', publisher: 'DC Comics' })
      ]);

      const series = await getSeriesByIdentity('Batman', 2020, 'DC Comics');

      expect(series).not.toBeNull();
      expect(mockDb.series.findMany).toHaveBeenCalled();
    });

    it('should match case-insensitively', async () => {
      // New implementation does case-insensitive matching in JS
      mockDb.series.findMany.mockResolvedValue([
        createMockSeriesRecord({ name: 'BATMAN', publisher: 'DC COMICS' })
      ]);

      const series = await getSeriesByIdentity('batman', 2011, 'dc comics');

      expect(series).not.toBeNull();
      expect(series?.name).toBe('BATMAN');
    });

    it('should return null when no match found', async () => {
      mockDb.series.findMany.mockResolvedValue([]);

      const series = await getSeriesByIdentity('NonExistent', null, null);

      expect(series).toBeNull();
    });
  });

  describe('updateSeries', () => {
    it('should update series fields', async () => {
      mockDb.series.findUnique.mockResolvedValue(createMockSeriesRecord());
      mockDb.series.update.mockResolvedValue(
        createMockSeriesRecord({ summary: 'Updated summary' })
      );

      const updated = await updateSeries('series-1', {
        summary: 'Updated summary',
      });

      expect(mockDb.series.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'series-1' },
          data: expect.objectContaining({
            summary: 'Updated summary',
          }),
        })
      );
    });

    it('should respect locked fields when respectLocks is true', async () => {
      mockDb.series.findUnique.mockResolvedValue(
        createMockSeriesRecord({ lockedFields: 'summary,publisher' })
      );
      mockDb.series.update.mockResolvedValue(createMockSeriesRecord());

      await updateSeries(
        'series-1',
        { summary: 'New summary', name: 'New Name' },
        true
      );

      // summary should be filtered out, name should remain
      expect(mockDb.series.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'New Name',
          }),
        })
      );
    });

    it('should throw error for non-existent series', async () => {
      mockDb.series.findUnique.mockResolvedValue(null);

      await expect(updateSeries('non-existent', { name: 'Test' })).rejects.toThrow(
        'not found'
      );
    });
  });

  describe('deleteSeries', () => {
    it('should delete series', async () => {
      mockDb.series.delete.mockResolvedValue({});

      await deleteSeries('series-1');

      expect(mockDb.series.delete).toHaveBeenCalledWith({
        where: { id: 'series-1' },
      });
    });
  });

  describe('searchSeries', () => {
    it('should search by name and aliases', async () => {
      mockDb.series.findMany.mockResolvedValue([
        createMockSeriesRecord({ name: 'Batman' }),
        createMockSeriesRecord({ name: 'Batgirl', aliases: 'The Batgirl' }),
      ]);

      const results = await searchSeries('Bat');

      expect(mockDb.series.findMany).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          OR: [{ name: { contains: 'Bat' } }, { aliases: { contains: 'Bat' } }],
        },
        take: 10,
        orderBy: { name: 'asc' },
      });
      expect(results).toHaveLength(2);
    });

    it('should respect limit parameter', async () => {
      mockDb.series.findMany.mockResolvedValue([]);

      await searchSeries('Batman', 5);

      expect(mockDb.series.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
        })
      );
    });
  });

  // ===========================================================================
  // Field Locking Tests
  // ===========================================================================

  describe('lockField', () => {
    it('should lock a field', async () => {
      mockDb.series.findUnique.mockResolvedValue(
        createMockSeriesRecord({ lockedFields: null, fieldSources: null })
      );
      mockDb.series.update.mockResolvedValue(createMockSeriesRecord());

      await lockField('series-1', 'summary');

      expect(mockDb.series.update).toHaveBeenCalledWith({
        where: { id: 'series-1' },
        data: expect.objectContaining({
          lockedFields: 'summary',
        }),
      });
    });

    it('should add to existing locked fields', async () => {
      mockDb.series.findUnique.mockResolvedValue(
        createMockSeriesRecord({ lockedFields: 'publisher', fieldSources: '{}' })
      );
      mockDb.series.update.mockResolvedValue(createMockSeriesRecord());

      await lockField('series-1', 'summary');

      expect(mockDb.series.update).toHaveBeenCalledWith({
        where: { id: 'series-1' },
        data: expect.objectContaining({
          lockedFields: 'publisher,summary',
        }),
      });
    });

    it('should not duplicate locked field', async () => {
      mockDb.series.findUnique.mockResolvedValue(
        createMockSeriesRecord({ lockedFields: 'summary' })
      );

      await lockField('series-1', 'summary');

      expect(mockDb.series.update).not.toHaveBeenCalled();
    });
  });

  describe('unlockField', () => {
    it('should unlock a field', async () => {
      mockDb.series.findUnique.mockResolvedValue(
        createMockSeriesRecord({
          lockedFields: 'summary,publisher',
          fieldSources: '{"summary": {"source": "manual", "lockedAt": "2024-01-01"}}',
        })
      );
      mockDb.series.update.mockResolvedValue(createMockSeriesRecord());

      await unlockField('series-1', 'summary');

      expect(mockDb.series.update).toHaveBeenCalledWith({
        where: { id: 'series-1' },
        data: expect.objectContaining({
          lockedFields: 'publisher',
        }),
      });
    });

    it('should set lockedFields to null when last field unlocked', async () => {
      mockDb.series.findUnique.mockResolvedValue(
        createMockSeriesRecord({ lockedFields: 'summary', fieldSources: '{}' })
      );
      mockDb.series.update.mockResolvedValue(createMockSeriesRecord());

      await unlockField('series-1', 'summary');

      expect(mockDb.series.update).toHaveBeenCalledWith({
        where: { id: 'series-1' },
        data: expect.objectContaining({
          lockedFields: null,
        }),
      });
    });
  });

  describe('getFieldSources', () => {
    it('should return field sources', async () => {
      mockDb.series.findUnique.mockResolvedValue(
        createMockSeriesRecord({
          fieldSources: '{"summary": {"source": "api"}, "publisher": {"source": "manual"}}',
        })
      );

      const sources = await getFieldSources('series-1');

      expect(sources.summary!.source).toBe('api');
      expect(sources.publisher!.source).toBe('manual');
    });

    it('should return empty object if no field sources', async () => {
      mockDb.series.findUnique.mockResolvedValue(
        createMockSeriesRecord({ fieldSources: null })
      );

      const sources = await getFieldSources('series-1');

      expect(sources).toEqual({});
    });
  });

  // ===========================================================================
  // Alias Management Tests
  // ===========================================================================

  describe('addAlias', () => {
    it('should add a new alias', async () => {
      mockDb.series.findUnique.mockResolvedValue(
        createMockSeriesRecord({ aliases: null })
      );
      mockDb.series.update.mockResolvedValue(createMockSeriesRecord());

      await addAlias('series-1', 'The Dark Knight');

      expect(mockDb.series.update).toHaveBeenCalledWith({
        where: { id: 'series-1' },
        data: { aliases: 'The Dark Knight' },
      });
    });

    it('should append to existing aliases', async () => {
      mockDb.series.findUnique.mockResolvedValue(
        createMockSeriesRecord({ aliases: 'Caped Crusader' })
      );
      mockDb.series.update.mockResolvedValue(createMockSeriesRecord());

      await addAlias('series-1', 'The Dark Knight');

      expect(mockDb.series.update).toHaveBeenCalledWith({
        where: { id: 'series-1' },
        data: { aliases: 'Caped Crusader,The Dark Knight' },
      });
    });

    it('should not duplicate alias', async () => {
      mockDb.series.findUnique.mockResolvedValue(
        createMockSeriesRecord({ aliases: 'The Dark Knight' })
      );

      await addAlias('series-1', 'The Dark Knight');

      expect(mockDb.series.update).not.toHaveBeenCalled();
    });
  });

  describe('removeAlias', () => {
    it('should remove an alias', async () => {
      mockDb.series.findUnique.mockResolvedValue(
        createMockSeriesRecord({ aliases: 'The Dark Knight, Caped Crusader' })
      );
      mockDb.series.update.mockResolvedValue(createMockSeriesRecord());

      await removeAlias('series-1', 'The Dark Knight');

      expect(mockDb.series.update).toHaveBeenCalledWith({
        where: { id: 'series-1' },
        data: { aliases: 'Caped Crusader' },
      });
    });

    it('should set aliases to null when last alias removed', async () => {
      mockDb.series.findUnique.mockResolvedValue(
        createMockSeriesRecord({ aliases: 'The Dark Knight' })
      );
      mockDb.series.update.mockResolvedValue(createMockSeriesRecord());

      await removeAlias('series-1', 'The Dark Knight');

      expect(mockDb.series.update).toHaveBeenCalledWith({
        where: { id: 'series-1' },
        data: { aliases: null },
      });
    });
  });

  describe('findSeriesByAlias', () => {
    it('should find series by alias', async () => {
      mockDb.series.findFirst.mockResolvedValue(
        createMockSeriesRecord({ name: 'Batman', aliases: 'The Dark Knight' })
      );

      const series = await findSeriesByAlias('The Dark Knight');

      expect(series).not.toBeNull();
      expect(mockDb.series.findFirst).toHaveBeenCalledWith({
        where: { aliases: { contains: 'The Dark Knight' }, deletedAt: null },
      });
    });
  });

  // ===========================================================================
  // Progress Tracking Tests
  // ===========================================================================

  describe('getSeriesProgress', () => {
    it('should return existing progress for user', async () => {
      mockDb.seriesProgress.findUnique.mockResolvedValue({
        userId: 'user-1',
        seriesId: 'series-1',
        totalOwned: 52,
        totalRead: 10,
        totalInProgress: 2,
      });

      const progress = await getSeriesProgress('user-1', 'series-1');

      expect(progress).not.toBeNull();
      expect(progress?.totalOwned).toBe(52);
    });

    it('should create progress if not exists for user', async () => {
      mockDb.seriesProgress.findUnique.mockResolvedValue(null);
      mockDb.comicFile.count.mockResolvedValue(10);
      mockDb.seriesProgress.create.mockResolvedValue({
        userId: 'user-1',
        seriesId: 'series-1',
        totalOwned: 10,
        totalRead: 0,
        totalInProgress: 0,
      });

      const progress = await getSeriesProgress('user-1', 'series-1');

      expect(mockDb.seriesProgress.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          seriesId: 'series-1',
          totalOwned: 10,
          totalRead: 0,
        }),
      });
    });
  });

  // ===========================================================================
  // Merge and Bulk Operations Tests
  // ===========================================================================

  describe('mergeSeries', () => {
    it('should merge source series into target', async () => {
      mockDb.series.findUnique.mockResolvedValue(createMockSeriesRecord());
      mockDb.comicFile.updateMany.mockResolvedValue({ count: 10 });
      mockDb.series.delete.mockResolvedValue({});
      mockDb.comicFile.findMany.mockResolvedValue([]);
      mockDb.seriesProgress.upsert.mockResolvedValue({});

      await mergeSeries(['source-1', 'source-2'], 'target-1');

      expect(mockDb.comicFile.updateMany).toHaveBeenCalledTimes(2);
      expect(mockDb.series.delete).toHaveBeenCalledTimes(2);
    });

    it('should throw error if target not found', async () => {
      mockDb.series.findUnique.mockResolvedValue(null);

      await expect(mergeSeries(['source-1'], 'non-existent')).rejects.toThrow(
        'not found'
      );
    });

    it('should skip if source equals target', async () => {
      mockDb.series.findUnique.mockResolvedValue(createMockSeriesRecord());
      mockDb.comicFile.findMany.mockResolvedValue([]);
      mockDb.seriesProgress.upsert.mockResolvedValue({});

      await mergeSeries(['target-1'], 'target-1');

      expect(mockDb.comicFile.updateMany).not.toHaveBeenCalled();
      expect(mockDb.series.delete).not.toHaveBeenCalled();
    });
  });

  describe('bulkRelinkFiles', () => {
    it('should relink files to new series', async () => {
      mockDb.comicFile.updateMany.mockResolvedValue({ count: 5 });
      mockDb.comicFile.findMany.mockResolvedValue([]);
      mockDb.seriesProgress.upsert.mockResolvedValue({});

      const count = await bulkRelinkFiles(['file-1', 'file-2', 'file-3'], 'series-1');

      expect(mockDb.comicFile.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['file-1', 'file-2', 'file-3'] } },
        data: { seriesId: 'series-1' },
      });
      expect(count).toBe(5);
    });
  });

  describe('getAllPublishers', () => {
    it('should return unique publishers', async () => {
      mockDb.series.findMany.mockResolvedValue([
        { publisher: 'DC Comics' },
        { publisher: 'Marvel Comics' },
        { publisher: 'Image Comics' },
      ]);

      const publishers = await getAllPublishers();

      expect(publishers).toEqual(['DC Comics', 'Image Comics', 'Marvel Comics']);
    });
  });

  describe('getAllGenres', () => {
    it('should return unique genres from comma-separated fields', async () => {
      mockDb.series.findMany.mockResolvedValue([
        { genres: 'Superhero, Action' },
        { genres: 'Horror, Superhero' },
        { genres: 'Comedy' },
      ]);

      const genres = await getAllGenres();

      expect(genres).toEqual(['Action', 'Comedy', 'Horror', 'Superhero']);
    });
  });

  // ===========================================================================
  // Name Normalization and Similarity Tests
  // ===========================================================================

  describe('normalizeSeriesName', () => {
    it('should lowercase and trim', () => {
      expect(normalizeSeriesName('  BATMAN  ')).toBe('batman');
    });

    it('should remove special characters', () => {
      expect(normalizeSeriesName("Batman: The Dark Knight's Return")).toBe(
        'batman the dark knights return'
      );
    });

    it('should remove trailing year', () => {
      expect(normalizeSeriesName('Batman 2011')).toBe('batman');
      expect(normalizeSeriesName('Spider-Man 2099')).toBe('spiderman');
    });

    it('should remove leading "The"', () => {
      expect(normalizeSeriesName('The Amazing Spider-Man')).toBe('amazing spiderman');
    });
  });

  describe('calculateNameSimilarity', () => {
    it('should return 1 for identical names', () => {
      expect(calculateNameSimilarity('Batman', 'Batman')).toBe(1);
    });

    it('should return 1 for normalized-identical names', () => {
      expect(calculateNameSimilarity('BATMAN', 'batman')).toBe(1);
      expect(calculateNameSimilarity('Batman 2011', 'Batman')).toBe(1);
    });

    it('should return high similarity for similar names', () => {
      const similarity = calculateNameSimilarity('Batman', 'Batmam');
      expect(similarity).toBeGreaterThan(0.8);
    });

    it('should return low similarity for different names', () => {
      const similarity = calculateNameSimilarity('Batman', 'Superman');
      expect(similarity).toBeLessThan(0.5);
    });
  });
});
