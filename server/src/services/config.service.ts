/**
 * Configuration Service
 *
 * Manages application configuration stored in ~/.helixio/config.json
 * Handles API keys, user preferences, and application settings.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { getConfigPath, ensureAppDirectories } from './app-paths.service.js';
import { logError } from './logger.service.js';

// =============================================================================
// Type Definitions
// =============================================================================

export interface ApiKeys {
  comicVine?: string;
  anthropic?: string;
  /** Metron username (create account at https://metron.cloud) */
  metronUsername?: string;
  /** Metron password */
  metronPassword?: string;
  gcdEmail?: string;
  gcdPassword?: string;
}

export interface LLMSettings {
  /** Claude model to use for filename parsing */
  model: string;
  /** Whether to enable LLM filename parsing by default */
  enableByDefault: boolean;
}

export type MetadataSource = 'comicvine' | 'metron' | 'gcd' | 'anilist' | 'mal';

export interface MetadataSettings {
  /** Primary source for metadata lookups */
  primarySource: MetadataSource;
  /** Rate limit aggressiveness (1-10, higher = more aggressive) */
  rateLimitLevel: number;
  /** LLM settings for filename parsing */
  llm: LLMSettings;
  /** Source priority order for merging (first = highest priority) */
  sourcePriority: MetadataSource[];
  /** Which metadata sources are enabled */
  enabledSources: MetadataSource[];
  /** Confidence threshold for auto-matching cross-source series (0.85-1.0) */
  autoMatchThreshold: number;
  /** Whether to automatically apply high-confidence cross-source matches */
  autoApplyHighConfidence: boolean;
  /** Manga file classification settings */
  mangaClassification: MangaClassificationSettings;
  /** Western comic file classification settings */
  comicClassification: ComicClassificationSettings;
}

export interface MangaClassificationSettings {
  /** Enable smart chapter/volume classification for manga files */
  enabled: boolean;
  /** Page count threshold: files with fewer pages are classified as chapters, more as volumes */
  volumePageThreshold: number;
  /** Whether filename-parsed type (e.g., "Vol 5", "Ch 12") overrides page count inference */
  filenameOverridesPageCount: boolean;
}

export interface ComicClassificationSettings {
  /** Enable page-based format classification for Western comic files */
  enabled: boolean;
  /** Page threshold: files with fewer pages are classified as issues */
  issuePageThreshold: number;
  /** Page threshold: files with more pages are classified as omnibus (between is TPB) */
  omnibusPageThreshold: number;
  /** Whether filename indicators (TPB, Omnibus, etc.) override page count inference */
  filenameOverridesPageCount: boolean;
}

export interface CacheSettings {
  /** Maximum size in MB for cover cache */
  coverCacheSizeMb: number;
  /** Series cache TTL in days */
  seriesTTLDays: number;
  /** Issues cache TTL in days */
  issuesTTLDays: number;
  /** Maximum number of cached series entries */
  maxSeriesCacheEntries: number;
  /** Maximum size in MB for series cache */
  maxSeriesCacheSizeMb: number;
}

export interface NamingConventions {
  /** Pattern for series folders: e.g., "{SeriesName} ({StartYear}-{EndYear})" */
  seriesFolder: string;
  /** Pattern for issue files */
  issueFile: string;
  /** Pattern for volume/TPB files */
  volumeFile: string;
  /** Pattern for book/OGN files */
  bookFile: string;
  /** Pattern for special issues */
  specialFile: string;
}

/** Rating source for external community/critic ratings */
export type ExternalRatingSource =
  | 'comicbookroundup'
  | 'leagueofcomicgeeks'
  | 'comicvine'
  | 'metron'
  | 'anilist'
  | 'myanimelist';

export interface ExternalRatingsSettings {
  /** Which rating sources are enabled */
  enabledSources: ExternalRatingSource[];
  /** Which review sources are enabled (subset of rating sources that support reviews) */
  enabledReviewSources: ExternalRatingSource[];
  /** Sync schedule: "daily" | "weekly" | "manual" */
  syncSchedule: 'daily' | 'weekly' | 'manual';
  /** Hour of day for scheduled sync (0-23, in server timezone) */
  syncHour: number;
  /** Series rating TTL in days before refresh */
  ratingTTLDays: number;
  /** Issue rating TTL in days before refresh (issues change less often) */
  issueRatingTTLDays: number;
  /** Review TTL in days before refresh */
  reviewTTLDays: number;
  /** Rate limit for scraping sources (requests per minute) */
  scrapingRateLimit: number;
  /** Minimum confidence for fuzzy matching (0.0-1.0) */
  minMatchConfidence: number;
}

