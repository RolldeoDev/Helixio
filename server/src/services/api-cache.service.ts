/**
 * API Cache Service
 *
 * Provides caching layer for ComicVine and Metron API responses.
 * Features:
 * - Configurable TTL per endpoint type
 * - Stale cache fallback when API unavailable
 * - Cache statistics tracking
 * - Automatic cleanup of expired entries
 */

import { createHash } from 'crypto';
import { getDatabase } from './database.service.js';
import { MetadataFetchLogger } from './metadata-fetch-logger.service.js';
import { createServiceLogger } from './logger.service.js';

const logger = createServiceLogger('api-cache');

// =============================================================================
// Types
// =============================================================================

export type CacheSource =
  | 'comicvine'
  | 'metron'
  | 'gcd'
  | 'anilist'
  | 'mal'
  | 'comicbookroundup'
  | 'leagueofcomicgeeks';

export interface CacheOptions {
  /** Time-to-live in milliseconds */
  ttl?: number;
  /** Session ID for logging */
  sessionId?: string;
  /** Force refresh (skip cache read) */
  forceRefresh?: boolean;
}

export interface CachedResponse<T = unknown> {
  data: T;
  cacheKey: string;
  createdAt: Date;
  expiresAt: Date;
  isStale: boolean;
  source: CacheSource;
  endpoint: string;
}

export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  missRate: number;
  staleHitRate: number;
  bySource: {
    comicvine: { entries: number; hits: number; misses: number };
    metron: { entries: number; hits: number; misses: number };
  };
  oldestEntry?: Date;
  newestEntry?: Date;
}

// =============================================================================
// TTL Configuration
// =============================================================================

/** Default TTL values in milliseconds */
const DEFAULT_TTL: Record<string, number> = {
  // Search results - 48 hours
  '/search/': 48 * 60 * 60 * 1000,
  '/search': 48 * 60 * 60 * 1000,
  '/volumes/': 48 * 60 * 60 * 1000,
  '/series/': 48 * 60 * 60 * 1000,
  '/issue/': 48 * 60 * 60 * 1000,
  '/issues/': 48 * 60 * 60 * 1000,

  // Individual resource lookups - 7 days (rarely change)
  '/volume/': 7 * 24 * 60 * 60 * 1000,
  '/issue/4000-': 7 * 24 * 60 * 60 * 1000,

  // AniList GraphQL - 7 days (manga data changes slowly)
  '/graphql': 7 * 24 * 60 * 60 * 1000,

  // Jikan (MAL) API - 24 hours (unofficial, may have delays)
  '/manga': 24 * 60 * 60 * 1000,
  '/manga/': 24 * 60 * 60 * 1000,

  // Default fallback
  default: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Get TTL for an endpoint based on its pattern
 */
function getTTLForEndpoint(endpoint: string): number {
  for (const [pattern, ttl] of Object.entries(DEFAULT_TTL)) {
    if (pattern !== 'default' && endpoint.includes(pattern)) {
      return ttl;
    }
  }
  return DEFAULT_TTL.default!;
}

// =============================================================================
// Cache Key Generation
// =============================================================================

/**
 * Normalize and sort object keys for consistent hashing
 */
function normalizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(params).sort();

  for (const key of keys) {
    let value = params[key];

    // Normalize string values
    if (typeof value === 'string') {
      value = value.toLowerCase().trim();
    }

    // Skip undefined/null values
    if (value !== undefined && value !== null) {
      sorted[key] = value;
    }
  }

  return sorted;
}

/**
 * Generate a unique cache key from source, endpoint, and params
 */
export function generateCacheKey(
  source: CacheSource,
  endpoint: string,
  params: Record<string, unknown>
): string {
  const normalized = {
    source,
    endpoint: endpoint.toLowerCase(),
    params: normalizeParams(params),
  };

  return createHash('md5').update(JSON.stringify(normalized)).digest('hex');
}

// =============================================================================
// Core Cache Functions
// =============================================================================

/**
 * Get a cached response if available and not expired
 */
