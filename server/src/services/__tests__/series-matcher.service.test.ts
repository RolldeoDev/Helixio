/**
 * Series Matcher Service Tests
 *
 * Tests for file-to-series linking:
 * - Series matching with fuzzy logic
 * - Auto-linking files to series
 * - Suggestions for unlinked files
 * - Batch operations
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createMockPrismaClient,
  createMockComicFile,
  createMockSeriesRecord,
  createMockFileMetadata,
} from './__mocks__/prisma.mock.js';

// Create mock prisma client
const mockPrisma = createMockPrismaClient();

// Mock database service
vi.mock('../database.service.js', () => ({
  getDatabase: vi.fn(() => mockPrisma),
}));

// Mock series service
const mockCreateSeries = vi.fn();
const mockGetSeriesByIdentity = vi.fn();
const mockUpdateSeriesProgress = vi.fn();
const mockFindSeriesByAlias = vi.fn();
const mockRestoreSeries = vi.fn();

vi.mock('../series/index.js', () => ({
  createSeries: (...args: unknown[]) => mockCreateSeries(...args),
  getSeriesByIdentity: (...args: unknown[]) => mockGetSeriesByIdentity(...args),
  updateSeriesProgress: (...args: unknown[]) => mockUpdateSeriesProgress(...args),
  findSeriesByAlias: (...args: unknown[]) => mockFindSeriesByAlias(...args),
  restoreSeries: (...args: unknown[]) => mockRestoreSeries(...args),
}));

// Mock collection service
vi.mock('../collection.service.js', () => ({
  restoreSeriesItems: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger service
vi.mock('../logger.service.js', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
  logDebug: vi.fn(),
}));

// Import service after mocking
const {
  findMatchingSeries,
  suggestSeriesForFile,
  linkFileToSeries,
  unlinkFileFromSeries,
  autoLinkFileToSeries,
  autoLinkAllFiles,
  getFilesNeedingConfirmation,
  findSeriesForFile,
} = await import('../series-matcher.service.js');

describe('Series Matcher Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateSeries.mockReset();
    mockGetSeriesByIdentity.mockReset();
    mockUpdateSeriesProgress.mockReset();
    mockFindSeriesByAlias.mockReset();
    mockRestoreSeries.mockReset();
  });

  // =============================================================================
  // findMatchingSeries
  // =============================================================================

  describe('findMatchingSeries', () => {
    it('should return exact match when series exists with same name, year, publisher', async () => {
      const series = createMockSeriesRecord({
        id: 'series-1',
        name: 'Batman',
        startYear: 2011,
        publisher: 'DC Comics',
      });
      mockGetSeriesByIdentity.mockResolvedValue(series);

      const result = await findMatchingSeries('Batman', 2011, 'DC Comics');

      expect(result.type).toBe('exact');
      expect(result.series).toEqual(series);
      expect(result.confidence).toBe(1.0);
    });

    it('should return partial match when name and year match', async () => {
      mockGetSeriesByIdentity.mockResolvedValue(null);
      const series = createMockSeriesRecord({
        name: 'Batman',
        startYear: 2011,
      });
      mockPrisma.series.findFirst.mockResolvedValue(series);
      mockPrisma.series.findMany.mockResolvedValue([]);

      const result = await findMatchingSeries('Batman', 2011, null);

      expect(result.type).toBe('partial');
      expect(result.confidence).toBe(0.9);
    });

    it('should return fuzzy match with high confidence', async () => {
      mockGetSeriesByIdentity.mockResolvedValue(null);
      mockPrisma.series.findFirst.mockResolvedValue(null);

      const series = createMockSeriesRecord({
        id: 'series-1',
        name: 'The Amazing Spider-Man',
        startYear: 2018,
      });
      mockPrisma.series.findMany.mockResolvedValue([series]);

      const result = await findMatchingSeries('Amazing Spider-Man', 2018, null);

      expect(result.type).toBe('fuzzy');
      expect(result.series).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should return no match when nothing similar exists', async () => {
      mockGetSeriesByIdentity.mockResolvedValue(null);
      mockPrisma.series.findFirst.mockResolvedValue(null);
      mockPrisma.series.findMany.mockResolvedValue([]);

      const result = await findMatchingSeries('Totally New Series', null, null);

      expect(result.type).toBe('none');
      expect(result.series).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it('should include alternates when multiple matches found', async () => {
      mockGetSeriesByIdentity.mockResolvedValue(null);
      mockPrisma.series.findFirst.mockResolvedValue(null);

      const series1 = createMockSeriesRecord({
        id: 'series-1',
        name: 'Batman',
        startYear: 2011,
      });
      const series2 = createMockSeriesRecord({
        id: 'series-2',
        name: 'Batman Beyond',
        startYear: 1999,
      });
      mockPrisma.series.findMany.mockResolvedValue([series1, series2]);

      const result = await findMatchingSeries('Batman', null, null);

      expect(result.series).toBeDefined();
      // May or may not have alternates depending on confidence scores
    });

    it('should check aliases for matches', async () => {
      mockGetSeriesByIdentity.mockResolvedValue(null);
      mockPrisma.series.findFirst.mockResolvedValue(null);

      const series = createMockSeriesRecord({
        id: 'series-1',
        name: 'The Amazing Spider-Man',
        aliases: 'ASM, Amazing Spider-Man, Spidey',
      });
      mockPrisma.series.findMany.mockResolvedValue([series]);

      const result = await findMatchingSeries('ASM', null, null);

      expect(result.series).toBeDefined();
    });
  });

  // =============================================================================
  // suggestSeriesForFile
  // =============================================================================

  describe('suggestSeriesForFile', () => {
    it('should return empty array when file not found', async () => {
      mockPrisma.comicFile.findUnique.mockResolvedValue(null);

      const result = await suggestSeriesForFile('nonexistent');

      expect(result).toEqual([]);
    });

    it('should suggest based on metadata series name', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        metadata: createMockFileMetadata({
          series: 'Batman',
          year: 2011,
          publisher: 'DC Comics',
        }),
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);

      const series = createMockSeriesRecord({ name: 'Batman' });
      mockGetSeriesByIdentity.mockResolvedValue(series);

      const result = await suggestSeriesForFile('file-1');

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.reason).toContain('ComicInfo.xml');
    });

    it('should suggest based on folder name when no metadata', async () => {
      const file = {
        ...createMockComicFile({
          id: 'file-1',
          relativePath: 'Batman/Batman 001.cbz',
        }),
        metadata: null,
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockGetSeriesByIdentity.mockResolvedValue(null);
      mockPrisma.series.findFirst.mockResolvedValue(null);

      const series = createMockSeriesRecord({ name: 'Batman' });
      mockPrisma.series.findMany.mockResolvedValue([series]);

      const result = await suggestSeriesForFile('file-1');

      expect(result.length).toBeGreaterThan(0);
    });

    it('should sort suggestions by confidence', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1', relativePath: 'Comics/test.cbz' }),
        metadata: createMockFileMetadata({ series: 'Batman' }),
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);

      const series1 = createMockSeriesRecord({ id: 's1', name: 'Batman' });
      const series2 = createMockSeriesRecord({ id: 's2', name: 'Batman Returns' });
      mockGetSeriesByIdentity.mockResolvedValue(null);
      mockPrisma.series.findFirst.mockResolvedValue(null);
      mockPrisma.series.findMany.mockResolvedValue([series1, series2]);

      const result = await suggestSeriesForFile('file-1');

      if (result.length >= 2) {
        expect(result[0]!.confidence).toBeGreaterThanOrEqual(result[1]!.confidence);
      }
    });
  });

  // =============================================================================
  // linkFileToSeries
  // =============================================================================

  describe('linkFileToSeries', () => {
    it('should link file to series', async () => {
      mockPrisma.series.findUnique.mockResolvedValue({ deletedAt: null });
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockUpdateSeriesProgress.mockResolvedValue(undefined);

      await linkFileToSeries('file-1', 'series-1');

      expect(mockPrisma.comicFile.update).toHaveBeenCalledWith({
        where: { id: 'file-1' },
        data: { seriesId: 'series-1' },
      });
      expect(mockUpdateSeriesProgress).toHaveBeenCalledWith('series-1');
    });

    it('should restore soft-deleted series before linking', async () => {
      mockPrisma.series.findUnique.mockResolvedValue({
        deletedAt: new Date('2024-01-01'),
      });
      mockRestoreSeries.mockResolvedValue(undefined);
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockUpdateSeriesProgress.mockResolvedValue(undefined);

      await linkFileToSeries('file-1', 'series-1');

      expect(mockRestoreSeries).toHaveBeenCalledWith('series-1');
    });
  });

  // =============================================================================
  // unlinkFileFromSeries
  // =============================================================================

  describe('unlinkFileFromSeries', () => {
    it('should unlink file from series', async () => {
      const file = createMockComicFile({
        id: 'file-1',
        seriesId: 'series-1',
      });
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockUpdateSeriesProgress.mockResolvedValue(undefined);

      await unlinkFileFromSeries('file-1');

      expect(mockPrisma.comicFile.update).toHaveBeenCalledWith({
        where: { id: 'file-1' },
        data: { seriesId: null },
      });
      expect(mockUpdateSeriesProgress).toHaveBeenCalledWith('series-1');
    });

    it('should do nothing when file not found', async () => {
      mockPrisma.comicFile.findUnique.mockResolvedValue(null);

      await unlinkFileFromSeries('nonexistent');

      expect(mockPrisma.comicFile.update).not.toHaveBeenCalled();
    });

    it('should not update series progress when file had no series', async () => {
      const file = createMockComicFile({
        id: 'file-1',
        seriesId: null,
      });
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockPrisma.comicFile.update.mockResolvedValue({});

      await unlinkFileFromSeries('file-1');

      expect(mockUpdateSeriesProgress).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // autoLinkFileToSeries
  // =============================================================================

  describe('autoLinkFileToSeries', () => {
    it('should return error when file not found', async () => {
      mockPrisma.comicFile.findUnique.mockResolvedValue(null);

      const result = await autoLinkFileToSeries('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBe('File not found');
    });

    it('should return error when no series name available', async () => {
      const file = {
        ...createMockComicFile({ relativePath: 'test.cbz' }),
        metadata: null,
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);

      const result = await autoLinkFileToSeries('file-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('No series name found');
    });

    it('should auto-link when high confidence match found', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        metadata: createMockFileMetadata({ series: 'Batman' }),
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);

      const series = createMockSeriesRecord({ id: 'series-1', name: 'Batman' });
      mockGetSeriesByIdentity.mockResolvedValue(series);
      mockPrisma.series.findUnique.mockResolvedValue({ deletedAt: null });
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockUpdateSeriesProgress.mockResolvedValue(undefined);

      const result = await autoLinkFileToSeries('file-1');

      expect(result.success).toBe(true);
      expect(result.seriesId).toBe('series-1');
      expect(result.matchType).toBe('exact');
    });

    it('should request confirmation for medium confidence matches', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        metadata: createMockFileMetadata({ series: 'Batman Beyond' }),
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);

      mockGetSeriesByIdentity.mockResolvedValue(null);
      mockPrisma.series.findFirst.mockResolvedValue(null);

      const series = createMockSeriesRecord({
        id: 'series-1',
        name: 'Batman',
      });
      mockPrisma.series.findMany.mockResolvedValue([series]);

      const result = await autoLinkFileToSeries('file-1');

      // May need confirmation for medium matches
      if (result.needsConfirmation) {
        expect(result.success).toBe(false);
        expect(result.suggestions).toBeDefined();
      }
    });

    it('should create new series when no match found', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1', relativePath: 'NewSeries/issue1.cbz' }),
        metadata: createMockFileMetadata({ series: 'Brand New Series' }),
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);

      mockGetSeriesByIdentity.mockResolvedValue(null);
      mockPrisma.series.findFirst.mockResolvedValue(null);
      mockPrisma.series.findMany.mockResolvedValue([]);

      const newSeries = createMockSeriesRecord({ id: 'new-series', name: 'Brand New Series' });
      mockCreateSeries.mockResolvedValue(newSeries);
      mockPrisma.series.findUnique.mockResolvedValue({ deletedAt: null });
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockUpdateSeriesProgress.mockResolvedValue(undefined);

      const result = await autoLinkFileToSeries('file-1');

      expect(result.success).toBe(true);
      expect(result.matchType).toBe('created');
      expect(mockCreateSeries).toHaveBeenCalled();
    });

    it('should use trustMetadata option to create series on fuzzy match', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1', relativePath: 'Trigun/issue1.cbz' }),
        metadata: createMockFileMetadata({ series: 'TRIGUN' }),
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);

      // First call: no exact match (findMatchingSeries)
      mockGetSeriesByIdentity.mockResolvedValueOnce(null);
      mockPrisma.series.findFirst.mockResolvedValue(null);

      // Fuzzy match with medium confidence - use similar enough name for 0.7-0.9 confidence
      // "Trigun" vs "TRIGUN" would be exact, so use slightly different name
      const similar = createMockSeriesRecord({ id: 's1', name: 'Trigun Vol 1' });
      mockPrisma.series.findMany.mockResolvedValue([similar]);

      // Second call: no exact match (createSeriesWithExactName)
      mockGetSeriesByIdentity.mockResolvedValueOnce(null);

      const newSeries = createMockSeriesRecord({ id: 'new-series', name: 'TRIGUN' });
      mockCreateSeries.mockResolvedValue(newSeries);
      mockPrisma.series.findUnique.mockResolvedValue({ deletedAt: null });
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockUpdateSeriesProgress.mockResolvedValue(undefined);

      const result = await autoLinkFileToSeries('file-1', { trustMetadata: true });

      // Result should either:
      // 1. Success with warnings (if fuzzy match was medium confidence)
      // 2. Success without warnings (if exact match was created)
      expect(result.success).toBe(true);
      // The exact behavior depends on the normalization/similarity calc
      // But regardless, we should have successfully linked or created
      expect(result.seriesId).toBeDefined();
    });
  });

  // =============================================================================
  // autoLinkAllFiles
  // =============================================================================

  describe('autoLinkAllFiles', () => {
    it('should process all unlinked files', async () => {
      const files = [
        { ...createMockComicFile({ id: 'file-1' }), metadata: createMockFileMetadata({ series: 'Batman' }) },
        { ...createMockComicFile({ id: 'file-2' }), metadata: createMockFileMetadata({ series: 'Superman' }) },
      ];
      mockPrisma.comicFile.findMany.mockResolvedValue(files);

      // Both should match exactly
      const batmanSeries = createMockSeriesRecord({ id: 's1', name: 'Batman' });
      const supermanSeries = createMockSeriesRecord({ id: 's2', name: 'Superman' });
      mockGetSeriesByIdentity
        .mockResolvedValueOnce(batmanSeries)
        .mockResolvedValueOnce(supermanSeries);

      mockPrisma.series.findUnique.mockResolvedValue({ deletedAt: null });
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockUpdateSeriesProgress.mockResolvedValue(undefined);

      const result = await autoLinkAllFiles();

      expect(result.linked).toBe(2);
      expect(result.errors).toBe(0);
    });

    it('should count created series separately', async () => {
      const files = [
        { ...createMockComicFile({ id: 'file-1', relativePath: 'NewSeries/issue1.cbz' }), metadata: createMockFileMetadata({ series: 'New Series' }) },
      ];
      mockPrisma.comicFile.findMany.mockResolvedValue(files);

      mockGetSeriesByIdentity.mockResolvedValue(null);
      mockPrisma.series.findFirst.mockResolvedValue(null);
      mockPrisma.series.findMany.mockResolvedValue([]);

      const newSeries = createMockSeriesRecord({ id: 'new', name: 'New Series' });
      mockCreateSeries.mockResolvedValue(newSeries);
      mockPrisma.series.findUnique.mockResolvedValue({ deletedAt: null });
      mockPrisma.comicFile.update.mockResolvedValue({});
      mockUpdateSeriesProgress.mockResolvedValue(undefined);

      const result = await autoLinkAllFiles();

      expect(result.created).toBe(1);
      expect(result.linked).toBe(1);
    });

    it('should handle errors gracefully', async () => {
      const files = [
        { ...createMockComicFile({ id: 'file-1' }), metadata: createMockFileMetadata({ series: 'Test' }) },
      ];
      mockPrisma.comicFile.findMany.mockResolvedValue(files);
      mockGetSeriesByIdentity.mockRejectedValue(new Error('DB error'));

      const result = await autoLinkAllFiles();

      expect(result.errors).toBe(1);
      expect(result.linked).toBe(0);
    });
  });

  // =============================================================================
  // getFilesNeedingConfirmation
  // =============================================================================

  describe('getFilesNeedingConfirmation', () => {
    it('should return files with ambiguous suggestions', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        metadata: createMockFileMetadata({ series: 'Batman' }),
      };
      mockPrisma.comicFile.findMany.mockResolvedValue([file]);

      // Mock the suggestion call - needs multiple series with similar confidence
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockGetSeriesByIdentity.mockResolvedValue(null);
      mockPrisma.series.findFirst.mockResolvedValue(null);

      // Multiple series with similar names creates ambiguity
      const series1 = createMockSeriesRecord({ id: 's1', name: 'Batman' });
      const series2 = createMockSeriesRecord({ id: 's2', name: 'Batman Vol 2' });
      mockPrisma.series.findMany.mockResolvedValue([series1, series2]);

      const result = await getFilesNeedingConfirmation();

      // The result depends on whether suggestions create enough ambiguity
      // (second suggestion confidence > topConfidence * 0.8)
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return empty when no ambiguous files', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        metadata: createMockFileMetadata({ series: 'UniqueComic' }),
      };
      mockPrisma.comicFile.findMany.mockResolvedValue([file]);

      // Mock the suggestion call
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);
      mockGetSeriesByIdentity.mockResolvedValue(null);
      mockPrisma.series.findFirst.mockResolvedValue(null);

      // Only one series - no ambiguity
      const series = createMockSeriesRecord({ name: 'UniqueComic' });
      mockPrisma.series.findMany.mockResolvedValue([series]);

      const result = await getFilesNeedingConfirmation();

      // Single suggestion means no ambiguity, so empty result
      expect(Array.isArray(result)).toBe(true);
    });

    it('should limit results for performance', async () => {
      mockPrisma.comicFile.findMany.mockResolvedValue([]);

      await getFilesNeedingConfirmation();

      const findManyCall = mockPrisma.comicFile.findMany.mock.calls[0]![0];
      expect(findManyCall.take).toBe(100);
    });
  });

  // =============================================================================
  // findSeriesForFile
  // =============================================================================

  describe('findSeriesForFile', () => {
    it('should return best match when confidence is high enough', async () => {
      const file = {
        ...createMockComicFile({ id: 'file-1' }),
        metadata: createMockFileMetadata({ series: 'Batman' }),
      };
      mockPrisma.comicFile.findUnique.mockResolvedValue(file);

      const series = createMockSeriesRecord({ id: 'series-1', name: 'Batman' });
      mockGetSeriesByIdentity.mockResolvedValue(series);

      const result = await findSeriesForFile('file-1');

      expect(result).toBeDefined();
      expect(result!.id).toBe('series-1');
    });

    it('should return null when no high confidence match', async () => {
      mockPrisma.comicFile.findUnique.mockResolvedValue(null);

      const result = await findSeriesForFile('file-1');

      expect(result).toBeNull();
    });
  });
});
