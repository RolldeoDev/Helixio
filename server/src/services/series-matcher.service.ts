/**
 * Series Matcher Service
 *
 * Handles file-to-series linking with fuzzy matching support.
 * Part of the Series-Centric Architecture.
 *
 * Matching Strategy (from SERIES_REWRITE.md):
 * 1. Exact match (name + year + publisher)
 * 2. Partial match (name + year)
 * 3. Fuzzy match (name only, including aliases)
 * 4. Fallback to folder name
 *
 * When ambiguous (multiple matches), queue for user confirmation.
 */

import { getDatabase } from './database.service.js';
import type { PrismaClient } from '@prisma/client';
import type { Series, ComicFile, FileMetadata } from '@prisma/client';
import {
  createSeries,
  getSeriesByIdentity,
  updateSeriesProgress,
  findSeriesByAlias,
  restoreSeries,
} from './series/index.js';
import { restoreSeriesItems } from './collection/index.js';
import { logInfo, logError, logDebug } from './logger.service.js';
import type { FolderSeriesRegistry, FolderSeriesEntry } from './folder-series-registry.service.js';
import type { SeriesDefinition } from './series-metadata.service.js';
import { dirname } from 'path';

// =============================================================================
// Types
// =============================================================================

export interface MatchResult {
  type: 'exact' | 'partial' | 'fuzzy' | 'folder' | 'none';
  series: Series | null;
  confidence: number; // 0-1
  alternates?: Series[]; // Other possible matches (for ambiguous cases)
}

export interface SuggestionResult {
  series: Series;
  confidence: number;
  reason: string;
}

export interface LinkResult {
  success: boolean;
  seriesId?: string;
  matchType?: string;
  error?: string;
  needsConfirmation?: boolean;
  suggestions?: SuggestionResult[];
  /** Non-fatal warnings about the operation (e.g., similar series existed). */
  warnings?: string[];
  /** Series data when a new series was created (avoids extra DB lookup) */
  createdSeries?: {
    id: string;
    name: string;
    publisher: string | null;
    startYear: number | null;
    volume: number | null;
    aliases: string | null;
  };
}

/**
 * Options for autoLinkFileToSeries.
 */
export interface AutoLinkOptions {
  /**
   * When true, trust the metadata and create a new series if no exact match exists.
   * Skip the "needsConfirmation" state for fuzzy matches.
   * Used for user-initiated metadata edits where we trust the metadata source.
   */
  trustMetadata?: boolean;

  /**
   * Folder series registry for folder-scoped matching.
   * When provided, checks folder's series.json definitions first before
   * falling back to database-wide matching.
   */
  folderRegistry?: FolderSeriesRegistry;

  /**
   * Scan series cache for fast in-memory matching during library scans.
   * When provided, uses cache.findMatch() instead of loading all series from DB.
   */
  scanCache?: import('./scan-series-cache.service.js').ScanSeriesCache;

