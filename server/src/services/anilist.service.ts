/**
 * AniList API Service
 *
 * Client for the AniList GraphQL API for fetching manga metadata.
 * AniList is a comprehensive anime/manga database with rich metadata.
 *
 * API Documentation: https://docs.anilist.co/
 *
 * NOTE: AniList's public GraphQL API does not require authentication for read-only queries.
 * This service is separate from tracker.service.ts which handles OAuth-authenticated
 * reading progress sync.
 */

import { getMetadataSettings } from './config.service.js';
import { MetadataFetchLogger } from './metadata-fetch-logger.service.js';
import { APICache, type CacheOptions } from './api-cache.service.js';

// =============================================================================
// Constants
// =============================================================================

const ANILIST_API = 'https://graphql.anilist.co';
const USER_AGENT = 'Helixio/0.1.0 (Comic Book Management Tool)';

// Rate limiting settings based on rateLimitLevel (1-10)
// AniList allows 90 req/min, so we can be more aggressive than Metron
// Level 1: 1 req/1.5s (conservative), Level 10: 1 req/0.15s (aggressive)
const getDelayMs = (level: number): number => {
  const minDelay = 150; // 0.15 seconds at level 10
  const maxDelay = 1500; // 1.5 seconds at level 1
  const normalized = Math.max(1, Math.min(10, level));
  return maxDelay - ((normalized - 1) / 9) * (maxDelay - minDelay);
};

// =============================================================================
// Types
// =============================================================================

export interface AniListTitle {
  romaji: string;
  english: string | null;
  native: string | null;
}

export interface AniListFuzzyDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

export interface AniListCoverImage {
  extraLarge: string;
  large: string;
  medium: string;
  color: string | null;
}

export interface AniListStaffEdge {
  role: string;
  node: {
    id: number;
    name: {
      full: string;
      native: string | null;
      alternative: string[];  // Pen names, other names
    };
    image: {
      large: string | null;
      medium: string | null;
    } | null;
    siteUrl: string;  // AniList profile URL
  };
}

export interface AniListCharacterEdge {
  role: 'MAIN' | 'SUPPORTING' | 'BACKGROUND';
  node: {
    id: number;
    name: {
      full: string;
      native: string | null;
    };
    image: {
      large: string | null;
      medium: string | null;
    } | null;
  };
}

export interface AniListMediaTag {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  rank: number;
  isMediaSpoiler: boolean;
}

export interface AniListManga {
  id: number;
  idMal: number | null;
  title: AniListTitle;
  synonyms: string[];
  format: 'MANGA' | 'NOVEL' | 'ONE_SHOT' | 'SPECIAL';
  status: 'FINISHED' | 'RELEASING' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS';
  description: string | null;
  startDate: AniListFuzzyDate | null;
  endDate: AniListFuzzyDate | null;
  chapters: number | null;
  volumes: number | null;
  countryOfOrigin: string | null;
  coverImage: AniListCoverImage;
  bannerImage: string | null;
  genres: string[];
  averageScore: number | null;
  meanScore: number | null;
  popularity: number | null;
  favourites: number | null;
  tags: AniListMediaTag[];
  staff: {
    edges: AniListStaffEdge[];
  };
  characters: {
    edges: AniListCharacterEdge[];
  };
  siteUrl: string;
}

export interface AniListPageInfo {
  total: number;
  currentPage: number;
  lastPage: number;
  hasNextPage: boolean;
  perPage: number;
}

export interface AniListSearchResponse {
  Page: {
    pageInfo: AniListPageInfo;
    media: AniListManga[];
  };
}

export interface AniListMediaResponse {
  Media: AniListManga | null;
}

export interface AniListError {
  code: string;
  message: string;
  statusCode?: number;
}

// =============================================================================
// GraphQL Queries
// =============================================================================

const MANGA_SEARCH_QUERY = `
query ($search: String, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      total
      currentPage
      lastPage
      hasNextPage
      perPage
    }
    media(search: $search, type: MANGA, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
      id
      idMal
      title {
        romaji
        english
        native
      }
      synonyms
      format
      status
      description(asHtml: false)
      startDate {
        year
        month
        day
      }
      endDate {
        year
        month
        day
      }
      chapters
      volumes
      countryOfOrigin
      coverImage {
        extraLarge
        large
        medium
        color
      }
      bannerImage
      genres
      averageScore
      meanScore
      popularity
      favourites
      tags {
        id
        name
        description
        category
        rank
        isMediaSpoiler
      }
      staff(sort: RELEVANCE, perPage: 15) {
        edges {
          role
          node {
            id
            name {
              full
              native
              alternative
            }
            image {
              large
              medium
            }
            siteUrl
          }
        }
      }
      characters(sort: [ROLE, RELEVANCE], perPage: 25) {
        edges {
          role
          node {
            id
            name {
              full
              native
            }
            image {
              large
              medium
            }
          }
        }
      }
      siteUrl
    }
  }
}
`;

