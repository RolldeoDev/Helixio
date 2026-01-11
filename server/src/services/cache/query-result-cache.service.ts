/**
 * Query Result Cache Service
 *
 * Caches database query results to eliminate redundant queries.
 * Implements request coalescing to deduplicate concurrent identical queries.
 *
 * Features:
 * - Stable cache keys from query parameters (deterministic hashing)
 * - Request coalescing (mirror stats-query.service.ts pattern)
 * - Scan-aware TTL adjustment (30s during scans, 5min otherwise)
 * - Automatic L1+L2 caching via unified cache service
 *
 * Cache key format: query:result:{endpoint}:{hash}
 * Where hash = SHA-256(sorted JSON params).substring(0, 16)
 */

import crypto from 'crypto';
import { cacheService } from './cache.service.js';
import { memoryCache } from '../memory-cache.service.js';
import { createServiceLogger } from '../logger.service.js';
import { CACHE_KEY_PREFIX, CACHE_TTL } from './cache.types.js';

const logger = createServiceLogger('query-result-cache');

// =============================================================================
// Request Coalescing (prevents duplicate concurrent queries)
// =============================================================================

/**
 * Map of in-flight queries to prevent duplicate database queries
 * when multiple concurrent requests ask for the same data.
 *
 * Key: cache key
 * Value: Promise that resolves to the query result
 */
const inFlightQueries = new Map<string, Promise<any>>();

/**
 * Execute a query with request coalescing.
 * If an identical query is already in-flight, reuse that promise.
 * Otherwise, execute the query and track it.
 *
 * @param cacheKey Unique key for this query
 * @param queryFn Function that executes the database query
 * @returns Query result
 */
export async function coalescedQuery<T>(
  cacheKey: string,
  queryFn: () => Promise<T>
): Promise<T> {
  // Check if identical query is already in-flight
  const existingRequest = inFlightQueries.get(cacheKey);
  if (existingRequest) {
    logger.debug({ cacheKey }, 'Request coalesced - reusing in-flight query');
    return existingRequest as Promise<T>;
  }

  // Execute query and track it
  const queryPromise = queryFn().finally(() => {
    // Clean up tracking when query completes
    inFlightQueries.delete(cacheKey);
  });

  inFlightQueries.set(cacheKey, queryPromise);
  return queryPromise;
}

// =============================================================================
// Cache Key Generation
// =============================================================================

/**
 * Build a stable, deterministic cache key from query parameters.
 * Sorts object keys before hashing to ensure identical params
 * produce identical keys regardless of property order.
 *
 * @param endpoint API endpoint name (e.g., 'series', 'files')
 * @param params Query parameters object
 * @returns Cache key string
 */
export function buildQueryCacheKey(
  endpoint: string,
  params: Record<string, any>
): string {
  // Sort keys for deterministic hashing
  const sortedParams = Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      // Skip undefined values (they don't affect query)
      if (params[key] !== undefined) {
        acc[key] = params[key];
      }
      return acc;
    }, {} as Record<string, any>);

  // Hash params for compact key
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(sortedParams))
    .digest('hex')
    .substring(0, 16); // Use first 16 chars for compact keys

  return `query:result:${endpoint}:${hash}`;
}

// =============================================================================
// Cache Operations
// =============================================================================

/**
 * Get a cached query result.
 *
 * @param cacheKey Cache key from buildQueryCacheKey()
 * @returns Cached result or null if not found
 */
export async function getQueryResultCache<T>(
  cacheKey: string
): Promise<T | null> {
  return await cacheService.get<T>(cacheKey);
}

/**
 * Set a query result in cache.
 * Uses scan-aware TTL (30s during scans, 5min otherwise).
 *
 * @param cacheKey Cache key from buildQueryCacheKey()
 * @param result Query result to cache
 * @param options Optional configuration
 */
export async function setQueryResultCache<T>(
  cacheKey: string,
  result: T,
  options: { libraryId?: string } = {}
): Promise<void> {
  // Use scan-aware TTL
  const isScanActive = memoryCache.isScanActive();
  const ttl = isScanActive ? 30 : 300; // 30s during scan, 5min otherwise

  await cacheService.set(cacheKey, result, ttl);

  if (isScanActive) {
    logger.debug(
      { cacheKey, ttl, libraryId: options.libraryId },
      'Query result cached with reduced TTL (scan active)'
    );
  }
}

/**
 * Invalidate all query result caches matching a pattern.
 *
 * @param pattern Pattern to match (e.g., 'series' to clear all series query caches)
 */
export async function invalidateQueryCache(pattern: string): Promise<number> {
  const fullPattern = `query:result:${pattern}`;
  const count = await cacheService.invalidatePattern(fullPattern);

  if (count > 0) {
    logger.debug({ pattern: fullPattern, count }, 'Query caches invalidated');
  }

  return count;
}

// =============================================================================
// Convenience Wrappers
// =============================================================================

/**
 * Get query result from cache, or execute query and cache result.
 * Includes request coalescing for concurrent identical queries.
 *
 * This is the primary pattern for query caching:
 * 1. Try cache (L1 then L2)
 * 2. If miss, coalesce identical concurrent requests
 * 3. Execute query once
 * 4. Cache result
 * 5. Return to all waiters
 *
 * @param endpoint API endpoint name
 * @param params Query parameters
 * @param queryFn Function to execute database query
 * @param options Optional configuration
 * @returns Query result (cached or fresh)
 */
