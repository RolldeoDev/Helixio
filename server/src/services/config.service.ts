/**
 * Configuration Service
 *
 * Manages application configuration stored in ~/.helixio/config.json
 * Handles API keys, user preferences, and application settings.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { getConfigPath, ensureAppDirectories } from './app-paths.service.js';

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

export interface AppConfig {
  version: string;
  apiKeys: ApiKeys;
  metadata: MetadataSettings;
  cache: CacheSettings;
  naming: NamingConventions;
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
    console.error('Failed to load config, using defaults:', error);
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
    console.error('Failed to save config:', error);
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
 * Get an API key by name
 */
export function getApiKey(name: keyof ApiKeys): string | undefined {
  const config = loadConfig();
  return config.apiKeys[name];
}

/**
 * Set an API key
 */
export function setApiKey(name: keyof ApiKeys, value: string): void {
  const config = loadConfig();
  config.apiKeys[name] = value;
  saveConfig(config);
}

/**
 * Check if an API key is configured
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

  return {
    version: partial.version ?? DEFAULT_CONFIG.version,
    apiKeys: { ...DEFAULT_CONFIG.apiKeys, ...partial.apiKeys },
    metadata: mergedMetadata,
    cache: { ...DEFAULT_CONFIG.cache, ...partial.cache },
    naming: { ...DEFAULT_CONFIG.naming, ...partial.naming },
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
