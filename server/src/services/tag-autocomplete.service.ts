/**
 * Tag Autocomplete Service
 *
 * Manages the TagValue table for efficient autocomplete suggestions.
 * - Extracts unique values from comma-separated fields
 * - Provides prefix-based search with pagination
 * - Integrates with scanner for incremental updates
 */

import { getDatabase } from './database.service.js';
import { LRUCache } from './lru-cache.service.js';

// =============================================================================
// Types
// =============================================================================

export const TAG_FIELD_TYPES = [
  'characters',
  'teams',
  'locations',
  'genres',
  'tags',
  'storyArcs',
  'creators',
  'publishers',
  'writers',
  'pencillers',
  'inkers',
  'colorists',
  'letterers',
  'coverArtists',
  'editors',
] as const;

export type TagFieldType = (typeof TAG_FIELD_TYPES)[number];

export interface TagAutocompleteResult {
  values: string[];
  hasMore: boolean;
}

interface RebuildResult {
  totalValues: number;
  byFieldType: Partial<Record<TagFieldType, number>>;
}

// =============================================================================
// Cache
// =============================================================================

// LRU cache for autocomplete results (5 minute TTL, 500 entries max)
const autocompleteCache = new LRUCache<string[]>({
  maxSize: 500,
  defaultTTL: 5 * 60 * 1000, // 5 minutes
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Parse comma-separated values into an array of trimmed, non-empty strings
 */
function parseCommaSeparated(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/**
 * Validate that a string is a valid TagFieldType
 */
export function isValidTagFieldType(field: string): field is TagFieldType {
  return TAG_FIELD_TYPES.includes(field as TagFieldType);
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Search for tag values with prefix matching
 */
export async function searchTagValues(
  fieldType: TagFieldType,
  query: string,
  limit: number = 10,
  offset: number = 0
): Promise<TagAutocompleteResult> {
  const queryLower = query.toLowerCase().trim();

  if (!queryLower) {
    return { values: [], hasMore: false };
  }

  // Check cache
  const cacheKey = `${fieldType}:${queryLower}:${limit}:${offset}`;
  const cached = autocompleteCache.get(cacheKey);
  if (cached) {
    return { values: cached, hasMore: cached.length === limit };
  }

  const db = getDatabase();

  // Fetch limit + 1 to determine hasMore without extra query
  const results = await db.tagValue.findMany({
    where: {
      fieldType,
      valueLower: { startsWith: queryLower },
    },
    select: { value: true },
    orderBy: { valueLower: 'asc' },
    skip: offset,
    take: limit + 1,
  });

  const hasMore = results.length > limit;
  const values = results.slice(0, limit).map((r) => r.value);

  // Cache the result
  autocompleteCache.set(cacheKey, values);

  return { values, hasMore };
}

/**
 * Extract and upsert tag values from a comma-separated string
 */
export async function extractAndUpsertTags(
  fieldType: TagFieldType,
  commaSeparatedValues: string | null | undefined
): Promise<number> {
  if (!commaSeparatedValues) return 0;

  const db = getDatabase();
  const values = parseCommaSeparated(commaSeparatedValues);

  let added = 0;
  for (const value of values) {
    try {
      await db.tagValue.upsert({
        where: {
          fieldType_value: { fieldType, value },
        },
        create: {
          fieldType,
          value,
          valueLower: value.toLowerCase(),
        },
        update: {}, // No-op if exists
      });
      added++;
    } catch {
      // Ignore unique constraint violations from race conditions
    }
  }

  // Invalidate cache for this field type if we added values
  if (added > 0) {
    invalidateTagCache(fieldType);
  }

  return added;
}

/**
 * Invalidate all cache entries for a specific field type
 */
export function invalidateTagCache(fieldType: TagFieldType): void {
  const keys = autocompleteCache.keys();
  for (const key of keys) {
    if (key.startsWith(`${fieldType}:`)) {
      autocompleteCache.delete(key);
    }
  }
}

/**
 * Invalidate all cache entries
 */
export function invalidateAllTagCache(): void {
  autocompleteCache.clear();
}

// =============================================================================
// Source Extraction
// =============================================================================

// Mapping of tag field types to Series model columns
const SERIES_FIELD_MAPPINGS: Array<{ fieldType: TagFieldType; column: string }> = [
  { fieldType: 'characters', column: 'characters' },
  { fieldType: 'teams', column: 'teams' },
  { fieldType: 'locations', column: 'locations' },
  { fieldType: 'genres', column: 'genres' },
  { fieldType: 'tags', column: 'tags' },
  { fieldType: 'storyArcs', column: 'storyArcs' },
  { fieldType: 'creators', column: 'creators' },
  { fieldType: 'publishers', column: 'publisher' },
];

// Mapping of tag field types to FileMetadata model columns
const FILE_METADATA_FIELD_MAPPINGS: Array<{ fieldType: TagFieldType; column: string }> = [
  { fieldType: 'characters', column: 'characters' },
  { fieldType: 'teams', column: 'teams' },
  { fieldType: 'locations', column: 'locations' },
  { fieldType: 'genres', column: 'genre' },
  { fieldType: 'tags', column: 'tags' },
  { fieldType: 'storyArcs', column: 'storyArc' },
  { fieldType: 'creators', column: 'creator' },
  { fieldType: 'publishers', column: 'publisher' },
  { fieldType: 'writers', column: 'writer' },
  { fieldType: 'pencillers', column: 'penciller' },
  { fieldType: 'inkers', column: 'inker' },
  { fieldType: 'colorists', column: 'colorist' },
  { fieldType: 'letterers', column: 'letterer' },
  { fieldType: 'coverArtists', column: 'coverArtist' },
  { fieldType: 'editors', column: 'editor' },
];

/**
 * Extract and upsert tags from a Series record
 */
export async function refreshTagsFromSeries(seriesId: string): Promise<void> {
  const db = getDatabase();

  const series = await db.series.findUnique({
    where: { id: seriesId },
    select: {
      characters: true,
      teams: true,
      locations: true,
      genres: true,
      tags: true,
      storyArcs: true,
      creators: true,
      publisher: true,
    },
  });

  if (!series) return;

  for (const { fieldType, column } of SERIES_FIELD_MAPPINGS) {
    const value = series[column as keyof typeof series] as string | null;
    await extractAndUpsertTags(fieldType, value);
  }
}

/**
 * Extract and upsert tags from a FileMetadata record
 */
export async function refreshTagsFromFile(fileId: string): Promise<void> {
  const db = getDatabase();

  const fileMetadata = await db.fileMetadata.findUnique({
    where: { comicId: fileId },
    select: {
      characters: true,
      teams: true,
      locations: true,
      genre: true,
      tags: true,
      storyArc: true,
      creator: true,
      publisher: true,
      writer: true,
      penciller: true,
      inker: true,
      colorist: true,
      letterer: true,
      coverArtist: true,
      editor: true,
    },
  });

  if (!fileMetadata) return;

  for (const { fieldType, column } of FILE_METADATA_FIELD_MAPPINGS) {
    const value = fileMetadata[column as keyof typeof fileMetadata] as string | null;
    await extractAndUpsertTags(fieldType, value);
  }
}

// =============================================================================
// Full Rebuild
// =============================================================================

/**
 * Full rebuild of TagValue table from all Series and FileMetadata records
 */
export async function rebuildAllTags(): Promise<RebuildResult> {
  const db = getDatabase();
  const counts: Partial<Record<TagFieldType, number>> = {};

  // Clear existing tags
  await db.tagValue.deleteMany({});
  invalidateAllTagCache();

  // Extract from all Series
  const allSeries = await db.series.findMany({
    select: {
      characters: true,
      teams: true,
      locations: true,
      genres: true,
      tags: true,
      storyArcs: true,
      creators: true,
      publisher: true,
    },
  });

  for (const series of allSeries) {
    for (const { fieldType, column } of SERIES_FIELD_MAPPINGS) {
      const value = series[column as keyof typeof series] as string | null;
      if (value) {
        const added = await extractAndUpsertTags(fieldType, value);
        counts[fieldType] = (counts[fieldType] || 0) + added;
      }
    }
  }

  // Extract from all FileMetadata
  const allFiles = await db.fileMetadata.findMany({
    select: {
      characters: true,
      teams: true,
      locations: true,
      genre: true,
      tags: true,
      storyArc: true,
      creator: true,
      publisher: true,
      writer: true,
      penciller: true,
      inker: true,
      colorist: true,
      letterer: true,
      coverArtist: true,
      editor: true,
    },
  });

  for (const file of allFiles) {
    for (const { fieldType, column } of FILE_METADATA_FIELD_MAPPINGS) {
      const value = file[column as keyof typeof file] as string | null;
      if (value) {
        const added = await extractAndUpsertTags(fieldType, value);
        counts[fieldType] = (counts[fieldType] || 0) + added;
      }
    }
  }

  // Count totals
  const totalValues = await db.tagValue.count();

  return { totalValues, byFieldType: counts };
}

/**
 * Get statistics about the tag value table
 */
export async function getTagStats(): Promise<{
  totalValues: number;
  byFieldType: Record<string, number>;
}> {
  const db = getDatabase();

  const results = await db.tagValue.groupBy({
    by: ['fieldType'],
    _count: { id: true },
  });

  const byFieldType: Record<string, number> = {};
  for (const result of results) {
    byFieldType[result.fieldType] = result._count.id;
  }

  const totalValues = await db.tagValue.count();

  return { totalValues, byFieldType };
}
