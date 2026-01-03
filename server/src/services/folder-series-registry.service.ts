/**
 * Folder Series Registry Service
 *
 * Builds and manages an in-memory registry of series definitions from series.json files.
 * Used during scanning to provide folder-scoped series matching before falling back
 * to database-wide matching.
 *
 * Key features:
 * - Handles both v1 (single-series) and v2 (multi-series) series.json formats
 * - Provides alias matching for flexible series name resolution
 * - Calculates similarity scores for ambiguous matches
 */

import type { SeriesMetadata, SeriesDefinition } from './series-metadata.service.js';
import { getSeriesDefinitions } from './series-metadata.service.js';
import { createServiceLogger } from './logger.service.js';

const logger = createServiceLogger('folder-series-registry');

// =============================================================================
// Types
// =============================================================================

/**
 * A registry entry for a single series definition in a folder.
 */
export interface FolderSeriesEntry {
  /** The folder containing the series.json */
  folderPath: string;
  /** The series definition from series.json */
  definition: SeriesDefinition;
  /** Normalized name for matching */
  normalizedName: string;
  /** Normalized aliases for matching */
  normalizedAliases: string[];
}

/**
 * Result of a folder-scoped series match.
 */
export interface FolderMatchResult {
  /** The matched entry, or null if no match */
  entry: FolderSeriesEntry | null;
  /** Match confidence score (0-1) */
  confidence: number;
  /** How the match was found */
  matchType: 'exact-name' | 'exact-alias' | 'fuzzy-name' | 'fuzzy-alias' | 'none';
  /** Other potential matches (for logging ambiguous cases) */
  alternates?: FolderSeriesEntry[];
}

// =============================================================================
// Name Normalization
// =============================================================================

/**
 * Normalize a series name for comparison.
 * Removes common prefixes/suffixes, normalizes spacing and case.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // Remove common prefixes
    .replace(/^the\s+/i, '')
    // Remove content in parentheses at the end (often year or volume)
    .replace(/\s*\([^)]+\)\s*$/, '')
    // Remove volume indicators
    .replace(/\s*vol(?:ume)?\.?\s*\d+\s*$/i, '')
    // Normalize spacing
    .replace(/\s+/g, ' ')
    // Remove special characters
    .replace(/[^\w\s]/g, '');
}

/**
 * Calculate similarity between two normalized strings (0-1).
 * Uses prefix/suffix matching and word-level comparison.
 */
export function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;

  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  let matches = 0;
  const minLen = Math.min(a.length, b.length);

  // Check common prefix
  let prefixLen = 0;
  while (prefixLen < minLen && a[prefixLen] === b[prefixLen]) {
    prefixLen++;
  }

  // Check common suffix
  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen &&
    a[a.length - 1 - suffixLen] === b[b.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  matches = prefixLen + suffixLen;

  // Check for word-level matches
  const wordsA = a.split(' ');
  const wordsB = new Set(b.split(' '));

  for (const word of wordsA) {
    if (wordsB.has(word) && word.length > 2) {
      matches += word.length;
    }
  }

  return Math.min(1, matches / maxLen);
}

// =============================================================================
// Folder Series Registry
// =============================================================================

/**
 * In-memory registry of series definitions from series.json files.
 * Built during scanning, ephemeral (not persisted).
 */
export class FolderSeriesRegistry {
  private registry = new Map<string, FolderSeriesEntry[]>();

  /**
   * Build a registry from the scanner's seriesJsonMap.
   * Handles both v1 and v2 series.json formats.
   */
  static buildFromMap(seriesJsonMap: Map<string, SeriesMetadata>): FolderSeriesRegistry {
    const registry = new FolderSeriesRegistry();

    for (const [folderPath, metadata] of seriesJsonMap.entries()) {
      const definitions = getSeriesDefinitions(metadata);

      if (definitions.length > 0) {
        const entries: FolderSeriesEntry[] = definitions.map((def) => ({
          folderPath,
          definition: def,
          normalizedName: normalizeName(def.name),
          normalizedAliases: (def.aliases || []).map(normalizeName).filter(Boolean),
        }));

        registry.registry.set(folderPath, entries);
        logger.debug({
          msg: `Registered ${entries.length} series for folder`,
          folder: folderPath,
          series: definitions.map((d) => d.name),
        });
      }
    }

    return registry;
  }

