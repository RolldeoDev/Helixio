/**
 * ComicBookRoundup Rate Limiter
 *
 * Single shared rate limiter for all CBR requests.
 * Prevents duplicate rate limiting state between rating and review providers.
 */

import { getExternalRatingsSettings } from '../config.service.js';

// =============================================================================
// Module-level State (Singleton)
// =============================================================================

let lastRequestTime = 0;
let consecutiveErrors = 0;

// =============================================================================
// Rate Limit Functions
// =============================================================================

/**
 * Get the rate limit delay in milliseconds based on settings.
 */
function getRateLimitDelayMs(): number {
  const settings = getExternalRatingsSettings();
  const requestsPerMinute = settings?.scrapingRateLimit || 10;
  // Convert to ms between requests
  return Math.ceil(60000 / requestsPerMinute);
}

/**
 * Wait for rate limit before making a request.
 * Implements exponential backoff on consecutive errors.
 */
export async function waitForRateLimit(): Promise<void> {
  const delayMs = getRateLimitDelayMs();
  const backoffMultiplier = Math.pow(2, consecutiveErrors);
  const totalDelay = delayMs * backoffMultiplier;

  const timeSinceLastRequest = Date.now() - lastRequestTime;
  if (timeSinceLastRequest < totalDelay) {
    await new Promise((resolve) =>
      setTimeout(resolve, totalDelay - timeSinceLastRequest)
    );
  }
}

/**
 * Update rate limit state after a request completes.
 * @param success - Whether the request was successful
 */
export function updateRateLimitState(success: boolean): void {
  lastRequestTime = Date.now();
  if (success) {
    consecutiveErrors = 0;
  } else {
    // Cap at 5 consecutive errors (32x max backoff)
    consecutiveErrors = Math.min(consecutiveErrors + 1, 5);
  }
}

/**
 * Reset rate limiter state (for testing).
 */
export function resetRateLimiter(): void {
  lastRequestTime = 0;
  consecutiveErrors = 0;
}

/**
 * Get current rate limiter state (for debugging/logging).
 */
export function getRateLimiterState(): {
  lastRequestTime: number;
  consecutiveErrors: number;
  currentDelayMs: number;
} {
  const delayMs = getRateLimitDelayMs();
  const backoffMultiplier = Math.pow(2, consecutiveErrors);
  return {
    lastRequestTime,
    consecutiveErrors,
    currentDelayMs: delayMs * backoffMultiplier,
  };
}
