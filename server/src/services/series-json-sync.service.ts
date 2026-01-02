/**
 * Series JSON Sync Service
 *
 * Unified service for synchronizing series metadata between the database
 * and series.json files. This is the SINGLE SOURCE OF TRUTH for all
 * series.json sync operations.
 *
 * Replaces duplicate functions:
 * - syncSeriesToSeriesJson() from series-crud.service.ts
 * - syncToSeriesJson() from series-metadata-fetch.service.ts
 */

import { getDatabase } from './database.service.js';
import {
  SeriesMetadata,
  readSeriesJson,
  writeSeriesJson,
  SERIES_JSON_SCHEMA_VERSION,
  MAX_REVIEWS_IN_SERIES_JSON,
} from './series-metadata.service.js';
import { createServiceLogger } from './logger.service.js';

const logger = createServiceLogger('series-json-sync');

// =============================================================================
// Types
// =============================================================================

export interface SyncOptions {
  /** Include external ratings/reviews in series.json (default: true) */
  includeExternalData?: boolean;
  /** Skip sync if called from bulk operation (for manual opt-out) */
  skipBulkOps?: boolean;
}

export interface MergeOptions {
  /** Whether to respect locked fields (default: true) */
  respectLocks?: boolean;
  /** Fields that can be merged from series.json */
  mergeableFields?: string[];
}

export interface MergeResult {
  success: boolean;
  seriesId: string;
  fieldsUpdated: string[];
  fieldsSkipped: string[];
  error?: string;
}

export interface BulkSyncOptions {
  /** Include external ratings/reviews in series.json (default: true) */
  includeExternalData?: boolean;
  /** Maximum concurrent syncs (default: 10) */
  concurrency?: number;
}

export interface BulkSyncResult {
  total: number;
  synced: number;
  skipped: number;
  failed: number;
  errors: Array<{ seriesId: string; error: string }>;
}

// =============================================================================
// Default Configuration
// =============================================================================

/** Fields that can be merged from series.json during scans */
export const MERGEABLE_FIELDS_DEFAULT = [
  'startYear', 'endYear', 'publisher', 'volume',
  'issueCount', 'deck', 'summary', 'coverUrl',
  'genres', 'tags', 'characters', 'teams',
  'locations', 'storyArcs', 'creators',
  'ageRating', 'languageISO', 'type', 'userNotes',
  // External IDs are mergeable if not locked
  'comicVineSeriesId', 'metronSeriesId',
  'anilistId', 'malId', 'gcdId',
  // Extended fields
  'creatorRoles', 'aliases',
];

// =============================================================================
// Core Sync Functions
// =============================================================================

/**
 * Sync a Series database record to its series.json file (DB → File)
 *
 * This is the unified sync function that replaces both:
 * - syncSeriesToSeriesJson() from series-crud.service.ts
 * - syncToSeriesJson() from series-metadata-fetch.service.ts
 */
