/**
 * Rate Limit Service Tests
 *
 * Tests for in-memory rate limiting with sliding window algorithm.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RATE_LIMITS,
  checkRateLimit,
  getRateLimitHeaders,
  resetRateLimit,
  clearAllRateLimits,
  getRateLimitStats,
  startCleanupTimer,
  stopCleanupTimer,
} from '../rate-limit.service.js';

describe('Rate Limit Service', () => {
  beforeEach(() => {
    // Clear all rate limits before each test
    clearAllRateLimits();
    // Stop any cleanup timers to prevent interference
    stopCleanupTimer();
  });

  afterEach(() => {
    clearAllRateLimits();
    stopCleanupTimer();
  });

  // ==========================================================================
  // RATE_LIMITS Configuration Tests
  // ==========================================================================

  describe('RATE_LIMITS configuration', () => {
    it('has standard tier with 100 requests per minute', () => {
      expect(RATE_LIMITS.standard).toBeDefined();
      expect(RATE_LIMITS.standard!.requests).toBe(100);
      expect(RATE_LIMITS.standard!.windowMs).toBe(60000);
    });

    it('has elevated tier with 500 requests per minute', () => {
      expect(RATE_LIMITS.elevated).toBeDefined();
      expect(RATE_LIMITS.elevated!.requests).toBe(500);
      expect(RATE_LIMITS.elevated!.windowMs).toBe(60000);
    });

    it('has unlimited tier with infinite requests', () => {
      expect(RATE_LIMITS.unlimited).toBeDefined();
      expect(RATE_LIMITS.unlimited!.requests).toBe(Infinity);
      expect(RATE_LIMITS.unlimited!.windowMs).toBe(0);
    });
  });

  // ==========================================================================
  // checkRateLimit Tests
  // ==========================================================================

  describe('checkRateLimit', () => {
    describe('unlimited tier', () => {
      it('always allows requests', () => {
        const result = checkRateLimit('key-1', 'unlimited');

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(Infinity);
        expect(result.limit).toBe(Infinity);
      });

      it('allows unlimited requests in sequence', () => {
        for (let i = 0; i < 1000; i++) {
          const result = checkRateLimit('key-1', 'unlimited');
          expect(result.allowed).toBe(true);
        }
      });
    });

    describe('standard tier', () => {
      it('allows first request', () => {
        const result = checkRateLimit('key-1', 'standard');

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(99);
        expect(result.limit).toBe(100);
      });

      it('decrements remaining count correctly', () => {
        // First request
        let result = checkRateLimit('key-1', 'standard');
        expect(result.remaining).toBe(99);

        // Second request
        result = checkRateLimit('key-1', 'standard');
        expect(result.remaining).toBe(98);

        // Third request
        result = checkRateLimit('key-1', 'standard');
        expect(result.remaining).toBe(97);
      });

      it('blocks requests when limit is exceeded', () => {
        // Make 100 requests (limit)
        for (let i = 0; i < 100; i++) {
          const result = checkRateLimit('key-1', 'standard');
          expect(result.allowed).toBe(true);
        }

        // 101st request should be blocked
        const blocked = checkRateLimit('key-1', 'standard');
        expect(blocked.allowed).toBe(false);
        expect(blocked.remaining).toBe(0);
        expect(blocked.retryAfter).toBeDefined();
        expect(blocked.retryAfter).toBeGreaterThan(0);
      });

      it('sets retryAfter when rate limited', () => {
        // Exhaust rate limit
        for (let i = 0; i < 100; i++) {
          checkRateLimit('key-1', 'standard');
        }

        const blocked = checkRateLimit('key-1', 'standard');
        expect(blocked.retryAfter).toBeDefined();
        expect(blocked.retryAfter).toBeGreaterThanOrEqual(1);
        expect(blocked.retryAfter).toBeLessThanOrEqual(60);
      });

      it('tracks separate limits per key', () => {
        // Key 1 makes some requests
        checkRateLimit('key-1', 'standard');
        checkRateLimit('key-1', 'standard');

        // Key 2 should have full limit
        const result = checkRateLimit('key-2', 'standard');
        expect(result.remaining).toBe(99);
      });
    });

    describe('elevated tier', () => {
      it('allows 500 requests per minute', () => {
        const result = checkRateLimit('key-1', 'elevated');

        expect(result.limit).toBe(500);
        expect(result.remaining).toBe(499);
      });

      it('blocks after 500 requests', () => {
        // Make 500 requests
        for (let i = 0; i < 500; i++) {
          const result = checkRateLimit('key-1', 'elevated');
          expect(result.allowed).toBe(true);
        }

        // 501st request should be blocked
        const blocked = checkRateLimit('key-1', 'elevated');
        expect(blocked.allowed).toBe(false);
      });
    });

    describe('unknown tier', () => {
      it('defaults to standard tier for unknown tiers', () => {
        const result = checkRateLimit('key-1', 'unknown-tier');

        expect(result.limit).toBe(100);
        expect(result.remaining).toBe(99);
      });
    });

    describe('window reset', () => {
      it('resets window after window expires', () => {
        vi.useFakeTimers();

        // Make requests to exhaust limit
        for (let i = 0; i < 100; i++) {
          checkRateLimit('key-1', 'standard');
        }

        // Verify blocked
        let result = checkRateLimit('key-1', 'standard');
        expect(result.allowed).toBe(false);

        // Advance time past window (60 seconds)
        vi.advanceTimersByTime(61000);

        // Should be allowed again
        result = checkRateLimit('key-1', 'standard');
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(99);

        vi.useRealTimers();
      });

      it('provides correct resetAt timestamp', () => {
        vi.useFakeTimers();
        const now = Date.now();

        const result = checkRateLimit('key-1', 'standard');

        // Reset should be ~60 seconds in the future
        const expectedResetMs = now + 60000;
        expect(result.resetAt.getTime()).toBe(expectedResetMs);

        vi.useRealTimers();
      });
    });
  });

  // ==========================================================================
  // getRateLimitHeaders Tests
  // ==========================================================================

  describe('getRateLimitHeaders', () => {
    it('returns limit headers for standard tier', () => {
      const result = checkRateLimit('key-1', 'standard');
      const headers = getRateLimitHeaders(result);

      expect(headers['X-RateLimit-Limit']).toBe('100');
      expect(headers['X-RateLimit-Remaining']).toBe('99');
      expect(headers['X-RateLimit-Reset']).toBeDefined();
    });

    it('returns reset as Unix timestamp in seconds', () => {
      vi.useFakeTimers();
      const now = Date.now();

      const result = checkRateLimit('key-1', 'standard');
      const headers = getRateLimitHeaders(result);

      const expectedReset = Math.floor((now + 60000) / 1000);
      expect(headers['X-RateLimit-Reset']).toBe(String(expectedReset));

      vi.useRealTimers();
    });

    it('includes Retry-After when rate limited', () => {
      // Exhaust limit
      for (let i = 0; i < 100; i++) {
        checkRateLimit('key-1', 'standard');
      }

      const result = checkRateLimit('key-1', 'standard');
      const headers = getRateLimitHeaders(result);

      expect(headers['Retry-After']).toBeDefined();
      expect(parseInt(headers['Retry-After']!)).toBeGreaterThan(0);
    });

    it('does not include Retry-After when not rate limited', () => {
      const result = checkRateLimit('key-1', 'standard');
      const headers = getRateLimitHeaders(result);

      expect(headers['Retry-After']).toBeUndefined();
    });

    it('returns empty headers for unlimited tier', () => {
      const result = checkRateLimit('key-1', 'unlimited');
      const headers = getRateLimitHeaders(result);

      expect(headers['X-RateLimit-Limit']).toBeUndefined();
      expect(headers['X-RateLimit-Remaining']).toBeUndefined();
      expect(headers['X-RateLimit-Reset']).toBeUndefined();
    });

    it('clamps remaining to 0 when negative', () => {
      // Exhaust limit
      for (let i = 0; i < 100; i++) {
        checkRateLimit('key-1', 'standard');
      }

      const result = checkRateLimit('key-1', 'standard');
      const headers = getRateLimitHeaders(result);

      expect(headers['X-RateLimit-Remaining']).toBe('0');
    });
  });

  // ==========================================================================
  // resetRateLimit Tests
  // ==========================================================================

  describe('resetRateLimit', () => {
    it('resets rate limit for specific key', () => {
      // Make some requests
      for (let i = 0; i < 50; i++) {
        checkRateLimit('key-1', 'standard');
      }

      // Verify remaining is reduced
      let result = checkRateLimit('key-1', 'standard');
      expect(result.remaining).toBe(49);

      // Reset key
      resetRateLimit('key-1');

      // Should be back to full limit
      result = checkRateLimit('key-1', 'standard');
      expect(result.remaining).toBe(99);
    });

    it('does not affect other keys', () => {
      // Make requests on both keys
      checkRateLimit('key-1', 'standard');
      checkRateLimit('key-2', 'standard');

      // Reset only key-1
      resetRateLimit('key-1');

      // key-1 should be reset
      let result = checkRateLimit('key-1', 'standard');
      expect(result.remaining).toBe(99);

      // key-2 should still have reduced limit
      result = checkRateLimit('key-2', 'standard');
      expect(result.remaining).toBe(98);
    });

    it('handles non-existent key gracefully', () => {
      // Should not throw
      expect(() => resetRateLimit('non-existent-key')).not.toThrow();
    });
  });

  // ==========================================================================
  // clearAllRateLimits Tests
  // ==========================================================================

  describe('clearAllRateLimits', () => {
    it('clears all rate limit entries', () => {
      // Create entries for multiple keys
      checkRateLimit('key-1', 'standard');
      checkRateLimit('key-2', 'standard');
      checkRateLimit('key-3', 'standard');

      // Verify entries exist
      let stats = getRateLimitStats();
      expect(stats.activeKeys).toBe(3);

      // Clear all
      clearAllRateLimits();

      // Verify all cleared
      stats = getRateLimitStats();
      expect(stats.activeKeys).toBe(0);
    });

    it('resets all keys to full limit', () => {
      // Make requests on multiple keys
      for (let i = 0; i < 50; i++) {
        checkRateLimit('key-1', 'standard');
        checkRateLimit('key-2', 'standard');
      }

      // Clear all
      clearAllRateLimits();

      // Both should be back to full limit
      let result = checkRateLimit('key-1', 'standard');
      expect(result.remaining).toBe(99);

      result = checkRateLimit('key-2', 'standard');
      expect(result.remaining).toBe(99);
    });
  });

  // ==========================================================================
  // getRateLimitStats Tests
  // ==========================================================================

  describe('getRateLimitStats', () => {
    it('returns correct active key count', () => {
      // Empty initially
      let stats = getRateLimitStats();
      expect(stats.activeKeys).toBe(0);

      // Add some keys
      checkRateLimit('key-1', 'standard');
      checkRateLimit('key-2', 'standard');

      stats = getRateLimitStats();
      expect(stats.activeKeys).toBe(2);
    });

    it('returns cache size equal to active keys', () => {
      checkRateLimit('key-1', 'standard');
      checkRateLimit('key-2', 'standard');
      checkRateLimit('key-3', 'standard');

      const stats = getRateLimitStats();
      expect(stats.cacheSize).toBe(stats.activeKeys);
      expect(stats.cacheSize).toBe(3);
    });

    it('returns max cache size constant', () => {
      const stats = getRateLimitStats();
      expect(stats.maxCacheSize).toBe(10000);
    });

    it('does not count unlimited tier keys', () => {
      // Unlimited tier doesn't create cache entries
      checkRateLimit('key-1', 'unlimited');

      const stats = getRateLimitStats();
      expect(stats.activeKeys).toBe(0);
    });
  });

  // ==========================================================================
  // Cleanup Timer Tests
  // ==========================================================================

  describe('cleanup timer', () => {
    it('startCleanupTimer does not throw', () => {
      expect(() => startCleanupTimer()).not.toThrow();
    });

    it('stopCleanupTimer does not throw', () => {
      expect(() => stopCleanupTimer()).not.toThrow();
    });

    it('can start and stop timer multiple times', () => {
      expect(() => {
        startCleanupTimer();
        startCleanupTimer(); // Should be idempotent
        stopCleanupTimer();
        stopCleanupTimer(); // Should be idempotent
        startCleanupTimer();
        stopCleanupTimer();
      }).not.toThrow();
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('handles empty key ID', () => {
      const result = checkRateLimit('', 'standard');
      expect(result.allowed).toBe(true);
    });

    it('handles very long key IDs', () => {
      const longKey = 'a'.repeat(1000);
      const result = checkRateLimit(longKey, 'standard');
      expect(result.allowed).toBe(true);
    });

    it('handles special characters in key ID', () => {
      const specialKey = 'key:with/special?chars#and&more=stuff';
      const result = checkRateLimit(specialKey, 'standard');
      expect(result.allowed).toBe(true);
    });

    it('correctly calculates remaining when at exact limit', () => {
      // Make exactly 100 requests
      for (let i = 0; i < 100; i++) {
        const result = checkRateLimit('key-1', 'standard');
        expect(result.allowed).toBe(true);
      }

      // At exact limit, next request should show 0 remaining
      const result = checkRateLimit('key-1', 'standard');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  // ==========================================================================
  // Performance Tests
  // ==========================================================================

  describe('performance', () => {
    it('handles many keys efficiently', () => {
      const start = Date.now();

      // Create 1000 different keys
      for (let i = 0; i < 1000; i++) {
        checkRateLimit(`key-${i}`, 'standard');
      }

      const elapsed = Date.now() - start;
      // Should complete in under 100ms
      expect(elapsed).toBeLessThan(100);
    });

    it('handles many requests on same key efficiently', () => {
      const start = Date.now();

      // Make many requests on same key (will be rate limited but still efficient)
      for (let i = 0; i < 1000; i++) {
        checkRateLimit('key-1', 'standard');
      }

      const elapsed = Date.now() - start;
      // Should complete in under 50ms
      expect(elapsed).toBeLessThan(50);
    });
  });
});