export interface AppConfig {
  version: string;
  apiKeys: ApiKeys;
  metadata: MetadataSettings;
  cache: CacheSettings;
  naming: NamingConventions;
  /** External rating sync settings */
  externalRatings: ExternalRatingsSettings;
  /** Operation log retention in days */
  logRetentionDays: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: AppConfig = {
  version: '1.0.0',
  apiKeys: {},
  metadata: {
    primarySource: 'comicvine',
    rateLimitLevel: 5,
    llm: {
      model: 'claude-3-5-haiku-20241022',
      enableByDefault: false,
    },
    sourcePriority: ['comicvine', 'metron', 'anilist', 'mal'],
    enabledSources: ['comicvine', 'metron', 'anilist', 'mal'],
    autoMatchThreshold: 0.95,
    autoApplyHighConfidence: true,
    mangaClassification: {
      enabled: true,
      volumePageThreshold: 60,
      filenameOverridesPageCount: true,
    },
    comicClassification: {
      enabled: true,
      issuePageThreshold: 50,
      omnibusPageThreshold: 200,
      filenameOverridesPageCount: true,
    },
  },
  cache: {
    coverCacheSizeMb: 500,
    seriesTTLDays: 7,
    issuesTTLDays: 7,
    maxSeriesCacheEntries: 500,
    maxSeriesCacheSizeMb: 100,
  },
  naming: {
    seriesFolder: '{SeriesName} ({StartYear}-{EndYear})',
    issueFile: 'Issue #{Number:3} - {Title} ({Date}).cbz',
    volumeFile: 'Volume {Number:2} - {Title} ({Year}).cbz',
    bookFile: 'Book {Number:2} - {Title} ({Year}).cbz',
    specialFile: 'Special - {Title} ({Year}).cbz',
  },
  externalRatings: {
    enabledSources: ['comicbookroundup', 'leagueofcomicgeeks'],
    enabledReviewSources: ['anilist'],
    syncSchedule: 'weekly',
    syncHour: 3, // 3 AM
    ratingTTLDays: 7,
    issueRatingTTLDays: 14, // Issues change less often than series
    reviewTTLDays: 14, // Reviews don't change often
    scrapingRateLimit: 10, // requests per minute
    minMatchConfidence: 0.7,
  },
  logRetentionDays: 10,
};

// =============================================================================
// Configuration State
// =============================================================================

let cachedConfig: AppConfig | null = null;

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Load configuration from disk
 * Returns cached config if available
 */
export function loadConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    // Create default config if it doesn't exist
    cachedConfig = { ...DEFAULT_CONFIG };
    saveConfig(cachedConfig);
    return cachedConfig;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(content) as Partial<AppConfig>;

    // Merge with defaults to ensure all fields exist
    cachedConfig = mergeWithDefaults(parsed);

    return cachedConfig;
  } catch (error) {
    logError('config', error, { action: 'load-config' });
    cachedConfig = { ...DEFAULT_CONFIG };
    return cachedConfig;
  }
}

/**
 * Save configuration to disk
 */
export function saveConfig(config: AppConfig): void {
  ensureAppDirectories();
  const configPath = getConfigPath();

  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    cachedConfig = config;
  } catch (error) {
    logError('config', error, { action: 'save-config' });
    throw new Error(`Failed to save configuration: ${error}`);
  }
}

/**
 * Update specific configuration values
 */
export function updateConfig(updates: Partial<AppConfig>): AppConfig {
  const current = loadConfig();
  const updated: AppConfig = {
    version: updates.version ?? current.version,
    apiKeys: { ...current.apiKeys, ...updates.apiKeys },
    metadata: { ...current.metadata, ...updates.metadata },
    cache: { ...current.cache, ...updates.cache },
    naming: { ...current.naming, ...updates.naming },
    externalRatings: { ...current.externalRatings, ...updates.externalRatings },
    logRetentionDays: updates.logRetentionDays ?? current.logRetentionDays,
  };
  saveConfig(updated);
  return updated;
}

