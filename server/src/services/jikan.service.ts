/**
 * Jikan API Service
 *
 * Client for the Jikan API (unofficial MyAnimeList API) for fetching manga metadata.
 * Jikan provides access to MyAnimeList data without requiring authentication.
 *
 * API Documentation: https://docs.api.jikan.moe/
 *
 * IMPORTANT: Jikan has strict rate limits:
 * - 60 requests per minute
 * - 3 requests per second
 *
 * This service uses a FIXED conservative rate limit (2 req/sec) that is NOT
 * configurable via rateLimitLevel to avoid overloading the public API.
 */

import { MetadataFetchLogger } from './metadata-fetch-logger.service.js';
import { APICache, type CacheOptions } from './api-cache.service.js';

// =============================================================================
// Constants
// =============================================================================

const JIKAN_API = 'https://api.jikan.moe/v4';
const USER_AGENT = 'Helixio/0.1.0 (Comic Book Management Tool)';

// Fixed conservative rate limit for Jikan (NOT configurable)
// 500ms = 2 requests/second (more conservative than Jikan's 3 req/sec limit)
const JIKAN_MIN_DELAY_MS = 500;

// =============================================================================
// Types
// =============================================================================

export interface JikanImage {
  image_url: string;
  small_image_url: string;
  large_image_url: string;
}

export interface JikanImages {
  jpg: JikanImage;
  webp: JikanImage;
}

export interface JikanMalUrl {
  mal_id: number;
  type: string;
  name: string;
  url: string;
}

export interface JikanAuthor {
  mal_id: number;
  type: string;
  name: string;
  url: string;
}

export interface JikanPublished {
  from: string | null;
  to: string | null;
  prop: {
    from: { day: number | null; month: number | null; year: number | null };
    to: { day: number | null; month: number | null; year: number | null };
  };
  string: string;
}

export interface JikanManga {
  mal_id: number;
  url: string;
  images: JikanImages;
  approved: boolean;
  titles: Array<{ type: string; title: string }>;
  title: string;
  title_english: string | null;
  title_japanese: string | null;
  title_synonyms: string[];
  type: 'Manga' | 'Novel' | 'Light Novel' | 'One-shot' | 'Doujinshi' | 'Manhwa' | 'Manhua' | 'OEL';
  chapters: number | null;
  volumes: number | null;
  status: 'Publishing' | 'Finished' | 'On Hiatus' | 'Discontinued' | 'Not yet published';
  publishing: boolean;
  published: JikanPublished;
  score: number | null;
  scored_by: number | null;
  rank: number | null;
  popularity: number | null;
  members: number | null;
  favorites: number | null;
  synopsis: string | null;
  background: string | null;
  authors: JikanAuthor[];
  serializations: JikanMalUrl[];
  genres: JikanMalUrl[];
  explicit_genres: JikanMalUrl[];
  themes: JikanMalUrl[];
  demographics: JikanMalUrl[];
}

export interface JikanPagination {
  last_visible_page: number;
  has_next_page: boolean;
  current_page: number;
  items: {
    count: number;
    total: number;
    per_page: number;
  };
}

export interface JikanSearchResponse {
  pagination: JikanPagination;
  data: JikanManga[];
}

export interface JikanMangaResponse {
  data: JikanManga;
}

export interface JikanError {
  code: string;
  message: string;
  statusCode?: number;
}

// =============================================================================
// Rate Limiting (Fixed, NOT configurable)
// =============================================================================

let lastRequestTime = 0;
let consecutiveErrors = 0;
const MAX_RETRIES = 3;

/**
 * Wait for rate limit before making request
 * Uses FIXED 500ms delay (2 req/sec) - NOT configurable
 */
