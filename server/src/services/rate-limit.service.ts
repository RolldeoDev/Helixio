/**
 * Rate Limit Service
 *
 * In-memory rate limiting for API keys using a sliding window algorithm.
 * Uses an LRU cache to manage memory efficiently.
 */

// =============================================================================
// Types
// =============================================================================

export interface RateLimitConfig {
  requests: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
  retryAfter?: number; // seconds until retry
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
  lastAccess: number;
}

// =============================================================================
// Configuration
// =============================================================================

// Rate limit tiers
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  standard: { requests: 100, windowMs: 60000 },   // 100 req/min
  elevated: { requests: 500, windowMs: 60000 },   // 500 req/min
  unlimited: { requests: Infinity, windowMs: 0 }, // No limit
};

// Cache settings
const MAX_CACHE_SIZE = 10000; // Max number of keys to track
const CLEANUP_INTERVAL = 60000; // Cleanup every minute

// =============================================================================
// In-Memory Store
// =============================================================================

const rateLimitCache = new Map<string, RateLimitEntry>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the cleanup timer
 */
export function startCleanupTimer(): void {
  if (cleanupTimer) return;

  cleanupTimer = setInterval(() => {
    cleanupExpiredEntries();
  }, CLEANUP_INTERVAL);

  // Don't prevent process exit
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }
}

/**
 * Stop the cleanup timer
 */
export function stopCleanupTimer(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/**
 * Clean up expired entries and enforce cache size limit
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  const maxWindowMs = Math.max(...Object.values(RATE_LIMITS).map(r => r.windowMs));

  // Remove expired entries
  for (const [key, entry] of rateLimitCache) {
    if (now - entry.windowStart > maxWindowMs * 2) {
      rateLimitCache.delete(key);
    }
  }

  // If still over limit, remove oldest entries
  if (rateLimitCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(rateLimitCache.entries())
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess);

    const toRemove = rateLimitCache.size - MAX_CACHE_SIZE;
    for (let i = 0; i < toRemove; i++) {
      const entry = entries[i];
      if (entry) {
        rateLimitCache.delete(entry[0]);
      }
    }
  }
}

// =============================================================================
// Rate Limiting
// =============================================================================

/**
 * Check if a request is allowed under the rate limit
 */
export function checkRateLimit(
  keyId: string,
  tier: string
): RateLimitResult {
  const config = RATE_LIMITS[tier] ?? RATE_LIMITS.standard!;

  // Unlimited tier always allowed
  if (config.requests === Infinity) {
    return {
      allowed: true,
      remaining: Infinity,
      limit: Infinity,
      resetAt: new Date(),
    };
  }

  const now = Date.now();
  const entry = rateLimitCache.get(keyId);

  // No existing entry - create new one
  if (!entry) {
    rateLimitCache.set(keyId, {
      count: 1,
      windowStart: now,
      lastAccess: now,
    });

    return {
      allowed: true,
      remaining: config.requests - 1,
      limit: config.requests,
      resetAt: new Date(now + config.windowMs),
    };
  }

  // Check if window has expired
  if (now - entry.windowStart >= config.windowMs) {
    // Reset window
    rateLimitCache.set(keyId, {
      count: 1,
      windowStart: now,
      lastAccess: now,
    });

    return {
      allowed: true,
      remaining: config.requests - 1,
      limit: config.requests,
      resetAt: new Date(now + config.windowMs),
    };
  }

  // Window still active - check limit
  const resetAt = new Date(entry.windowStart + config.windowMs);

  if (entry.count >= config.requests) {
    // Rate limited
    const retryAfter = Math.ceil((entry.windowStart + config.windowMs - now) / 1000);

    return {
      allowed: false,
      remaining: 0,
      limit: config.requests,
      resetAt,
      retryAfter: Math.max(1, retryAfter),
    };
  }

  // Increment count
  entry.count++;
  entry.lastAccess = now;

  return {
    allowed: true,
    remaining: config.requests - entry.count,
    limit: config.requests,
    resetAt,
  };
}

/**
 * Get HTTP headers for rate limit response
 */
export function getRateLimitHeaders(
  result: RateLimitResult
): Record<string, string> {
  const headers: Record<string, string> = {};

  if (result.limit !== Infinity) {
    headers['X-RateLimit-Limit'] = String(result.limit);
    headers['X-RateLimit-Remaining'] = String(Math.max(0, result.remaining));
    headers['X-RateLimit-Reset'] = String(Math.floor(result.resetAt.getTime() / 1000));
  }

  if (result.retryAfter !== undefined) {
    headers['Retry-After'] = String(result.retryAfter);
  }

  return headers;
}

/**
 * Reset rate limit for a key (for testing)
 */
export function resetRateLimit(keyId: string): void {
  rateLimitCache.delete(keyId);
}

/**
 * Clear all rate limits (for testing)
 */
export function clearAllRateLimits(): void {
  rateLimitCache.clear();
}

/**
 * Get current rate limit stats (for debugging/monitoring)
 */
export function getRateLimitStats(): {
  activeKeys: number;
  cacheSize: number;
  maxCacheSize: number;
} {
  return {
    activeKeys: rateLimitCache.size,
    cacheSize: rateLimitCache.size,
    maxCacheSize: MAX_CACHE_SIZE,
  };
}

// Start cleanup timer on module load
startCleanupTimer();
