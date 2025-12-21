/**
 * Metron API Service
 *
 * Client for the Metron API for fetching comic metadata.
 * Metron is a free, community-driven comic database.
 *
 * API Documentation: https://metron.cloud/api/
 *
 * IMPORTANT: Metron API requires authentication!
 * Users must create an account at https://metron.cloud and configure
 * their credentials in settings (metronUsername/metronPassword).
 */

import { getMetadataSettings, getApiKey } from './config.service.js';
import { MetadataFetchLogger } from './metadata-fetch-logger.service.js';
import { APICache, type CacheOptions } from './api-cache.service.js';

// =============================================================================
// Constants
// =============================================================================

const BASE_URL = 'https://metron.cloud/api';
const USER_AGENT = 'Helixio/0.1.0 (Comic Book Management Tool)';

// Rate limiting settings based on rateLimitLevel (1-10)
// Level 1: 1 req/2s (conservative), Level 10: 1 req/0.2s (aggressive)
const getDelayMs = (level: number): number => {
  const minDelay = 200; // 0.2 seconds at level 10
  const maxDelay = 2000; // 2 seconds at level 1
  const normalized = Math.max(1, Math.min(10, level));
  return maxDelay - ((normalized - 1) / 9) * (maxDelay - minDelay);
};

// =============================================================================
// Types
// =============================================================================

export interface MetronPublisher {
  id: number;
  name: string;
}

export interface MetronSeriesType {
  id: number;
  name: string;
}

export interface MetronSeries {
  id: number;
  /** Series name - used in detail endpoint */
  name?: string;
  /** Series name - used in list/search endpoint (Metron API inconsistency) */
  series?: string;
  sort_name?: string;
  volume?: number;
  year_began?: number;
  year_end?: number;
  issue_count?: number;
  publisher?: MetronPublisher;
  series_type?: MetronSeriesType;
  desc?: string;
  image?: string;
  resource_url?: string;
}

/**
 * Get normalized series name from MetronSeries
 * Handles API inconsistency where list endpoint uses "series" and detail uses "name"
 */
export function getSeriesName(series: MetronSeries): string {
  return series.name || series.series || 'Unknown Series';
}

export interface MetronCredit {
  id: number;
  creator: string;
  role: Array<{
    id: number;
    name: string;
  }>;
}

export interface MetronArc {
  id: number;
  name: string;
}

export interface MetronCharacter {
  id: number;
  name: string;
}

export interface MetronTeam {
  id: number;
  name: string;
}

export interface MetronIssue {
  id: number;
  publisher?: MetronPublisher;
  series?: {
    id: number;
    name: string;
  };
  number: string;
  title?: string;
  name?: string[];
  cover_date?: string;
  store_date?: string;
  price?: string;
  sku?: string;
  isbn?: string;
  upc?: string;
  page?: number;
  desc?: string;
  image?: string;
  cover_hash?: string;
  arcs?: MetronArc[];
  credits?: MetronCredit[];
  characters?: MetronCharacter[];
  teams?: MetronTeam[];
  resource_url?: string;
}

export interface MetronApiResponse<T> {
  count: number;
  next?: string;
  previous?: string;
  results: T[];
}