async function waitForRateLimit(): Promise<void> {
  // Apply exponential backoff for consecutive errors
  const backoffMultiplier = Math.pow(2, consecutiveErrors);
  const totalDelay = JIKAN_MIN_DELAY_MS * backoffMultiplier;

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
 * Create a typed error
 */
function createError(code: string, message: string, statusCode?: number): JikanError & Error {
  const error = new Error(message) as JikanError & Error;
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

/**
 * Make a request to the Jikan API (uncached, direct API call)
 */
async function makeRequestDirect<T>(
  endpoint: string,
  params: Record<string, string> = {},
  sessionId?: string
): Promise<T> {
  // Build URL with parameters
  const url = new URL(`${JIKAN_API}${endpoint}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  // Log API call start
  if (sessionId) {
    MetadataFetchLogger.logAPICallStart(sessionId, 'jikan', endpoint, params);
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await waitForRateLimit();

    try {
      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
        },
      });

      // Handle rate limiting (429)
      if (response.status === 429) {
        updateRateLimitState(false);
        if (sessionId) {
          MetadataFetchLogger.logAPICallEnd(sessionId, 'jikan', endpoint, {
            success: false,
            error: 'Rate limit exceeded (429)',
            retried: attempt < MAX_RETRIES,
          });
        }
        lastError = createError('RATE_LIMITED', 'Rate limit exceeded', 429);
        // Jikan rate limit: wait extra time before retry
        await new Promise((resolve) => setTimeout(resolve, 2000));
        continue;
      }

      // Handle 404 (not found)
      if (response.status === 404) {
        updateRateLimitState(true); // Not an error, just not found
        if (sessionId) {
          MetadataFetchLogger.logAPICallEnd(sessionId, 'jikan', endpoint, {
            success: true,
            resultCount: 0,
          });
        }
        throw createError('NOT_FOUND', 'Resource not found', 404);
      }

      // Handle other HTTP errors
      if (!response.ok) {
        updateRateLimitState(false);
        const error = `HTTP ${response.status}: ${response.statusText}`;
        if (sessionId) {
          MetadataFetchLogger.logAPICallEnd(sessionId, 'jikan', endpoint, {
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
        if (data && typeof data === 'object' && 'data' in data) {
          const responseData = (data as Record<string, unknown>).data;
          if (Array.isArray(responseData)) {
            resultCount = responseData.length;
          } else if (responseData) {
            resultCount = 1;
          }
        }
        MetadataFetchLogger.logAPICallEnd(sessionId, 'jikan', endpoint, {
          success: true,
          resultCount,
        });
      }

      return data;
    } catch (err) {
      if (err instanceof Error && 'code' in err) {
        // Re-throw our custom errors (except rate limit which we retry)
        const jikanErr = err as JikanError;
        if (jikanErr.code !== 'RATE_LIMITED') {
          throw err;
        }
      }

      updateRateLimitState(false);
      lastError = err instanceof Error ? err : new Error(String(err));

      // Only retry on network errors or rate limits
      if (attempt < MAX_RETRIES) {
        if (sessionId) {
          MetadataFetchLogger.logAPICallEnd(sessionId, 'jikan', endpoint, {
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
    MetadataFetchLogger.logAPICallEnd(sessionId, 'jikan', endpoint, {
      success: false,
      error: lastError?.message || 'Request failed after retries',
    });
  }

  throw lastError || createError('UNKNOWN_ERROR', 'Request failed after retries');
}

/**
 * Make a request to the Jikan API with caching
 */
async function makeRequest<T>(
  endpoint: string,
  params: Record<string, string> = {},
  options: MakeRequestOptions = {}
): Promise<T> {
  const { sessionId, skipCache = false } = options;

  // Build cache options
  const cacheOptions: CacheOptions = {
    sessionId,
    forceRefresh: skipCache,
  };

  // Use cached request with stale fallback
  return APICache.getCachedOrFetch<T>(
    'mal' as 'comicvine', // Type assertion needed until types.ts is updated
    endpoint,
    params,
    () => makeRequestDirect<T>(endpoint, params, sessionId),
    cacheOptions
  );
}

// =============================================================================
// Public API Functions
// =============================================================================

/**
 * Search for manga by name
 */
export async function searchManga(
  query: string,
  options: { limit?: number; page?: number; sessionId?: string } = {}
): Promise<{
  results: JikanManga[];
  total: number;
  page: number;
  hasMore: boolean;
}> {
  const limit = Math.min(options.limit || 10, 25); // Jikan max is 25
  const page = options.page || 1;

  const params: Record<string, string> = {
    q: query,
    limit: String(limit),
    page: String(page),
    order_by: 'popularity',
    sort: 'asc',
  };

  const response = await makeRequest<JikanSearchResponse>(
    '/manga',
    params,
    { sessionId: options.sessionId }
  );

  return {
    results: response.data,
    total: response.pagination.items.total,
    page: response.pagination.current_page,
    hasMore: response.pagination.has_next_page,
  };
}

/**
 * Get manga details by MAL ID
 */
export async function getMangaById(
  id: number,
  sessionId?: string
): Promise<JikanManga | null> {
  try {
    const response = await makeRequest<JikanMangaResponse>(
      `/manga/${id}/full`,
      {},
      { sessionId }
    );

    return response.data;
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as JikanError).code === 'NOT_FOUND') {
      return null;
    }
    throw err;
  }
}

/**
 * Check if Jikan API is available
 * Jikan doesn't require configuration (public API)
 */
export async function checkApiAvailability(): Promise<{
  available: boolean;
  configured: boolean;
  error?: string;
}> {
  try {
    // Make a minimal request to check availability
    const response = await fetch(`${JIKAN_API}/manga?limit=1`, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      return {
        available: false,
        configured: true, // No config needed
        error: `HTTP ${response.status}`,
      };
    }

    return {
      available: true,
      configured: true, // No config needed for public API
    };
  } catch (err) {
    return {
      available: false,
      configured: true,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get preferred title for a manga (English > Japanese > Title)
 */
export function getPreferredTitle(manga: JikanManga): string {
  return manga.title_english || manga.title_japanese || manga.title || 'Unknown';
}

/**
 * Get all title variants for matching
 */
export function getAllTitles(manga: JikanManga): string[] {
  const titles: string[] = [manga.title];

  if (manga.title_english) titles.push(manga.title_english);
  if (manga.title_japanese) titles.push(manga.title_japanese);
  if (manga.title_synonyms) titles.push(...manga.title_synonyms);

  // Also include titles from the titles array
  if (manga.titles) {
    for (const t of manga.titles) {
      if (t.title && !titles.includes(t.title)) {
        titles.push(t.title);
      }
    }
  }

  return titles.filter(Boolean);
}

/**
 * Get authors with their roles
 */
export function getAuthors(manga: JikanManga): Array<{ id: number; name: string; role: string }> {
  return manga.authors.map((author) => ({
    id: author.mal_id,
    name: author.name,
    role: author.type, // "Story" or "Art" or "Story & Art"
  }));
}

/**
 * Get all genres combined (genres + themes + demographics)
 */
export function getAllGenres(manga: JikanManga): string[] {
  const genres: string[] = [];

  if (manga.genres) genres.push(...manga.genres.map((g) => g.name));
  if (manga.themes) genres.push(...manga.themes.map((t) => t.name));
  if (manga.demographics) genres.push(...manga.demographics.map((d) => d.name));

  return genres;
}

/**
 * Parse start year from published dates
 */
export function getStartYear(manga: JikanManga): number | undefined {
  return manga.published?.prop?.from?.year || undefined;
}

/**
 * Parse end year from published dates
 */
export function getEndYear(manga: JikanManga): number | undefined {
  return manga.published?.prop?.to?.year || undefined;
}

/**
 * Map Jikan type to series type
 */
export function typeToSeriesType(type: JikanManga['type']): string {
  const typeMap: Record<JikanManga['type'], string> = {
    Manga: 'Manga',
    Novel: 'Novel',
    'Light Novel': 'Light Novel',
    'One-shot': 'One-Shot',
    Doujinshi: 'Doujinshi',
    Manhwa: 'Manhwa',
    Manhua: 'Manhua',
    OEL: 'OEL Manga',
  };
  return typeMap[type] || type;
}

/**
 * Map Jikan status to publication status
 */
export function statusToPublicationStatus(status: JikanManga['status']): string {
  const statusMap: Record<JikanManga['status'], string> = {
    Publishing: 'Ongoing',
    Finished: 'Completed',
    'On Hiatus': 'Hiatus',
    Discontinued: 'Cancelled',
    'Not yet published': 'Upcoming',
  };
  return statusMap[status] || status;
}