  /**
   * Optional database client for connection pool routing.
   * When provided, uses this client instead of calling getDatabase().
   * Pass getWriteDatabase() during scans to use the write pool.
   */
  db?: PrismaClient;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Normalize a series name for comparison.
 * Removes common prefixes/suffixes, normalizes spacing and case.
 */
function normalizeName(name: string): string {
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
 * Calculate similarity between two strings (0-1).
 * Uses a simple character-based comparison.
 */
function calculateSimilarity(a: string, b: string): number {
  const normA = normalizeName(a);
  const normB = normalizeName(b);

  if (normA === normB) return 1;

  // Levenshtein-like distance calculation
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1;

  let matches = 0;
  const minLen = Math.min(normA.length, normB.length);

  // Check common prefix
  let prefixLen = 0;
  while (prefixLen < minLen && normA[prefixLen] === normB[prefixLen]) {
    prefixLen++;
  }

  // Check common suffix
  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen &&
    normA[normA.length - 1 - suffixLen] === normB[normB.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  matches = prefixLen + suffixLen;

  // Check for word-level matches
  const wordsA = normA.split(' ');
  const wordsB = new Set(normB.split(' '));

  for (const word of wordsA) {
    if (wordsB.has(word) && word.length > 2) {
      matches += word.length;
    }
  }

  return Math.min(1, matches / maxLen);
}

// =============================================================================
// Matching Functions
// =============================================================================

/**
 * Find matching series for a file based on its metadata.
 *
 * @param name - Series name to match
 * @param year - Optional start year
 * @param publisher - Optional publisher
 * @param scanCache - Optional scan cache for fast in-memory matching during scans
 */
export async function findMatchingSeries(
  name: string,
  year?: number | null,
  publisher?: string | null,
  scanCache?: import('./scan-series-cache.service.js').ScanSeriesCache
): Promise<MatchResult> {
  const db = getDatabase();

  // If scan cache is provided, use it for fast in-memory matching
  if (scanCache) {
    const cacheResult = scanCache.findMatch({
      seriesName: name,
      publisher: publisher ?? undefined,
      startYear: year ?? undefined,
    });

    if (cacheResult.match && cacheResult.confidence !== 'none') {
      // Convert cache result to MatchResult
      // We need to fetch the full series from DB for the return type
      const series = await db.series.findUnique({
        where: { id: cacheResult.match.id },
      });

      if (series) {
        const confidenceScore = cacheResult.confidence === 'exact' ? 1.0 :
                                cacheResult.confidence === 'high' ? 0.95 :
                                cacheResult.confidence === 'medium' ? 0.85 :
                                0.75;
        return {
          type: cacheResult.confidence === 'exact' ? 'exact' :
                cacheResult.confidence === 'high' ? 'partial' : 'fuzzy',
          series,
          confidence: confidenceScore,
        };
      }
    }

    // Cache miss - no match found in cache
    return {
      type: 'none',
      series: null,
      confidence: 0,
    };
  }

  // Original logic when no cache provided (for non-scan contexts)

  // 1. Try exact match
  const exactMatch = await getSeriesByIdentity(name, year, publisher);
  if (exactMatch) {
    return {
      type: 'exact',
      series: exactMatch,
      confidence: 1.0,
    };
  }

  // 2. Try partial match (name + year, ignoring publisher)
  if (year) {
    const partialMatch = await db.series.findFirst({
      where: {
        name,
        startYear: year,
      },
    });

    if (partialMatch) {
      return {
        type: 'partial',
        series: partialMatch,
        confidence: 0.9,
      };
    }
  }

  // 3. Try fuzzy match on name
  // PERFORMANCE: Exclude soft-deleted series from fuzzy matching
  // On large libraries with many deleted series, this significantly reduces memory usage
  const allSeries = await db.series.findMany({
    where: {
      deletedAt: null, // Only match against active series
    },
  });
  const normalizedSearch = normalizeName(name);

  let bestMatch: Series | null = null;
  let bestScore = 0;
  const alternates: Series[] = [];

  for (const series of allSeries) {
    // Check main name
    const nameScore = calculateSimilarity(name, series.name);

    // Check aliases
    let aliasScore = 0;
    if (series.aliases) {
      const aliases = series.aliases.split(',').map((a) => a.trim());
      for (const alias of aliases) {
        const score = calculateSimilarity(name, alias);
        if (score > aliasScore) {
          aliasScore = score;
        }
      }
    }

    const score = Math.max(nameScore, aliasScore);

    // Apply year boost if matching
    const yearBoost = series.startYear === year ? 0.1 : 0;
    const publisherBoost =
      series.publisher?.toLowerCase() === publisher?.toLowerCase() ? 0.05 : 0;
    const totalScore = Math.min(1, score + yearBoost + publisherBoost);

    if (totalScore > 0.7) {
      if (totalScore > bestScore) {
        if (bestMatch) {
          alternates.push(bestMatch);
        }
        bestMatch = series;
        bestScore = totalScore;
      } else if (totalScore > 0.7) {
        alternates.push(series);
      }
    }
  }

  if (bestMatch && bestScore >= 0.9) {
    return {
      type: 'fuzzy',
      series: bestMatch,
      confidence: bestScore,
      alternates: alternates.length > 0 ? alternates : undefined,
    };
  }

  // If we have a match but it's not confident enough, return with alternates
  if (bestMatch) {
    return {
      type: 'fuzzy',
      series: bestMatch,
      confidence: bestScore,
      alternates: alternates.length > 0 ? alternates : undefined,
    };
  }

  return {
    type: 'none',
    series: null,
    confidence: 0,
  };
}

// =============================================================================
// Folder-Scoped Series Creation
// =============================================================================

/**
 * Find or create a series from a SeriesDefinition (from series.json).
 * Used for folder-scoped matching where we have pre-defined series metadata.
 *
 * @param definition - The series definition from series.json
 * @param folderPath - The folder path containing the series
 * @param database - Optional database client (defaults to read pool for backward compatibility)
 */
async function findOrCreateSeriesFromDefinition(
  definition: SeriesDefinition,
  folderPath: string,
  database?: PrismaClient
): Promise<Series> {
  // Check if series already exists by identity (name + publisher)
  const existing = await getSeriesByIdentity(
    definition.name,
    null, // Year is not part of identity
    definition.publisher ?? null,
    true // Include deleted series to restore
  );

  if (existing) {
    // Restore if soft-deleted
    if (existing.deletedAt) {
      await restoreSeries(existing.id, database);
      await restoreSeriesItems(existing.id);
    }

    // Merge metadata from definition into existing series (respecting locks)
    await mergeDefinitionIntoSeries(existing.id, definition, database);

    return existing;
  }

  // Create new series with all metadata from definition
  const newSeries = await createSeries({
    name: definition.name,
    startYear: definition.startYear ?? null,
    publisher: definition.publisher ?? null,
    endYear: definition.endYear ?? null,
    deck: definition.deck ?? null,
    summary: definition.summary ?? null,
    coverUrl: definition.coverUrl ?? null,
    issueCount: definition.issueCount ?? null,
    genres: definition.genres?.join(',') ?? null,
    tags: definition.tags?.join(',') ?? null,
    volume: definition.volume ?? null,
    type: definition.type ?? 'western',
    ageRating: definition.ageRating ?? null,
    languageISO: definition.languageISO ?? null,
    comicVineId: definition.comicVineSeriesId ?? null,
    metronId: definition.metronSeriesId ?? null,
    anilistId: definition.anilistId ?? null,
    malId: definition.malId ?? null,
    characters: definition.characters?.join(',') ?? null,
    teams: definition.teams?.join(',') ?? null,
    storyArcs: definition.storyArcs?.join(',') ?? null,
    locations: definition.locations?.join(',') ?? null,
    aliases: definition.aliases?.join(',') ?? null,
    primaryFolder: folderPath,
  }, database);

  logInfo('series-matcher', `Created series from folder definition`, {
    seriesId: newSeries.id,
    seriesName: newSeries.name,
    folder: folderPath,
  });

  return newSeries;
}

/**
 * Merge a SeriesDefinition into an existing series, respecting locked fields.
 * Only updates fields that are currently empty in the database.
 *
 * @param seriesId - The series ID to merge into
 * @param definition - The series definition with new values
 * @param database - Optional database client (defaults to read pool for backward compatibility)
 */
async function mergeDefinitionIntoSeries(
  seriesId: string,
  definition: SeriesDefinition,
  database?: PrismaClient
): Promise<void> {
  const db = database ?? getDatabase();

  const series = await db.series.findUnique({
    where: { id: seriesId },
  });

  if (!series) return;

  // Parse locked fields
  const lockedFields = new Set(
    series.lockedFields?.split(',').map((f) => f.trim()).filter(Boolean) ?? []
  );

  // Build update data for empty fields only
  const updateData: Record<string, unknown> = {};

  // Helper to check if a field should be updated
  const shouldUpdate = (dbField: string, dbValue: unknown): boolean => {
    if (lockedFields.has(dbField)) return false;
    if (dbValue !== null && dbValue !== undefined && dbValue !== '') return false;
    return true;
  };

  // Map definition fields to database fields
  if (definition.startYear && shouldUpdate('startYear', series.startYear)) {
    updateData.startYear = definition.startYear;
  }
  if (definition.endYear && shouldUpdate('endYear', series.endYear)) {
    updateData.endYear = definition.endYear;
  }
  if (definition.publisher && shouldUpdate('publisher', series.publisher)) {
    updateData.publisher = definition.publisher;
  }
  if (definition.deck && shouldUpdate('deck', series.deck)) {
    updateData.deck = definition.deck;
  }
  if (definition.summary && shouldUpdate('summary', series.summary)) {
    updateData.summary = definition.summary;
  }
  if (definition.coverUrl && shouldUpdate('coverUrl', series.coverUrl)) {
    updateData.coverUrl = definition.coverUrl;
  }
  if (definition.issueCount && shouldUpdate('issueCount', series.issueCount)) {
    updateData.issueCount = definition.issueCount;
  }
  if (definition.genres?.length && shouldUpdate('genres', series.genres)) {
    updateData.genres = definition.genres.join(',');
  }
  if (definition.tags?.length && shouldUpdate('tags', series.tags)) {
    updateData.tags = definition.tags.join(',');
  }
  if (definition.aliases?.length && shouldUpdate('aliases', series.aliases)) {
    updateData.aliases = definition.aliases.join(',');
  }
  if (definition.characters?.length && shouldUpdate('characters', series.characters)) {
    updateData.characters = definition.characters.join(',');
  }
  if (definition.teams?.length && shouldUpdate('teams', series.teams)) {
    updateData.teams = definition.teams.join(',');
  }
  if (definition.comicVineSeriesId && shouldUpdate('comicVineId', series.comicVineId)) {
    updateData.comicVineId = definition.comicVineSeriesId;
  }
  if (definition.metronSeriesId && shouldUpdate('metronId', series.metronId)) {
    updateData.metronId = definition.metronSeriesId;
  }

  // Only update if we have changes
  if (Object.keys(updateData).length > 0) {
    await db.series.update({
      where: { id: seriesId },
      data: updateData,
    });

    logDebug('series-matcher', `Merged definition into series`, {
      seriesId,
      fieldsUpdated: Object.keys(updateData),
    });
  }
}

// =============================================================================
// Series Suggestions
// =============================================================================

/**
 * Get series suggestions for a file.
 */
export async function suggestSeriesForFile(
  fileId: string
): Promise<SuggestionResult[]> {
  const db = getDatabase();

  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    include: { metadata: true },
  });

  if (!file) {
    return [];
  }

  const suggestions: SuggestionResult[] = [];

  // Use metadata series name if available
  if (file.metadata?.series) {
    const match = await findMatchingSeries(
      file.metadata.series,
      file.metadata.year,
      file.metadata.publisher
    );

    if (match.series) {
      suggestions.push({
        series: match.series,
        confidence: match.confidence,
        reason: `Matched from ComicInfo.xml series: "${file.metadata.series}"`,
      });

      if (match.alternates) {
        for (const alt of match.alternates) {
          suggestions.push({
            series: alt,
            confidence: match.confidence * 0.8,
            reason: 'Alternative match',
          });
        }
      }
    }
  }

  // Try folder-based matching
  const folderName = getFolderNameFromPath(file.relativePath);
  if (folderName && (!file.metadata?.series || file.metadata.series !== folderName)) {
    const folderMatch = await findMatchingSeries(folderName);
    if (folderMatch.series) {
      const existingSuggestion = suggestions.find(
        (s) => s.series.id === folderMatch.series?.id
      );
      if (!existingSuggestion) {
        suggestions.push({
          series: folderMatch.series,
          confidence: folderMatch.confidence * 0.7,
          reason: `Matched from folder name: "${folderName}"`,
        });
      }
    }
  }

  // Sort by confidence
  suggestions.sort((a, b) => b.confidence - a.confidence);

  return suggestions;
}

/**
 * Extract folder name from relative path.
 */
function getFolderNameFromPath(relativePath: string): string | null {
  const parts = relativePath.split('/');
  if (parts.length > 1) {
    return parts[parts.length - 2] ?? null;
  }
  return null;
}

// =============================================================================
// File-to-Series Linking
// =============================================================================

/**
 * Link a file to a series.
 *
 * @param fileId - The file ID to link
 * @param seriesId - The series ID to link to
 * @param database - Optional database client (defaults to read pool for backward compatibility)
 */
export async function linkFileToSeries(
  fileId: string,
  seriesId: string,
  database?: PrismaClient
): Promise<void> {
  const db = database ?? getDatabase();

  // Check if the series is soft-deleted and restore it
  const series = await db.series.findUnique({
    where: { id: seriesId },
    select: { deletedAt: true },
  });

  if (series?.deletedAt) {
    await restoreSeries(seriesId, database);
    await restoreSeriesItems(seriesId);
    logInfo('series-matcher', `Restored soft-deleted series: ${seriesId}`);
  }

  await db.comicFile.update({
    where: { id: fileId },
    data: { seriesId },
  });

  // Update series progress
  await updateSeriesProgress(seriesId, undefined, database);

  // Recalculate series cover (first issue may have changed)
  try {
    const { recalculateSeriesCover } = await import('./cover.service.js');
    await recalculateSeriesCover(seriesId);
  } catch (err) {
    // Non-critical, don't fail the link operation
    logError('series-matcher', err, { action: 'recalculate-cover', seriesId });
  }
}

/**
 * Unlink a file from its series.
 */
export async function unlinkFileFromSeries(fileId: string): Promise<void> {
  const db = getDatabase();

  const file = await db.comicFile.findUnique({
    where: { id: fileId },
  });

  if (!file) return;

  const previousSeriesId = file.seriesId;

  await db.comicFile.update({
    where: { id: fileId },
    data: { seriesId: null },
  });

  // Update previous series progress
  if (previousSeriesId) {
    await updateSeriesProgress(previousSeriesId);

    // Recalculate series cover (first issue may have changed)
    try {
      const { recalculateSeriesCover } = await import('./cover.service.js');
      await recalculateSeriesCover(previousSeriesId);
    } catch (err) {
      // Non-critical, don't fail the unlink operation
      logError('series-matcher', err, { action: 'recalculate-cover', seriesId: previousSeriesId });
    }
  }
}

/**
 * Automatically link a file to a series based on its metadata.
 * Returns the linked series or null if no confident match found.
 *
 * @param fileId - The file to link
 * @param options - Options controlling linking behavior
 * @param options.trustMetadata - When true, create new series on fuzzy match instead of asking for confirmation
 * @param options.db - Optional database client for connection pool routing
 */
export async function autoLinkFileToSeries(
  fileId: string,
  options: AutoLinkOptions = {}
): Promise<LinkResult> {
  const { trustMetadata = false, folderRegistry, scanCache, db: database } = options;
  const db = database ?? getDatabase();

  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    include: { metadata: true },
  });

  if (!file) {
    return { success: false, error: 'File not found' };
  }

  // Get series name from metadata or folder
  const seriesName =
    file.metadata?.series ?? getFolderNameFromPath(file.relativePath);
  if (!seriesName) {
    return { success: false, error: 'No series name found' };
  }

  // NEW: Try folder-scoped matching first if registry is provided
  if (folderRegistry) {
    const folderPath = dirname(file.path);
    const folderMatch = folderRegistry.findInFolder(folderPath, seriesName);

    if (folderMatch.entry && folderMatch.confidence >= 0.8) {
      // Check if series already exists before creating
      const existingSeries = await getSeriesByIdentity(
        folderMatch.entry.definition.name,
        null,
        folderMatch.entry.definition.publisher ?? null,
        true
      );
      const isNewSeries = !existingSeries || existingSeries.deletedAt;

      // Found a match in the folder's series.json - use it
      const series = await findOrCreateSeriesFromDefinition(
        folderMatch.entry.definition,
        folderPath,
        database
      );

      await linkFileToSeries(fileId, series.id, database);

      logDebug('series-matcher', `Folder-scoped match`, {
        file: file.filename,
        series: series.name,
        matchType: folderMatch.matchType,
        confidence: folderMatch.confidence,
      });

      return {
        success: true,
        seriesId: series.id,
        matchType: isNewSeries ? 'created' : `folder-${folderMatch.matchType}`,
        // Include createdSeries when a new series was created so the scanner can cache it
        ...(isNewSeries && {
          createdSeries: {
            id: series.id,
            name: series.name,
            publisher: series.publisher,
            startYear: series.startYear,
            volume: series.volume,
            aliases: series.aliases,
          },
        }),
      };
    }
  }

  // When trustMetadata is true, skip fuzzy matching entirely.
  // Use exact match or create a new series with the exact metadata name.
  // This ensures "Trigun Maximum" creates a new series instead of fuzzy-matching to "Trigun".
  if (trustMetadata) {
    const createResult = await createSeriesWithExactName(
      seriesName,
      file.metadata,
      file.relativePath,
      database
    );

    await linkFileToSeries(fileId, createResult.series.id, database);

    return {
      success: true,
      seriesId: createResult.series.id,
      matchType: createResult.alreadyExisted ? 'exact' : 'created',
      // Include createdSeries when a new series was created so the scanner can cache it
      ...(!createResult.alreadyExisted && {
        createdSeries: {
          id: createResult.series.id,
          name: createResult.series.name,
          publisher: createResult.series.publisher,
          startYear: createResult.series.startYear,
          volume: createResult.series.volume,
          aliases: createResult.series.aliases,
        },
      }),
    };
  }

  const match = await findMatchingSeries(
    seriesName,
    file.metadata?.year,
    file.metadata?.publisher,
    scanCache
  );

  // High confidence match - auto-link
  if (match.series && match.confidence >= 0.9) {
    await linkFileToSeries(fileId, match.series.id, database);

    return {
      success: true,
      seriesId: match.series.id,
      matchType: match.type,
    };
  }

  // Medium confidence (0.7-0.9) - behavior depends on trustMetadata flag
  if (match.series && match.confidence >= 0.7) {
    if (trustMetadata) {
      // User trusts metadata - create new series with the exact metadata name
      // but warn about similar series that exist
      const warnings: string[] = [];
      warnings.push(
        `Similar series "${match.series.name}" exists (${Math.round(match.confidence * 100)}% match). Created new series "${seriesName}" instead.`
      );

      // Include up to 2 alternate matches in warnings
      if (match.alternates && match.alternates.length > 0) {
        for (const alt of match.alternates.slice(0, 2)) {
          warnings.push(`Also similar: "${alt.name}"`);
        }
      }

      // Create new series with exact metadata name
      const createResult = await createSeriesWithExactName(
        seriesName,
        file.metadata,
        file.relativePath,
        database
      );

      if (createResult.alreadyExisted) {
        // Exact match was found (case-insensitive), link to existing
        await linkFileToSeries(fileId, createResult.series.id, database);
        return {
          success: true,
          seriesId: createResult.series.id,
          matchType: 'exact',
        };
      }

      await linkFileToSeries(fileId, createResult.series.id, database);

      return {
        success: true,
        seriesId: createResult.series.id,
        matchType: 'created',
        warnings,
        // Include createdSeries for scanner cache
        createdSeries: {
          id: createResult.series.id,
          name: createResult.series.name,
          publisher: createResult.series.publisher,
          startYear: createResult.series.startYear,
          volume: createResult.series.volume,
          aliases: createResult.series.aliases,
        },
      };
    } else {
      // Normal behavior - suggest but don't auto-link
      const suggestions = await suggestSeriesForFile(fileId);
      return {
        success: false,
        needsConfirmation: true,
        suggestions,
      };
    }
  }

  // No match - create new series
  // Use try-catch to handle race condition where another process creates the same series
  try {
    const newSeries = await createSeries({
      name: seriesName,
      startYear: file.metadata?.year ?? null,
      publisher: file.metadata?.publisher ?? null,
      genres: file.metadata?.genre ?? null,
      tags: file.metadata?.tags ?? null,
      languageISO: file.metadata?.languageISO ?? null,
      ageRating: file.metadata?.ageRating ?? null,
      comicVineId: file.metadata?.comicVineId ?? null,
      metronId: file.metadata?.metronId ?? null,
      primaryFolder: getFolderPathFromRelativePath(file.relativePath),
    }, database);

    await linkFileToSeries(fileId, newSeries.id, database);

    return {
      success: true,
      seriesId: newSeries.id,
      matchType: 'created',
      createdSeries: {
        id: newSeries.id,
        name: newSeries.name,
        publisher: newSeries.publisher,
        startYear: newSeries.startYear,
        volume: newSeries.volume,
        aliases: newSeries.aliases,
      },
    };
  } catch (error) {
    // Handle race condition: another process may have created the series concurrently
    if (error instanceof Error && error.message.includes('already exists')) {
      // Retry finding the series that was just created by another process
      // Note: Don't use scanCache here - we need fresh data from DB
      const retryMatch = await findMatchingSeries(
        seriesName,
        file.metadata?.year,
        file.metadata?.publisher
      );

      if (retryMatch.series) {
        await linkFileToSeries(fileId, retryMatch.series.id, database);
        return {
          success: true,
          seriesId: retryMatch.series.id,
          matchType: retryMatch.type,
        };
      }
    }
    // Re-throw if it's a different error
    throw error;
  }
}

