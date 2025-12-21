/**
 * API Mock Utilities
 *
 * Provides mock responses for ComicVine and Metron API calls.
 * Used for isolated unit testing without hitting real APIs.
 */

import { vi } from 'vitest';
import type { SeriesMetadata, IssueMetadata, MetadataSource } from '../../metadata-providers/types.js';

// =============================================================================
// ComicVine API Mocks
// =============================================================================

export interface MockComicVineVolume {
  id: number;
  name: string;
  publisher?: { id: number; name: string };
  start_year?: string;
  count_of_issues?: number;
  description?: string;
  image?: { medium_url?: string };
  site_detail_url?: string;
}

export interface MockComicVineIssue {
  id: number;
  name?: string;
  issue_number: string;
  volume: { id: number; name: string };
  cover_date?: string;
  description?: string;
  image?: { medium_url?: string };
  site_detail_url?: string;
  person_credits?: Array<{ id: number; name: string; role: string }>;
  character_credits?: Array<{ id: number; name: string }>;
  team_credits?: Array<{ id: number; name: string }>;
}

/**
 * Create a mock ComicVine volume response.
 */
export function createMockComicVineVolume(overrides: Partial<MockComicVineVolume> = {}): MockComicVineVolume {
  return {
    id: 12345,
    name: 'Batman',
    publisher: { id: 10, name: 'DC Comics' },
    start_year: '2011',
    count_of_issues: 52,
    description: '<p>The New 52 Batman series.</p>',
    image: { medium_url: 'https://comicvine.com/batman/cover.jpg' },
    site_detail_url: 'https://comicvine.com/batman/',
    ...overrides,
  };
}

/**
 * Create a mock ComicVine issue response.
 */
export function createMockComicVineIssue(overrides: Partial<MockComicVineIssue> = {}): MockComicVineIssue {
  return {
    id: 67890,
    name: 'The Court of Owls, Part 1',
    issue_number: '1',
    volume: { id: 12345, name: 'Batman' },
    cover_date: '2011-09-01',
    description: '<p>Batman discovers a secret society.</p>',
    image: { medium_url: 'https://comicvine.com/batman-1/cover.jpg' },
    site_detail_url: 'https://comicvine.com/batman-1/',
    person_credits: [
      { id: 1, name: 'Scott Snyder', role: 'writer' },
      { id: 2, name: 'Greg Capullo', role: 'penciler' },
    ],
    character_credits: [
      { id: 100, name: 'Batman' },
      { id: 101, name: 'James Gordon' },
    ],
    team_credits: [],
    ...overrides,
  };
}

/**
 * Create mock ComicVine service.
 */
export function createMockComicVineService(volumes: MockComicVineVolume[] = [], issues: MockComicVineIssue[] = []) {
  return {
    searchVolumes: vi.fn().mockImplementation(async (query: string) => {
      const results = volumes.filter((v) =>
        v.name.toLowerCase().includes(query.toLowerCase())
      );
      return results;
    }),

    getVolume: vi.fn().mockImplementation(async (volumeId: number) => {
      return volumes.find((v) => v.id === volumeId) ?? null;
    }),

    getVolumeIssues: vi.fn().mockImplementation(async (volumeId: number) => {
      return issues.filter((i) => i.volume.id === volumeId);
    }),

    getIssue: vi.fn().mockImplementation(async (issueId: number) => {
      return issues.find((i) => i.id === issueId) ?? null;
    }),

    searchIssues: vi.fn().mockImplementation(async (volumeId: number, issueNumber: string) => {
      return issues.filter(
        (i) => i.volume.id === volumeId && i.issue_number === issueNumber
      );
    }),
  };
}

// =============================================================================
// Metron API Mocks
// =============================================================================

export interface MockMetronSeries {
  id: number;
  name: string;
  sort_name: string;
  publisher: { id: number; name: string };
  year_began?: number;
  year_end?: number;
  issue_count?: number;
  desc?: string;
  image?: string;
}

export interface MockMetronIssue {
  id: number;
  number: string;
  name?: string;
  series: { id: number; name: string };
  cover_date?: string;
  desc?: string;
  image?: string;
  credits?: Array<{ id: number; creator: string; role: Array<{ id: number; name: string }> }>;
  characters?: Array<{ id: number; name: string }>;
  teams?: Array<{ id: number; name: string }>;
}

/**
 * Create a mock Metron series response.
 */
export function createMockMetronSeries(overrides: Partial<MockMetronSeries> = {}): MockMetronSeries {
  return {
    id: 11111,
    name: 'Batman',
    sort_name: 'Batman',
    publisher: { id: 1, name: 'DC Comics' },
    year_began: 2011,
    year_end: 2016,
    issue_count: 52,
    desc: 'The New 52 Batman series.',
    image: 'https://metron.cloud/batman/cover.jpg',
    ...overrides,
  };
}

/**
 * Create a mock Metron issue response.
 */