export async function syncSeriesToSeriesJson(
  seriesId: string,
  options: SyncOptions = {}
): Promise<void> {
  const { includeExternalData = true } = options;
  const db = getDatabase();

  // Fetch series with related data
  const series = await db.series.findUnique({
    where: { id: seriesId },
  });

  if (!series || !series.primaryFolder) {
    logger.debug({ seriesId }, 'Cannot sync to series.json - no primary folder');
    return;
  }

  // Fetch external ratings if enabled
  let externalRatings: SeriesMetadata['externalRatings'] | undefined;
  if (includeExternalData) {
    const ratings = await db.externalRating.findMany({
      where: {
        seriesId,
        expiresAt: { gt: new Date() },
      },
      select: {
        source: true,
        ratingType: true,
        ratingValue: true,
        ratingScale: true,
        voteCount: true,
        lastSyncedAt: true,
      },
    });

    if (ratings.length > 0) {
      externalRatings = ratings.map((r) => ({
        source: r.source,
        ratingType: r.ratingType as 'community' | 'critic',
        value: r.ratingValue,
        scale: r.ratingScale,
        voteCount: r.voteCount ?? undefined,
        fetchedAt: r.lastSyncedAt.toISOString(),
      }));
    }
  }

  // Fetch top N external reviews if enabled
  let externalReviews: SeriesMetadata['externalReviews'] | undefined;
  if (includeExternalData) {
    const reviews = await db.externalReview.findMany({
      where: { seriesId },
      orderBy: [
        { likes: 'desc' },
        { createdAt: 'desc' },
      ],
      take: MAX_REVIEWS_IN_SERIES_JSON,
      select: {
        source: true,
        authorName: true,
        reviewText: true,
        summary: true,
        rating: true,
        originalRating: true,
        ratingScale: true,
        reviewType: true,
        hasSpoilers: true,
        likes: true,
        reviewDate: true,
        lastSyncedAt: true,
      },
    });

    if (reviews.length > 0) {
      externalReviews = reviews.map((r) => ({
        source: r.source,
        authorName: r.authorName,
        reviewText: r.reviewText,
        summary: r.summary ?? undefined,
        rating: r.rating ?? undefined,
        originalRating: r.originalRating ?? undefined,
        ratingScale: r.ratingScale ?? undefined,
        reviewType: r.reviewType as 'user' | 'critic',
        hasSpoilers: r.hasSpoilers ?? undefined,
        likes: r.likes ?? undefined,
        reviewDate: r.reviewDate?.toISOString(),
        fetchedAt: r.lastSyncedAt.toISOString(),
      }));
    }
  }

  // Parse creator roles from database if available
  let creatorRoles: SeriesMetadata['creatorRoles'] | undefined;
  if (series.creatorsJson) {
    try {
      // creatorsJson should be a structured object with role arrays
      const parsed = JSON.parse(series.creatorsJson);
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        creatorRoles = parsed as SeriesMetadata['creatorRoles'];
      }
    } catch {
      // If parsing fails, try to build from individual fields
      creatorRoles = buildCreatorRolesFromFields(series);
    }
  } else {
    // Build from individual creator fields
    creatorRoles = buildCreatorRolesFromFields(series);
  }

  // Build the complete SeriesMetadata object
  const metadata: SeriesMetadata = {
    schemaVersion: SERIES_JSON_SCHEMA_VERSION,
    seriesName: series.name,
    startYear: series.startYear ?? undefined,
    endYear: series.endYear ?? undefined,
    publisher: series.publisher ?? undefined,
    comicVineSeriesId: series.comicVineId ?? undefined,
    metronSeriesId: series.metronId ?? undefined,
    anilistId: series.anilistId ?? undefined,
    malId: series.malId ?? undefined,
    gcdId: series.gcdId ?? undefined,
    issueCount: series.issueCount ?? undefined,
    deck: series.deck ?? undefined,
    summary: series.summary ?? undefined,
    coverUrl: series.coverUrl ?? undefined,
    genres: splitToArray(series.genres),
    tags: splitToArray(series.tags),
    characters: splitToArray(series.characters),
    teams: splitToArray(series.teams),
    storyArcs: splitToArray(series.storyArcs),
    locations: splitToArray(series.locations),
    creators: splitToArray(series.creators),
    userNotes: series.userNotes ?? undefined,
    volume: series.volume ?? undefined,
    type: series.type as 'western' | 'manga' | undefined,
    ageRating: series.ageRating ?? undefined,
    languageISO: series.languageISO ?? undefined,
    lastUpdated: new Date().toISOString(),
    // Extended fields
    creatorRoles,
    aliases: splitToArray(series.aliases),
    externalRatings,
    externalReviews,
  };

  try {
    await writeSeriesJson(series.primaryFolder, metadata);
    logger.debug({ seriesId, folder: series.primaryFolder }, 'Synced to series.json');
  } catch (err) {
    logger.error({ err, seriesId }, 'Failed to sync to series.json');
  }
}

/**
 * Merge series.json data into a Series database record (File → DB)
 *
 * Used by the scanner to populate/update series from series.json files.
 * Respects locked fields and only updates empty database fields.
 */
