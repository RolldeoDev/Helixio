/**
 * Grand Comics Database (GCD) API Service
 *
 * Client for the GCD REST API for fetching comic metadata.
 * GCD is the world's largest comics database (2M+ issues).
 *
 * API Documentation: https://www.comics.org/api/
 * License: CC-BY 3.0 (attribution required)
 */

import { getMetadataSettings, getApiKey, hasApiKey } from './config.service.js';
import { MetadataFetchLogger } from './metadata-fetch-logger.service.js';
import { APICache, type CacheOptions } from './api-cache.service.js';
import { logError, logInfo, logDebug, logWarn, createServiceLogger } from './logger.service.js';

const logger = createServiceLogger('gcd');

// =============================================================================
// Constants
// =============================================================================

const BASE_URL = 'https://www.comics.org/api';
const USER_AGENT = 'Helixio/0.1.0 (Comic Book Management Tool)';

// Rate limiting settings based on rateLimitLevel (1-10)
// Level 1: 1 req/3s (conservative), Level 10: 1 req/0.2s (aggressive)
const getDelayMs = (level: number): number => {
  const minDelay = 200; // 0.2 seconds at level 10
  const maxDelay = 3000; // 3 seconds at level 1
  const normalized = Math.max(1, Math.min(10, level));
  return maxDelay - ((normalized - 1) / 9) * (maxDelay - minDelay);
};

// =============================================================================
// Types
// =============================================================================

export interface GCDPublisher {
  id: number;
  name: string;
  year_began?: number;
  year_ended?: number;
  country?: {
    id: number;
    code: string;
    name: string;
  };
  url?: string;
  notes?: string;
}

export interface GCDSeriesType {
  id: number;
  name: string;
}

export interface GCDSeries {
  id: number;
  name: string;
  sort_name?: string;
  year_began?: number;
  year_ended?: number;
  issue_count?: number;
  publisher?: {
    id: number;
    name: string;
  };
  series_type?: GCDSeriesType;
  country?: {
    id: number;
    code: string;
    name: string;
  };
  language?: {
    id: number;
    code: string;
    name: string;
  };
  notes?: string;
  tracking_notes?: string;
  publication_notes?: string;
  color?: string;
  dimensions?: string;
  paper_stock?: string;
  binding?: string;
  publishing_format?: string;
  is_comics_publication?: boolean;
  // Issue list when fetching single series
  issues?: Array<{
    id: number;
    number: string;
    key_date?: string;
  }>;
}

export interface GCDStoryType {
  id: number;
  name: string;
}

export interface GCDStory {
  id: number;
  sequence_number: number;
  title?: string;
  title_inferred?: boolean;
  first_line?: string;
  type?: GCDStoryType;
  feature?: string;
  feature_logo?: string;
  genre?: string;
  job_number?: string;
  page_count?: number;
  page_count_uncertain?: boolean;
  // Text-based credits (need parsing)
  script?: string;
  pencils?: string;
  inks?: string;
  colors?: string;
  letters?: string;
  editing?: string;
  characters?: string;
  synopsis?: string;
  reprint_notes?: string;
  notes?: string;
}

export interface GCDIssue {
  id: number;
  number: string;
  title?: string;
  volume?: string;
  display_volume_with_number?: boolean;
  series?: {
    id: number;
    name: string;
  };
  indicia_publisher?: {
    id: number;
    name: string;
  };
  brand?: {
    id: number;
    name: string;
  };
  publication_date?: string; // Cover date as text
  key_date?: string; // Normalized date (YYYY-MM-DD)
  on_sale_date?: string; // Actual sale date
  indicia_frequency?: string;
  price?: string;
  page_count?: number;
  page_count_uncertain?: boolean;
  editing?: string; // Text-based editor credits
  isbn?: string;
  barcode?: string;
  rating?: string;
  notes?: string;
  keywords?: string[];
  stories?: GCDStory[];
}

export interface GCDApiResponse<T> {
  count?: number;
  next?: string;
  previous?: string;
  results?: T[];
  // Single item responses don't have these fields
}

export interface GCDError {
  code: string;
  message: string;
  statusCode?: number;
}

export interface ParsedCredits {
  writer?: string;
  penciller?: string;
  inker?: string;
  colorist?: string;
  letterer?: string;
  editor?: string;
  coverArtist?: string;
}

// =============================================================================
// Rate Limiting
// =============================================================================

