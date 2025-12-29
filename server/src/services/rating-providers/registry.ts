/**
 * Rating Provider Registry
 *
 * Central registry for external rating providers.
 * Manages provider registration and provides access by source name or priority.
 */

import type { RatingProvider, RatingSource } from './types.js';
import { getExternalRatingsSettings } from '../config.service.js';
import { createServiceLogger } from '../logger.service.js';

const logger = createServiceLogger('rating-provider-registry');

// =============================================================================
// Registry State
// =============================================================================

const providers = new Map<RatingSource, RatingProvider>();

// =============================================================================
// Registry Functions
// =============================================================================

/**
 * Register a rating provider
 */
export function register(provider: RatingProvider): void {
  providers.set(provider.name, provider);
  logger.debug({ source: provider.name }, 'Registered rating provider');
}

/**
 * Get a provider by source name
 */
export function get(source: RatingSource): RatingProvider | undefined {
  return providers.get(source);
}

/**
 * Get all registered providers
 */
export function getAll(): RatingProvider[] {
  return Array.from(providers.values());
}

/**
 * Get all source names of registered providers
 */
export function getAllSources(): RatingSource[] {
  return Array.from(providers.keys());
}

/**
 * Get enabled providers based on config
 */
export function getEnabled(): RatingProvider[] {
  const settings = getExternalRatingsSettings();
  const enabledSources = settings?.enabledSources || getAllSources();

  return enabledSources
    .map((source) => providers.get(source))
    .filter((p): p is RatingProvider => p !== undefined);
}

/**
 * Get enabled providers ordered by priority
 * Priority order: comicbookroundup > leagueofcomicgeeks > comicvine > metron > anilist
 */
export function getEnabledByPriority(): RatingProvider[] {
  const defaultPriority: RatingSource[] = [
    'comicbookroundup',
    'leagueofcomicgeeks',
    'comicvine',
    'metron',
    'anilist',
  ];

  const settings = getExternalRatingsSettings();
  const enabledSources = new Set(settings?.enabledSources || getAllSources());

  const ordered: RatingProvider[] = [];
  const seen = new Set<RatingSource>();

  // Add in priority order
  for (const source of defaultPriority) {
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
 * Get providers that support a specific rating type
 */
export function getByRatingType(
  ratingType: 'community' | 'critic'
): RatingProvider[] {
  return getEnabled().filter((p) => p.ratingTypes.includes(ratingType));
}

/**
 * Get providers that support issue-level ratings
 */
export function getWithIssueSupport(): RatingProvider[] {
  return getEnabled().filter((p) => p.supportsIssueRatings);
}

/**
 * Check if a source is registered
 */
export function has(source: RatingSource): boolean {
  return providers.has(source);
}

/**
 * Check if a source is enabled
 */
export function isEnabled(source: RatingSource): boolean {
  const settings = getExternalRatingsSettings();
  const enabledSources = settings?.enabledSources || getAllSources();
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
  Map<RatingSource, { available: boolean; error?: string }>
> {
  const results = new Map<
    RatingSource,
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
// Rating Provider Registry Object (for convenient import)
// =============================================================================

export const RatingProviderRegistry = {
  register,
  get,
  getAll,
  getAllSources,
  getEnabled,
  getEnabledByPriority,
  getByRatingType,
  getWithIssueSupport,
  has,
  isEnabled,
  count,
  enabledCount,
  clear,
  checkAllAvailability,
};

export default RatingProviderRegistry;
