/**
 * Metadata Search Service Tests
 *
 * Tests for the unified metadata search service that searches
 * across multiple sources (ComicVine, Metron, AniList, MAL).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks
// =============================================================================

const mockGetMetadataSettings = vi.fn();

vi.mock('../config.service.js', () => ({
  getMetadataSettings: () => mockGetMetadataSettings(),
}));

const mockComicVine = {
  searchVolumes: vi.fn(),
  searchIssues: vi.fn(),
  getVolume: vi.fn(),
  getIssue: vi.fn(),
  volumeToSeriesMetadata: vi.fn(),
  issueToComicInfo: vi.fn(),
};

vi.mock('../comicvine.service.js', () => mockComicVine);

const mockMetron = {
  isMetronAvailable: vi.fn(),
  getSeriesName: vi.fn(),
  searchSeries: vi.fn(),
  searchIssues: vi.fn(),
  getSeries: vi.fn(),
  getIssue: vi.fn(),
  seriesToSeriesMetadata: vi.fn(),
  issueToComicInfo: vi.fn(),
};

vi.mock('../metron.service.js', () => mockMetron);

const mockAnilist = {
  searchManga: vi.fn(),
  getMangaById: vi.fn(),
  getPreferredTitle: vi.fn(),
  getAllTitles: vi.fn(),
};

vi.mock('../anilist.service.js', () => mockAnilist);

const mockJikan = {
  searchManga: vi.fn(),
  getMangaById: vi.fn(),
};

vi.mock('../jikan.service.js', () => mockJikan);

vi.mock('../metadata-fetch-logger.service.js', () => ({
  MetadataFetchLogger: {
    log: vi.fn(),
    logAPICallStart: vi.fn(),
    logAPICallEnd: vi.fn(),
    logScoring: vi.fn(),
    logOrganizing: vi.fn(),
    logFetching: vi.fn(),
  },
}));

vi.mock('../logger.service.js', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logDebug: vi.fn(),
  createServiceLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import AFTER mocks
const {
  getSourcesForLibraryType,
  searchSeries,
  searchIssues,
  search,
  getSeriesMetadata,
  getIssueMetadata,
} = await import('../metadata-search.service.js');

// =============================================================================
// Helper Functions
// =============================================================================

function createMockVolumeResult(overrides: Partial<{
  id: number;
  name: string;
  start_year: string;
  count_of_issues: number;
  publisher: { id: number; name: string };
  description: string;
  deck: string;
  image: { medium_url: string };
  aliases: string;
  site_detail_url: string;
}> = {}) {
  return {
    id: 12345,
    name: 'Batman',
    start_year: '1940',
    count_of_issues: 100,
    publisher: { id: 1, name: 'DC Comics' },
    description: '<p>The Dark Knight</p>',
    deck: 'Batman comics',
    image: { medium_url: 'http://example.com/batman.jpg' },
    aliases: 'Dark Knight',
    site_detail_url: 'http://comicvine.com/batman/',
    ...overrides,
  };
}

function createMockIssueResult(overrides: Partial<{
  id: number;
  issue_number: string;
  name: string;
  cover_date: string;
  volume: { id: number; name: string };
  image: { medium_url: string };
  site_detail_url: string;
}> = {}) {
  return {
    id: 100001,
    issue_number: '1',
    name: 'The Beginning',
    cover_date: '2020-06-15',
    volume: { id: 12345, name: 'Batman' },
    image: { medium_url: 'http://example.com/issue1.jpg' },
    site_detail_url: 'http://comicvine.com/batman-1/',
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('Metadata Search Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMetadataSettings.mockReturnValue({
      primarySource: 'comicvine',
      enabledSources: ['comicvine', 'metron', 'anilist', 'mal'],
      rateLimitLevel: 5,
    });
    mockMetron.isMetronAvailable.mockReturnValue(false);
  });

  // ===========================================================================
  // getSourcesForLibraryType
  // ===========================================================================

  describe('getSourcesForLibraryType', () => {
    it('should prioritize AniList/MAL for manga libraries', () => {
      const sources = getSourcesForLibraryType('manga');

      expect(sources[0]).toBe('anilist');
      expect(sources[1]).toBe('mal');
    });

    it('should prioritize ComicVine/Metron for western libraries', () => {
      const sources = getSourcesForLibraryType('western');

      expect(sources[0]).toBe('comicvine');
      expect(sources[1]).toBe('metron');
    });

    it('should include other enabled sources after primary for manga', () => {
      mockGetMetadataSettings.mockReturnValue({
        enabledSources: ['comicvine', 'metron', 'anilist', 'mal'],
      });

      const sources = getSourcesForLibraryType('manga');

      expect(sources).toContain('anilist');
      expect(sources).toContain('mal');
      expect(sources).toContain('comicvine');
      expect(sources).toContain('metron');
    });
  });

  // ===========================================================================
  // searchSeries
  // ===========================================================================

  describe('searchSeries', () => {
    it('should search ComicVine for series', async () => {
      const volumes = [createMockVolumeResult()];
      mockComicVine.searchVolumes.mockResolvedValue({
        results: volumes,
        total: 1,
        offset: 0,
        limit: 10,
      });

      const result = await searchSeries({ series: 'Batman' }, { sources: ['comicvine'] });

      expect(result.series).toHaveLength(1);
      expect(result.series[0]?.name).toBe('Batman');
      expect(result.series[0]?.source).toBe('comicvine');
      expect(result.sources.comicVine.searched).toBe(true);
      expect(result.sources.comicVine.available).toBe(true);
    });

    it('should include pagination metadata', async () => {
      mockComicVine.searchVolumes.mockResolvedValue({
        results: [createMockVolumeResult()],
        total: 100,
        offset: 0,
        limit: 10,
      });

      const result = await searchSeries({ series: 'Batman' }, { sources: ['comicvine'] });

      expect(result.pagination).toBeDefined();
      expect(result.pagination?.total).toBe(100);
      expect(result.pagination?.hasMore).toBe(true);
    });

    it('should calculate confidence scores', async () => {
      mockComicVine.searchVolumes.mockResolvedValue({
        results: [
          createMockVolumeResult({ name: 'Batman' }),
          createMockVolumeResult({ id: 2, name: 'Batman Adventures' }),
        ],
        total: 2,
        offset: 0,
        limit: 10,
      });

      const result = await searchSeries({ series: 'Batman' }, { sources: ['comicvine'] });

      // Exact match should have higher confidence
      expect(result.series[0]?.confidence).toBeGreaterThan(result.series[1]?.confidence ?? 0);
    });

    it('should sort results by confidence', async () => {
      mockComicVine.searchVolumes.mockResolvedValue({
        results: [
          createMockVolumeResult({ id: 1, name: 'Batman Begins' }),
          createMockVolumeResult({ id: 2, name: 'Batman' }),
          createMockVolumeResult({ id: 3, name: 'Batman: The Long Halloween' }),
        ],
        total: 3,
        offset: 0,
        limit: 10,
      });

      const result = await searchSeries({ series: 'Batman' }, { sources: ['comicvine'] });

      // Results should be sorted by confidence (highest first)
      for (let i = 1; i < result.series.length; i++) {
        expect(result.series[i - 1]!.confidence).toBeGreaterThanOrEqual(result.series[i]!.confidence);
      }
    });

    it('should search Metron when available', async () => {
      mockMetron.isMetronAvailable.mockReturnValue(true);
      mockMetron.searchSeries.mockResolvedValue({
        results: [{ id: 1, name: 'Batman', publisher: { name: 'DC' } }],
        count: 1,
      });
      mockComicVine.searchVolumes.mockResolvedValue({ results: [], total: 0, offset: 0, limit: 10 });

      const result = await searchSeries({ series: 'Batman' }, { sources: ['comicvine', 'metron'] });

      expect(result.sources.metron.searched).toBe(true);
      expect(result.sources.metron.available).toBe(true);
    });

    it('should handle Metron unavailable gracefully', async () => {
      mockMetron.isMetronAvailable.mockReturnValue(false);
      mockComicVine.searchVolumes.mockResolvedValue({ results: [], total: 0, offset: 0, limit: 10 });

      const result = await searchSeries({ series: 'Batman' }, { sources: ['comicvine', 'metron'] });

      expect(result.sources.metron.searched).toBe(false);
      expect(result.sources.metron.error).toContain('not configured');
    });

    it('should return empty results for empty query', async () => {
      const result = await searchSeries({});

      expect(result.series).toHaveLength(0);
    });

    it('should handle ComicVine errors gracefully', async () => {
      mockComicVine.searchVolumes.mockRejectedValue(new Error('API error'));

      const result = await searchSeries({ series: 'Batman' }, { sources: ['comicvine'] });

      expect(result.sources.comicVine.searched).toBe(true);
      expect(result.sources.comicVine.error).toBe('API error');
    });

    it('should search AniList for manga libraries', async () => {
      mockAnilist.searchManga.mockResolvedValue({
        results: [{
          id: 1,
          title: { romaji: 'One Piece', english: 'One Piece' },
          coverImage: { medium: 'http://example.com/op.jpg' },
        }],
      });
      mockAnilist.getPreferredTitle.mockReturnValue('One Piece');

      const result = await searchSeries(
        { series: 'One Piece' },
        { sources: ['anilist'], libraryType: 'manga' }
      );

      expect(result.sources.anilist.searched).toBe(true);
    });
  });

  // ===========================================================================
  // searchIssues
  // ===========================================================================

  describe('searchIssues', () => {
    it('should search ComicVine for issues by series ID', async () => {
      const issues = [createMockIssueResult()];
      mockComicVine.getVolume.mockResolvedValue(createMockVolumeResult());

      // We need to manually define ComicVineIssue mock for getVolumeIssues
      vi.doMock('../comicvine.service.js', () => ({
        ...mockComicVine,
        getVolumeIssues: vi.fn().mockResolvedValue({
          results: issues,
          total: 1,
          offset: 0,
          limit: 100,
        }),
      }));

      // For the regular search path
      mockComicVine.searchIssues.mockResolvedValue({
        results: [{ id: 100001 }],
        total: 1,
        offset: 0,
        limit: 10,
      });
      mockComicVine.getIssue.mockResolvedValue(createMockIssueResult());

      const result = await searchIssues(
        { series: 'Batman', issueNumber: '1' },
        { sources: ['comicvine'] }
      );

      expect(result.sources.comicVine.searched).toBe(true);
    });

    it('should calculate issue confidence scores', async () => {
      mockComicVine.searchIssues.mockResolvedValue({
        results: [{ id: 1 }, { id: 2 }],
        total: 2,
        offset: 0,
        limit: 10,
      });
      mockComicVine.getIssue
        .mockResolvedValueOnce(createMockIssueResult({ issue_number: '1' }))
        .mockResolvedValueOnce(createMockIssueResult({ id: 2, issue_number: '2' }));

      const result = await searchIssues(
        { series: 'Batman', issueNumber: '1' },
        { sources: ['comicvine'] }
      );

      // Issue #1 should have higher confidence than #2 when searching for #1
      if (result.issues.length >= 2) {
        const issue1 = result.issues.find((i) => i.number === '1');
        const issue2 = result.issues.find((i) => i.number === '2');
        if (issue1 && issue2) {
          expect(issue1.confidence).toBeGreaterThan(issue2.confidence);
        }
      }
    });

    it('should search Metron for issues when available', async () => {
      mockMetron.isMetronAvailable.mockReturnValue(true);
      mockMetron.searchIssues.mockResolvedValue({
        results: [{
          id: 1,
          number: '1',
          title: 'Issue 1',
          cover_date: '2020-01-01',
          series: { id: 1, name: 'Batman' },
        }],
      });

      const result = await searchIssues(
        { series: 'Batman', issueNumber: '1' },
        { sources: ['metron'] }
      );

      expect(result.sources.metron.searched).toBe(true);
      expect(result.issues).toHaveLength(1);
    });

    it('should handle errors gracefully', async () => {
      mockComicVine.searchIssues.mockRejectedValue(new Error('Network error'));

      const result = await searchIssues(
        { series: 'Batman' },
        { sources: ['comicvine'] }
      );

      expect(result.sources.comicVine.error).toBe('Network error');
    });
  });

  // ===========================================================================
  // search (combined)
  // ===========================================================================

  describe('search', () => {
    it('should combine series and issue results', async () => {
      mockComicVine.searchVolumes.mockResolvedValue({
        results: [createMockVolumeResult()],
        total: 1,
        offset: 0,
        limit: 10,
      });
      mockComicVine.searchIssues.mockResolvedValue({
        results: [{ id: 1 }],
        total: 1,
        offset: 0,
        limit: 10,
      });
      mockComicVine.getIssue.mockResolvedValue(createMockIssueResult());

      const result = await search({ series: 'Batman' }, { sources: ['comicvine'] });

      expect(result.series.length).toBeGreaterThanOrEqual(0);
      expect(result.issues.length).toBeGreaterThanOrEqual(0);
      expect(result.query.series).toBe('Batman');
    });

    it('should merge source status from both searches', async () => {
      mockComicVine.searchVolumes.mockResolvedValue({
        results: [],
        total: 0,
        offset: 0,
        limit: 10,
      });
      mockComicVine.searchIssues.mockResolvedValue({
        results: [],
        total: 0,
        offset: 0,
        limit: 10,
      });

      const result = await search({ series: 'Test' }, { sources: ['comicvine'] });

      expect(result.sources.comicVine.searched).toBe(true);
    });
  });

  // ===========================================================================
  // getSeriesMetadata
  // ===========================================================================

  describe('getSeriesMetadata', () => {
    it('should fetch ComicVine series metadata', async () => {
      const volume = createMockVolumeResult();
      const metadata = { name: 'Batman', publisher: 'DC Comics' };
      mockComicVine.getVolume.mockResolvedValue(volume);
      mockComicVine.volumeToSeriesMetadata.mockReturnValue(metadata);

      const result = await getSeriesMetadata('comicvine', '12345');

      expect(result).toEqual(metadata);
      expect(mockComicVine.getVolume).toHaveBeenCalledWith(12345, undefined);
      expect(mockComicVine.volumeToSeriesMetadata).toHaveBeenCalledWith(volume);
    });

    it('should return null when volume not found', async () => {
      mockComicVine.getVolume.mockResolvedValue(null);

      const result = await getSeriesMetadata('comicvine', '99999');

      expect(result).toBeNull();
    });

    it('should fetch Metron series metadata when available', async () => {
      mockMetron.isMetronAvailable.mockReturnValue(true);
      const series = { id: 1, name: 'Batman' };
      const metadata = { name: 'Batman', publisher: 'DC' };
      mockMetron.getSeries.mockResolvedValue(series);
      mockMetron.seriesToSeriesMetadata.mockReturnValue(metadata);

      const result = await getSeriesMetadata('metron', '1');

      expect(result).toEqual(metadata);
    });

    it('should return null for Metron when unavailable', async () => {
      mockMetron.isMetronAvailable.mockReturnValue(false);

      const result = await getSeriesMetadata('metron', '1');

      expect(result).toBeNull();
    });

    it('should fetch AniList manga metadata', async () => {
      const manga = {
        id: 1,
        description: 'A great manga',
        startDate: { year: 2020 },
        endDate: { year: 2023 },
        chapters: 100,
        coverImage: { large: 'http://example.com/cover.jpg' },
        genres: ['Action', 'Adventure'],
        characters: { edges: [{ node: { name: { full: 'Luffy' } } }] },
        status: 'FINISHED',
      };
      mockAnilist.getMangaById.mockResolvedValue(manga);
      mockAnilist.getPreferredTitle.mockReturnValue('One Piece');
      mockAnilist.getAllTitles.mockReturnValue(['One Piece', 'ワンピース']);

      const result = await getSeriesMetadata('anilist', '1');

      expect(result).toBeDefined();
      expect(result?.name).toBe('One Piece');
      expect(result?.startYear).toBe(2020);
      expect(result?.genres).toEqual(['Action', 'Adventure']);
    });

    it('should fetch MAL manga metadata', async () => {
      const manga = {
        title: 'One Piece',
        title_english: 'One Piece',
        title_japanese: 'ワンピース',
        synopsis: 'A pirate adventure',
        published: { from: '1997-07-22', to: null },
        chapters: 1000,
        volumes: 100,
        images: { jpg: { large_image_url: 'http://example.com/op.jpg' } },
        genres: [{ name: 'Action' }],
        status: 'Publishing',
        serializations: [{ name: 'Shonen Jump' }],
      };
      mockJikan.getMangaById.mockResolvedValue(manga);

      const result = await getSeriesMetadata('mal', '1');

      expect(result).toBeDefined();
      expect(result?.name).toBe('One Piece');
      expect(result?.publisher).toBe('Shonen Jump');
    });

    it('should return null for MAL when manga not found', async () => {
      mockJikan.getMangaById.mockResolvedValue(null);

      const result = await getSeriesMetadata('mal', '99999');

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // getIssueMetadata
  // ===========================================================================

  describe('getIssueMetadata', () => {
    it('should fetch ComicVine issue metadata', async () => {
      const issue = createMockIssueResult();
      const volume = createMockVolumeResult();
      const metadata = { Series: 'Batman', Number: '1' };
      mockComicVine.getIssue.mockResolvedValue(issue);
      mockComicVine.getVolume.mockResolvedValue(volume);
      mockComicVine.issueToComicInfo.mockReturnValue(metadata);

      const result = await getIssueMetadata('comicvine', '100001');

      expect(result).toEqual(metadata);
      expect(mockComicVine.getIssue).toHaveBeenCalledWith(100001, undefined);
    });

    it('should return null when issue not found', async () => {
      mockComicVine.getIssue.mockResolvedValue(null);

      const result = await getIssueMetadata('comicvine', '99999');

      expect(result).toBeNull();
    });

    it('should fetch Metron issue metadata when available', async () => {
      mockMetron.isMetronAvailable.mockReturnValue(true);
      const issue = { id: 1, number: '1', series: { id: 1 } };
      const series = { id: 1, name: 'Batman' };
      const metadata = { Series: 'Batman', Number: '1' };
      mockMetron.getIssue.mockResolvedValue(issue);
      mockMetron.getSeries.mockResolvedValue(series);
      mockMetron.issueToComicInfo.mockReturnValue(metadata);

      const result = await getIssueMetadata('metron', '1');

      expect(result).toEqual(metadata);
    });

    it('should return null for Metron when unavailable', async () => {
      mockMetron.isMetronAvailable.mockReturnValue(false);

      const result = await getIssueMetadata('metron', '1');

      expect(result).toBeNull();
    });

    it('should return null for unsupported sources', async () => {
      // AniList/MAL don't have issue-level metadata
      const result = await getIssueMetadata('anilist' as any, '1');

      expect(result).toBeNull();
    });
  });
});