let lastRequestTime = 0;
let consecutiveErrors = 0;
const MAX_RETRIES = 3;

/**
 * Wait for rate limit before making request
 */
async function waitForRateLimit(): Promise<void> {
  const settings = getMetadataSettings();
  const delay = getDelayMs(settings.rateLimitLevel);

  // Apply exponential backoff for consecutive errors
  const backoffMultiplier = Math.pow(2, Math.min(consecutiveErrors, 5));
  const totalDelay = delay * backoffMultiplier;

  const timeSinceLastRequest = Date.now() - lastRequestTime;
  if (timeSinceLastRequest < totalDelay) {
    await new Promise((resolve) => setTimeout(resolve, totalDelay - timeSinceLastRequest));
  }
}

/**
 * Update rate limit state after request
 */
function updateRateLimitState(success: boolean): void {
  lastRequestTime = Date.now();
  if (success) {
    consecutiveErrors = 0;
  } else {
    consecutiveErrors = Math.min(consecutiveErrors + 1, 5);
  }
}

// =============================================================================
// Authentication
// =============================================================================

/**
 * Get Basic auth header if credentials are configured
 */
function getAuthHeader(): string | null {
  const gcdEmail = getApiKey('gcdEmail');
  const gcdPassword = getApiKey('gcdPassword');

  if (!gcdEmail || !gcdPassword) {
    return null;
  }

  const credentials = Buffer.from(`${gcdEmail}:${gcdPassword}`).toString('base64');
  return `Basic ${credentials}`;
}

/**
 * Check if GCD credentials are configured
 */
export function hasGCDCredentials(): boolean {
  return hasApiKey('gcdEmail') && hasApiKey('gcdPassword');
}

// =============================================================================
// Credit Parsing
// =============================================================================

/**
 * Parse text-based credits into structured format
 * Handles various GCD credit formats:
 * - "Writer: Stan Lee; Penciler: Jack Kirby"
 * - "script by Stan Lee, art by Jack Kirby"
 * - "Stan Lee (writer), Jack Kirby (artist)"
 * - "Stan Lee [script]; Jack Kirby [pencils]"
 */
export function parseCredits(story: GCDStory): ParsedCredits {
  const credits: ParsedCredits = {};

  // Direct fields from story
  if (story.script) {
    credits.writer = cleanCreditText(story.script);
  }
  if (story.pencils) {
    credits.penciller = cleanCreditText(story.pencils);
  }
  if (story.inks) {
    credits.inker = cleanCreditText(story.inks);
  }
  if (story.colors) {
    credits.colorist = cleanCreditText(story.colors);
  }
  if (story.letters) {
    credits.letterer = cleanCreditText(story.letters);
  }
  if (story.editing) {
    credits.editor = cleanCreditText(story.editing);
  }

  return credits;
}

/**
 * Clean credit text by removing common annotations and normalizing
 */
function cleanCreditText(text: string): string {
  if (!text) return '';

  return (
    text
      // Remove uncertainty markers
      .replace(/\s*\?\s*/g, '')
      // Remove "credited as" notes
      .replace(/\s*\[credited as[^\]]*\]/gi, '')
      // Remove "as" aliases
      .replace(/\s*\(as [^)]*\)/gi, '')
      // Remove other bracketed notes
      .replace(/\s*\[[^\]]*\]/g, '')
      // Clean up whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Parse credits from all stories in an issue
 * Combines credits from all stories, prioritizing cover story for cover artist
 */
export function parseIssueCredits(stories: GCDStory[]): ParsedCredits {
  const combined: ParsedCredits = {};

  // Group stories by type
  const coverStories = stories.filter(
    (s) => s.type?.name?.toLowerCase().includes('cover') || s.sequence_number === 0
  );
  const mainStories = stories.filter(
    (s) => s.type?.name?.toLowerCase().includes('comic story') || s.type?.name?.toLowerCase().includes('story')
  );

  // Get cover artist from cover stories
  for (const story of coverStories) {
    const credits = parseCredits(story);
    if (credits.penciller && !combined.coverArtist) {
      combined.coverArtist = credits.penciller;
    }
  }

  // Get main credits from story content (prefer first main story)
  const storiesToParse = mainStories.length > 0 ? mainStories : stories;
  for (const story of storiesToParse) {
    const credits = parseCredits(story);

    if (credits.writer && !combined.writer) {
      combined.writer = credits.writer;
    }
    if (credits.penciller && !combined.penciller) {
      combined.penciller = credits.penciller;
    }
    if (credits.inker && !combined.inker) {
      combined.inker = credits.inker;
    }
    if (credits.colorist && !combined.colorist) {
      combined.colorist = credits.colorist;
    }
    if (credits.letterer && !combined.letterer) {
      combined.letterer = credits.letterer;
    }
    if (credits.editor && !combined.editor) {
      combined.editor = credits.editor;
    }
  }

  return combined;
}

