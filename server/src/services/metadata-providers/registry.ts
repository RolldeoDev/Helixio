/**
 * Provider Registry
 *
 * Central registry for metadata providers.
 * Manages provider registration and provides access by source name or priority.
 */

import type { MetadataProvider, MetadataSource } from './types.js';
import { getMetadataSettings } from '../config.service.js';

// =============================================================================
// Registry State
// =============================================================================

const providers = new Map<MetadataSource, MetadataProvider>();

// =============================================================================
// Registry Functions
// =============================================================================

/**
 * Register a metadata provider
 */
export function register(provider: MetadataProvider): void {
  providers.set(provider.name, provider);
}

/**
 * Get a provider by source name
 */
export function get(source: MetadataSource): MetadataProvider | undefined {
  return providers.get(source);
}

/**
 * Get all registered providers
 */
export function getAll(): MetadataProvider[] {
  return Array.from(providers.values());
}

/**
 * Get all source names of registered providers
 */
export function getAllSources(): MetadataSource[] {
  return Array.from(providers.keys());
}

/**
 * Get enabled providers based on config
 */
export function getEnabled(): MetadataProvider[] {
  const settings = getMetadataSettings();
  const enabledSources = settings.enabledSources || getAllSources();

  return enabledSources
    .map((source) => providers.get(source))
    .filter((p): p is MetadataProvider => p !== undefined);
}

/**
 * Get providers ordered by priority
 */
export function getByPriority(): MetadataProvider[] {
  const settings = getMetadataSettings();
  const priorityOrder = settings.sourcePriority || [settings.primarySource];

  // Start with sources in priority order
  const ordered: MetadataProvider[] = [];
  const seen = new Set<MetadataSource>();

  for (const source of priorityOrder) {
    const provider = providers.get(source);
    if (provider && !seen.has(source)) {
      ordered.push(provider);
      seen.add(source);
    }
  }

  // Add any remaining providers not in priority list
  for (const [source, provider] of providers) {
    if (!seen.has(source)) {
      ordered.push(provider);
    }
  }

  return ordered;
}

/**
 * Get enabled providers ordered by priority
 */
export function getEnabledByPriority(): MetadataProvider[] {
  const settings = getMetadataSettings();
  const enabledSources = new Set(settings.enabledSources || getAllSources());

  return getByPriority().filter((p) => enabledSources.has(p.name));
}

/**
 * Get the primary provider
 */
export function getPrimary(): MetadataProvider | undefined {
  const settings = getMetadataSettings();
  return providers.get(settings.primarySource);
}

/**
 * Check if a source is registered
 */
export function has(source: MetadataSource): boolean {
  return providers.has(source);
}

/**
 * Get count of registered providers
 */
export function count(): number {
  return providers.size;
}

/**
 * Clear all registered providers (for testing)
 */
export function clear(): void {
  providers.clear();
}

// =============================================================================
// Provider Registry Object (for convenient import)
// =============================================================================

export const ProviderRegistry = {
  register,
  get,
  getAll,
  getAllSources,
  getEnabled,
  getByPriority,
  getEnabledByPriority,
  getPrimary,
  has,
  count,
  clear,
};

export default ProviderRegistry;