/**
 * Extract folder path from relative path.
 */
function getFolderPathFromRelativePath(relativePath: string): string | null {
  const lastSlash = relativePath.lastIndexOf('/');
  if (lastSlash > 0) {
    return relativePath.substring(0, lastSlash);
  }
  return null;
}

/**
 * Result from createSeriesWithExactName.
 */
interface CreateSeriesResult {
  series: Series;
  alreadyExisted: boolean;
}

/**
 * Create a new series with the exact metadata name, or return existing if found.
 * Uses case-insensitive matching to prevent duplicates like "TRIGUN" vs "Trigun".
 * Handles race conditions where multiple files try to create the same series.
 *
 * @param seriesName - The exact series name from metadata
 * @param metadata - File metadata for additional series fields
 * @param relativePath - File path for primary folder extraction
 * @param database - Optional database client (defaults to read pool for backward compatibility)
 */
async function createSeriesWithExactName(
  seriesName: string,
  metadata: FileMetadata | null,
  relativePath: string,
  database?: PrismaClient
): Promise<CreateSeriesResult> {
  // First check for case-insensitive exact match to prevent duplicates
  // getSeriesByIdentity already does case-insensitive comparison
  const existingExact = await getSeriesByIdentity(seriesName, null, metadata?.publisher);

  if (existingExact) {
    // Exact match exists (possibly different case) - use it instead of creating
    return { series: existingExact, alreadyExisted: true };
  }

  // No exact match - create new series
  try {
    const newSeries = await createSeries({
      name: seriesName,
      startYear: metadata?.year ?? null,
      publisher: metadata?.publisher ?? null,
      genres: metadata?.genre ?? null,
      tags: metadata?.tags ?? null,
      languageISO: metadata?.languageISO ?? null,
      ageRating: metadata?.ageRating ?? null,
      comicVineId: metadata?.comicVineId ?? null,
      metronId: metadata?.metronId ?? null,
      primaryFolder: getFolderPathFromRelativePath(relativePath),
    }, database);

    return { series: newSeries, alreadyExisted: false };
  } catch (error) {
    // Handle race condition: another process may have created the series concurrently
    if (error instanceof Error && error.message.includes('already exists')) {
      // Retry finding the series that was just created by another process
      const retryMatch = await getSeriesByIdentity(seriesName, null, metadata?.publisher);

      if (retryMatch) {
        return { series: retryMatch, alreadyExisted: true };
      }
    }
    // Re-throw if it's a different error
    throw error;
  }
}

