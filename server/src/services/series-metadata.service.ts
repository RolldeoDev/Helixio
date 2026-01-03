/**
 * Series Metadata Service
 *
 * Handles series.json files and folder-level ComicInfo.xml files.
 *
 * Per PLAN.md:
 * - series.json is the SOURCE OF TRUTH for the application
 * - folder-root ComicInfo.xml is a convenience export for external tools
 * - When series.json is updated, ComicInfo.xml is auto-regenerated
 */

import { existsSync } from 'fs';
import { readFile, writeFile, readdir, stat } from 'fs/promises';
import { join, dirname, basename } from 'path';
import {
  ComicInfo,
  writeComicInfoToFile,
  readComicInfoFromFile,
} from './comicinfo.service.js';

// =============================================================================
// Constants
// =============================================================================

/** Current schema version for series.json files (v2 adds multi-series support) */
export const SERIES_JSON_SCHEMA_VERSION = 2;

/** Maximum number of reviews to persist in series.json */
export const MAX_REVIEWS_IN_SERIES_JSON = 10;

// =============================================================================
// Types
// =============================================================================

/**
 * A single series definition within a multi-series series.json file.
 * Contains all metadata fields that can be defined per-series.
 */
export interface SeriesDefinition {
  /** Series name (required) */
  name: string;
  /** Alternative series names for matching (e.g., ["The Batman", "Dark Knight"]) */
  aliases?: string[];
  /** Publisher name */
  publisher?: string;
  /** Publisher ID (for API matching) */
  publisherId?: number;
  /** First year of the series/run */
  startYear?: number;
  /** Last year of the series/run */
  endYear?: number;
  /** Total issue count in the series */
  issueCount?: number;
  /** Short description/deck */
  deck?: string;
  /** Full description/summary of the series */
  summary?: string;
  /** Cover image URL */
  coverUrl?: string;
  /** ComicVine site URL */
  siteUrl?: string;
  /** Genre tags */
  genres?: string[];
  /** Custom tags */
  tags?: string[];
  /** Main characters appearing in the series */
  characters?: string[];
  /** Teams appearing in the series */
  teams?: string[];
  /** Story arcs in this series */
  storyArcs?: string[];
  /** Locations featured in the series */
  locations?: string[];
  /** Creators associated with the series */
  creators?: string[];
  /** User notes about the series */
  userNotes?: string;
  /** Volume number for multi-volume series */
  volume?: number;
  /** Type: "western" or "manga" */
  type?: 'western' | 'manga';
  /** Age rating */
  ageRating?: string;
  /** Language ISO code */
  languageISO?: string;
  /** ComicVine series/volume ID for API matching */
  comicVineSeriesId?: string;
  /** Metron series ID for API matching */
  metronSeriesId?: string;
  /** AniList series ID for API matching */
  anilistId?: string;
  /** MyAnimeList ID for API matching */
  malId?: string;
  /** Grand Comics Database ID for API matching */
  gcdId?: string;
  /** Creator roles with structured format */
  creatorRoles?: {
    writers?: string[];
    pencillers?: string[];
    inkers?: string[];
    colorists?: string[];
    letterers?: string[];
    coverArtists?: string[];
    editors?: string[];
  };
  /** External community/critic ratings */
  externalRatings?: Array<{
    source: string;
    ratingType: 'community' | 'critic';
    value: number;
    scale: number;
    voteCount?: number;
    fetchedAt?: string;
  }>;
  /** Top external reviews (limited to prevent file bloat) */
  externalReviews?: Array<{
    source: string;
    authorName: string;
    reviewText: string;
    summary?: string;
    rating?: number;
    originalRating?: number;
    ratingScale?: number;
    reviewType: 'user' | 'critic';
    hasSpoilers?: boolean;
    likes?: number;
    reviewDate?: string;
    fetchedAt?: string;
  }>;
}

/**
 * Series.json schema for series-level metadata.
 *
 * V2 FORMAT (multi-series): Use the `series` array to define multiple series.
 * V1 FORMAT (legacy): Use `seriesName` and top-level fields for single series.
 *
 * This is the SOURCE OF TRUTH for series-level data - once populated,
 * we should not need to make additional series API calls.
 */
export interface SeriesMetadata {
  // ==========================================================================
  // V2: Multi-Series Support
  // ==========================================================================

  /** Array of series definitions (v2 format for multi-series folders) */
  series?: SeriesDefinition[];