export async function get<T>(
  source: CacheSource,
  endpoint: string,
  params: Record<string, unknown>,
  options: CacheOptions = {}
): Promise<CachedResponse<T> | null> {
  if (options.forceRefresh) {
    return null;
  }

  const prisma = getDatabase();
  const cacheKey = generateCacheKey(source, endpoint, params);

  try {
    const cached = await prisma.aPICache.findUnique({
      where: { cacheKey },
    });

    if (!cached) {
      // Record miss
      await recordCacheAccess(source, 'miss');
      return null;
    }

    const now = new Date();
    const isStale = cached.expiresAt < now;

    // Update access statistics
    await prisma.aPICache.update({
      where: { id: cached.id },
      data: {
        lastAccessed: now,
        accessCount: { increment: 1 },
      },
    });

    // Record hit (regular or stale)
    await recordCacheAccess(source, isStale ? 'stale_hit' : 'hit');

    // Log cache hit
    if (options.sessionId) {
      MetadataFetchLogger.log(
        options.sessionId,
        'debug',
        'searching',
        `Cache ${isStale ? 'stale ' : ''}hit for ${source} ${endpoint}`,
        { cacheKey, isStale, createdAt: cached.createdAt }
      );
    }

    return {
      data: JSON.parse(cached.response) as T,
      cacheKey,
      createdAt: cached.createdAt,
      expiresAt: cached.expiresAt,
      isStale,
      source,
      endpoint,
    };
  } catch (error) {
    logger.error({ error, cacheKey }, 'Cache get error');
    return null;
  }
}

/**
 * Store a response in the cache
 */
export async function set<T>(
  source: CacheSource,
  endpoint: string,
  params: Record<string, unknown>,
  response: T,
  options: CacheOptions = {}
): Promise<void> {
  const prisma = getDatabase();
  const cacheKey = generateCacheKey(source, endpoint, params);
  const ttl = options.ttl || getTTLForEndpoint(endpoint);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttl);

  // Calculate result count if response is an array or has results property
  let resultCount: number | undefined;
  if (Array.isArray(response)) {
    resultCount = response.length;
  } else if (response && typeof response === 'object' && 'results' in response) {
    const results = (response as Record<string, unknown>).results;
    if (Array.isArray(results)) {
      resultCount = results.length;
    }
  }

  try {
    await prisma.aPICache.upsert({
      where: { cacheKey },
      create: {
        cacheKey,
        source,
        endpoint,
        params: JSON.stringify(normalizeParams(params)),
        response: JSON.stringify(response),
        resultCount,
        expiresAt,
      },
      update: {
        response: JSON.stringify(response),
        resultCount,
        expiresAt,
        lastAccessed: now,
        accessCount: 0, // Reset on update
      },
    });

    // Log cache set
    if (options.sessionId) {
      MetadataFetchLogger.log(
        options.sessionId,
        'debug',
        'searching',
        `Cached ${source} ${endpoint} response (TTL: ${Math.round(ttl / 3600000)}h)`,
        { cacheKey, resultCount, expiresAt }
      );
    }
  } catch (error) {
    logger.error({ error, cacheKey }, 'Cache set error');
  }
}

/**
 * Get cached data or fetch from API with automatic caching
 * Includes stale cache fallback when API fails
 */
export async function getCachedOrFetch<T>(
  source: CacheSource,
  endpoint: string,
  params: Record<string, unknown>,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  // Try to get from cache first
  const cached = await get<T>(source, endpoint, params, options);

  if (cached && !cached.isStale) {
    // Fresh cache hit - return cached data directly
    return cached.data;
  }

  // Cache miss or stale - try to fetch fresh data
  try {
    const freshData = await fetcher();

    // Store in cache
    await set(source, endpoint, params, freshData, options);

    return freshData;
  } catch (error) {
    // API failed - check if we have stale cache to fall back to
    if (cached) {
      // Return stale data (better than nothing)
      logger.warn(
        { source, endpoint, cachedAt: cached.createdAt },
        'API call failed, using stale cache'
      );

      if (options.sessionId) {
        MetadataFetchLogger.log(
          options.sessionId,
          'warn',
          'searching',
          `API failed, using stale cache (${Math.round((Date.now() - cached.createdAt.getTime()) / 3600000)}h old)`,
          { source, endpoint, error: String(error) }
        );
      }

      return cached.data;
    }

    // No cache available, propagate error
    throw error;
  }
}

// =============================================================================
// Cache Management
// =============================================================================

/**
 * Invalidate cache entries matching criteria
 */
export async function invalidate(options: {
  source?: CacheSource;
  endpoint?: string;
  cacheKey?: string;
  olderThan?: Date;
}): Promise<number> {
  const prisma = getDatabase();

  const where: Record<string, unknown> = {};

  if (options.cacheKey) {
    where.cacheKey = options.cacheKey;
  }

  if (options.source) {
    where.source = options.source;
  }

  if (options.endpoint) {
    where.endpoint = { contains: options.endpoint };
  }

  if (options.olderThan) {
    where.createdAt = { lt: options.olderThan };
  }

  const result = await prisma.aPICache.deleteMany({ where });
  return result.count;
}