/**
 * Clear cached config (useful for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

// =============================================================================
// API Key Management
// =============================================================================

/**
 * Environment variable names for each API key.
 * These take highest priority over OS keychain and config file.
 */
export const ENV_VAR_MAP: Record<keyof ApiKeys, string> = {
  comicVine: 'HELIXIO_COMICVINE_API_KEY',
  anthropic: 'HELIXIO_ANTHROPIC_API_KEY',
  metronUsername: 'HELIXIO_METRON_USERNAME',
  metronPassword: 'HELIXIO_METRON_PASSWORD',
  gcdEmail: 'HELIXIO_GCD_EMAIL',
  gcdPassword: 'HELIXIO_GCD_PASSWORD',
};

/**
 * Get the source of an API key (for debugging/UI)
 */
export type ApiKeySource = 'environment' | 'config' | 'none';

/**
 * Get an API key by name with priority lookup.
 *
 * Priority order:
 * 1. Environment variable (HELIXIO_*)
 * 2. Config file (~/.helixio/config.json)
 *
 * Note: OS keychain support is available via secure-storage.service.ts
 * but not integrated here to keep getApiKey synchronous.
 */
export function getApiKey(name: keyof ApiKeys): string | undefined {
  // 1. Check environment variable (highest priority)
  const envVar = ENV_VAR_MAP[name];
  const envValue = process.env[envVar];
  if (envValue && envValue.trim().length > 0) {
    return envValue.trim();
  }

  // 2. Fall back to config file (lowest priority)
  const config = loadConfig();
  return config.apiKeys[name];
}

/**
 * Get the source of an API key value.
 * Useful for UI to show where credentials are coming from.
 */
export function getApiKeySource(name: keyof ApiKeys): ApiKeySource {
  const envVar = ENV_VAR_MAP[name];
  const envValue = process.env[envVar];
  if (envValue && envValue.trim().length > 0) {
    return 'environment';
  }

  const config = loadConfig();
  const configValue = config.apiKeys[name];
  if (configValue && configValue.trim().length > 0) {
    return 'config';
  }

  return 'none';
}

/**
 * Check if an API key is read-only (set via environment variable).
 * Keys set via environment variables cannot be changed via the UI.
 */
export function isApiKeyReadOnly(name: keyof ApiKeys): boolean {
  return getApiKeySource(name) === 'environment';
}

/**
 * Set an API key in the config file.
 * Note: If an environment variable is set for this key, it will take priority.
 */
export function setApiKey(name: keyof ApiKeys, value: string): void {
  const config = loadConfig();
  config.apiKeys[name] = value;
  saveConfig(config);
}

/**
 * Check if an API key is configured (from any source)
 */
export function hasApiKey(name: keyof ApiKeys): boolean {
  const key = getApiKey(name);
  return key !== undefined && key.length > 0;
}

// =============================================================================
// Settings Accessors
// =============================================================================

/**
 * Get metadata settings
 */
export function getMetadataSettings(): MetadataSettings {
  return loadConfig().metadata;
}

/**
 * Update metadata settings
 */
export function updateMetadataSettings(settings: Partial<MetadataSettings>): void {
  const config = loadConfig();
  config.metadata = { ...config.metadata, ...settings };
  saveConfig(config);
}

/**
 * Get cache settings
 */
export function getCacheSettings(): CacheSettings {
  return loadConfig().cache;
}

/**
 * Update cache settings
 */
export function updateCacheSettings(settings: Partial<CacheSettings>): void {
  const config = loadConfig();
  config.cache = { ...config.cache, ...settings };
  saveConfig(config);
}

/**
 * Get external ratings settings
 */
export function getExternalRatingsSettings(): ExternalRatingsSettings {
  return loadConfig().externalRatings;
}

/**
 * Update external ratings settings
 */
export function updateExternalRatingsSettings(
  settings: Partial<ExternalRatingsSettings>
): void {
  const config = loadConfig();
  config.externalRatings = { ...config.externalRatings, ...settings };
  saveConfig(config);
}

/**
 * Get naming conventions
 */
export function getNamingConventions(): NamingConventions {
  return loadConfig().naming;
}

/**
 * Update naming conventions
 */
export function updateNamingConventions(conventions: Partial<NamingConventions>): void {
  const config = loadConfig();
  config.naming = { ...config.naming, ...conventions };
  saveConfig(config);
}