  // ==========================================================================
  // V1: Single Series Fields (legacy, still supported)
  // ==========================================================================

  /** Series name (v1 format - use series[] array for v2) */
  seriesName?: string;
  /** Author/creator run identifier (e.g., "Grant Morrison") */
  authorRun?: string;
  /** First year of the series/run */
  startYear?: number;
  /** Last year of the series/run */
  endYear?: number;
  /** Publisher name */
  publisher?: string;
  /** Publisher ID (for API matching) */
  publisherId?: number;
  /** ComicVine series/volume ID for API matching */
  comicVineSeriesId?: string;
  /** Metron series ID for API matching */
  metronSeriesId?: string;
  /** AniList series ID for API matching */
  anilistId?: string;
  /** MyAnimeList ID for API matching */
  malId?: string;
  /** Grand Comics Database ID for API matching */
  gcdId?: string;
  /** Total issue count in the series */
  issueCount?: number;
  /** Short description/deck */
  deck?: string;
  /** Full description/summary of the series */
  summary?: string;
  /** Cover image URL */
  coverUrl?: string;
  /** ComicVine site URL */
  siteUrl?: string;
  /** Genre tags */
  genres?: string[];
  /** Custom tags */
  tags?: string[];
  /** Main characters appearing in the series */
  characters?: string[];
  /** Teams appearing in the series */
  teams?: string[];
  /** Story arcs in this series */
  storyArcs?: string[];
  /** Locations featured in the series */
  locations?: string[];
  /** Creators associated with the series (no role info at series level) */
  creators?: string[];
  /** User notes about the series */
  userNotes?: string;
  /** Volume number for multi-volume series */
  volume?: number;
  /** Type: "western" or "manga" */
  type?: 'western' | 'manga';
  /** Age rating */
  ageRating?: string;
  /** Language ISO code */
  languageISO?: string;
  /** When this metadata was last fetched from API */
  lastUpdated?: string;

  // ==========================================================================
  // Issue Matching Series (for collected editions / split matching)
  // ==========================================================================
  // When the series used for issue matching differs from the main series metadata
  // (e.g., "Batman: The Long Halloween" for metadata but "Batman" for issue lookup)

  /** Issue matching series name (if different from main series) */
  issueMatchingSeriesName?: string;
  /** Issue matching ComicVine series/volume ID */
  issueMatchingComicVineId?: string;
  /** Issue matching Metron series ID */
  issueMatchingMetronId?: string;
  /** Issue matching series start year */
  issueMatchingStartYear?: number;
  /** Issue matching series publisher */
  issueMatchingPublisher?: string;
  /** Issue matching series issue count */
  issueMatchingIssueCount?: number;

  // ==========================================================================
  // Schema Version (for future migrations)
  // ==========================================================================

  /** Schema version for migration compatibility (current: 1) */
  schemaVersion?: number;

  // ==========================================================================
  // Creator Credits with Roles
  // ==========================================================================

  /** Creator roles with structured format (aggregated from issues) */
  creatorRoles?: {
    writers?: string[];
    pencillers?: string[];
    inkers?: string[];
    colorists?: string[];
    letterers?: string[];
    coverArtists?: string[];
    editors?: string[];
  };

  // ==========================================================================
  // Series Aliases
  // ==========================================================================

  /** Alternative series names (for search/matching) */
  aliases?: string[];

  // ==========================================================================
  // External Ratings
  // ==========================================================================

  /** External community/critic ratings */
  externalRatings?: Array<{
    source: string;
    ratingType: 'community' | 'critic';
    value: number;
    scale: number;
    voteCount?: number;
    fetchedAt?: string;
  }>;

  // ==========================================================================
  // External Reviews (top 10 only)
  // ==========================================================================

  /** Top external reviews (limited to prevent file bloat) */
  externalReviews?: Array<{
    source: string;
    authorName: string;
    reviewText: string;
    summary?: string;
    rating?: number;
    originalRating?: number;
    ratingScale?: number;
    reviewType: 'user' | 'critic';
    hasSpoilers?: boolean;
    likes?: number;
    reviewDate?: string;
    fetchedAt?: string;
  }>;
}

export interface SeriesMetadataResult {
  success: boolean;
  metadata?: SeriesMetadata;
  error?: string;
}

export interface FolderMetadata {
  folderPath: string;
  hasSeriesJson: boolean;
  hasComicInfo: boolean;
  seriesMetadata?: SeriesMetadata;
  comicInfo?: ComicInfo;
  fileCount: number;
}

