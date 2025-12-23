/**
 * ComicVine API Service
 *
 * Client for the ComicVine API for fetching comic metadata.
 * Implements rate limiting with exponential backoff.
 *
 * API Documentation: https://comicvine.gamespot.com/api/documentation
 */

import { getApiKey, getMetadataSettings } from './config.service.js';
import { MetadataFetchLogger } from './metadata-fetch-logger.service.js';
import { APICache, type CacheOptions } from './api-cache.service.js';
import { comicvineLogger as logger } from './logger.service.js';

// =============================================================================
// Constants
// =============================================================================

const BASE_URL = 'https://comicvine.gamespot.com/api';
const USER_AGENT = 'Helixio/0.1.0 (Comic Book Management Tool)';

// Rate limiting settings based on rateLimitLevel (1-10)
// Level 1: 1 req/3s (conservative), Level 10: 1 req/0.3s (aggressive)
const getDelayMs = (level: number): number => {
  const minDelay = 300; // 0.3 seconds at level 10
  const maxDelay = 3000; // 3 seconds at level 1
  const normalized = Math.max(1, Math.min(10, level));
  return maxDelay - ((normalized - 1) / 9) * (maxDelay - minDelay);
};

// =============================================================================
// Types
// =============================================================================

export interface ComicVineSearchResult {
  id: number;
  name: string;
  aliases?: string;
  deck?: string;
  description?: string;
  image?: {
    icon_url?: string;
    medium_url?: string;
    screen_url?: string;
    screen_large_url?: string;
    small_url?: string;
    super_url?: string;
    thumb_url?: string;
    tiny_url?: string;
    original_url?: string;
  };
  api_detail_url?: string;
  site_detail_url?: string;
  resource_type?: string;
}

/** Generic entry with count for volume credits */
export interface ComicVineCredit {
  id: number;
  name: string;
  count?: number;
}

export interface ComicVineVolume {
  id: number;
  name: string;
  aliases?: string;
  count_of_issues?: number;
  deck?: string;
  description?: string;
  date_added?: string;
  date_last_updated?: string;
  first_issue?: {
    id: number;
    name: string;
    issue_number: string;
  };
  last_issue?: {
    id: number;
    name: string;
    issue_number: string;
  };
  image?: ComicVineSearchResult['image'];
  publisher?: {
    id: number;
    name: string;
  };
  start_year?: string;
  api_detail_url?: string;
  site_detail_url?: string;
  // Extended fields - characters, concepts, people (creators), locations, objects
  characters?: ComicVineCredit[];
  concepts?: ComicVineCredit[];
  people?: ComicVineCredit[];
  locations?: ComicVineCredit[];
  objects?: ComicVineCredit[];
}

export interface ComicVineIssue {
  id: number;
  name?: string;
  aliases?: string;
  issue_number: string;
  cover_date?: string;
  store_date?: string;
  deck?: string;
  description?: string;
  image?: ComicVineSearchResult['image'];
  volume?: {
    id: number;
    name: string;
  };
  character_credits?: Array<{
    id: number;
    name: string;
  }>;
  team_credits?: Array<{
    id: number;
    name: string;
  }>;
  location_credits?: Array<{
    id: number;
    name: string;
  }>;
  story_arc_credits?: Array<{
    id: number;
    name: string;
  }>;
  person_credits?: Array<{
    id: number;
    name: string;
    role: string;
  }>;
  api_detail_url?: string;
  site_detail_url?: string;
}

export interface ComicVineCharacter {
  id: number;
  name: string;
  aliases?: string;
  real_name?: string;
  deck?: string;
  description?: string;
  image?: ComicVineSearchResult['image'];
  gender?: number;
  origin?: {
    id: number;
    name: string;
  };
  publisher?: {
    id: number;
    name: string;
  };
  first_appeared_in_issue?: {
    id: number;
    name: string;
    issue_number: string;
  };
  api_detail_url?: string;
  site_detail_url?: string;
}

export interface ComicVinePerson {
  id: number;
  name: string;
  aliases?: string;
  deck?: string;
  description?: string;
  image?: ComicVineSearchResult['image'];
  birth?: string;
  death?: string;
  country?: string;
  hometown?: string;
  gender?: number;
  api_detail_url?: string;
  site_detail_url?: string;
}