/**
 * Find the best series match for file metadata.
 */
export async function findSeriesForFile(
  fileId: string
): Promise<Series | null> {
  const suggestions = await suggestSeriesForFile(fileId);

  if (suggestions.length > 0 && suggestions[0]!.confidence >= 0.7) {
    return suggestions[0]!.series;
  }

  return null;
}

// =============================================================================
// Batch Operations
// =============================================================================

/**
 * Auto-link all unlinked files to series.
 * Returns counts of linked, created, and needing confirmation.
 */
export async function autoLinkAllFiles(): Promise<{
  linked: number;
  created: number;
  needsConfirmation: number;
  errors: number;
}> {
  const db = getDatabase();

  const unlinkedFiles = await db.comicFile.findMany({
    where: { seriesId: null },
    include: { metadata: true },
  });

  let linked = 0;
  let created = 0;
  let needsConfirmation = 0;
  let errors = 0;

  for (const file of unlinkedFiles) {
    try {
      const result = await autoLinkFileToSeries(file.id);

      if (result.success) {
        if (result.matchType === 'created') {
          created++;
        }
        linked++;
      } else if (result.needsConfirmation) {
        needsConfirmation++;
      } else {
        errors++;
      }
    } catch {
      errors++;
    }
  }

  return { linked, created, needsConfirmation, errors };
}

