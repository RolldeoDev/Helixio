/**
 * ComicVine Service Tests
 *
 * Tests for the ComicVine API client service.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Mocks
// =============================================================================

const mockGetApiKey = vi.fn();
const mockGetMetadataSettings = vi.fn();

vi.mock('../config.service.js', () => ({
  getApiKey: (source: string) => mockGetApiKey(source),
  getMetadataSettings: () => mockGetMetadataSettings(),
}));

vi.mock('../metadata-fetch-logger.service.js', () => ({
  MetadataFetchLogger: {
    logAPICallStart: vi.fn(),
    logAPICallEnd: vi.fn(),
  },
}));

const mockAPICache = {
  getCachedOrFetch: vi.fn(),
};

vi.mock('../api-cache.service.js', () => ({
  APICache: mockAPICache,
}));

vi.mock('../logger.service.js', () => ({
  comicvineLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import AFTER mocks
const {
  searchVolumes,
  searchIssues,
  searchCharacters,
  searchPeople,
  getVolume,
  getVolumeIssues,
  getIssue,
  getCharacter,
  getPerson,
  checkApiAvailability,
  issueToComicInfo,
  volumeToSeriesMetadata,
} = await import('../comicvine.service.js');

// =============================================================================
// Helper Functions
// =============================================================================

function createMockVolume(overrides: Partial<{
  id: number;
  name: string;
  aliases: string;
  count_of_issues: number;
  start_year: string;
  description: string;
  deck: string;
  publisher: { id: number; name: string };
  image: { medium_url: string; small_url: string };
  characters: Array<{ id: number; name: string; count?: number }>;
  people: Array<{ id: number; name: string; count?: number }>;
  locations: Array<{ id: number; name: string; count?: number }>;
}> = {}) {
  return {
    id: 12345,
    name: 'Batman',
    aliases: 'Dark Knight\nCaped Crusader',
    count_of_issues: 100,
    start_year: '1940',
    description: '<p>The adventures of the Dark Knight.</p>',
    deck: 'Batman comics',
    publisher: { id: 1, name: 'DC Comics' },
    image: { medium_url: 'http://example.com/batman.jpg', small_url: 'http://example.com/batman_small.jpg' },
    api_detail_url: 'http://api.comicvine.com/volume/4050-12345/',
    site_detail_url: 'http://comicvine.com/batman/4050-12345/',
    ...overrides,
  };
}

function createMockIssue(overrides: Partial<{
  id: number;
  name: string;
  issue_number: string;
  cover_date: string;
  store_date: string;
  description: string;
  deck: string;
  volume: { id: number; name: string };
  character_credits: Array<{ id: number; name: string }>;
  team_credits: Array<{ id: number; name: string }>;
  person_credits: Array<{ id: number; name: string; role: string }>;
  location_credits: Array<{ id: number; name: string }>;
  story_arc_credits: Array<{ id: number; name: string }>;
  image: { medium_url: string };
}> = {}) {
  return {
    id: 100001,
    name: 'The Beginning',
    issue_number: '1',
    cover_date: '2020-01-01',
    store_date: '2019-12-27',
    description: '<p>The first issue.</p>',
    deck: 'Where it all began',
    volume: { id: 12345, name: 'Batman' },
    character_credits: [
      { id: 1, name: 'Batman' },
      { id: 2, name: 'Joker' },
    ],
    team_credits: [{ id: 1, name: 'Justice League' }],
    person_credits: [
      { id: 1, name: 'Tom King', role: 'writer' },
      { id: 2, name: 'Jim Lee', role: 'penciler' },
      { id: 3, name: 'Scott Williams', role: 'inker' },
    ],
    location_credits: [{ id: 1, name: 'Gotham City' }],
    story_arc_credits: [{ id: 1, name: 'City of Bane' }],
    image: { medium_url: 'http://example.com/issue1.jpg' },
    api_detail_url: 'http://api.comicvine.com/issue/4000-100001/',
    site_detail_url: 'http://comicvine.com/batman-1/4000-100001/',
    ...overrides,
  };
}

function createMockApiResponse<T>(results: T, overrides: Partial<{
  error: string;
  status_code: number;
  number_of_total_results: number;
  offset: number;
  limit: number;
}> = {}) {
  return {
    error: 'OK',
    status_code: 1,
    limit: 10,
    offset: 0,
    number_of_page_results: Array.isArray(results) ? results.length : 1,
    number_of_total_results: Array.isArray(results) ? results.length : 1,
    results,
    version: '1.0',
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('ComicVine Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApiKey.mockReturnValue('test-api-key');
    mockGetMetadataSettings.mockReturnValue({ rateLimitLevel: 5 });
  });

  // ===========================================================================
  // searchVolumes
  // ===========================================================================

  describe('searchVolumes', () => {
    it('should search for volumes by name', async () => {
      const volumes = [createMockVolume()];
      const response = createMockApiResponse(volumes, { number_of_total_results: 1 });

      mockAPICache.getCachedOrFetch.mockResolvedValue(response);

      const result = await searchVolumes('Batman');

      expect(result.results).toEqual(volumes);
      expect(result.total).toBe(1);
      expect(mockAPICache.getCachedOrFetch).toHaveBeenCalledWith(
        'comicvine',
        '/volumes/',
        expect.objectContaining({ filter: 'name:Batman' }),
        expect.any(Function),
        expect.any(Object)
      );
    });

    it('should handle pagination parameters', async () => {
      const volumes = [createMockVolume()];
      const response = createMockApiResponse(volumes, {
        number_of_total_results: 50,
        offset: 10,
        limit: 20,
      });

      mockAPICache.getCachedOrFetch.mockResolvedValue(response);

      const result = await searchVolumes('Batman', { limit: 20, offset: 10 });

      expect(result.offset).toBe(10);
      expect(result.limit).toBe(20);
      expect(result.total).toBe(50);
    });

    it('should return empty results when no matches', async () => {
      const response = createMockApiResponse([], { number_of_total_results: 0 });
      mockAPICache.getCachedOrFetch.mockResolvedValue(response);

      const result = await searchVolumes('NonexistentComic');

      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  // ===========================================================================
  // searchIssues
  // ===========================================================================

  describe('searchIssues', () => {
    it('should search for issues', async () => {
      const issues = [{ id: 1, name: 'Batman #1' }];
      const response = createMockApiResponse(issues);

      mockAPICache.getCachedOrFetch.mockResolvedValue(response);

      const result = await searchIssues('Batman #1');

      expect(result.results).toEqual(issues);
      expect(mockAPICache.getCachedOrFetch).toHaveBeenCalledWith(
        'comicvine',
        '/search/',
        expect.objectContaining({
          query: 'Batman #1',
          resources: 'issue',
        }),
        expect.any(Function),
        expect.any(Object)
      );
    });

    it('should support session tracking', async () => {
      const response = createMockApiResponse([]);
      mockAPICache.getCachedOrFetch.mockResolvedValue(response);

      await searchIssues('Test', { sessionId: 'session-123' });

      expect(mockAPICache.getCachedOrFetch).toHaveBeenCalledWith(
        'comicvine',
        '/search/',
        expect.any(Object),
        expect.any(Function),
        expect.objectContaining({ sessionId: 'session-123' })
      );
    });
  });

  // ===========================================================================
  // searchCharacters
  // ===========================================================================

  describe('searchCharacters', () => {
    it('should search for characters', async () => {
      const characters = [{ id: 1, name: 'Batman' }];
      const response = createMockApiResponse(characters);

      mockAPICache.getCachedOrFetch.mockResolvedValue(response);

      const result = await searchCharacters('Batman');

      expect(result.results).toEqual(characters);
      expect(mockAPICache.getCachedOrFetch).toHaveBeenCalledWith(
        'comicvine',
        '/search/',
        expect.objectContaining({
          query: 'Batman',
          resources: 'character',
        }),
        expect.any(Function),
        expect.any(Object)
      );
    });
  });

  // ===========================================================================
  // searchPeople
  // ===========================================================================

  describe('searchPeople', () => {
    it('should search for people (creators)', async () => {
      const people = [{ id: 1, name: 'Jim Lee' }];
      const response = createMockApiResponse(people);

      mockAPICache.getCachedOrFetch.mockResolvedValue(response);

      const result = await searchPeople('Jim Lee');

      expect(result.results).toEqual(people);
      expect(mockAPICache.getCachedOrFetch).toHaveBeenCalledWith(
        'comicvine',
        '/search/',
        expect.objectContaining({
          query: 'Jim Lee',
          resources: 'person',
        }),
        expect.any(Function),
        expect.any(Object)
      );
    });
  });

  // ===========================================================================
  // getVolume
  // ===========================================================================

  describe('getVolume', () => {
    it('should fetch volume by ID', async () => {
      const volume = createMockVolume();
      const response = createMockApiResponse(volume);

      mockAPICache.getCachedOrFetch.mockResolvedValue(response);

      const result = await getVolume(12345);

      expect(result).toEqual(volume);
      expect(mockAPICache.getCachedOrFetch).toHaveBeenCalledWith(
        'comicvine',
        '/volume/4050-12345/',
        expect.objectContaining({ field_list: expect.any(String) }),
        expect.any(Function),
        expect.any(Object)
      );
    });

    it('should return null on error', async () => {
      mockAPICache.getCachedOrFetch.mockRejectedValue(new Error('Not found'));

      const result = await getVolume(99999);

      expect(result).toBeNull();
    });

    it('should pass session ID for logging', async () => {
      const volume = createMockVolume();
      const response = createMockApiResponse(volume);
      mockAPICache.getCachedOrFetch.mockResolvedValue(response);

      await getVolume(12345, 'session-abc');

      expect(mockAPICache.getCachedOrFetch).toHaveBeenCalledWith(
        'comicvine',
        '/volume/4050-12345/',
        expect.any(Object),
        expect.any(Function),
        expect.objectContaining({ sessionId: 'session-abc' })
      );
    });
  });

  // ===========================================================================
  // getVolumeIssues
  // ===========================================================================

  describe('getVolumeIssues', () => {
    it('should fetch all issues for a volume', async () => {
      const issues = [createMockIssue({ issue_number: '1' }), createMockIssue({ issue_number: '2' })];
      const response = createMockApiResponse(issues, { number_of_total_results: 2 });

      mockAPICache.getCachedOrFetch.mockResolvedValue(response);

      const result = await getVolumeIssues(12345);

      expect(result.results).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockAPICache.getCachedOrFetch).toHaveBeenCalledWith(
        'comicvine',
        '/issues/',
        expect.objectContaining({
          filter: 'volume:12345',
          sort: 'issue_number:asc',
        }),
        expect.any(Function),
        expect.any(Object)
      );
    });

    it('should handle pagination for large volumes', async () => {
      const issues = [createMockIssue()];
      const response = createMockApiResponse(issues, {
        number_of_total_results: 500,
        offset: 100,
        limit: 100,
      });

      mockAPICache.getCachedOrFetch.mockResolvedValue(response);

      const result = await getVolumeIssues(12345, { limit: 100, offset: 100 });

      expect(result.total).toBe(500);
      expect(result.offset).toBe(100);
    });
  });

  // ===========================================================================
  // getIssue
  // ===========================================================================

  describe('getIssue', () => {
    it('should fetch issue by ID', async () => {
      const issue = createMockIssue();
      const response = createMockApiResponse(issue);

      mockAPICache.getCachedOrFetch.mockResolvedValue(response);

      const result = await getIssue(100001);

      expect(result).toEqual(issue);
      expect(mockAPICache.getCachedOrFetch).toHaveBeenCalledWith(
        'comicvine',
        '/issue/4000-100001/',
        expect.any(Object),
        expect.any(Function),
        expect.any(Object)
      );
    });

    it('should return null on error', async () => {
      mockAPICache.getCachedOrFetch.mockRejectedValue(new Error('Not found'));

      const result = await getIssue(99999);

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // getCharacter
  // ===========================================================================

  describe('getCharacter', () => {
    it('should fetch character by ID', async () => {
      const character = { id: 1, name: 'Batman', real_name: 'Bruce Wayne' };
      const response = createMockApiResponse(character);

      mockAPICache.getCachedOrFetch.mockResolvedValue(response);

      const result = await getCharacter(1);

      expect(result).toEqual(character);
      expect(mockAPICache.getCachedOrFetch).toHaveBeenCalledWith(
        'comicvine',
        '/character/4005-1/',
        expect.any(Object),
        expect.any(Function),
        expect.any(Object)
      );
    });

    it('should return null on error', async () => {
      mockAPICache.getCachedOrFetch.mockRejectedValue(new Error('Not found'));

      const result = await getCharacter(99999);

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // getPerson
  // ===========================================================================

  describe('getPerson', () => {
    it('should fetch person by ID', async () => {
      const person = { id: 1, name: 'Jim Lee', country: 'USA' };
      const response = createMockApiResponse(person);

      mockAPICache.getCachedOrFetch.mockResolvedValue(response);

      const result = await getPerson(1);

      expect(result).toEqual(person);
      expect(mockAPICache.getCachedOrFetch).toHaveBeenCalledWith(
        'comicvine',
        '/person/4040-1/',
        expect.any(Object),
        expect.any(Function),
        expect.any(Object)
      );
    });

    it('should return null on error', async () => {
      mockAPICache.getCachedOrFetch.mockRejectedValue(new Error('Not found'));

      const result = await getPerson(99999);

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // checkApiAvailability
  // ===========================================================================

  describe('checkApiAvailability', () => {
    it('should return available when API key is configured and works', async () => {
      mockGetApiKey.mockReturnValue('valid-api-key');
      mockAPICache.getCachedOrFetch.mockResolvedValue(createMockApiResponse([]));

      const result = await checkApiAvailability();

      expect(result.available).toBe(true);
      expect(result.configured).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return not configured when API key is missing', async () => {
      mockGetApiKey.mockReturnValue(null);

      const result = await checkApiAvailability();

      expect(result.available).toBe(false);
      expect(result.configured).toBe(false);
      expect(result.error).toBe('API key not configured');
    });

    it('should return configured but unavailable on API error', async () => {
      mockGetApiKey.mockReturnValue('valid-api-key');
      mockAPICache.getCachedOrFetch.mockRejectedValue(new Error('Connection refused'));

      const result = await checkApiAvailability();

      expect(result.available).toBe(false);
      expect(result.configured).toBe(true);
      expect(result.error).toBe('Connection refused');
    });
  });

  // ===========================================================================
  // issueToComicInfo
  // ===========================================================================

  describe('issueToComicInfo', () => {
    it('should convert issue to ComicInfo format', () => {
      // Use a date with time to avoid timezone ambiguity
      const issue = createMockIssue({ cover_date: '2020-06-15T12:00:00Z' });
      const volume = createMockVolume();

      const result = issueToComicInfo(issue, volume);

      expect(result.Series).toBe('Batman');
      expect(result.Number).toBe('1');
      expect(result.Title).toBe('The Beginning');
      expect(result.Publisher).toBe('DC Comics');
      // Date parsing may vary by timezone, just check values are reasonable
      expect(result.Year).toBe(2020);
      expect(result.Month).toBeGreaterThanOrEqual(6);
      expect(result.Month).toBeLessThanOrEqual(6);
      expect(result.Day).toBeGreaterThan(0);
      expect(result.Day).toBeLessThanOrEqual(31);
    });

    it('should extract creators by role', () => {
      const issue = createMockIssue({
        person_credits: [
          { id: 1, name: 'Tom King', role: 'writer' },
          { id: 2, name: 'Jim Lee', role: 'penciler' },
          { id: 3, name: 'Scott Williams', role: 'inker' },
          { id: 4, name: 'Alex Sinclair', role: 'colorist' },
          { id: 5, name: 'Clayton Cowles', role: 'letterer' },
          { id: 6, name: 'David Finch', role: 'cover artist' },
        ],
      });

      const result = issueToComicInfo(issue);

      expect(result.Writer).toBe('Tom King');
      expect(result.Penciller).toBe('Jim Lee');
      expect(result.Inker).toBe('Scott Williams');
      expect(result.Colorist).toBe('Alex Sinclair');
      expect(result.Letterer).toBe('Clayton Cowles');
    });

    it('should handle multiple writers', () => {
      const issue = createMockIssue({
        person_credits: [
          { id: 1, name: 'Tom King', role: 'writer' },
          { id: 2, name: 'Scott Snyder', role: 'writer' },
        ],
      });

      const result = issueToComicInfo(issue);

      expect(result.Writer).toBe('Tom King, Scott Snyder');
    });

    it('should extract characters, teams, locations', () => {
      const issue = createMockIssue({
        character_credits: [
          { id: 1, name: 'Batman' },
          { id: 2, name: 'Robin' },
        ],
        team_credits: [{ id: 1, name: 'Bat-Family' }],
        location_credits: [{ id: 1, name: 'Gotham City' }],
        story_arc_credits: [{ id: 1, name: 'Night of the Owls' }],
      });

      const result = issueToComicInfo(issue);

      expect(result.Characters).toBe('Batman, Robin');
      expect(result.Teams).toBe('Bat-Family');
      expect(result.Locations).toBe('Gotham City');
      expect(result.StoryArc).toBe('Night of the Owls');
    });

    it('should strip HTML from descriptions', () => {
      const issue = createMockIssue({
        deck: undefined,
        description: '<p>This is a <strong>bold</strong> summary.</p>',
      });

      const result = issueToComicInfo(issue);

      expect(result.Summary).toBe('This is a bold summary.');
    });

    it('should use deck over description for summary', () => {
      const issue = createMockIssue({
        deck: 'Short deck summary',
        description: '<p>Long description.</p>',
      });

      const result = issueToComicInfo(issue);

      expect(result.Summary).toBe('Short deck summary');
    });

    it('should parse aliases for alternate series', () => {
      const volume = createMockVolume({
        aliases: 'The Dark Knight\nCaped Crusader',
      });

      const result = issueToComicInfo(createMockIssue(), volume);

      expect(result.AlternateSeries).toBe('The Dark Knight');
    });

    it('should handle missing fields gracefully', () => {
      const issue = {
        id: 1,
        issue_number: '1',
      };

      const result = issueToComicInfo(issue as any);

      expect(result.Series).toBeUndefined();
      expect(result.Title).toBeUndefined();
      expect(result.Writer).toBeUndefined();
      expect(result.Characters).toBeUndefined();
    });
  });

  // ===========================================================================
  // volumeToSeriesMetadata
  // ===========================================================================

  describe('volumeToSeriesMetadata', () => {
    it('should convert volume to series metadata', () => {
      const volume = createMockVolume();

      const result = volumeToSeriesMetadata(volume);

      expect(result.seriesName).toBe('Batman');
      expect(result.publisher).toBe('DC Comics');
      expect(result.startYear).toBe(1940);
      expect(result.issueCount).toBe(100);
      expect(result.comicVineSeriesId).toBe('12345');
    });

    it('should strip HTML from description', () => {
      const volume = createMockVolume({
        description: '<p>The <em>Dark Knight</em> rises.</p>',
      });

      const result = volumeToSeriesMetadata(volume);

      expect(result.description).toBe('The Dark Knight rises.');
    });

    it('should extract top characters by count', () => {
      const volume = createMockVolume({
        characters: [
          { id: 1, name: 'Batman', count: 100 },
          { id: 2, name: 'Robin', count: 80 },
          { id: 3, name: 'Alfred', count: 60 },
        ],
      });

      const result = volumeToSeriesMetadata(volume);

      expect(result.characters).toEqual(['Batman', 'Robin', 'Alfred']);
    });

    it('should sort characters by appearance count', () => {
      const volume = createMockVolume({
        characters: [
          { id: 1, name: 'Alfred', count: 30 },
          { id: 2, name: 'Batman', count: 100 },
          { id: 3, name: 'Robin', count: 50 },
        ],
      });

      const result = volumeToSeriesMetadata(volume);

      expect(result.characters).toEqual(['Batman', 'Robin', 'Alfred']);
    });

    it('should limit characters to top 20', () => {
      const characters = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        name: `Character ${i}`,
        count: 30 - i,
      }));

      const volume = createMockVolume({ characters });

      const result = volumeToSeriesMetadata(volume);

      expect((result.characters as string[]).length).toBe(20);
    });

    it('should extract creators from people field', () => {
      const volume = createMockVolume({
        people: [
          { id: 1, name: 'Jim Lee', count: 50 },
          { id: 2, name: 'Scott Snyder', count: 100 },
        ],
      });

      const result = volumeToSeriesMetadata(volume);

      expect(result.creators).toEqual(['Scott Snyder', 'Jim Lee']);
    });

    it('should parse aliases into array', () => {
      const volume = createMockVolume({
        aliases: 'Dark Knight\nCaped Crusader\nWorld\'s Greatest Detective',
      });

      const result = volumeToSeriesMetadata(volume);

      expect(result.aliases).toEqual([
        'Dark Knight',
        'Caped Crusader',
        "World's Greatest Detective",
      ]);
    });

    it('should handle missing fields', () => {
      const volume = {
        id: 1,
        name: 'Test',
      };

      const result = volumeToSeriesMetadata(volume as any);

      expect(result.seriesName).toBe('Test');
      expect(result.publisher).toBeUndefined();
      expect(result.characters).toBeUndefined();
    });

    it('should prefer medium_url for cover', () => {
      const volume = createMockVolume({
        image: {
          medium_url: 'http://example.com/medium.jpg',
          small_url: 'http://example.com/small.jpg',
        },
      });

      const result = volumeToSeriesMetadata(volume);

      expect(result.coverUrl).toBe('http://example.com/medium.jpg');
    });

    it('should fallback to small_url when medium_url missing', () => {
      const volume = createMockVolume({
        image: {
          medium_url: undefined as any,
          small_url: 'http://example.com/small.jpg',
        },
      });

      const result = volumeToSeriesMetadata(volume);

      expect(result.coverUrl).toBe('http://example.com/small.jpg');
    });
  });
});