export interface ComicVineApiResponse<T> {
  error: string;
  limit: number;
  offset: number;
  number_of_page_results: number;
  number_of_total_results: number;
  status_code: number;
  results: T;
  version: string;
}

export interface ComicVineError {
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
  /** Custom TTL for caching (in milliseconds) */
  ttl?: number;
}

/**
 * Make a request to the ComicVine API (uncached, direct API call)
 */
async function makeRequestDirect<T>(
  endpoint: string,
  params: Record<string, string> = {},
  sessionId?: string
): Promise<ComicVineApiResponse<T>> {
  const apiKey = getApiKey('comicVine');
  if (!apiKey) {
    throw createError('API_KEY_MISSING', 'ComicVine API key not configured');
  }

  // Build URL with parameters
  const url = new URL(`${BASE_URL}${endpoint}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('format', 'json');

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  // Log API call start
  if (sessionId) {
    MetadataFetchLogger.logAPICallStart(sessionId, 'comicvine', endpoint, params);
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
          MetadataFetchLogger.logAPICallEnd(sessionId, 'comicvine', endpoint, {
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
          MetadataFetchLogger.logAPICallEnd(sessionId, 'comicvine', endpoint, {
            success: false,
            error,
          });
        }
        throw createError('HTTP_ERROR', error, response.status);
      }

      const data = (await response.json()) as ComicVineApiResponse<T>;

      // Check API-level errors
      if (data.status_code !== 1) {
        updateRateLimitState(false);
        const error = data.error || 'Unknown API error';
        if (sessionId) {
          MetadataFetchLogger.logAPICallEnd(sessionId, 'comicvine', endpoint, {
            success: false,
            error,
          });
        }
        throw createError('API_ERROR', error, data.status_code);
      }

      updateRateLimitState(true);

      // Log successful API call
      if (sessionId) {
        const resultCount = Array.isArray(data.results)
          ? data.results.length
          : data.results
            ? 1
            : 0;
        MetadataFetchLogger.logAPICallEnd(sessionId, 'comicvine', endpoint, {
          success: true,
          resultCount,
        });
      }

      return data;
    } catch (err) {
      if (err instanceof Error && 'code' in err) {
        // Re-throw our custom errors
        throw err;
      }

      updateRateLimitState(false);
      lastError = err instanceof Error ? err : new Error(String(err));

      // Only retry on network errors
      if (attempt < MAX_RETRIES) {
        if (sessionId) {
          MetadataFetchLogger.logAPICallEnd(sessionId, 'comicvine', endpoint, {
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
    MetadataFetchLogger.logAPICallEnd(sessionId, 'comicvine', endpoint, {
      success: false,
      error: lastError?.message || 'Request failed after retries',
    });
  }

  throw lastError || createError('UNKNOWN_ERROR', 'Request failed after retries');
}

/**
 * Make a request to the ComicVine API with caching
 * Uses APICache to avoid redundant API calls for the same queries
 */
async function makeRequest<T>(
  endpoint: string,
  params: Record<string, string> = {},
  options: MakeRequestOptions | string = {}
): Promise<ComicVineApiResponse<T>> {
  // Handle legacy signature where sessionId was passed directly
  const opts: MakeRequestOptions = typeof options === 'string'
    ? { sessionId: options }
    : options;

  const { sessionId, skipCache = false, ttl } = opts;

  // Build cache options
  const cacheOptions: CacheOptions = {
    sessionId,
    forceRefresh: skipCache,
    ...(ttl !== undefined && { ttl }),
  };

  // Use cached request with stale fallback
  return APICache.getCachedOrFetch<ComicVineApiResponse<T>>(
    'comicvine',
    endpoint,
    params,
    () => makeRequestDirect<T>(endpoint, params, sessionId),
    cacheOptions
  );
}

/**
 * Create a typed error
 */
function createError(code: string, message: string, statusCode?: number): ComicVineError & Error {
  const error = new Error(message) as ComicVineError & Error;
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

// =============================================================================
// Search Functions
// =============================================================================

/**
 * Search for volumes (series) by name
 *
 * Uses the /volumes/ endpoint with a filter for fast searches instead of
 * /search/ + individual getVolume() calls. This reduces N+1 API calls to just 1.
 */
export async function searchVolumes(
  query: string,
  options: { limit?: number; offset?: number; sessionId?: string } = {}
): Promise<{
  results: ComicVineVolume[];
  total: number;
  offset: number;
  limit: number;
}> {
  const params: Record<string, string> = {
    filter: `name:${query}`,
    limit: String(options.limit || 10),
    offset: String(options.offset || 0),
    sort: 'count_of_issues:desc', // Sort by issue count to prioritize major series
    field_list: [
      'id',
      'name',
      'aliases',
      'deck',
      'description',
      'count_of_issues',
      'start_year',
      'publisher',
      'image',
      'first_issue',
      'last_issue',
      'api_detail_url',
      'site_detail_url',
    ].join(','),
  };

  const response = await makeRequest<ComicVineVolume[]>('/volumes/', params, options.sessionId);

  return {
    results: response.results || [],
    total: response.number_of_total_results,
    offset: response.offset,
    limit: response.limit,
  };
}

/**
 * Search for issues
 */
export async function searchIssues(
  query: string,
  options: { limit?: number; offset?: number; sessionId?: string } = {}
): Promise<{
  results: ComicVineSearchResult[];
  total: number;
  offset: number;
  limit: number;
}> {
  const params: Record<string, string> = {
    query,
    resources: 'issue',
    limit: String(options.limit || 10),
    offset: String(options.offset || 0),
  };

  const response = await makeRequest<ComicVineSearchResult[]>('/search/', params, options.sessionId);

  return {
    results: response.results,
    total: response.number_of_total_results,
    offset: response.offset,
    limit: response.limit,
  };
}

/**
 * Search for characters
 */
export async function searchCharacters(
  query: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{
  results: ComicVineSearchResult[];
  total: number;
  offset: number;
  limit: number;
}> {
  const params: Record<string, string> = {
    query,
    resources: 'character',
    limit: String(options.limit || 10),
    offset: String(options.offset || 0),
  };

  const response = await makeRequest<ComicVineSearchResult[]>('/search/', params);

  return {
    results: response.results,
    total: response.number_of_total_results,
    offset: response.offset,
    limit: response.limit,
  };
}

/**
 * Search for people (creators)
 */
export async function searchPeople(
  query: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{
  results: ComicVineSearchResult[];
  total: number;
  offset: number;
  limit: number;
}> {
  const params: Record<string, string> = {
    query,
    resources: 'person',
    limit: String(options.limit || 10),
    offset: String(options.offset || 0),
  };

  const response = await makeRequest<ComicVineSearchResult[]>('/search/', params);

  return {
    results: response.results,
    total: response.number_of_total_results,
    offset: response.offset,
    limit: response.limit,
  };
}

// =============================================================================
// Detail Functions
// =============================================================================

/**
 * Get volume (series) details by ID
 *
 * Fetches comprehensive volume data including:
 * - Basic info: name, description, publisher, year, issue count
 * - Credits: characters, concepts, creators, locations, objects
 * - Issue range: first_issue, last_issue
 * - Images: cover images at multiple resolutions
 */
export async function getVolume(id: number, sessionId?: string): Promise<ComicVineVolume | null> {
  try {
    const params: Record<string, string> = {
      field_list: [
        // Basic info
        'id',
        'name',
        'aliases',
        'deck',
        'description',
        'count_of_issues',
        'start_year',
        'publisher',
        'image',
        // Issue range
        'first_issue',
        'last_issue',
        // URLs
        'api_detail_url',
        'site_detail_url',
        // Timestamps
        'date_added',
        'date_last_updated',
        // Credits - these provide valuable series context
        'characters',
        'concepts',
        'people',
        'locations',
        'objects',
      ].join(','),
    };

    const response = await makeRequest<ComicVineVolume>(`/volume/4050-${id}/`, params, sessionId);
    return response.results;
  } catch (err) {
    logger.debug({ volumeId: id, err }, 'Failed to fetch volume');
    return null;
  }
}

/**
 * Get all issues for a volume
 *
 * Includes full credit information (person_credits, character_credits, etc.)
 * to avoid needing separate getIssue() calls for each matched file.
 * This reduces API calls from N+1 to just the paginated batch requests.
 */
export async function getVolumeIssues(
  volumeId: number,
  options: { limit?: number; offset?: number; sessionId?: string } = {}
): Promise<{
  results: ComicVineIssue[];
  total: number;
  offset: number;
  limit: number;
}> {
  const params: Record<string, string> = {
    filter: `volume:${volumeId}`,
    sort: 'issue_number:asc',
    limit: String(options.limit || 100),
    offset: String(options.offset || 0),
    // Include all fields needed for metadata, including credits
    // This avoids needing individual getIssue() calls for each file
    field_list: [
      'id',
      'name',
      'aliases',
      'issue_number',
      'cover_date',
      'store_date',
      'deck',
      'description',
      'image',
      'volume',
      'api_detail_url',
      'site_detail_url',
      // Credit fields - fetched in batch to avoid N individual API calls
      'person_credits',
      'character_credits',
      'team_credits',
      'location_credits',
      'story_arc_credits',
    ].join(','),
  };

  const response = await makeRequest<ComicVineIssue[]>('/issues/', params, options.sessionId);

  return {
    results: response.results,
    total: response.number_of_total_results,
    offset: response.offset,
    limit: response.limit,
  };
}

/**
 * Get issue details by ID
 */
export async function getIssue(id: number, sessionId?: string): Promise<ComicVineIssue | null> {
  try {
    const params: Record<string, string> = {
      field_list: 'id,name,aliases,issue_number,cover_date,store_date,deck,description,image,volume,character_credits,team_credits,location_credits,story_arc_credits,person_credits,api_detail_url,site_detail_url',
    };

    const response = await makeRequest<ComicVineIssue>(`/issue/4000-${id}/`, params, sessionId);
    return response.results;
  } catch (err) {
    logger.debug({ issueId: id, err }, 'Failed to fetch issue');
    return null;
  }
}

/**
 * Get character details by ID
 */
export async function getCharacter(id: number): Promise<ComicVineCharacter | null> {
  try {
    const params: Record<string, string> = {
      field_list: 'id,name,aliases,real_name,deck,description,image,gender,origin,publisher,first_appeared_in_issue,api_detail_url,site_detail_url',
    };

    const response = await makeRequest<ComicVineCharacter>(`/character/4005-${id}/`, params);
    return response.results;
  } catch (err) {
    logger.debug({ characterId: id, err }, 'Failed to fetch character');
    return null;
  }
}

/**
 * Get person (creator) details by ID
 */
export async function getPerson(id: number): Promise<ComicVinePerson | null> {
  try {
    const params: Record<string, string> = {
      field_list: 'id,name,aliases,deck,description,image,birth,death,country,hometown,gender,api_detail_url,site_detail_url',
    };

    const response = await makeRequest<ComicVinePerson>(`/person/4040-${id}/`, params);
    return response.results;
  } catch (err) {
    logger.debug({ personId: id, err }, 'Failed to fetch person');
    return null;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if ComicVine API is configured and available
 */
export async function checkApiAvailability(): Promise<{
  available: boolean;
  configured: boolean;
  error?: string;
}> {
  const apiKey = getApiKey('comicVine');

  if (!apiKey) {
    return {
      available: false,
      configured: false,
      error: 'API key not configured',
    };
  }

  try {
    // Make a minimal request to check availability
    await makeRequest<ComicVineSearchResult[]>('/search/', {
      query: 'test',
      resources: 'volume',
      limit: '1',
    });

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
 * Convert ComicVine issue to ComicInfo-compatible format
 */
export function issueToComicInfo(
  issue: ComicVineIssue,
  volume?: ComicVineVolume
): Record<string, string | number | undefined> {
  // Extract creators by role
  const getCreatorsByRole = (role: string): string | undefined => {
    const creators = issue.person_credits?.filter((p) =>
      p.role.toLowerCase().includes(role.toLowerCase())
    );
    if (!creators || creators.length === 0) return undefined;
    return creators.map((c) => c.name).join(', ');
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

  // Parse volume aliases for AlternateSeries (first alias if available)
  const parseAliases = (aliases?: string): string | undefined => {
    if (!aliases) return undefined;
    const aliasList = aliases.split('\n').map(a => a.trim()).filter(a => a.length > 0);
    return aliasList.length > 0 ? aliasList[0] : undefined;
  };

  return {
    // Basic Info
    Series: volume?.name || issue.volume?.name,
    Number: issue.issue_number,
    Title: issue.name,
    Summary: issue.deck || issue.description?.replace(/<[^>]*>/g, '').substring(0, 2000),
    AlternateSeries: parseAliases(volume?.aliases || issue.aliases),

    // Date Info
    Year: coverDate.year,
    Month: coverDate.month,
    Day: coverDate.day,

    // Credits
    Writer: getCreatorsByRole('writer'),
    Penciller: getCreatorsByRole('penciler') || getCreatorsByRole('penciller'),
    Inker: getCreatorsByRole('inker'),
    Colorist: getCreatorsByRole('colorist'),
    Letterer: getCreatorsByRole('letterer'),
    CoverArtist: getCreatorsByRole('cover'),
    Editor: getCreatorsByRole('editor'),

    // Content
    Characters: issue.character_credits?.map((c) => c.name).join(', '),
    Teams: issue.team_credits?.map((t) => t.name).join(', '),
    Locations: issue.location_credits?.map((l) => l.name).join(', '),
    StoryArc: issue.story_arc_credits?.map((s) => s.name).join(', '),

    // Publishing Info
    Publisher: volume?.publisher?.name,
    Count: volume?.count_of_issues,
    Web: issue.site_detail_url,
  };
}

/**
 * Convert ComicVine volume to series metadata format
 *
 * Includes extended fields:
 * - deck: Short description
 * - characters: Top characters appearing in the series (by appearance count)
 * - locations: Locations featured in the series
 * - concepts: Concepts/themes (also mapped to genres)
 * - aliases: Alternative series names
 */
export function volumeToSeriesMetadata(volume: ComicVineVolume): Record<string, unknown> {
  // Sort credits by count (descending) and take top entries
  const sortByCount = (credits: ComicVineCredit[] | undefined, limit: number): ComicVineCredit[] => {
    if (!credits || credits.length === 0) return [];
    return [...credits]
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, limit);
  };

  // Extract top characters (limit to 20 most frequently appearing)
  const topCharacters = sortByCount(volume.characters, 20);

  // Extract locations (limit to 10)
  const topLocations = sortByCount(volume.locations, 10);

  // Extract creators (limit to 20, sorted by appearance count)
  const topCreators = sortByCount(volume.people, 20);

  // Extract just the names from credit objects
  const characterNames = topCharacters.map((c) => c.name);
  const locationNames = topLocations.map((l) => l.name);
  const creatorNames = topCreators.map((c) => c.name);

  return {
    // Basic info
    seriesName: volume.name,
    publisher: volume.publisher?.name,
    startYear: volume.start_year ? parseInt(volume.start_year, 10) : undefined,
    issueCount: volume.count_of_issues,
    comicVineSeriesId: String(volume.id),

    // Descriptions
    description: volume.description?.replace(/<[^>]*>/g, '').substring(0, 2000),
    deck: volume.deck,

    // Cover
    coverUrl: volume.image?.medium_url || volume.image?.small_url,

    // Extended data - arrays of names
    characters: characterNames.length > 0 ? characterNames : undefined,
    locations: locationNames.length > 0 ? locationNames : undefined,
    creators: creatorNames.length > 0 ? creatorNames : undefined,
    // Note: ComicVine "concepts" are imprints/labels (e.g., "Vertigo", "DC Black Label"),
    // not thematic genres. Website themes (Horror, Drama, etc.) are not exposed via API.

    // Aliases from volume
    aliases: volume.aliases?.split('\n').filter(Boolean),
  };
}