const MANGA_BY_ID_QUERY = `
query ($id: Int) {
  Media(id: $id, type: MANGA) {
    id
    idMal
    title {
      romaji
      english
      native
    }
    synonyms
    format
    status
    description(asHtml: false)
    startDate {
      year
      month
      day
    }
    endDate {
      year
      month
      day
    }
    chapters
    volumes
    countryOfOrigin
    coverImage {
      extraLarge
      large
      medium
      color
    }
    bannerImage
    genres
    averageScore
    meanScore
    popularity
    favourites
    tags {
      id
      name
      description
      category
      rank
      isMediaSpoiler
    }
    staff(sort: RELEVANCE, perPage: 15) {
      edges {
        role
        node {
          id
          name {
            full
            native
            alternative
          }
          image {
            large
            medium
          }
          siteUrl
        }
      }
    }
    characters(sort: [ROLE, RELEVANCE], perPage: 25) {
      edges {
        role
        node {
          id
          name {
            full
            native
          }
          image {
            large
            medium
          }
        }
      }
    }
    siteUrl
  }
}
`;

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
 * Create a typed error
 */
function createError(code: string, message: string, statusCode?: number): AniListError & Error {
  const error = new Error(message) as AniListError & Error;
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

/**
 * Make a GraphQL request to the AniList API (uncached, direct API call)
 */
async function makeRequestDirect<T>(
  query: string,
  variables: Record<string, unknown> = {},
  sessionId?: string
): Promise<T> {
  // Log API call start
  if (sessionId) {
    // Convert variables to string record for logging
    const stringVars = Object.fromEntries(
      Object.entries(variables).map(([k, v]) => [k, String(v)])
    );
    MetadataFetchLogger.logAPICallStart(sessionId, 'anilist', '/graphql', stringVars);
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await waitForRateLimit();

    try {
      const response = await fetch(ANILIST_API, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      });

      // Handle rate limiting (429)
      if (response.status === 429) {
        updateRateLimitState(false);
        if (sessionId) {
          MetadataFetchLogger.logAPICallEnd(sessionId, 'anilist', '/graphql', {
            success: false,
            error: 'Rate limit exceeded (429)',
            retried: attempt < MAX_RETRIES,
          });
        }
        lastError = createError('RATE_LIMITED', 'Rate limit exceeded', 429);
        continue;
      }

      // Handle other HTTP errors
      if (!response.ok) {
        updateRateLimitState(false);
        const error = `HTTP ${response.status}: ${response.statusText}`;
        if (sessionId) {
          MetadataFetchLogger.logAPICallEnd(sessionId, 'anilist', '/graphql', {
            success: false,
            error,
          });
        }
        throw createError('HTTP_ERROR', error, response.status);
      }

      const json = (await response.json()) as {
        data?: T;
        errors?: Array<{ message: string; status?: number }>;
      };

      // Handle GraphQL errors
      if (json.errors && json.errors.length > 0) {
        updateRateLimitState(false);
        const errorMsg = json.errors[0]?.message || 'GraphQL error';
        if (sessionId) {
          MetadataFetchLogger.logAPICallEnd(sessionId, 'anilist', '/graphql', {
            success: false,
            error: errorMsg,
          });
        }
        throw createError('GRAPHQL_ERROR', errorMsg);
      }

      if (!json.data) {
        throw createError('EMPTY_RESPONSE', 'No data in response');
      }

      updateRateLimitState(true);

      // Log successful API call
      if (sessionId) {
        MetadataFetchLogger.logAPICallEnd(sessionId, 'anilist', '/graphql', {
          success: true,
          resultCount: 1,
        });
      }

      return json.data;
    } catch (err) {
      if (err instanceof Error && 'code' in err) {
        // Re-throw our custom errors (except rate limit which we retry)
        if ((err as AniListError).code !== 'RATE_LIMITED') {
          throw err;
        }
      }

      updateRateLimitState(false);
      lastError = err instanceof Error ? err : new Error(String(err));

      // Only retry on network errors or rate limits
      if (attempt < MAX_RETRIES) {
        if (sessionId) {
          MetadataFetchLogger.logAPICallEnd(sessionId, 'anilist', '/graphql', {
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
    MetadataFetchLogger.logAPICallEnd(sessionId, 'anilist', '/graphql', {
      success: false,
      error: lastError?.message || 'Request failed after retries',
    });
  }

  throw lastError || createError('UNKNOWN_ERROR', 'Request failed after retries');
}

/**
 * Make a GraphQL request to the AniList API with caching
 */
async function makeRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options: MakeRequestOptions = {}
): Promise<T> {
  const { sessionId, skipCache = false } = options;

  // Build cache options
  const cacheOptions: CacheOptions = {
    sessionId,
    forceRefresh: skipCache,
  };

  // Create a cache key based on the query type
  const endpoint = query.includes('$search') ? '/search' : '/media';

  // Use cached request with stale fallback
  return APICache.getCachedOrFetch<T>(
    'anilist' as 'comicvine', // Type assertion needed until types.ts is updated
    endpoint,
    variables,
    () => makeRequestDirect<T>(query, variables, sessionId),
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
  results: AniListManga[];
  total: number;
  page: number;
  hasMore: boolean;
}> {
  const perPage = Math.min(options.limit || 10, 25); // AniList max is 25
  const page = options.page || 1;

  const response = await makeRequest<AniListSearchResponse>(
    MANGA_SEARCH_QUERY,
    { search: query, page, perPage },
    { sessionId: options.sessionId }
  );

  return {
    results: response.Page.media,
    total: response.Page.pageInfo.total,
    page: response.Page.pageInfo.currentPage,
    hasMore: response.Page.pageInfo.hasNextPage,
  };
}

/**
 * Get manga details by AniList ID
 */
export async function getMangaById(
  id: number,
  sessionId?: string
): Promise<AniListManga | null> {
  try {
    const response = await makeRequest<AniListMediaResponse>(
      MANGA_BY_ID_QUERY,
      { id },
      { sessionId }
    );

    return response.Media;
  } catch {
    return null;
  }
}

/**
 * Check if AniList API is available
 * AniList doesn't require configuration (public API)
 */
export async function checkApiAvailability(): Promise<{
  available: boolean;
  configured: boolean;
  error?: string;
}> {
  try {
    // Make a minimal request to check availability
    const response = await fetch(ANILIST_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: '{ Page(perPage: 1) { pageInfo { total } } }',
      }),
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
 * Get preferred title for a manga (English > Romaji > Native)
 */
export function getPreferredTitle(manga: AniListManga): string {
  return manga.title.english || manga.title.romaji || manga.title.native || 'Unknown';
}

/**
 * Get all title variants for matching
 */
export function getAllTitles(manga: AniListManga): string[] {
  const titles: string[] = [];

  if (manga.title.english) titles.push(manga.title.english);
  if (manga.title.romaji) titles.push(manga.title.romaji);
  if (manga.title.native) titles.push(manga.title.native);
  if (manga.synonyms) titles.push(...manga.synonyms);

  return titles.filter(Boolean);
}

/**
 * Extract staff by role
 */
export function getStaffByRole(
  manga: AniListManga,
  rolePattern: string
): Array<{ id: number; name: string }> {
  return manga.staff.edges
    .filter((edge) => edge.role.toLowerCase().includes(rolePattern.toLowerCase()))
    .map((edge) => ({
      id: edge.node.id,
      name: edge.node.name.full,
    }));
}

/**
 * Get main characters
 */
export function getMainCharacters(
  manga: AniListManga,
  limit: number = 20
): Array<{ id: number; name: string; role: string }> {
  return manga.characters.edges
    .slice(0, limit)
    .map((edge) => ({
      id: edge.node.id,
      name: edge.node.name.full,
      role: edge.role,
    }));
}

/**
 * Parse AniList fuzzy date to year number
 */
export function fuzzyDateToYear(date: AniListFuzzyDate | null): number | undefined {
  return date?.year || undefined;
}

/**
 * Map AniList format to series type
 */
export function formatToSeriesType(format: AniListManga['format']): string {
  const formatMap: Record<AniListManga['format'], string> = {
    MANGA: 'Manga',
    NOVEL: 'Light Novel',
    ONE_SHOT: 'One-Shot',
    SPECIAL: 'Special',
  };
  return formatMap[format] || format;
}

/**
 * Map AniList status to publication status
 */
export function statusToPublicationStatus(status: AniListManga['status']): string {
  const statusMap: Record<AniListManga['status'], string> = {
    FINISHED: 'Completed',
    RELEASING: 'Ongoing',
    NOT_YET_RELEASED: 'Upcoming',
    CANCELLED: 'Cancelled',
    HIATUS: 'Hiatus',
  };
  return statusMap[status] || status;
}