/**
 * Clean up expired cache entries
 */
export async function cleanExpired(): Promise<number> {
  const prisma = getDatabase();

  const result = await prisma.aPICache.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });

  return result.count;
}

/**
 * Clear entire cache
 */
export async function clearAll(): Promise<number> {
  const prisma = getDatabase();
  const result = await prisma.aPICache.deleteMany({});
  return result.count;
}

/**
 * Get cache statistics
 */
export async function getStats(): Promise<CacheStats> {
  const prisma = getDatabase();

  // Get total counts
  const [total, comicvine, metron] = await Promise.all([
    prisma.aPICache.count(),
    prisma.aPICache.count({ where: { source: 'comicvine' } }),
    prisma.aPICache.count({ where: { source: 'metron' } }),
  ]);

  // Get date range
  const [oldest, newest] = await Promise.all([
    prisma.aPICache.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    prisma.aPICache.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
  ]);

  // Get today's stats (aggregate and per-source)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [todayStats, comicvineStats, metronStats] = await Promise.all([
    prisma.cacheStats.findUnique({
      where: { date_source: { date: today, source: 'all' } },
    }),
    prisma.cacheStats.findUnique({
      where: { date_source: { date: today, source: 'comicvine' } },
    }),
    prisma.cacheStats.findUnique({
      where: { date_source: { date: today, source: 'metron' } },
    }),
  ]);

  const hits = todayStats?.hits || 0;
  const misses = todayStats?.misses || 0;
  const staleHits = todayStats?.staleHits || 0;
  const totalAccesses = hits + misses + staleHits;

  // Calculate approximate size (rough estimate based on response lengths)
  const sizeResult = await prisma.$queryRaw<[{ total: number }]>`
    SELECT COALESCE(SUM(LENGTH(response)), 0) as total FROM APICache
  `;
  const totalSize = Number(sizeResult[0]?.total || 0);

  return {
    totalEntries: total,
    totalSize,
    hitRate: totalAccesses > 0 ? hits / totalAccesses : 0,
    missRate: totalAccesses > 0 ? misses / totalAccesses : 0,
    staleHitRate: totalAccesses > 0 ? staleHits / totalAccesses : 0,
    bySource: {
      comicvine: {
        entries: comicvine,
        hits: comicvineStats?.hits || 0,
        misses: comicvineStats?.misses || 0,
      },
      metron: {
        entries: metron,
        hits: metronStats?.hits || 0,
        misses: metronStats?.misses || 0,
      },
    },
    oldestEntry: oldest?.createdAt,
    newestEntry: newest?.createdAt,
  };
}

// =============================================================================
// Statistics Recording
// =============================================================================

/**
 * Record a cache access for statistics
 * Updates both source-specific and aggregate ("all") statistics
 */
async function recordCacheAccess(
  source: CacheSource,
  type: 'hit' | 'miss' | 'stale_hit'
): Promise<void> {
  const prisma = getDatabase();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const updateData = {
    hits: type === 'hit' ? { increment: 1 } : undefined,
    misses: type === 'miss' ? { increment: 1 } : undefined,
    staleHits: type === 'stale_hit' ? { increment: 1 } : undefined,
    apiCallsSaved: type === 'hit' || type === 'stale_hit' ? { increment: 1 } : undefined,
  };

  const createData = {
    date: today,
    hits: type === 'hit' ? 1 : 0,
    misses: type === 'miss' ? 1 : 0,
    staleHits: type === 'stale_hit' ? 1 : 0,
    apiCallsSaved: type === 'hit' || type === 'stale_hit' ? 1 : 0,
  };

  try {
    // Update source-specific stats and aggregate "all" stats in parallel
    await Promise.all([
      // Source-specific stats
      prisma.cacheStats.upsert({
        where: { date_source: { date: today, source } },
        create: { ...createData, source },
        update: updateData,
      }),
      // Aggregate stats for all sources
      prisma.cacheStats.upsert({
        where: { date_source: { date: today, source: 'all' } },
        create: { ...createData, source: 'all' },
        update: updateData,
      }),
    ]);
  } catch {
    // Non-critical, ignore errors
  }
}

// =============================================================================
// Exports
// =============================================================================

export const APICache = {
  get,
  set,
  getCachedOrFetch,
  invalidate,
  cleanExpired,
  clearAll,
  getStats,
  generateCacheKey,
  getTTLForEndpoint,
};

export default APICache;