export function createMockMetronIssue(overrides: Partial<MockMetronIssue> = {}): MockMetronIssue {
  return {
    id: 22222,
    number: '1',
    name: 'The Court of Owls, Part 1',
    series: { id: 11111, name: 'Batman' },
    cover_date: '2011-09',
    desc: 'Batman discovers a secret society.',
    image: 'https://metron.cloud/batman-1/cover.jpg',
    credits: [
      { id: 1, creator: 'Scott Snyder', role: [{ id: 1, name: 'Writer' }] },
      { id: 2, creator: 'Greg Capullo', role: [{ id: 2, name: 'Penciller' }] },
    ],
    characters: [
      { id: 100, name: 'Batman' },
      { id: 101, name: 'James Gordon' },
    ],
    teams: [],
    ...overrides,
  };
}

/**
 * Create mock Metron service.
 */
export function createMockMetronService(series: MockMetronSeries[] = [], issues: MockMetronIssue[] = []) {
  return {
    searchSeries: vi.fn().mockImplementation(async (query: string) => {
      const results = series.filter((s) =>
        s.name.toLowerCase().includes(query.toLowerCase())
      );
      return results;
    }),

    getSeries: vi.fn().mockImplementation(async (seriesId: number) => {
      return series.find((s) => s.id === seriesId) ?? null;
    }),

    getSeriesIssues: vi.fn().mockImplementation(async (seriesId: number) => {
      return issues.filter((i) => i.series.id === seriesId);
    }),

    getIssue: vi.fn().mockImplementation(async (issueId: number) => {
      return issues.find((i) => i.id === issueId) ?? null;
    }),

    searchIssue: vi.fn().mockImplementation(async (seriesId: number, issueNumber: string) => {
      return issues.find(
        (i) => i.series.id === seriesId && i.number === issueNumber
      ) ?? null;
    }),

    isAuthenticated: vi.fn().mockReturnValue(true),
  };
}

// =============================================================================
// Generic Metadata Mocks
// =============================================================================

/**
 * Create a mock SeriesMetadata object.
 */
export function createMockSeriesMetadata(
  source: MetadataSource = 'comicvine',
  overrides: Partial<SeriesMetadata> = {}
): SeriesMetadata {
  return {
    source,
    sourceId: `${source}-123`,
    name: 'Batman',
    publisher: 'DC Comics',
    startYear: 2011,
    endYear: 2016,
    issueCount: 52,
    description: 'The New 52 Batman series.',
    shortDescription: 'Batman in the New 52.',
    url: `https://${source}.com/batman`,
    coverUrl: `https://${source}.com/batman/cover.jpg`,
    aliases: ['The Dark Knight'],
    creators: [
      { id: 1, name: 'Scott Snyder' },
      { id: 2, name: 'Greg Capullo' },
    ],
    characters: [
      { id: 100, name: 'Batman' },
      { id: 101, name: 'Robin' },
    ],
    ...overrides,
  };
}

/**
 * Create a mock IssueMetadata object.
 */
export function createMockIssueMetadata(
  source: MetadataSource = 'comicvine',
  overrides: Partial<IssueMetadata> = {}
): IssueMetadata {
  return {
    source,
    sourceId: `${source}-issue-1`,
    seriesId: `${source}-123`,
    seriesName: 'Batman',
    number: '1',
    title: 'The Court of Owls, Part 1',
    coverDate: '2011-09',
    storeDate: '2011-09-07',
    description: 'Batman discovers a secret society in Gotham.',
    coverUrl: `https://${source}.com/batman-1/cover.jpg`,
    url: `https://${source}.com/batman-1`,
    writer: 'Scott Snyder',
    penciller: 'Greg Capullo',
    inker: 'Jonathan Glapion',
    colorist: 'FCO Plascencia',
    letterer: 'Richard Starkings',
    coverArtist: 'Greg Capullo',
    editor: 'Mike Marts',
    characters: ['Batman', 'James Gordon', 'Dick Grayson'],
    teams: ['Bat-Family'],
    locations: ['Gotham City', 'Wayne Manor'],
    storyArcs: ['Court of Owls'],
    ...overrides,
  };
}

/**
 * Create mock metadata search service.
 */
export function createMockMetadataSearchService() {
  return {
    searchSeries: vi.fn().mockResolvedValue([]),
    searchIssue: vi.fn().mockResolvedValue([]),
    getSeriesMetadata: vi.fn().mockResolvedValue(null),
    getIssueMetadata: vi.fn().mockResolvedValue(null),
    searchAllSources: vi.fn().mockResolvedValue(new Map()),
  };
}

// =============================================================================
// API Error Mocks
// =============================================================================

/**
 * Create a rate limit error response.
 */
export function createRateLimitError() {
  const error = new Error('Rate limit exceeded');
  (error as any).status = 429;
  (error as any).retryAfter = 60;
  return error;
}

/**
 * Create an authentication error response.
 */
export function createAuthError() {
  const error = new Error('Invalid API key');
  (error as any).status = 401;
  return error;
}

/**
 * Create a not found error response.
 */
export function createNotFoundError() {
  const error = new Error('Resource not found');
  (error as any).status = 404;
  return error;
}

/**
 * Create a server error response.
 */
export function createServerError() {
  const error = new Error('Internal server error');
  (error as any).status = 500;
  return error;
}