export async function mergeSeriesJsonToDb(
  seriesId: string,
  folderPath: string,
  options: MergeOptions = {}
): Promise<MergeResult> {
  const { respectLocks = true, mergeableFields = MERGEABLE_FIELDS_DEFAULT } = options;
  const db = getDatabase();

  const result: MergeResult = {
    success: false,
    seriesId,
    fieldsUpdated: [],
    fieldsSkipped: [],
  };

  // Read series.json
  const jsonResult = await readSeriesJson(folderPath);
  if (!jsonResult.success || !jsonResult.metadata) {
    result.error = jsonResult.error || 'Failed to read series.json';
    return result;
  }

  const metadata = jsonResult.metadata;

  // Get current series data
  const series = await db.series.findUnique({
    where: { id: seriesId },
  });

  if (!series) {
    result.error = `Series ${seriesId} not found`;
    return result;
  }

  // Parse locked fields
  const lockedFields = new Set(
    series.lockedFields?.split(',').map((f) => f.trim()).filter(Boolean) || []
  );

  // Build update data - only update empty fields
  const updateData: Record<string, unknown> = {};

  // Map series.json fields to database fields
  const fieldMappings: Array<{
    jsonField: keyof SeriesMetadata;
    dbField: string;
    transform?: (v: unknown) => unknown;
  }> = [
    { jsonField: 'startYear', dbField: 'startYear' },
    { jsonField: 'endYear', dbField: 'endYear' },
    { jsonField: 'publisher', dbField: 'publisher' },
    { jsonField: 'volume', dbField: 'volume' },
    { jsonField: 'issueCount', dbField: 'issueCount' },
    { jsonField: 'deck', dbField: 'deck' },
    { jsonField: 'summary', dbField: 'summary' },
    { jsonField: 'coverUrl', dbField: 'coverUrl' },
    { jsonField: 'type', dbField: 'type' },
    { jsonField: 'ageRating', dbField: 'ageRating' },
    { jsonField: 'languageISO', dbField: 'languageISO' },
    { jsonField: 'userNotes', dbField: 'userNotes' },
    { jsonField: 'comicVineSeriesId', dbField: 'comicVineId' },
    { jsonField: 'metronSeriesId', dbField: 'metronId' },
    { jsonField: 'anilistId', dbField: 'anilistId' },
    { jsonField: 'malId', dbField: 'malId' },
    { jsonField: 'gcdId', dbField: 'gcdId' },
    // Array fields - join to comma-separated string
    { jsonField: 'genres', dbField: 'genres', transform: joinArray },
    { jsonField: 'tags', dbField: 'tags', transform: joinArray },
    { jsonField: 'characters', dbField: 'characters', transform: joinArray },
    { jsonField: 'teams', dbField: 'teams', transform: joinArray },
    { jsonField: 'storyArcs', dbField: 'storyArcs', transform: joinArray },
    { jsonField: 'locations', dbField: 'locations', transform: joinArray },
    { jsonField: 'creators', dbField: 'creators', transform: joinArray },
    { jsonField: 'aliases', dbField: 'aliases', transform: joinArray },
  ];

  for (const mapping of fieldMappings) {
    const { jsonField, dbField, transform } = mapping;
    const jsonValue = metadata[jsonField];

    // Skip if not in mergeable fields list
    if (!mergeableFields.includes(jsonField)) {
      result.fieldsSkipped.push(`${jsonField}:not_mergeable`);
      continue;
    }

    // Skip if field is locked and we respect locks
    if (respectLocks && lockedFields.has(dbField)) {
      result.fieldsSkipped.push(`${jsonField}:locked`);
      continue;
    }

    // Skip if json value is empty
    if (jsonValue === undefined || jsonValue === null ||
        (Array.isArray(jsonValue) && jsonValue.length === 0) ||
        jsonValue === '') {
      continue;
    }

    // Get current db value
    const dbValue = series[dbField as keyof typeof series];

    // Only update if db field is empty
    if (isEmptyValue(dbValue)) {
      const finalValue = transform ? transform(jsonValue) : jsonValue;
      updateData[dbField] = finalValue;
      result.fieldsUpdated.push(jsonField);
    } else {
      result.fieldsSkipped.push(`${jsonField}:db_has_value`);
    }
  }

  // Handle creatorRoles separately (stores as JSON)
  if (metadata.creatorRoles && mergeableFields.includes('creatorRoles')) {
    // Check if locked (creatorsJson is the db field name)
    if (respectLocks && lockedFields.has('creatorsJson')) {
      result.fieldsSkipped.push('creatorRoles:locked');
    } else if (isEmptyValue(series.creatorsJson)) {
      updateData.creatorsJson = JSON.stringify(metadata.creatorRoles);
      result.fieldsUpdated.push('creatorRoles');
    } else {
      result.fieldsSkipped.push('creatorRoles:db_has_value');
    }
  }

  // Apply updates if any
  if (Object.keys(updateData).length > 0) {
    try {
      await db.series.update({
        where: { id: seriesId },
        data: updateData,
      });
      result.success = true;
      logger.debug({ seriesId, fieldsUpdated: result.fieldsUpdated }, 'Merged series.json to DB');
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      logger.error({ err, seriesId }, 'Failed to merge series.json to DB');
    }
  } else {
    result.success = true; // No updates needed is still a success
    logger.debug({ seriesId }, 'No fields to merge from series.json');
  }

  return result;
}

