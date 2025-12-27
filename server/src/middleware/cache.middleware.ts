/**
 * Cache Headers Middleware
 *
 * HTTP caching middleware for controlling browser and proxy caching behavior.
 * Adds Cache-Control, ETag, and related headers to API responses.
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';

// =============================================================================
// Types
// =============================================================================

export interface CacheOptions {
  /** Cache visibility: 'public' or 'private' */
  visibility?: 'public' | 'private';
  /** Max age in seconds */
  maxAge: number;
  /** Allow stale responses while revalidating */
  staleWhileRevalidate?: number;
  /** Mark as immutable (content will never change) */
  immutable?: boolean;
  /** Vary header values for content negotiation */
  vary?: string[];
}

// =============================================================================
// Cache Control Middleware Factory
// =============================================================================

/**
 * Creates middleware that sets Cache-Control headers
 *
 * @param options Cache configuration options
 * @returns Express middleware
 *
 * @example
 * // Cache for 1 hour, public
 * router.get('/data', setCacheHeaders({ maxAge: 3600 }), handler);
 *
 * // Cache for 1 day, private (user-specific)
 * router.get('/profile', setCacheHeaders({ maxAge: 86400, visibility: 'private' }), handler);
 *
 * // No caching
 * router.get('/sensitive', setCacheHeaders({ maxAge: 0, visibility: 'private' }), handler);
 */
export function setCacheHeaders(options: CacheOptions): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const parts: string[] = [];

    // Visibility
    parts.push(options.visibility || 'public');

    // Max age
    parts.push(`max-age=${options.maxAge}`);

    // Stale while revalidate (allows serving stale content while fetching fresh)
    if (options.staleWhileRevalidate) {
      parts.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
    }

    // Immutable (tells browser content will never change)
    if (options.immutable) {
      parts.push('immutable');
    }

    // Set Cache-Control header
    res.setHeader('Cache-Control', parts.join(', '));

    // Set Vary headers for content negotiation
    if (options.vary && options.vary.length > 0) {
      res.setHeader('Vary', options.vary.join(', '));
    }

    next();
  };
}

// =============================================================================
// Preset Cache Configurations
// =============================================================================

/**
 * Cache presets for common use cases
 */
export const cachePresets = {
  /**
   * Static data that rarely changes (themes, genres, publishers)
   * 1 day cache with stale-while-revalidate
   */
  static: setCacheHeaders({
    maxAge: 86400, // 1 day
    staleWhileRevalidate: 3600, // Allow stale for 1 hour while revalidating
  }),

  /**
   * Semi-static data that changes occasionally (library list, series list)
   * 1 minute cache
   */
  shortTerm: setCacheHeaders({
    maxAge: 60, // 1 minute
    staleWhileRevalidate: 30,
  }),

  /**
   * Stable data that changes infrequently (file pages, archive structure)
   * 1 hour cache
   */
  stable: setCacheHeaders({
    maxAge: 3600, // 1 hour
    staleWhileRevalidate: 600, // 10 minutes
  }),

  /**
   * No caching for user-specific or sensitive data
   */
  noCache: setCacheHeaders({
    maxAge: 0,
    visibility: 'private',
  }),

  /**
   * Long-term immutable cache (covers, thumbnails with content-based URLs)
   * 1 year cache
   */
  immutable: setCacheHeaders({
    maxAge: 31536000, // 1 year
    immutable: true,
  }),
} as const;

// =============================================================================
// Conditional ETag Middleware
// =============================================================================

/**
 * Adds ETag support for conditional requests
 * Use with content that has a stable identifier (file hash, version, etc.)
 *
 * @param getETag Function to generate ETag from request
 * @returns Express middleware
 *
 * @example
 * router.get('/file/:id',
 *   withETag((req) => `"${req.params.id}-${req.query.version}"`),
 *   handler
 * );
 */
export function withETag(getETag: (req: Request) => string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const etag = getETag(req);
    res.setHeader('ETag', etag);

    // Check If-None-Match for conditional request
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }

    next();
  };
}

// =============================================================================
// Last-Modified Support
// =============================================================================

/**
 * Adds Last-Modified header and handles If-Modified-Since
 *
 * @param getLastModified Function to get last modified date from request
 * @returns Express middleware
 */
export function withLastModified(
  getLastModified: (req: Request) => Date | null
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const lastModified = getLastModified(req);
    if (!lastModified) {
      next();
      return;
    }

    res.setHeader('Last-Modified', lastModified.toUTCString());

    // Check If-Modified-Since for conditional request
    const ifModifiedSince = req.headers['if-modified-since'];
    if (ifModifiedSince) {
      const ifModifiedDate = new Date(ifModifiedSince);
      if (lastModified <= ifModifiedDate) {
        res.status(304).end();
        return;
      }
    }

    next();
  };
}