  /**
   * Find a series entry in a specific folder by matching name or alias.
   * Returns best match with confidence score.
   *
   * Matching priority:
   * 1. Exact name match
   * 2. Exact alias match
   * 3. Fuzzy name match (score >= 0.8)
   * 4. Fuzzy alias match (score >= 0.8)
   */
  findInFolder(folderPath: string, seriesNameFromFile: string): FolderMatchResult {
    const entries = this.registry.get(folderPath);
    if (!entries || entries.length === 0) {
      return { entry: null, confidence: 0, matchType: 'none' };
    }

    const normalized = normalizeName(seriesNameFromFile);

    // 1. Try exact name match
    for (const entry of entries) {
      if (entry.normalizedName === normalized) {
        return {
          entry,
          confidence: 1.0,
          matchType: 'exact-name',
        };
      }
    }

    // 2. Try exact alias match
    for (const entry of entries) {
      if (entry.normalizedAliases.includes(normalized)) {
        logger.debug({
          msg: 'Matched via alias',
          searchName: seriesNameFromFile,
          matchedSeries: entry.definition.name,
          folder: folderPath,
        });
        return {
          entry,
          confidence: 1.0,
          matchType: 'exact-alias',
        };
      }
    }

    // 3. Try fuzzy matching
    const fuzzyThreshold = 0.8;
    let bestMatch: FolderSeriesEntry | null = null;
    let bestScore = 0;
    let bestMatchType: 'fuzzy-name' | 'fuzzy-alias' = 'fuzzy-name';
    const alternates: FolderSeriesEntry[] = [];

    for (const entry of entries) {
      // Check name similarity
      const nameScore = calculateSimilarity(normalized, entry.normalizedName);

      // Check alias similarities
      let bestAliasScore = 0;
      for (const alias of entry.normalizedAliases) {
        const aliasScore = calculateSimilarity(normalized, alias);
        if (aliasScore > bestAliasScore) {
          bestAliasScore = aliasScore;
        }
      }

      const score = Math.max(nameScore, bestAliasScore);
      const matchType = nameScore >= bestAliasScore ? 'fuzzy-name' : 'fuzzy-alias';

      if (score >= fuzzyThreshold) {
        if (score > bestScore) {
          if (bestMatch) {
            alternates.push(bestMatch);
          }
          bestMatch = entry;
          bestScore = score;
          bestMatchType = matchType as 'fuzzy-name' | 'fuzzy-alias';
        } else {
          alternates.push(entry);
        }
      }
    }

    if (bestMatch) {
      // Log warning if there are ambiguous matches
      if (alternates.length > 0) {
        logger.warn({
          msg: 'Ambiguous match in folder',
          searchName: seriesNameFromFile,
          bestMatch: bestMatch.definition.name,
          score: bestScore.toFixed(2),
          alternates: alternates.map((a) => a.definition.name),
          folder: folderPath,
        });
      }

      return {
        entry: bestMatch,
        confidence: bestScore,
        matchType: bestMatchType,
        alternates: alternates.length > 0 ? alternates : undefined,
      };
    }

    return { entry: null, confidence: 0, matchType: 'none' };
  }

  /**
   * Get all series entries for a folder.
   */
  getEntriesForFolder(folderPath: string): FolderSeriesEntry[] {
    return this.registry.get(folderPath) || [];
  }

  /**
   * Get all registered folder paths.
   */
  getFolders(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * Get total number of series definitions across all folders.
   */
  getTotalSeriesCount(): number {
    let count = 0;
    for (const entries of this.registry.values()) {
      count += entries.length;
    }
    return count;
  }

  /**
   * Check if a folder has any series definitions.
   */
  hasFolder(folderPath: string): boolean {
    return this.registry.has(folderPath);
  }

  /**
   * Get statistics about the registry.
   */
  getStats(): { folders: number; series: number; multiSeriesFolders: number } {
    let multiSeriesFolders = 0;
    for (const entries of this.registry.values()) {
      if (entries.length > 1) {
        multiSeriesFolders++;
      }
    }
    return {
      folders: this.registry.size,
      series: this.getTotalSeriesCount(),
      multiSeriesFolders,
    };
  }
}