/**
 * Parse character appearances from text
 * GCD format: "Batman [Bruce Wayne]; Robin [Dick Grayson]; Joker"
 */
export function parseCharacters(text: string | undefined): string[] {
  if (!text) return [];

  return text
    .split(/[;,]/)
    .map((char) => {
      // Extract main name, removing secret identity brackets
      const match = char.match(/^([^[\]]+)/);
      return match && match[1] ? match[1].trim() : char.trim();
    })
    .filter((char) => char.length > 0);
}

// =============================================================================
// Core API Functions
// =============================================================================

interface MakeRequestOptions {
  sessionId?: string;
  /** Skip cache and force fresh API call */
  skipCache?: boolean;
}

/**
 * Make a request to the GCD API (uncached, direct API call)
 */
async function makeRequestDirect<T>(
  endpoint: string,
  params: Record<string, string> = {},
  sessionId?: string
): Promise<T> {
  // Build URL with parameters
  const url = new URL(`${BASE_URL}${endpoint}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  // Log API call start
  if (sessionId) {
    MetadataFetchLogger.logAPICallStart(sessionId, 'gcd', endpoint, params);
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await waitForRateLimit();

    try {
      const headers: Record<string, string> = {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      };

      // Add authentication if configured
      const authHeader = getAuthHeader();
      if (authHeader) {
        headers['Authorization'] = authHeader;
      }

      const response = await fetch(url.toString(), { headers });

      // Handle rate limiting (429)
      if (response.status === 429) {
        updateRateLimitState(false);
        if (sessionId) {
          MetadataFetchLogger.logAPICallEnd(sessionId, 'gcd', endpoint, {
            success: false,
            error: 'Rate limit exceeded (429)',
            retried: attempt < MAX_RETRIES,
          });
        }
        lastError = createError('RATE_LIMITED', 'Rate limit exceeded', 429);
        continue;
      }

      // Handle authentication errors
      if (response.status === 401 || response.status === 403) {
        updateRateLimitState(false);
        const error = `Authentication failed (${response.status}): Check GCD credentials`;
        if (sessionId) {
          MetadataFetchLogger.logAPICallEnd(sessionId, 'gcd', endpoint, {
            success: false,
            error,
          });
        }
        throw createError('AUTH_ERROR', error, response.status);
      }

      // Handle other HTTP errors
      if (!response.ok) {
        updateRateLimitState(false);
        const error = `HTTP ${response.status}: ${response.statusText}`;
        if (sessionId) {
          MetadataFetchLogger.logAPICallEnd(sessionId, 'gcd', endpoint, {
            success: false,
            error,
          });
        }
        throw createError('HTTP_ERROR', error, response.status);
      }

      const data = (await response.json()) as T;
      updateRateLimitState(true);

      // Log successful API call
      if (sessionId) {
        let resultCount = 0;
        if (Array.isArray(data)) {
          resultCount = data.length;
        } else if (data && typeof data === 'object' && 'results' in data) {
          resultCount = Array.isArray((data as Record<string, unknown>).results)
            ? ((data as Record<string, unknown>).results as unknown[]).length
            : 1;
        } else if (data) {
          resultCount = 1;
        }
        MetadataFetchLogger.logAPICallEnd(sessionId, 'gcd', endpoint, {
          success: true,
          resultCount,
        });
      }

      return data;
    } catch (err) {
      if (err instanceof Error && 'code' in err) {
        // Re-throw our custom errors (except rate limit which we retry)
        if ((err as GCDError).code !== 'RATE_LIMITED') {
          throw err;
        }
      }

      updateRateLimitState(false);
      lastError = err instanceof Error ? err : new Error(String(err));

      // Only retry on network errors or rate limits
      if (attempt < MAX_RETRIES) {
        if (sessionId) {
          MetadataFetchLogger.logAPICallEnd(sessionId, 'gcd', endpoint, {
            success: false,
            error: lastError.message,
            retried: true,
          });
        }
        continue;
      }
    }
  }

  if (sessionId) {
    MetadataFetchLogger.logAPICallEnd(sessionId, 'gcd', endpoint, {
      success: false,
      error: lastError?.message || 'Request failed after retries',
    });
  }

  throw lastError || createError('UNKNOWN_ERROR', 'Request failed after retries');
}

/**
 * Make a request to the GCD API with caching
 */
async function makeRequest<T>(
  endpoint: string,
  params: Record<string, string> = {},
  options: MakeRequestOptions | string = {}
): Promise<T> {
  // Handle legacy signature where sessionId was passed directly
  const opts: MakeRequestOptions = typeof options === 'string' ? { sessionId: options } : options;

  const { sessionId, skipCache = false } = opts;

  // Build cache options
  const cacheOptions: CacheOptions = {
    sessionId,
    forceRefresh: skipCache,
  };

  // Use cached request with stale fallback
  return APICache.getCachedOrFetch<T>(
    'gcd',
    endpoint,
    params,
    () => makeRequestDirect<T>(endpoint, params, sessionId),
    cacheOptions
  );
}

/**
 * Create a typed error
 */
function createError(code: string, message: string, statusCode?: number): GCDError & Error {
  const error = new Error(message) as GCDError & Error;
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

// =============================================================================
// Search Functions
// =============================================================================

/**
 * Search for series by name
 */
export async function searchSeries(
  query: string,
  options: { year?: number; sessionId?: string } = {}
): Promise<{
  results: GCDSeries[];
  total: number;
  hasMore: boolean;
}> {
  try {
    // Build endpoint path
    let endpoint = `/series/name/${encodeURIComponent(query)}/`;
    if (options.year) {
      endpoint = `/series/name/${encodeURIComponent(query)}/year/${options.year}/`;
    }

    const response = await makeRequest<GCDSeries | GCDSeries[] | GCDApiResponse<GCDSeries>>(
      endpoint,
      {},
      options.sessionId
    );

    // Handle different response formats
    let results: GCDSeries[];
    if (Array.isArray(response)) {
      results = response;
    } else if ('results' in response && Array.isArray(response.results)) {
      results = response.results;
    } else if (response && typeof response === 'object' && 'id' in response) {
      // Single series response
      results = [response as GCDSeries];
    } else {
      results = [];
    }

    return {
      results,
      total: results.length,
      hasMore: false, // GCD API doesn't paginate name searches well
    };
  } catch (err) {
    // Graceful degradation - return empty results on error
    logWarn('gcd', 'Search series failed', { error: err instanceof Error ? err.message : String(err) });
    return { results: [], total: 0, hasMore: false };
  }
}

/**
 * Search for issues by series name and number
 */
export async function searchIssues(
  options: {
    seriesName?: string;
    number?: string;
    year?: number;
    sessionId?: string;
  } = {}
): Promise<{
  results: GCDIssue[];
  total: number;
  hasMore: boolean;
}> {
  try {
    if (!options.seriesName) {
      return { results: [], total: 0, hasMore: false };
    }

    let endpoint = `/series/name/${encodeURIComponent(options.seriesName)}/`;
    if (options.number) {
      endpoint += `issue/${encodeURIComponent(options.number)}/`;
    }
    if (options.year) {
      endpoint += `year/${options.year}/`;
    }

    const response = await makeRequest<GCDIssue | GCDIssue[] | GCDApiResponse<GCDIssue>>(
      endpoint,
      {},
      options.sessionId
    );

    // Handle different response formats
    let results: GCDIssue[];
    if (Array.isArray(response)) {
      results = response;
    } else if ('results' in response && Array.isArray(response.results)) {
      results = response.results;
    } else if (response && typeof response === 'object' && 'id' in response) {
      results = [response as GCDIssue];
    } else {
      results = [];
    }

    return {
      results,
      total: results.length,
      hasMore: false,
    };
  } catch (err) {
    logWarn('gcd', 'Search issues failed', { error: err instanceof Error ? err.message : String(err) });
    return { results: [], total: 0, hasMore: false };
  }
}

// =============================================================================
// Detail Functions
// =============================================================================

/**
 * Get series details by ID
 */
export async function getSeries(id: number, sessionId?: string): Promise<GCDSeries | null> {
  try {
    const series = await makeRequest<GCDSeries>(`/series/${id}/`, {}, sessionId);
    return series;
  } catch (err) {
    logWarn('gcd', 'Get series failed', { id, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Get all issues for a series
 * Note: GCD series response includes issues list, so we fetch the series
 */
export async function getSeriesIssues(
  seriesId: number,
  options: { page?: number; sessionId?: string } = {}
): Promise<{
  results: GCDIssue[];
  total: number;
  page: number;
  hasMore: boolean;
}> {
  try {
    // The GCD API includes issues in the series response
    const series = await makeRequest<GCDSeries>(`/series/${seriesId}/`, {}, options.sessionId);

    if (!series || !series.issues) {
      return { results: [], total: 0, page: 1, hasMore: false };
    }

    // Convert issue stubs to full issue objects
    // For full details, each issue would need to be fetched separately
    const issueStubs = series.issues.map((issue) => ({
      id: issue.id,
      number: issue.number,
      key_date: issue.key_date,
      series: { id: seriesId, name: series.name },
    })) as GCDIssue[];

    return {
      results: issueStubs,
      total: issueStubs.length,
      page: 1,
      hasMore: false,
    };
  } catch (err) {
    logWarn('gcd', 'Get series issues failed', { seriesId, error: err instanceof Error ? err.message : String(err) });
    return { results: [], total: 0, page: 1, hasMore: false };
  }
}

/**
 * Get issue details by ID
 */
export async function getIssue(id: number, sessionId?: string): Promise<GCDIssue | null> {
  try {
    const issue = await makeRequest<GCDIssue>(`/issue/${id}/`, {}, sessionId);
    return issue;
  } catch (err) {
    logWarn('gcd', 'Get issue failed', { id, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Get publisher details by ID
 */
export async function getPublisher(id: number, sessionId?: string): Promise<GCDPublisher | null> {
  try {
    const publisher = await makeRequest<GCDPublisher>(`/publisher/${id}/`, {}, sessionId);
    return publisher;
  } catch (err) {
    logWarn('gcd', 'Get publisher failed', { id, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if GCD API is available
 */
export async function checkApiAvailability(): Promise<{
  available: boolean;
  configured: boolean;
  error?: string;
}> {
  // First check if credentials are configured
  if (!hasGCDCredentials()) {
    return {
      available: false,
      configured: false,
      error: 'GCD credentials not configured (requires email and password)',
    };
  }

  try {
    // Make a minimal request to check availability
    // Search for a known series to test the API
    await makeRequestDirect<GCDSeries | GCDSeries[]>('/series/name/Batman/');

    return {
      available: true,
      configured: true,
    };
  } catch (err) {
    return {
      available: false,
      configured: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Convert GCD issue to ComicInfo-compatible format
 */
export function issueToComicInfo(
  issue: GCDIssue,
  series?: GCDSeries
): Record<string, string | number | undefined> {
  // Parse credits from stories
  const credits = issue.stories ? parseIssueCredits(issue.stories) : {};

  // Parse date
  const parseDate = (dateStr?: string): { year?: number; month?: number; day?: number } => {
    if (!dateStr) return {};
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return {};
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
    };
  };

  const keyDate = parseDate(issue.key_date);

  // Get characters from first main story
  const mainStory = issue.stories?.find(
    (s) => s.type?.name?.toLowerCase().includes('story') || s.sequence_number > 0
  );
  const characters = mainStory ? parseCharacters(mainStory.characters) : [];

  return {
    // Basic Info
    Series: series?.name || issue.series?.name,
    Number: issue.number,
    Title: issue.title,
    Summary: mainStory?.synopsis,
    Volume: issue.volume ? parseInt(issue.volume, 10) : undefined,

    // Date Info
    Year: keyDate.year,
    Month: keyDate.month,
    Day: keyDate.day,

    // Credits
    Writer: credits.writer,
    Penciller: credits.penciller,
    Inker: credits.inker,
    Colorist: credits.colorist,
    Letterer: credits.letterer,
    CoverArtist: credits.coverArtist,
    Editor: credits.editor || cleanCreditText(issue.editing || ''),

    // Content
    Characters: characters.join(', '),
    Genre: mainStory?.genre,

    // Publishing Info
    Publisher: series?.publisher?.name || issue.indicia_publisher?.name,
    PageCount: issue.page_count,
    Count: series?.issue_count,
    Format: series?.series_type?.name,
    GTIN: issue.barcode || issue.isbn,
    Web: `https://www.comics.org/issue/${issue.id}/`,

    // GCD-specific
    Notes: `Data from Grand Comics Database™`,
  };
}