/**
 * Get log retention period in days
 */
export function getLogRetentionDays(): number {
  return loadConfig().logRetentionDays;
}

/**
 * Get LLM settings
 */
export function getLLMSettings(): LLMSettings {
  return loadConfig().metadata.llm;
}

/**
 * Update LLM settings
 */
export function updateLLMSettings(settings: Partial<LLMSettings>): void {
  const config = loadConfig();
  config.metadata.llm = { ...config.metadata.llm, ...settings };
  saveConfig(config);
}

/**
 * Get the configured LLM model
 */
export function getLLMModel(): string {
  return loadConfig().metadata.llm.model;
}

/**
 * Get manga classification settings
 */
export function getMangaClassificationSettings(): MangaClassificationSettings {
  return loadConfig().metadata.mangaClassification;
}

/**
 * Update manga classification settings
 */
export function updateMangaClassificationSettings(settings: Partial<MangaClassificationSettings>): void {
  const config = loadConfig();
  config.metadata.mangaClassification = { ...config.metadata.mangaClassification, ...settings };
  saveConfig(config);
}

/**
 * Get comic (Western) classification settings
 */
export function getComicClassificationSettings(): ComicClassificationSettings {
  return loadConfig().metadata.comicClassification;
}

/**
 * Update comic (Western) classification settings
 */
export function updateComicClassificationSettings(settings: Partial<ComicClassificationSettings>): void {
  const config = loadConfig();
  config.metadata.comicClassification = { ...config.metadata.comicClassification, ...settings };
  saveConfig(config);
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Merge partial config with defaults
 */
function mergeWithDefaults(partial: Partial<AppConfig>): AppConfig {
  // Deep merge metadata settings to handle nested llm object
  const mergedMetadata: MetadataSettings = {
    ...DEFAULT_CONFIG.metadata,
    ...partial.metadata,
    llm: {
      ...DEFAULT_CONFIG.metadata.llm,
      ...(partial.metadata?.llm || {}),
    },
    // Ensure arrays have defaults if not provided
    sourcePriority: partial.metadata?.sourcePriority || DEFAULT_CONFIG.metadata.sourcePriority,
    enabledSources: partial.metadata?.enabledSources || DEFAULT_CONFIG.metadata.enabledSources,
    // Ensure new cross-source settings have defaults
    autoMatchThreshold: partial.metadata?.autoMatchThreshold ?? DEFAULT_CONFIG.metadata.autoMatchThreshold,
    autoApplyHighConfidence: partial.metadata?.autoApplyHighConfidence ?? DEFAULT_CONFIG.metadata.autoApplyHighConfidence,
    // Manga classification settings
    mangaClassification: {
      ...DEFAULT_CONFIG.metadata.mangaClassification,
      ...(partial.metadata?.mangaClassification || {}),
    },
    // Western comic classification settings
    comicClassification: {
      ...DEFAULT_CONFIG.metadata.comicClassification,
      ...(partial.metadata?.comicClassification || {}),
    },
  };

  // External ratings settings
  const mergedExternalRatings: ExternalRatingsSettings = {
    ...DEFAULT_CONFIG.externalRatings,
    ...(partial.externalRatings || {}),
    // Ensure arrays have defaults if not provided
    enabledSources:
      partial.externalRatings?.enabledSources ||
      DEFAULT_CONFIG.externalRatings.enabledSources,
    enabledReviewSources:
      partial.externalRatings?.enabledReviewSources ||
      DEFAULT_CONFIG.externalRatings.enabledReviewSources,
  };

  return {
    version: partial.version ?? DEFAULT_CONFIG.version,
    apiKeys: { ...DEFAULT_CONFIG.apiKeys, ...partial.apiKeys },
    metadata: mergedMetadata,
    cache: { ...DEFAULT_CONFIG.cache, ...partial.cache },
    naming: { ...DEFAULT_CONFIG.naming, ...partial.naming },
    externalRatings: mergedExternalRatings,
    logRetentionDays: partial.logRetentionDays ?? DEFAULT_CONFIG.logRetentionDays,
  };
}


// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize configuration on startup
 * Creates default config if it doesn't exist
 */
export function initializeConfig(): AppConfig {
  ensureAppDirectories();
  return loadConfig();
}
