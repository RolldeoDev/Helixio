/**
 * Review Provider Registry
 *
 * Central registry for external review providers.
 * Manages provider registration and provides access by source name or priority.
 */

import type { ReviewProvider, ReviewSource } from './types.js';
import { getExternalRatingsSettings } from '../config.service.js';
import { createServiceLogger } from '../logger.service.js';

const logger = createServiceLogger('review-provider-registry');

// =============================================================================
// Registry State
// =============================================================================

const providers = new Map<ReviewSource, ReviewProvider>();

// =============================================================================
// Registry Functions
// =============================================================================

/**
 * Register a review provider
 */
export function register(provider: ReviewProvider): void {
  providers.set(provider.name, provider);
  logger.debug({ source: provider.name }, 'Registered review provider');
}

/**
 * Get a provider by source name
 */
export function get(source: ReviewSource): ReviewProvider | undefined {
  return providers.get(source);
}

/**
 * Get all registered providers
 */
export function getAll(): ReviewProvider[] {
  return Array.from(providers.values());
}

/**
 * Get all source names of registered providers
 */
export function getAllSources(): ReviewSource[] {
  return Array.from(providers.keys());
}

/**
 * Get enabled providers based on config
 */
export function getEnabled(): ReviewProvider[] {
  const settings = getExternalRatingsSettings();
  const enabledSources =
    (settings?.enabledReviewSources as ReviewSource[]) || getAllSources();

  return enabledSources
    .map((source) => providers.get(source))
    .filter((p): p is ReviewProvider => p !== undefined);
}

/**
 * Get enabled providers ordered by priority
 * Priority order depends on content type:
 * - Manga: anilist > myanimelist > comicbookroundup
 * - Western: comicbookroundup > anilist > myanimelist
 */
export function getEnabledByPriority(
  contentType: 'manga' | 'western' = 'western'
): ReviewProvider[] {
  const priorityOrder: ReviewSource[] =
    contentType === 'manga'
      ? ['anilist', 'myanimelist', 'comicbookroundup']
      : ['comicbookroundup', 'anilist', 'myanimelist'];

  const settings = getExternalRatingsSettings();
  const enabledSources = new Set(
    (settings?.enabledReviewSources as ReviewSource[]) || getAllSources()
  );

  const ordered: ReviewProvider[] = [];
  const seen = new Set<ReviewSource>();

  // Add in priority order
  for (const source of priorityOrder) {
    if (enabledSources.has(source) && !seen.has(source)) {
      const provider = providers.get(source);
      if (provider) {
        ordered.push(provider);
        seen.add(source);
      }
    }
  }

  // Add any remaining providers not in priority list
  for (const [source, provider] of providers) {
    if (enabledSources.has(source) && !seen.has(source)) {
      ordered.push(provider);
    }
  }

  return ordered;
}

/**
 * Get providers that support issue-level reviews
 */
export function getWithIssueSupport(): ReviewProvider[] {
  return getEnabled().filter((p) => p.supportsIssueReviews);
}

/**
 * Check if a source is registered
 */
export function has(source: ReviewSource): boolean {
  return providers.has(source);
}

/**
 * Check if a source is enabled
 */
export function isEnabled(source: ReviewSource): boolean {
  const settings = getExternalRatingsSettings();
  const enabledSources =
    (settings?.enabledReviewSources as ReviewSource[]) || getAllSources();
  return enabledSources.includes(source) && providers.has(source);
}

/**
 * Get count of registered providers
 */
export function count(): number {
  return providers.size;
}

/**
 * Get count of enabled providers
 */
export function enabledCount(): number {
  return getEnabled().length;
}

/**
 * Clear all registered providers (for testing)
 */
export function clear(): void {
  providers.clear();
}

/**
 * Check availability of all enabled providers
 */
export async function checkAllAvailability(): Promise<
  Map<ReviewSource, { available: boolean; error?: string }>
> {
  const results = new Map<
    ReviewSource,
    { available: boolean; error?: string }
  >();

  const enabled = getEnabled();
  const checks = await Promise.allSettled(
    enabled.map(async (provider) => {
      const result = await provider.checkAvailability();
      return { source: provider.name, result };
    })
  );

  for (const check of checks) {
    if (check.status === 'fulfilled') {
      results.set(check.value.source, check.value.result);
    } else {
      // Promise rejected - provider errored during check
      const source = enabled[checks.indexOf(check)]?.name;
      if (source) {
        results.set(source, {
          available: false,
          error: check.reason?.message || 'Unknown error',
        });
      }
    }
  }

  return results;
}

// =============================================================================
// Review Provider Registry Object (for convenient import)
// =============================================================================

export const ReviewProviderRegistry = {
  register,
  get,
  getAll,
  getAllSources,
  getEnabled,
  getEnabledByPriority,
  getWithIssueSupport,
  has,
  isEnabled,
  count,
  enabledCount,
  clear,
  checkAllAvailability,
};

export default ReviewProviderRegistry;