/**
 * Get files that need series confirmation.
 */
export async function getFilesNeedingConfirmation(): Promise<
  Array<{
    file: ComicFile & { metadata: FileMetadata | null };
    suggestions: SuggestionResult[];
  }>
> {
  const db = getDatabase();

  const unlinkedFiles = await db.comicFile.findMany({
    where: { seriesId: null },
    include: { metadata: true },
    take: 100, // Limit for performance
  });

  const results: Array<{
    file: ComicFile & { metadata: FileMetadata | null };
    suggestions: SuggestionResult[];
  }> = [];

  for (const file of unlinkedFiles) {
    const suggestions = await suggestSeriesForFile(file.id);

    // Only include files with ambiguous suggestions (multiple options with similar confidence)
    if (suggestions.length > 1) {
      const topConfidence = suggestions[0]?.confidence ?? 0;
      const hasAmbiguity = suggestions.some(
        (s) => s !== suggestions[0] && s.confidence > topConfidence * 0.8
      );

      if (hasAmbiguity) {
        results.push({ file, suggestions });
      }
    }
  }

  return results;
}

// =============================================================================
// Duplicate Detection
// =============================================================================

/**
 * Confirm that two series are NOT duplicates.
 * This could be used to store user decisions to prevent re-suggesting.
 */