export async function getCachedOrFetch<T>(
  endpoint: string,
  params: Record<string, any>,
  queryFn: () => Promise<T>,
  options: { libraryId?: string } = {}
): Promise<T> {
  // Build stable cache key
  const cacheKey = buildQueryCacheKey(endpoint, params);

  // Try cache first
  const cached = await getQueryResultCache<T>(cacheKey);
  if (cached !== null) {
    logger.debug({ cacheKey, endpoint }, 'Query result cache HIT');
    return cached;
  }

  logger.debug({ cacheKey, endpoint }, 'Query result cache MISS');

  // Cache miss - execute with coalescing
  const result = await coalescedQuery(cacheKey, queryFn);

  // Cache result (fire-and-forget)
  setQueryResultCache(cacheKey, result, options).catch((err) => {
    logger.debug({ err, cacheKey }, 'Failed to cache query result');
  });

  return result;
}

// =============================================================================
// Metadata Caching Helpers
// =============================================================================

/**
 * Get cached series metadata (full details with includes).
 *
 * @param seriesId Series ID
 * @returns Cached metadata or null if not found
 */
export async function getCachedSeriesMetadata<T>(
  seriesId: string
): Promise<T | null> {
  const key = `${CACHE_KEY_PREFIX.SERIES_METADATA}:${seriesId}`;
  return await cacheService.get<T>(key);
}

/**
 * Set series metadata in cache.
 * Uses 10-minute TTL (metadata changes infrequently).
 *
 * @param seriesId Series ID
 * @param metadata Full series metadata with includes
 */
export async function setCachedSeriesMetadata<T>(
  seriesId: string,
  metadata: T
): Promise<void> {
  const key = `${CACHE_KEY_PREFIX.SERIES_METADATA}:${seriesId}`;
  const ttl = CACHE_TTL.SERIES_METADATA; // 600s (10 minutes)

  await cacheService.set(key, metadata, ttl);

  logger.debug({ seriesId, key }, 'Series metadata cached');
}

/**
 * Get cached issue/file metadata (full details).
 *
 * @param fileId File/issue ID
 * @returns Cached metadata or null if not found
 */
export async function getCachedIssueMetadata<T>(
  fileId: string
): Promise<T | null> {
  const key = `${CACHE_KEY_PREFIX.ISSUE_METADATA}:${fileId}`;
  return await cacheService.get<T>(key);
}

/**
 * Set issue/file metadata in cache.
 * Uses 10-minute TTL (metadata changes infrequently).
 *
 * @param fileId File/issue ID
 * @param metadata Full file metadata with includes
 */
export async function setCachedIssueMetadata<T>(
  fileId: string,
  metadata: T
): Promise<void> {
  const key = `${CACHE_KEY_PREFIX.ISSUE_METADATA}:${fileId}`;
  const ttl = CACHE_TTL.ISSUE_METADATA; // 600s (10 minutes)

  await cacheService.set(key, metadata, ttl);

  logger.debug({ fileId, key }, 'Issue metadata cached');
}

/**
 * Invalidate all metadata caches for a specific series.
 *
 * @param seriesId Series ID
 */
export async function invalidateSeriesMetadata(seriesId: string): Promise<void> {
  // Use pattern-based invalidation to clear all userId variants
  // Pattern matches: metadata:series:${seriesId} AND metadata:series:${seriesId}:*
  const pattern = `${CACHE_KEY_PREFIX.SERIES_METADATA}:${seriesId}`;
  const count = await cacheService.invalidatePattern(`${pattern}:`);

  // Also clear the base key (non-user-specific version)
  await cacheService.delete(pattern);

  logger.debug({ seriesId, variantCount: count }, 'Series metadata cache invalidated (all user variants)');
}

/**
 * Invalidate all metadata caches for a specific file/issue.
 *
 * @param fileId File/issue ID
 */
export async function invalidateIssueMetadata(fileId: string): Promise<void> {
  const key = `${CACHE_KEY_PREFIX.ISSUE_METADATA}:${fileId}`;
  await cacheService.delete(key);

  logger.debug({ fileId }, 'Issue metadata cache invalidated');
}

/**
 * Get series metadata from cache, or execute query and cache result.
 *
 * @param seriesId Series ID
 * @param queryFn Function to execute database query
 * @returns Series metadata (cached or fresh)
 */
export async function getCachedOrFetchSeriesMetadata<T>(
  seriesId: string,
  queryFn: () => Promise<T>
): Promise<T> {
  // Try cache first
  const cached = await getCachedSeriesMetadata<T>(seriesId);
  if (cached !== null) {
    logger.debug({ seriesId }, 'Series metadata cache HIT');
    return cached;
  }

  logger.debug({ seriesId }, 'Series metadata cache MISS');

  // Cache miss - execute query
  const metadata = await queryFn();

  // Cache result (fire-and-forget)
  setCachedSeriesMetadata(seriesId, metadata).catch((err) => {
    logger.debug({ err, seriesId }, 'Failed to cache series metadata');
  });

  return metadata;
}

/**
 * Get issue metadata from cache, or execute query and cache result.
 *
 * @param fileId File/issue ID
 * @param queryFn Function to execute database query
 * @returns Issue metadata (cached or fresh)
 */
export async function getCachedOrFetchIssueMetadata<T>(
  fileId: string,
  queryFn: () => Promise<T>
): Promise<T> {
  // Try cache first
  const cached = await getCachedIssueMetadata<T>(fileId);
  if (cached !== null) {
    logger.debug({ fileId }, 'Issue metadata cache HIT');
    return cached;
  }

  logger.debug({ fileId }, 'Issue metadata cache MISS');

  // Cache miss - execute query
  const metadata = await queryFn();

  // Cache result (fire-and-forget)
  setCachedIssueMetadata(fileId, metadata).catch((err) => {
    logger.debug({ err, fileId }, 'Failed to cache issue metadata');
  });

  return metadata;
}