/**
 * Bulk sync multiple series to their series.json files.
 * Used by bulk operations and scheduled sync tasks.
 */
export async function bulkSyncToSeriesJson(
  seriesIds: string[],
  options: BulkSyncOptions = {}
): Promise<BulkSyncResult> {
  const { includeExternalData = true, concurrency = 10 } = options;
  const db = getDatabase();

  const result: BulkSyncResult = {
    total: seriesIds.length,
    synced: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  // Get series with primary folders
  const seriesList = await db.series.findMany({
    where: {
      id: { in: seriesIds },
      primaryFolder: { not: null },
    },
    select: { id: true, primaryFolder: true },
  });

  const seriesWithFolders = new Set(seriesList.map((s) => s.id));
  result.skipped = seriesIds.length - seriesList.length;

  // Process in batches to limit concurrency
  const batches: string[][] = [];
  for (let i = 0; i < seriesList.length; i += concurrency) {
    batches.push(seriesList.slice(i, i + concurrency).map((s) => s.id));
  }

  for (const batch of batches) {
    const promises = batch.map(async (seriesId) => {
      try {
        await syncSeriesToSeriesJson(seriesId, { includeExternalData });
        result.synced++;
      } catch (err) {
        result.failed++;
        result.errors.push({
          seriesId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    await Promise.all(promises);
  }

  logger.info(
    { total: result.total, synced: result.synced, skipped: result.skipped, failed: result.failed },
    'Bulk sync to series.json completed'
  );

  return result;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Split a comma-separated string into an array, filtering empty values.
 */
function splitToArray(value: string | null | undefined): string[] | undefined {
  if (!value) return undefined;
  const arr = value.split(',').map((s) => s.trim()).filter(Boolean);
  return arr.length > 0 ? arr : undefined;
}

/**
 * Join an array into a comma-separated string.
 */
function joinArray(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const joined = value.filter(Boolean).join(',');
  return joined || null;
}

/**
 * Check if a value is considered "empty" for merging purposes.
 */
function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

/**
 * Build creatorRoles object from individual series fields.
 */
function buildCreatorRolesFromFields(series: {
  writer?: string | null;
  penciller?: string | null;
  inker?: string | null;
  colorist?: string | null;
  letterer?: string | null;
  coverArtist?: string | null;
  editor?: string | null;
}): SeriesMetadata['creatorRoles'] | undefined {
  const roles: NonNullable<SeriesMetadata['creatorRoles']> = {};
  let hasAny = false;

  if (series.writer) {
    roles.writers = splitToArray(series.writer);
    if (roles.writers) hasAny = true;
  }
  if (series.penciller) {
    roles.pencillers = splitToArray(series.penciller);
    if (roles.pencillers) hasAny = true;
  }
  if (series.inker) {
    roles.inkers = splitToArray(series.inker);
    if (roles.inkers) hasAny = true;
  }
  if (series.colorist) {
    roles.colorists = splitToArray(series.colorist);
    if (roles.colorists) hasAny = true;
  }
  if (series.letterer) {
    roles.letterers = splitToArray(series.letterer);
    if (roles.letterers) hasAny = true;
  }
  if (series.coverArtist) {
    roles.coverArtists = splitToArray(series.coverArtist);
    if (roles.coverArtists) hasAny = true;
  }
  if (series.editor) {
    roles.editors = splitToArray(series.editor);
    if (roles.editors) hasAny = true;
  }

  return hasAny ? roles : undefined;
}