export async function confirmNotDuplicate(
  seriesId1: string,
  seriesId2: string
): Promise<void> {
  // For now, this is a no-op. Could be extended to store
  // in a separate table to remember user decisions.
  logInfo('series-matcher', `Confirmed ${seriesId1} and ${seriesId2} are not duplicates`);
}

// =============================================================================
// Folder Fallback Linking
// =============================================================================

export interface LinkWithFolderFallbackResult {
  linked: boolean;
  seriesId?: string;
  seriesCreated: boolean;
  source: 'metadata' | 'folder' | 'filename' | 'none';
  seriesName?: string;
}

/**
 * Get series info for a file, using metadata first, then folder name as fallback.
 * Returns the series name, source, and any parsed metadata from the folder name.
 */
async function getSeriesInfoForFile(fileId: string): Promise<{
  name: string | null;
  source: 'metadata' | 'folder' | 'filename';
  year?: number | null;
  publisher?: string | null;
}> {
  const db = getDatabase();

  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    include: { metadata: true },
  });

  if (!file) {
    return { name: null, source: 'metadata' };
  }

  // 1. Try ComicInfo.xml metadata first
  if (file.metadata?.series) {
    return {
      name: file.metadata.series,
      source: 'metadata',
      year: file.metadata.year,
      publisher: file.metadata.publisher,
    };
  }

  // 2. Fallback to parent folder name
  const folderName = getFolderNameFromPath(file.relativePath);
  if (folderName) {
    // Import parseSeriesFolderName dynamically to avoid circular dependencies
    const { parseSeriesFolderName } = await import('./series-metadata.service.js');
    const parsed = parseSeriesFolderName(folderName);

    return {
      name: parsed.seriesName || folderName,
      source: 'folder',
      year: parsed.startYear,
      publisher: undefined, // Folder names don't typically contain publisher
    };
  }

  // 3. Last resort: use filename without extension
  const filenameWithoutExt = file.filename.replace(/\.[^.]+$/, '');
  // Try to extract series name from filename (basic parsing)
  // e.g., "Batman 001.cbz" -> "Batman"
  const nameMatch = filenameWithoutExt.match(/^(.+?)\s*(?:#?\d+|issue|vol)/i);
  const extractedName = nameMatch ? nameMatch[1]!.trim() : filenameWithoutExt;

  return {
    name: extractedName,
    source: 'filename',
    year: file.metadata?.year,
    publisher: file.metadata?.publisher,
  };
}

/**
 * Link a file to a series with folder fallback.
 * Uses metadata first, then folder name, then filename.
 * Creates a new series if no match is found.
 *
 * This is the primary function used by the full library scan.
 */
export async function linkFileToSeriesWithFolderFallback(
  fileId: string
): Promise<LinkWithFolderFallbackResult> {
  const db = getDatabase();

  // Check if file already has a series
  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    select: { seriesId: true, relativePath: true },
  });

  if (!file) {
    return { linked: false, seriesCreated: false, source: 'none' };
  }

  if (file.seriesId) {
    // Already linked
    return {
      linked: true,
      seriesId: file.seriesId,
      seriesCreated: false,
      source: 'metadata',
    };
  }

  // Get series info using metadata-first, folder-fallback approach
  const seriesInfo = await getSeriesInfoForFile(fileId);

  if (!seriesInfo.name) {
    return { linked: false, seriesCreated: false, source: 'none' };
  }

  // Try to find existing series
  const match = await findMatchingSeries(
    seriesInfo.name,
    seriesInfo.year,
    seriesInfo.publisher
  );

  // High confidence match - link to existing series
  if (match.series && match.confidence >= 0.9) {
    await linkFileToSeries(fileId, match.series.id);
    return {
      linked: true,
      seriesId: match.series.id,
      seriesCreated: false,
      source: seriesInfo.source,
      seriesName: match.series.name,
    };
  }

  // No confident match - create new series
  // Use try-catch to handle race condition where another process creates the same series
  try {
    const newSeries = await createSeries({
      name: seriesInfo.name,
      startYear: seriesInfo.year ?? null,
      publisher: seriesInfo.publisher ?? null,
      primaryFolder: getFolderPathFromRelativePath(file.relativePath),
    });

    await linkFileToSeries(fileId, newSeries.id);

    return {
      linked: true,
      seriesId: newSeries.id,
      seriesCreated: true,
      source: seriesInfo.source,
      seriesName: newSeries.name,
    };
  } catch (error) {
    // Handle race condition: another process may have created the series concurrently
    if (error instanceof Error && error.message.includes('already exists')) {
      // Retry finding the series that was just created by another process
      const retryMatch = await findMatchingSeries(
        seriesInfo.name,
        seriesInfo.year,
        seriesInfo.publisher
      );

      if (retryMatch.series) {
        await linkFileToSeries(fileId, retryMatch.series.id);
        return {
          linked: true,
          seriesId: retryMatch.series.id,
          seriesCreated: false,
          source: seriesInfo.source,
          seriesName: retryMatch.series.name,
        };
      }
    }
    // Re-throw if it's a different error
    throw error;
  }
}