export interface MetronError {
  code: string;
  message: string;
  statusCode?: number;
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
  const backoffMultiplier = Math.pow(2, consecutiveErrors);
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
// Core API Functions
// =============================================================================

interface MakeRequestOptions {
  sessionId?: string;
  /** Skip cache and force fresh API call */
  skipCache?: boolean;
}

/**
 * Get Metron credentials from config
 * Returns null if credentials are not configured
 */
function getMetronCredentials(): { username: string; password: string } | null {
  const username = getApiKey('metronUsername');
  const password = getApiKey('metronPassword');
  if (!username || !password) {
    return null;
  }
  return { username, password };
}

/**
 * Check if Metron API is available (credentials configured)
 */
export function isMetronAvailable(): boolean {
  return getMetronCredentials() !== null;
}

/**
 * Make a request to the Metron API (uncached, direct API call)
 * Metron API requires HTTP Basic Authentication with username/password.
 * Create an account at https://metron.cloud to get credentials.
 */
async function makeRequestDirect<T>(
  endpoint: string,
  params: Record<string, string> = {},
  sessionId?: string
): Promise<T> {
  // Check for credentials
  const credentials = getMetronCredentials();
  if (!credentials) {
    throw createError(
      'AUTH_REQUIRED',
      'Metron API requires authentication. Please configure metronUsername and metronPassword in settings.',
      401
    );
  }

  // Build URL with parameters
  const url = new URL(`${BASE_URL}${endpoint}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  // Log API call start
  if (sessionId) {
    MetadataFetchLogger.logAPICallStart(sessionId, 'metron', endpoint, params);
  }

  // Create Basic Auth header
  const authString = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await waitForRateLimit();

    try {
      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          Authorization: `Basic ${authString}`,
        },
      });

      // Handle rate limiting (429)
      if (response.status === 429) {
        updateRateLimitState(false);
        if (sessionId) {
          MetadataFetchLogger.logAPICallEnd(sessionId, 'metron', endpoint, {
            success: false,
            error: 'Rate limit exceeded (429)',
            retried: attempt < MAX_RETRIES,
          });
        }
        lastError = createError('RATE_LIMITED', 'Rate limit exceeded', 429);
        continue;
      }

      // Handle authentication errors (401)
      if (response.status === 401) {
        updateRateLimitState(false);
        if (sessionId) {
          MetadataFetchLogger.logAPICallEnd(sessionId, 'metron', endpoint, {
            success: false,
            error: 'Authentication failed - check Metron credentials',
          });
        }
        throw createError('AUTH_FAILED', 'Metron authentication failed. Please check your username and password in settings.', 401);
      }

      // Handle other HTTP errors
      if (!response.ok) {
        updateRateLimitState(false);
        const error = `HTTP ${response.status}: ${response.statusText}`;
        if (sessionId) {
          MetadataFetchLogger.logAPICallEnd(sessionId, 'metron', endpoint, {
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
        // Determine result count based on response structure
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
        MetadataFetchLogger.logAPICallEnd(sessionId, 'metron', endpoint, {
          success: true,
          resultCount,
        });
      }

      return data;
    } catch (err) {
      if (err instanceof Error && 'code' in err) {
        // Re-throw our custom errors (except rate limit which we retry)
        if ((err as MetronError).code !== 'RATE_LIMITED') {
          throw err;
        }
      }

      updateRateLimitState(false);
      lastError = err instanceof Error ? err : new Error(String(err));

      // Only retry on network errors or rate limits
      if (attempt < MAX_RETRIES) {
        if (sessionId) {
          MetadataFetchLogger.logAPICallEnd(sessionId, 'metron', endpoint, {
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
    MetadataFetchLogger.logAPICallEnd(sessionId, 'metron', endpoint, {
      success: false,
      error: lastError?.message || 'Request failed after retries',
    });
  }

  throw lastError || createError('UNKNOWN_ERROR', 'Request failed after retries');
}

/**
 * Make a request to the Metron API with caching
 * Uses APICache to avoid redundant API calls for the same queries
 */
async function makeRequest<T>(
  endpoint: string,
  params: Record<string, string> = {},
  options: MakeRequestOptions | string = {}
): Promise<T> {
  // Handle legacy signature where sessionId was passed directly
  const opts: MakeRequestOptions = typeof options === 'string'
    ? { sessionId: options }
    : options;

  const { sessionId, skipCache = false } = opts;

  // Build cache options
  const cacheOptions: CacheOptions = {
    sessionId,
    forceRefresh: skipCache,
  };

  // Use cached request with stale fallback
  return APICache.getCachedOrFetch<T>(
    'metron',
    endpoint,
    params,
    () => makeRequestDirect<T>(endpoint, params, sessionId),
    cacheOptions
  );
}

/**
 * Create a typed error
 */
function createError(code: string, message: string, statusCode?: number): MetronError & Error {
  const error = new Error(message) as MetronError & Error;
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
  options: { page?: number; publisher?: string; year?: number; sessionId?: string } = {}
): Promise<{
  results: MetronSeries[];
  total: number;
  page: number;
  hasMore: boolean;
}> {
  const params: Record<string, string> = {
    name: query,
  };

  if (options.publisher) {
    params.publisher_name = options.publisher;
  }

  if (options.year) {
    params.year_began = String(options.year);
  }

  if (options.page && options.page > 1) {
    params.page = String(options.page);
  }

  const response = await makeRequest<MetronApiResponse<MetronSeries>>('/series/', params, options.sessionId);

  return {
    results: response.results,
    total: response.count,
    page: options.page || 1,
    hasMore: !!response.next,
  };
}

/**
 * Search for issues
 */
export async function searchIssues(
  options: {
    seriesName?: string;
    seriesId?: number;
    number?: string;
    page?: number;
    sessionId?: string;
  } = {}
): Promise<{
  results: MetronIssue[];
  total: number;
  page: number;
  hasMore: boolean;
}> {
  const params: Record<string, string> = {};

  if (options.seriesName) {
    params.series_name = options.seriesName;
  }

  if (options.seriesId) {
    params.series_id = String(options.seriesId);
  }

  if (options.number) {
    params.number = options.number;
  }

  if (options.page && options.page > 1) {
    params.page = String(options.page);
  }

  const response = await makeRequest<MetronApiResponse<MetronIssue>>('/issue/', params, options.sessionId);

  return {
    results: response.results,
    total: response.count,
    page: options.page || 1,
    hasMore: !!response.next,
  };
}

/**
 * Search for publishers
 */
export async function searchPublishers(
  query: string,
  options: { page?: number } = {}
): Promise<{
  results: MetronPublisher[];
  total: number;
  page: number;
  hasMore: boolean;
}> {
  const params: Record<string, string> = {
    name: query,
  };

  if (options.page && options.page > 1) {
    params.page = String(options.page);
  }

  const response = await makeRequest<MetronApiResponse<MetronPublisher>>('/publisher/', params);

  return {
    results: response.results,
    total: response.count,
    page: options.page || 1,
    hasMore: !!response.next,
  };
}

// =============================================================================
// Detail Functions
// =============================================================================

/**
 * Get series details by ID
 */
export async function getSeries(id: number, sessionId?: string): Promise<MetronSeries | null> {
  try {
    const series = await makeRequest<MetronSeries>(`/series/${id}/`, {}, sessionId);
    return series;
  } catch {
    return null;
  }
}

/**
 * Get all issues for a series
 */
export async function getSeriesIssues(
  seriesId: number,
  options: { page?: number; sessionId?: string } = {}
): Promise<{
  results: MetronIssue[];
  total: number;
  page: number;
  hasMore: boolean;
}> {
  const params: Record<string, string> = {
    series_id: String(seriesId),
  };

  if (options.page && options.page > 1) {
    params.page = String(options.page);
  }

  const response = await makeRequest<MetronApiResponse<MetronIssue>>('/issue/', params, options.sessionId);

  return {
    results: response.results,
    total: response.count,
    page: options.page || 1,
    hasMore: !!response.next,
  };
}

/**
 * Get issue details by ID
 */
export async function getIssue(id: number, sessionId?: string): Promise<MetronIssue | null> {
  try {
    const issue = await makeRequest<MetronIssue>(`/issue/${id}/`, {}, sessionId);
    return issue;
  } catch {
    return null;
  }
}

/**
 * Get publisher details by ID
 */
export async function getPublisher(id: number): Promise<MetronPublisher | null> {
  try {
    const publisher = await makeRequest<MetronPublisher>(`/publisher/${id}/`);
    return publisher;
  } catch {
    return null;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if Metron API is available
 */
export async function checkApiAvailability(): Promise<{
  available: boolean;
  error?: string;
}> {
  try {
    // Make a minimal request to check availability
    await makeRequest<MetronApiResponse<MetronPublisher>>('/publisher/', {
      page_size: '1',
    });

    return {
      available: true,
    };
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Convert Metron issue to ComicInfo-compatible format
 */
export function issueToComicInfo(
  issue: MetronIssue,
  series?: MetronSeries
): Record<string, string | number | undefined> {
  // Extract creators by role
  const getCreatorsByRole = (roleName: string): string | undefined => {
    if (!issue.credits) return undefined;
    const creators = issue.credits.filter((c) =>
      c.role.some((r) => r.name.toLowerCase().includes(roleName.toLowerCase()))
    );
    if (creators.length === 0) return undefined;
    return creators.map((c) => c.creator).join(', ');
  };

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

  const coverDate = parseDate(issue.cover_date);

  return {
    // Basic Info
    Series: series?.name || issue.series?.name,
    Number: issue.number,
    Title: issue.title || (issue.name && issue.name.length > 0 ? issue.name[0] : undefined),
    Summary: issue.desc,
    Volume: series?.volume,

    // Date Info
    Year: coverDate.year,
    Month: coverDate.month,
    Day: coverDate.day,

    // Credits
    Writer: getCreatorsByRole('writer'),
    Penciller: getCreatorsByRole('penciller') || getCreatorsByRole('artist'),
    Inker: getCreatorsByRole('inker'),
    Colorist: getCreatorsByRole('colorist'),
    Letterer: getCreatorsByRole('letterer'),
    CoverArtist: getCreatorsByRole('cover'),
    Editor: getCreatorsByRole('editor'),

    // Content
    Characters: issue.characters?.map((c) => c.name).join(', '),
    Teams: issue.teams?.map((t) => t.name).join(', '),
    StoryArc: issue.arcs?.map((a) => a.name).join(', '),

    // Publishing Info
    Publisher: series?.publisher?.name || issue.publisher?.name,
    PageCount: issue.page,
    Count: series?.issue_count,
    Format: series?.series_type?.name,
    GTIN: issue.upc || issue.isbn,
    Web: issue.resource_url,
  };
}

/**
 * Convert Metron series to series metadata format
 */
export function seriesToSeriesMetadata(series: MetronSeries): Record<string, unknown> {
  return {
    seriesName: getSeriesName(series),
    publisher: series.publisher?.name,
    startYear: series.year_began,
    endYear: series.year_end,
    issueCount: series.issue_count,
    metronSeriesId: String(series.id),
    description: series.desc,
    coverUrl: series.image,
    seriesType: series.series_type?.name,
  };
}
