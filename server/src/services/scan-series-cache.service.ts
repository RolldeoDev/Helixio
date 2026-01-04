/**
 * Scan Series Cache Service
 *
 * In-memory LRU cache for fast series matching during library scans.
 * Prevents duplicate series creation by maintaining a real-time view
 * of series identity (name + publisher).
 *
 * Designed for the folder-first scanning architecture where we need
 * to quickly match files to existing series without hitting the database
 * for every file.
 */

import { getDatabase } from './database.service.js';
import { scannerLogger } from './logger.service.js';

// =============================================================================
// Types
// =============================================================================

export interface ScanSeriesCacheEntry {
  id: string;
  name: string;
  normalizedName: string;
  publisher: string | null;
  normalizedPublisher: string | null;
  startYear: number | null;
  volumeNumber: number | null;
  aliases: string[];
  normalizedAliases: string[];
}

export interface SeriesMatchCriteria {
  seriesName: string;
  publisher?: string | null;
  startYear?: number | null;
  volumeNumber?: number | null;
}

export interface SeriesMatchResult {
  match: ScanSeriesCacheEntry | null;
  confidence: MatchConfidence;
  matchedOn: string[];
  score: number;
}

export type MatchConfidence = 'exact' | 'high' | 'medium' | 'low' | 'none';

// =============================================================================
// Normalization Utilities
// =============================================================================

/**
 * Normalize a series name for matching.
 * - Lowercase
 * - Remove "The " prefix
 * - Remove parentheses content (year/volume)
 * - Remove volume indicators (Vol., Volume, V.)
 * - Strip special characters except spaces
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/i, '')
    .replace(/\s*\([^)]*\)/g, '') // Remove (2023), (Vol. 2), etc.
    .replace(/\s*vol\.?\s*\d+/gi, '') // Remove Vol. 2, Volume 2
    .replace(/\s*v\d+$/gi, '') // Remove V2 at end
    .replace(/[^\w\s]/g, '') // Remove special chars except spaces
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
}

/**
 * Normalize publisher name for matching.
 * - Lowercase
 * - Remove common suffixes (Comics, Publishing, etc.)
 * - Remove special characters
 */
