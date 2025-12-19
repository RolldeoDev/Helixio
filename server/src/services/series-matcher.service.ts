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
import type { Series, ComicFile, FileMetadata } from '@prisma/client';
import {
  createSeries,
  getSeriesByIdentity,
  updateSeriesProgress,
  findSeriesByAlias,
} from './series.service.js';

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
 */
export async function findMatchingSeries(
  name: string,
  year?: number | null,
  publisher?: string | null
): Promise<MatchResult> {
  const db = getDatabase();

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
  const allSeries = await db.series.findMany();
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
 */
export async function linkFileToSeries(
  fileId: string,
  seriesId: string
): Promise<void> {
  const db = getDatabase();

  await db.comicFile.update({
    where: { id: fileId },
    data: { seriesId },
  });

  // Update series progress
  await updateSeriesProgress(seriesId);
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
  }
}

/**
 * Automatically link a file to a series based on its metadata.
 * Returns the linked series or null if no confident match found.
 */
export async function autoLinkFileToSeries(fileId: string): Promise<LinkResult> {
  const db = getDatabase();

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

  const match = await findMatchingSeries(
    seriesName,
    file.metadata?.year,
    file.metadata?.publisher
  );

  // High confidence match - auto-link
  if (match.series && match.confidence >= 0.9) {
    await linkFileToSeries(fileId, match.series.id);

    return {
      success: true,
      seriesId: match.series.id,
      matchType: match.type,
    };
  }

  // Medium confidence - suggest but don't auto-link
  if (match.series && match.confidence >= 0.7) {
    const suggestions = await suggestSeriesForFile(fileId);
    return {
      success: false,
      needsConfirmation: true,
      suggestions,
    };
  }

  // No match - create new series
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
  });

  await linkFileToSeries(fileId, newSeries.id);

  return {
    success: true,
    seriesId: newSeries.id,
    matchType: 'created',
  };
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
  console.log(`Confirmed ${seriesId1} and ${seriesId2} are not duplicates`);
}