// =============================================================================
// Mixed Series Cache Types
// =============================================================================

/**
 * A cached series match for mixed-series folders.
 * Stores the essential fields needed to recreate a SeriesMatch.
 */
export interface CachedSeriesMatch {
  /** The data source: comicvine, metron, gcd, anilist, or mal */
  source: 'comicvine' | 'metron' | 'gcd' | 'anilist' | 'mal';
  /** Source-specific ID */
  sourceId: string;
  /** Series name */
  name: string;
  /** Start year of the series */
  startYear?: number;
  /** End year of the series */
  endYear?: number;
  /** Publisher name */
  publisher?: string;
  /** Total issue count */
  issueCount?: number;
  /** Short description */
  description?: string;
  /** Cover image URL */
  coverUrl?: string;
  /** Site URL */
  url?: string;
}

/**
 * Mixed series cache - stores multiple series mappings for a folder.
 * Used when a folder contains comics from multiple series.
 * The key is the normalized series name (lowercase, alphanumeric).
 */
export interface MixedSeriesCache {
  /** Map of normalized series name -> cached series match */
  seriesMappings: Record<string, CachedSeriesMatch>;
  /** When this cache was last updated */
  lastUpdated: string;
}

export interface MixedSeriesCacheResult {
  success: boolean;
  cache?: MixedSeriesCache;
  error?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if metadata is in v2 (multi-series) format.
 */
export function isMultiSeriesFormat(metadata: SeriesMetadata): boolean {
  return Array.isArray(metadata.series) && metadata.series.length > 0;
}

/**
 * Get all series definitions from metadata (handles both v1 and v2 formats).
 * For v1 format, converts the single series to a SeriesDefinition.
 */
export function getSeriesDefinitions(metadata: SeriesMetadata): SeriesDefinition[] {
  // V2 format: return series array directly
  if (isMultiSeriesFormat(metadata)) {
    return metadata.series!;
  }

  // V1 format: convert to single SeriesDefinition
  if (metadata.seriesName) {
    return [
      {
        name: metadata.seriesName,
        aliases: metadata.aliases,
        publisher: metadata.publisher,
        publisherId: metadata.publisherId,
        startYear: metadata.startYear,
        endYear: metadata.endYear,
        issueCount: metadata.issueCount,
        deck: metadata.deck,
        summary: metadata.summary,
        coverUrl: metadata.coverUrl,
        siteUrl: metadata.siteUrl,
        genres: metadata.genres,
        tags: metadata.tags,
        characters: metadata.characters,
        teams: metadata.teams,
        storyArcs: metadata.storyArcs,
        locations: metadata.locations,
        creators: metadata.creators,
        userNotes: metadata.userNotes,
        volume: metadata.volume,
        type: metadata.type,
        ageRating: metadata.ageRating,
        languageISO: metadata.languageISO,
        comicVineSeriesId: metadata.comicVineSeriesId,
        metronSeriesId: metadata.metronSeriesId,
        anilistId: metadata.anilistId,
        malId: metadata.malId,
        gcdId: metadata.gcdId,
        creatorRoles: metadata.creatorRoles,
        externalRatings: metadata.externalRatings,
        externalReviews: metadata.externalReviews,
      },
    ];
  }

  return [];
}

// =============================================================================
// Series.json Operations
// =============================================================================

/**
 * Read series.json from a folder.
 * Supports both v2 (multi-series) and v1 (single-series) formats.
 */
export async function readSeriesJson(folderPath: string): Promise<SeriesMetadataResult> {
  const seriesJsonPath = join(folderPath, 'series.json');

  if (!existsSync(seriesJsonPath)) {
    return {
      success: false,
      error: 'series.json not found',
    };
  }

  try {
    const content = await readFile(seriesJsonPath, 'utf-8');
    const metadata = JSON.parse(content) as SeriesMetadata;

    // V2 format: multi-series array
    if (metadata.series !== undefined) {
      if (!Array.isArray(metadata.series)) {
        return {
          success: false,
          error: 'series.json: "series" field must be an array',
        };
      }

      // Validate each series definition
      for (let i = 0; i < metadata.series.length; i++) {
        const seriesDef = metadata.series[i]!;
        if (!seriesDef.name || typeof seriesDef.name !== 'string') {
          return {
            success: false,
            error: `series.json: series[${i}] missing required field: name`,
          };
        }
        // Validate aliases if present
        if (seriesDef.aliases !== undefined && !Array.isArray(seriesDef.aliases)) {
          return {
            success: false,
            error: `series.json: series[${i}].aliases must be an array`,
          };
        }
      }

      // Empty array is technically valid but useless
      if (metadata.series.length === 0) {
        return {
          success: false,
          error: 'series.json: series array is empty',
        };
      }

      return {
        success: true,
        metadata,
      };
    }

    // V1 format: single series with seriesName
    if (!metadata.seriesName) {
      return {
        success: false,
        error: 'series.json missing required field: seriesName or series array',
      };
    }

    return {
      success: true,
      metadata,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Write series.json to a folder.
 * Supports both v2 (multi-series) and v1 (single-series) formats.
 * For v2 format, ComicInfo.xml sync is skipped (multi-series folders don't have a single series).
 */
export async function writeSeriesJson(
  folderPath: string,
  metadata: SeriesMetadata,
  skipComicInfoSync = false
): Promise<{ success: boolean; error?: string }> {
  const seriesJsonPath = join(folderPath, 'series.json');

  try {
    // V2 format validation
    if (metadata.series !== undefined) {
      if (!Array.isArray(metadata.series)) {
        return {
          success: false,
          error: 'series field must be an array',
        };
      }
      for (let i = 0; i < metadata.series.length; i++) {
        if (!metadata.series[i]!.name) {
          return {
            success: false,
            error: `series[${i}].name is required`,
          };
        }
      }
      if (metadata.series.length === 0) {
        return {
          success: false,
          error: 'series array cannot be empty',
        };
      }
    } else {
      // V1 format validation
      if (!metadata.seriesName) {
        return {
          success: false,
          error: 'seriesName is required (or use series[] array for v2 format)',
        };
      }
    }

    // Write series.json
    const content = JSON.stringify(metadata, null, 2);
    await writeFile(seriesJsonPath, content, 'utf-8');

    // Auto-regenerate ComicInfo.xml for v1 single-series format only
    // V2 multi-series folders don't have a single authoritative series for ComicInfo.xml
    const isV2 = metadata.series !== undefined && metadata.series.length > 0;
    if (!skipComicInfoSync && !isV2) {
      await syncComicInfoFromSeriesJson(folderPath, metadata);
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Update series.json with partial updates.
 * Preserves existing fields not being updated.
 */
export async function updateSeriesJson(
  folderPath: string,
  updates: Partial<SeriesMetadata>
): Promise<{ success: boolean; error?: string }> {
  // Read existing metadata
  const existing = await readSeriesJson(folderPath);

  // Merge with updates
  const merged: SeriesMetadata = existing.success && existing.metadata
    ? { ...existing.metadata, ...updates }
    : { seriesName: updates.seriesName || 'Unknown', ...updates };

  return writeSeriesJson(folderPath, merged);
}

/**
 * Delete series.json from a folder.
 */
export async function deleteSeriesJson(folderPath: string): Promise<boolean> {
  const seriesJsonPath = join(folderPath, 'series.json');

  if (!existsSync(seriesJsonPath)) {
    return true; // Already doesn't exist
  }

  try {
    const { unlink } = await import('fs/promises');
    await unlink(seriesJsonPath);
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// ComicInfo.xml Sync
// =============================================================================

/**
 * Convert SeriesMetadata to ComicInfo format.
 */
export function seriesMetadataToComicInfo(metadata: SeriesMetadata): ComicInfo {
  const comicInfo: ComicInfo = {
    Series: metadata.seriesName,
  };

  if (metadata.publisher) comicInfo.Publisher = metadata.publisher;
  if (metadata.summary) comicInfo.Summary = metadata.summary;
  if (metadata.startYear) comicInfo.Year = metadata.startYear;
  if (metadata.volume) comicInfo.Volume = metadata.volume;
  if (metadata.ageRating) comicInfo.AgeRating = metadata.ageRating;
  if (metadata.languageISO) comicInfo.LanguageISO = metadata.languageISO;

  // Convert arrays to comma-separated strings
  if (metadata.genres && metadata.genres.length > 0) {
    comicInfo.Genre = metadata.genres.join(', ');
  }
  if (metadata.tags && metadata.tags.length > 0) {
    comicInfo.Tags = metadata.tags.join(', ');
  }

  // Add author run as writer if specified
  if (metadata.authorRun) {
    comicInfo.Writer = metadata.authorRun;
  }

  // Add user notes to Notes field
  if (metadata.userNotes) {
    comicInfo.Notes = metadata.userNotes;
  }

  // Set Manga flag based on type
  if (metadata.type === 'manga') {
    comicInfo.Manga = 'YesAndRightToLeft';
  }

  return comicInfo;
}

/**
 * Convert ComicInfo to SeriesMetadata format.
 */
export function comicInfoToSeriesMetadata(comicInfo: ComicInfo): SeriesMetadata {
  const metadata: SeriesMetadata = {
    seriesName: comicInfo.Series || 'Unknown',
  };

  if (comicInfo.Publisher) metadata.publisher = comicInfo.Publisher;
  if (comicInfo.Summary) metadata.summary = comicInfo.Summary;
  if (comicInfo.Year) metadata.startYear = comicInfo.Year;
  if (comicInfo.Volume) metadata.volume = comicInfo.Volume;
  if (comicInfo.AgeRating) metadata.ageRating = comicInfo.AgeRating;
  if (comicInfo.LanguageISO) metadata.languageISO = comicInfo.LanguageISO;
  if (comicInfo.Writer) metadata.authorRun = comicInfo.Writer;
  if (comicInfo.Notes) metadata.userNotes = comicInfo.Notes;

  // Convert comma-separated strings to arrays
  if (comicInfo.Genre) {
    metadata.genres = comicInfo.Genre.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (comicInfo.Tags) {
    metadata.tags = comicInfo.Tags.split(',').map(s => s.trim()).filter(Boolean);
  }

  // Check Manga flag
  if (comicInfo.Manga === 'Yes' || comicInfo.Manga === 'YesAndRightToLeft') {
    metadata.type = 'manga';
  }

  return metadata;
}

/**
 * Sync folder-level ComicInfo.xml from series.json.
 * Called automatically when series.json is updated.
 */
export async function syncComicInfoFromSeriesJson(
  folderPath: string,
  metadata?: SeriesMetadata
): Promise<{ success: boolean; error?: string }> {
  // Read series.json if not provided
  if (!metadata) {
    const result = await readSeriesJson(folderPath);
    if (!result.success || !result.metadata) {
      return {
        success: false,
        error: result.error || 'Failed to read series.json',
      };
    }
    metadata = result.metadata;
  }

  // Convert to ComicInfo format
  const comicInfo = seriesMetadataToComicInfo(metadata);

  // Write ComicInfo.xml to folder
  const comicInfoPath = join(folderPath, 'ComicInfo.xml');
  return writeComicInfoToFile(comicInfoPath, comicInfo);
}

// =============================================================================
// Folder Discovery
// =============================================================================

/**
 * Get metadata for a folder (series.json and/or ComicInfo.xml).
 */
export async function getFolderMetadata(folderPath: string): Promise<FolderMetadata> {
  const result: FolderMetadata = {
    folderPath,
    hasSeriesJson: false,
    hasComicInfo: false,
    fileCount: 0,
  };

  // Check for series.json
  const seriesJsonPath = join(folderPath, 'series.json');
  if (existsSync(seriesJsonPath)) {
    result.hasSeriesJson = true;
    const seriesResult = await readSeriesJson(folderPath);
    if (seriesResult.success) {
      result.seriesMetadata = seriesResult.metadata;
    }
  }

  // Check for ComicInfo.xml
  const comicInfoPath = join(folderPath, 'ComicInfo.xml');
  if (existsSync(comicInfoPath)) {
    result.hasComicInfo = true;
    const comicInfoResult = await readComicInfoFromFile(comicInfoPath);
    if (comicInfoResult.success) {
      result.comicInfo = comicInfoResult.comicInfo;
    }
  }

  // Count comic files in folder
  try {
    const entries = await readdir(folderPath);
    for (const entry of entries) {
      const ext = entry.toLowerCase().split('.').pop();
      if (ext && ['cbz', 'cbr', 'cb7', 'cbt'].includes(ext)) {
        result.fileCount++;
      }
    }
  } catch {
    // Ignore read errors
  }

  return result;
}

/**
 * Find all series folders (folders with series.json) in a directory.
 */
export async function findSeriesFolders(
  rootPath: string,
  maxDepth = 3
): Promise<FolderMetadata[]> {
  const results: FolderMetadata[] = [];

  async function scanFolder(folderPath: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    try {
      const entries = await readdir(folderPath);

      // Check if this folder has series.json
      if (entries.includes('series.json')) {
        const metadata = await getFolderMetadata(folderPath);
        results.push(metadata);
      }

      // Recurse into subdirectories
      for (const entry of entries) {
        const entryPath = join(folderPath, entry);
        try {
          const entryStat = await stat(entryPath);
          if (entryStat.isDirectory() && !entry.startsWith('.')) {
            await scanFolder(entryPath, depth + 1);
          }
        } catch {
          // Skip entries we can't stat
        }
      }
    } catch {
      // Skip folders we can't read
    }
  }

  await scanFolder(rootPath, 0);
  return results;
}

/**
 * Initialize series.json for a folder based on folder name.
 * Parses folder names like "Batman (2011-2016)" or "Daredevil by Frank Miller (1979-1983)"
 */
export function parseSeriesFolderName(folderName: string): Partial<SeriesMetadata> {
  const result: Partial<SeriesMetadata> = {};

  // Try to match patterns like "Series Name (YYYY-YYYY)" or "Series Name (YYYY)"
  const yearPattern = /^(.+?)\s*\((\d{4})(?:-(\d{4}))?\)$/;
  const yearMatch = folderName.match(yearPattern);

  if (yearMatch) {
    let seriesName = yearMatch[1]!.trim();
    result.startYear = parseInt(yearMatch[2]!, 10);
    if (yearMatch[3]) {
      result.endYear = parseInt(yearMatch[3], 10);
    }

    // Check for "by Author" pattern
    const byAuthorPattern = /^(.+?)\s+by\s+(.+)$/i;
    const authorMatch = seriesName.match(byAuthorPattern);

    if (authorMatch) {
      result.seriesName = authorMatch[1]!.trim();
      result.authorRun = authorMatch[2]!.trim();
    } else {
      result.seriesName = seriesName;
    }
  } else {
    // No year pattern, just use folder name as series name
    const byAuthorPattern = /^(.+?)\s+by\s+(.+)$/i;
    const authorMatch = folderName.match(byAuthorPattern);

    if (authorMatch) {
      result.seriesName = authorMatch[1]!.trim();
      result.authorRun = authorMatch[2]!.trim();
    } else {
      result.seriesName = folderName;
    }
  }

  return result;
}

/**
 * Create series.json from folder name if it doesn't exist.
 */
export async function initializeSeriesFromFolderName(
  folderPath: string
): Promise<{ success: boolean; created: boolean; error?: string }> {
  // Check if series.json already exists
  const seriesJsonPath = join(folderPath, 'series.json');
  if (existsSync(seriesJsonPath)) {
    return { success: true, created: false };
  }

  // Parse folder name
  const folderName = basename(folderPath);
  const parsedMetadata = parseSeriesFolderName(folderName);

  if (!parsedMetadata.seriesName) {
    return {
      success: false,
      created: false,
      error: 'Could not parse series name from folder name',
    };
  }

  // Create series.json
  const result = await writeSeriesJson(folderPath, parsedMetadata as SeriesMetadata);

  return {
    success: result.success,
    created: result.success,
    error: result.error,
  };
}

// =============================================================================
// Bulk Operations
// =============================================================================

/**
 * Sync all folder ComicInfo.xml files from their series.json files.
 */
export async function syncAllComicInfoFiles(
  rootPath: string
): Promise<{
  synced: number;
  skipped: number;
  errors: Array<{ folderPath: string; error: string }>;
}> {
  const seriesFolders = await findSeriesFolders(rootPath);
  let synced = 0;
  let skipped = 0;
  const errors: Array<{ folderPath: string; error: string }> = [];

  for (const folder of seriesFolders) {
    if (!folder.hasSeriesJson || !folder.seriesMetadata) {
      skipped++;
      continue;
    }

    const result = await syncComicInfoFromSeriesJson(folder.folderPath, folder.seriesMetadata);

    if (result.success) {
      synced++;
    } else {
      errors.push({
        folderPath: folder.folderPath,
        error: result.error || 'Unknown error',
      });
    }
  }

  return { synced, skipped, errors };
}

/**
 * Initialize series.json for all folders that don't have one.
 */
export async function initializeAllSeriesFromFolderNames(
  rootPath: string,
  maxDepth = 2
): Promise<{
  created: number;
  skipped: number;
  errors: Array<{ folderPath: string; error: string }>;
}> {
  let created = 0;
  let skipped = 0;
  const errors: Array<{ folderPath: string; error: string }> = [];

  async function scanFolder(folderPath: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;

    try {
      const entries = await readdir(folderPath);

      // Check if folder has comic files but no series.json
      let hasComicFiles = false;
      let hasSeriesJson = entries.includes('series.json');

      for (const entry of entries) {
        const ext = entry.toLowerCase().split('.').pop();
        if (ext && ['cbz', 'cbr', 'cb7', 'cbt'].includes(ext)) {
          hasComicFiles = true;
          break;
        }
      }

      // Initialize if has comics but no series.json
      if (hasComicFiles && !hasSeriesJson) {
        const result = await initializeSeriesFromFolderName(folderPath);
        if (result.created) {
          created++;
        } else if (result.error) {
          errors.push({ folderPath, error: result.error });
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }

      // Recurse into subdirectories
      for (const entry of entries) {
        const entryPath = join(folderPath, entry);
        try {
          const entryStat = await stat(entryPath);
          if (entryStat.isDirectory() && !entry.startsWith('.') && entry !== 'specials') {
            await scanFolder(entryPath, depth + 1);
          }
        } catch {
          // Skip entries we can't stat
        }
      }
    } catch {
      // Skip folders we can't read
    }
  }

  await scanFolder(rootPath, 0);
  return { created, skipped, errors };
}

// =============================================================================
// Mixed Series Cache Operations
// =============================================================================

const MIXED_SERIES_CACHE_FILENAME = '.series-cache.json';

/**
 * Read the mixed series cache from a folder.
 * This cache stores multiple series mappings for folders with mixed series.
 */
export async function readMixedSeriesCache(folderPath: string): Promise<MixedSeriesCacheResult> {
  const cachePath = join(folderPath, MIXED_SERIES_CACHE_FILENAME);

  if (!existsSync(cachePath)) {
    return {
      success: false,
      error: 'Mixed series cache not found',
    };
  }

  try {
    const content = await readFile(cachePath, 'utf-8');
    const cache = JSON.parse(content) as MixedSeriesCache;

    // Validate structure
    if (!cache.seriesMappings || typeof cache.seriesMappings !== 'object') {
      return {
        success: false,
        error: 'Invalid mixed series cache format',
      };
    }

    return {
      success: true,
      cache,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Write the mixed series cache to a folder.
 */
export async function writeMixedSeriesCache(
  folderPath: string,
  cache: MixedSeriesCache
): Promise<{ success: boolean; error?: string }> {
  const cachePath = join(folderPath, MIXED_SERIES_CACHE_FILENAME);

  try {
    // Update timestamp
    cache.lastUpdated = new Date().toISOString();

    const content = JSON.stringify(cache, null, 2);
    await writeFile(cachePath, content, 'utf-8');

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Add or update a series mapping in the mixed series cache.
 * Creates the cache file if it doesn't exist.
 */
export async function addToMixedSeriesCache(
  folderPath: string,
  normalizedSeriesName: string,
  seriesMatch: CachedSeriesMatch
): Promise<{ success: boolean; error?: string }> {
  // Read existing cache or create new one
  const existing = await readMixedSeriesCache(folderPath);
  const cache: MixedSeriesCache = existing.success && existing.cache
    ? existing.cache
    : { seriesMappings: {}, lastUpdated: new Date().toISOString() };

  // Add/update the mapping
  cache.seriesMappings[normalizedSeriesName] = seriesMatch;

  return writeMixedSeriesCache(folderPath, cache);
}

/**
 * Get a series match from the mixed series cache by normalized name.
 */
export async function getFromMixedSeriesCache(
  folderPath: string,
  normalizedSeriesName: string
): Promise<CachedSeriesMatch | null> {
  const result = await readMixedSeriesCache(folderPath);
  if (!result.success || !result.cache) {
    return null;
  }

  return result.cache.seriesMappings[normalizedSeriesName] || null;
}

/**
 * Delete the mixed series cache from a folder.
 */
export async function deleteMixedSeriesCache(folderPath: string): Promise<boolean> {
  const cachePath = join(folderPath, MIXED_SERIES_CACHE_FILENAME);

  if (!existsSync(cachePath)) {
    return true; // Already doesn't exist
  }

  try {
    const { unlink } = await import('fs/promises');
    await unlink(cachePath);
    return true;
  } catch {
    return false;
  }
}