export function normalizePublisher(publisher: string | null): string | null {
  if (!publisher) return null;
  return publisher
    .toLowerCase()
    .replace(/\s*comics?\s*$/i, '')
    .replace(/\s*publishing\s*$/i, '')
    .replace(/\s*entertainment\s*$/i, '')
    .replace(/\s*inc\.?\s*$/i, '')
    .replace(/\s*llc\.?\s*$/i, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse aliases from comma-separated string.
 */
function parseAliases(aliasString: string | null): string[] {
  if (!aliasString) return [];
  return aliasString
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
}

// =============================================================================
// Match Score Calculation
// =============================================================================

/**
 * Calculate match score between metadata and a cached series entry.
 *
 * Scoring:
 * - Name match (required): 50 points
 * - Publisher match: 30 points
 * - Publisher inherited (cached has publisher, metadata doesn't): 15 points
 * - Year match (within 1 year): 15 points
 * - Volume match: 5 points
 * - Alias match (instead of name): 40 points (slightly less than exact name)
 */
function calculateMatchScore(
  criteria: SeriesMatchCriteria,
  cached: ScanSeriesCacheEntry
): { score: number; matchedOn: string[] } {
  const matchedOn: string[] = [];
  let score = 0;

  const normalizedInput = normalizeName(criteria.seriesName);
  const normalizedInputPublisher = normalizePublisher(criteria.publisher ?? null);

  // Check name match (or alias match)
  let nameMatched = false;
  if (normalizedInput === cached.normalizedName) {
    matchedOn.push('name');
    score += 50;
    nameMatched = true;
  } else if (cached.normalizedAliases.includes(normalizedInput)) {
    matchedOn.push('alias');
    score += 40;
    nameMatched = true;
  }

  // Name match is required
  if (!nameMatched) {
    return { score: 0, matchedOn: [] };
  }

  // Publisher matching - STRICT for library scans
  if (normalizedInputPublisher && cached.normalizedPublisher) {
    if (normalizedInputPublisher === cached.normalizedPublisher) {
      matchedOn.push('publisher');
      score += 30;
    } else {
      // Different publishers = ALWAYS different series in library scans
      return { score: 0, matchedOn: [] };
    }
  } else if (normalizedInputPublisher && !cached.normalizedPublisher) {
    // New file has publisher, cached doesn't - no match, create new series
    return { score: 0, matchedOn: [] };
  } else if (!normalizedInputPublisher && cached.normalizedPublisher) {
    // Cached has publisher, new file doesn't - allow match (inherit publisher)
    matchedOn.push('publisher-inherited');
    score += 15;
  }
  // Both null publishers: allow match (name-only series)

  // Year match (within 1 year tolerance)
  if (criteria.startYear && cached.startYear) {
    if (Math.abs(criteria.startYear - cached.startYear) <= 1) {
      matchedOn.push('year');
      score += 15;
    }
  }

  // Volume number match
  if (criteria.volumeNumber && cached.volumeNumber) {
    if (criteria.volumeNumber === cached.volumeNumber) {
      matchedOn.push('volume');
      score += 5;
    }
  }

  return { score, matchedOn };
}

/**
 * Convert score to confidence level.
 */
function scoreToConfidence(score: number): MatchConfidence {
  if (score >= 95) return 'exact';      // name + publisher + year + volume
  if (score >= 80) return 'high';       // name + publisher
  if (score >= 50) return 'medium';     // name only, no conflicting publisher
  if (score >= 40) return 'low';        // alias match only
  return 'none';
}

// =============================================================================
// Scan Series Cache Class
// =============================================================================

export class ScanSeriesCache {
  private cache: Map<string, ScanSeriesCacheEntry> = new Map();
  private maxSize: number;
  private accessOrder: string[] = []; // For LRU eviction
  private hitCount = 0;
  private missCount = 0;

  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
  }

  /**
   * Initialize cache from database for a specific library.
   * Loads all active (non-deleted) series.
   */
  async initialize(libraryId: string): Promise<void> {
    const db = getDatabase();
    const startTime = Date.now();

    // Get all series that have at least one issue in this library
    const series = await db.series.findMany({
      where: {
        deletedAt: null,
        issues: {
          some: {
            libraryId,
          },
        },
      },
      select: {
        id: true,
        name: true,
        publisher: true,
        startYear: true,
        volume: true,
        aliases: true,
      },
    });

    // Clear existing cache
    this.cache.clear();
    this.accessOrder = [];
    this.hitCount = 0;
    this.missCount = 0;

    // Populate cache
    for (const s of series) {
      const aliases = parseAliases(s.aliases);
      const entry: ScanSeriesCacheEntry = {
        id: s.id,
        name: s.name,
        normalizedName: normalizeName(s.name),
        publisher: s.publisher,
        normalizedPublisher: normalizePublisher(s.publisher),
        startYear: s.startYear,
        volumeNumber: s.volume,
        aliases,
        normalizedAliases: aliases.map(normalizeName),
      };
      this.cache.set(s.id, entry);
      this.accessOrder.push(s.id);
    }

    const elapsed = Date.now() - startTime;
    scannerLogger.info(
      { libraryId, seriesCount: series.length, elapsedMs: elapsed },
      `Scan series cache initialized with ${series.length} series in ${elapsed}ms`
    );
  }

  /**
   * Find matching series for given metadata.
   * Returns null match if no suitable match found.
   */
  findMatch(criteria: SeriesMatchCriteria): SeriesMatchResult {
    let bestMatch: ScanSeriesCacheEntry | null = null;
    let bestScore = 0;
    let bestMatchedOn: string[] = [];

    for (const entry of this.cache.values()) {
      const { score, matchedOn } = calculateMatchScore(criteria, entry);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = entry;
        bestMatchedOn = matchedOn;

        // Update access order for LRU
        this.touchEntry(entry.id);
      }
    }

    const confidence = scoreToConfidence(bestScore);

    if (bestMatch && confidence !== 'none') {
      this.hitCount++;
    } else {
      this.missCount++;
    }

    return {
      match: confidence !== 'none' ? bestMatch : null,
      confidence,
      matchedOn: bestMatchedOn,
      score: bestScore,
    };
  }

  /**
   * Add newly created series to cache.
   * Called after series is inserted into database.
   */
  addSeries(series: {
    id: string;
    name: string;
    publisher: string | null;
    startYear: number | null;
    volume?: number | null;
    aliases?: string | null;
  }): void {
    // Evict LRU entry if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const aliases = parseAliases(series.aliases ?? null);
    const entry: ScanSeriesCacheEntry = {
      id: series.id,
      name: series.name,
      normalizedName: normalizeName(series.name),
      publisher: series.publisher,
      normalizedPublisher: normalizePublisher(series.publisher),
      startYear: series.startYear,
      volumeNumber: series.volume ?? null,
      aliases,
      normalizedAliases: aliases.map(normalizeName),
    };

    this.cache.set(series.id, entry);
    this.accessOrder.push(series.id);

    scannerLogger.debug(
      { seriesId: series.id, name: series.name, publisher: series.publisher },
      `Added series to scan cache: ${series.name}`
    );
  }

  /**
   * Add an alias to an existing series in the cache.
   */
  addAlias(seriesId: string, alias: string): void {
    const entry = this.cache.get(seriesId);
    if (entry) {
      if (!entry.aliases.includes(alias)) {
        entry.aliases.push(alias);
        entry.normalizedAliases.push(normalizeName(alias));
      }
      this.touchEntry(seriesId);
    }
  }

  /**
   * Get a series by ID from cache.
   */
  get(seriesId: string): ScanSeriesCacheEntry | undefined {
    const entry = this.cache.get(seriesId);
    if (entry) {
      this.touchEntry(seriesId);
    }
    return entry;
  }

  /**
   * Check if a series exists in the cache by ID.
   */
  has(seriesId: string): boolean {
    return this.cache.has(seriesId);
  }

  /**
   * Remove a series from the cache.
   */
  remove(seriesId: string): void {
    this.cache.delete(seriesId);
    this.accessOrder = this.accessOrder.filter((id) => id !== seriesId);
  }

  /**
   * Get cache statistics for monitoring.
   */
  getStats(): {
    totalSeries: number;
    hitRate: number;
    memoryEstimateBytes: number;
    maxSize: number;
  } {
    const totalLookups = this.hitCount + this.missCount;
    const hitRate = totalLookups > 0 ? this.hitCount / totalLookups : 0;

    // Rough memory estimate: ~500 bytes per entry
    const memoryEstimateBytes = this.cache.size * 500;

    return {
      totalSeries: this.cache.size,
      hitRate,
      memoryEstimateBytes,
      maxSize: this.maxSize,
    };
  }

  /**
   * Clear the cache.
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.hitCount = 0;
    this.missCount = 0;
  }

  // =============================================================================
  // Private Methods
  // =============================================================================

  /**
   * Update access order for LRU tracking.
   */
  private touchEntry(id: string): void {
    const index = this.accessOrder.indexOf(id);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(id);
  }

  /**
   * Evict least recently used entry.
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;

    const lruId = this.accessOrder.shift();
    if (lruId) {
      const evicted = this.cache.get(lruId);
      this.cache.delete(lruId);
      if (evicted) {
        scannerLogger.debug(
          { seriesId: lruId, name: evicted.name },
          `Evicted LRU series from scan cache: ${evicted.name}`
        );
      }
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let globalScanCache: ScanSeriesCache | null = null;

/**
 * Get or create the global scan series cache instance.
 */
export function getScanSeriesCache(maxSize = 10000): ScanSeriesCache {
  if (!globalScanCache) {
    globalScanCache = new ScanSeriesCache(maxSize);
  }
  return globalScanCache;
}

/**
 * Clear and reset the global scan series cache.
 */
export function resetScanSeriesCache(): void {
  if (globalScanCache) {
    globalScanCache.clear();
  }
  globalScanCache = null;
}
