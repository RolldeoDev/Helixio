/**
 * Series Metadata Fetch Service
 *
 * Handles fetching and applying series-level metadata from external APIs (ComicVine, Metron).
 * Integrates with the Edit Series Modal and file-based workflow.
 *
 * Key features:
 * - Fetch metadata by stored external ID
 * - Preview changes before applying
 * - Apply selected fields respecting locks
 * - Sync to series.json file
 */

import { getDatabase } from './database.service.js';
import { createServiceLogger } from './logger.service.js';
import { getSeriesMetadata, type MetadataSource } from './metadata-search.service.js';
import { writeSeriesJson, type SeriesMetadata } from './series-metadata.service.js';
import { getSeries, updateSeries, type FieldSourceMap } from './series.service.js';
import { onSeriesCoverChanged } from './collection.service.js';
import type { Series } from '@prisma/client';

const logger = createServiceLogger('series-metadata-fetch');

// =============================================================================
// Types
// =============================================================================

export interface SeriesMetadataPayload {
  seriesName?: string;
  publisher?: string;
  startYear?: number;
  endYear?: number;
  issueCount?: number;
  description?: string;
  deck?: string;
  coverUrl?: string;
  seriesType?: string;
  comicVineSeriesId?: string;
  metronSeriesId?: string;
  anilistId?: string;
  malId?: string;
  characters?: string[];
  locations?: string[];
  storyArcs?: string[];
  creators?: string[];
  aliases?: string[];
}

export interface FetchMetadataResult {
  success: boolean;
  metadata?: SeriesMetadataPayload;
  source?: MetadataSource;
  externalId?: string;
  error?: string;
  needsSearch?: boolean;
}

export interface ApplyMetadataResult {
  success: boolean;
  series?: Series;
  fieldsUpdated: string[];
  error?: string;
}

export interface PreviewField {
  field: string;
  label: string;
  currentValue: string | null;
  apiValue: string | null;
  isLocked: boolean;
  diff: 'same' | 'diff' | 'new' | 'removed';
}

export interface PreviewResult {
  source: MetadataSource;
  externalId: string;
  fields: PreviewField[];
  lockedFields: string[];
}

// =============================================================================
// Field Mapping
// =============================================================================

/**
 * Map API metadata field names to Series model field names
 */
const API_TO_SERIES_FIELD_MAP: Record<string, string> = {
  seriesName: 'name',
  publisher: 'publisher',
  startYear: 'startYear',
  endYear: 'endYear',
  issueCount: 'issueCount',
  description: 'summary',
  deck: 'deck',
  coverUrl: 'coverUrl',
  seriesType: 'type',
  comicVineSeriesId: 'comicVineId',
  metronSeriesId: 'metronId',
  characters: 'characters',
  locations: 'locations',
  storyArcs: 'storyArcs',
  creators: 'creators',
  aliases: 'aliases',
};

/**
 * Human-readable labels for fields
 */
const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  publisher: 'Publisher',
  startYear: 'Start Year',
  endYear: 'End Year',
  issueCount: 'Issue Count',
  summary: 'Summary',
  deck: 'Short Description',
  coverUrl: 'Cover',
  type: 'Type',
  comicVineId: 'ComicVine ID',
  metronId: 'Metron ID',
  characters: 'Characters',
  locations: 'Locations',
  storyArcs: 'Story Arcs',
  creators: 'Creators',
  aliases: 'Aliases',
};

// =============================================================================
// Fetch Functions
// =============================================================================

/**
 * Fetch series metadata using stored external ID
 * Returns the raw metadata for preview, does not apply it
 */
export async function fetchSeriesMetadataById(seriesId: string): Promise<FetchMetadataResult> {
  const series = await getSeries(seriesId);

  if (!series) {
    return {
      success: false,
      error: 'Series not found',
    };
  }

  // Determine which external ID to use
  let source: MetadataSource | null = null;
  let externalId: string | null = null;

  if (series.comicVineId) {
    source = 'comicvine';
    externalId = series.comicVineId;
  } else if (series.metronId) {
    source = 'metron';
    externalId = series.metronId;
  }

  if (!source || !externalId) {
    return {
      success: false,
      needsSearch: true,
      error: 'No external ID found. Please search for the series.',
    };
  }

  logger.info({ seriesId, source, externalId }, 'Fetching metadata by external ID');

  try {
    const rawMetadata = await getSeriesMetadata(source, externalId);

    if (!rawMetadata) {
      return {
        success: false,
        error: `Failed to fetch metadata from ${source}`,
      };
    }

    // Convert raw metadata to SeriesMetadataPayload
    const metadata = convertRawMetadata(rawMetadata, source);

    return {
      success: true,
      metadata,
      source,
      externalId,
    };
  } catch (err) {
    logger.error({ err, seriesId, source, externalId }, 'Failed to fetch metadata');
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error fetching metadata',
    };
  }
}

/**
 * Fetch metadata for a specific external ID (used after search selection)
 */
export async function fetchMetadataByExternalId(
  source: MetadataSource,
  externalId: string
): Promise<FetchMetadataResult> {
  logger.info({ source, externalId }, 'Fetching metadata by specific external ID');

  try {
    const rawMetadata = await getSeriesMetadata(source, externalId);

    if (!rawMetadata) {
      return {
        success: false,
        error: `Failed to fetch metadata from ${source}`,
      };
    }

    const metadata = convertRawMetadata(rawMetadata, source);

    return {
      success: true,
      metadata,
      source,
      externalId,
    };
  } catch (err) {
    logger.error({ err, source, externalId }, 'Failed to fetch metadata by external ID');
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error fetching metadata',
    };
  }
}

// =============================================================================
// Preview Functions
// =============================================================================

/**
 * Generate a preview comparing current series data with API metadata
 */
export async function previewMetadataChanges(
  seriesId: string,
  metadata: SeriesMetadataPayload,
  source: MetadataSource,
  externalId: string
): Promise<PreviewResult> {
  const series = await getSeries(seriesId);

  if (!series) {
    throw new Error('Series not found');
  }

  // Get locked fields
  const lockedFields = series.lockedFields
    ? series.lockedFields.split(',').map((f) => f.trim())
    : [];

  const fields: PreviewField[] = [];

  // Compare each field
  for (const [apiField, seriesField] of Object.entries(API_TO_SERIES_FIELD_MAP)) {
    const apiValue = metadata[apiField as keyof SeriesMetadataPayload];
    const currentValue = series[seriesField as keyof Series];

    // Skip if API doesn't have this field
    if (apiValue === undefined) continue;

    // Format values for display
    const formattedApiValue = formatValue(apiValue);
    const formattedCurrentValue = formatValue(currentValue);

    // Determine diff type
    let diff: PreviewField['diff'] = 'same';
    if (formattedCurrentValue === null && formattedApiValue !== null) {
      diff = 'new';
    } else if (formattedCurrentValue !== null && formattedApiValue === null) {
      diff = 'removed';
    } else if (formattedCurrentValue !== formattedApiValue) {
      diff = 'diff';
    }

    fields.push({
      field: seriesField,
      label: FIELD_LABELS[seriesField] || seriesField,
      currentValue: formattedCurrentValue,
      apiValue: formattedApiValue,
      isLocked: lockedFields.includes(seriesField),
      diff,
    });
  }

  return {
    source,
    externalId,
    fields,
    lockedFields,
  };
}

// =============================================================================
// Apply Functions
// =============================================================================

/**
 * Apply metadata to series, respecting field selections and locks
 */
export async function applyMetadataToSeries(
  seriesId: string,
  metadata: SeriesMetadataPayload,
  source: MetadataSource,
  externalId: string | null,
  selectedFields: string[]
): Promise<ApplyMetadataResult> {
  const db = getDatabase();
  const series = await getSeries(seriesId);

  if (!series) {
    return {
      success: false,
      fieldsUpdated: [],
      error: 'Series not found',
    };
  }

  // Get locked fields
  const lockedFields = series.lockedFields
    ? series.lockedFields.split(',').map((f) => f.trim())
    : [];

  // Build update data from selected fields
  const updateData: Record<string, unknown> = {};
  const fieldsUpdated: string[] = [];

  // Get current field sources
  const fieldSources: FieldSourceMap = series.fieldSources
    ? JSON.parse(series.fieldSources)
    : {};

  for (const seriesField of selectedFields) {
    // Skip locked fields
    if (lockedFields.includes(seriesField)) {
      logger.debug({ seriesField }, 'Skipping locked field');
      continue;
    }

    // Find the corresponding API field
    const apiField = Object.entries(API_TO_SERIES_FIELD_MAP).find(
      ([, sf]) => sf === seriesField
    )?.[0];

    if (!apiField) continue;

    const apiValue = metadata[apiField as keyof SeriesMetadataPayload];
    if (apiValue === undefined) continue;

    // Convert value for storage
    if (Array.isArray(apiValue)) {
      updateData[seriesField] = apiValue.join(', ');
    } else {
      updateData[seriesField] = apiValue;
    }

    // Track field source
    fieldSources[seriesField] = {
      source: 'api',
    };

    fieldsUpdated.push(seriesField);
  }

  // Always update the external ID if provided
  if (externalId) {
    if (source === 'comicvine' && !lockedFields.includes('comicVineId')) {
      updateData.comicVineId = externalId;
      fieldSources.comicVineId = { source: 'api' };
      if (!fieldsUpdated.includes('comicVineId')) {
        fieldsUpdated.push('comicVineId');
      }
    } else if (source === 'metron' && !lockedFields.includes('metronId')) {
      updateData.metronId = externalId;
      fieldSources.metronId = { source: 'api' };
      if (!fieldsUpdated.includes('metronId')) {
        fieldsUpdated.push('metronId');
      }
    } else if (source === 'anilist' && !lockedFields.includes('anilistId')) {
      updateData.anilistId = externalId;
      fieldSources.anilistId = { source: 'api' };
      if (!fieldsUpdated.includes('anilistId')) {
        fieldsUpdated.push('anilistId');
      }
    } else if (source === 'mal' && !lockedFields.includes('malId')) {
      updateData.malId = externalId;
      fieldSources.malId = { source: 'api' };
      if (!fieldsUpdated.includes('malId')) {
        fieldsUpdated.push('malId');
      }
    }
  }

  // Handle cover separately - download and cache locally
  if (selectedFields.includes('coverUrl') && metadata.coverUrl) {
    try {
      const { downloadApiCover, deleteSeriesCover } = await import('./cover.service.js');

      // Delete old cover if exists to prevent stale cache
      if (series.coverHash) {
        try {
          await deleteSeriesCover(series.coverHash);
          logger.debug({ seriesId, oldHash: series.coverHash }, 'Deleted old cover before downloading new one');
        } catch (err) {
          logger.warn({ seriesId, oldHash: series.coverHash, error: err }, 'Failed to delete old cover, continuing with download');
        }
      }

      const downloadResult = await downloadApiCover(metadata.coverUrl);

      if (downloadResult.success && downloadResult.coverHash) {
        updateData.coverUrl = metadata.coverUrl;  // Keep URL for reference/re-download
        updateData.coverHash = downloadResult.coverHash;  // Store local cache hash
        updateData.coverSource = 'api';
        logger.info({ seriesId, coverHash: downloadResult.coverHash }, 'Downloaded and cached API cover');
      } else {
        logger.warn({ seriesId, error: downloadResult.error }, 'Failed to download cover, storing URL only');
        updateData.coverUrl = metadata.coverUrl;
        updateData.coverSource = 'api';
      }
    } catch (err) {
      logger.error({ err, seriesId }, 'Error downloading cover');
      // Still store the URL even if download fails
      updateData.coverUrl = metadata.coverUrl;
      updateData.coverSource = 'api';
    }
  }

  if (Object.keys(updateData).length === 0) {
    return {
      success: true,
      series,
      fieldsUpdated: [],
    };
  }

  // Add field sources to update
  updateData.fieldSources = JSON.stringify(fieldSources);

  logger.info({ seriesId, fieldsUpdated }, 'Applying metadata to series');

  try {
    // Update series directly (bypass lock checking since we already filtered)
    const updatedSeries = await db.series.update({
      where: { id: seriesId },
      data: updateData,
    });

    // Sync to series.json if primary folder exists
    if (series.primaryFolder) {
      await syncToSeriesJson(seriesId);
    }

    // Trigger cascade refresh for collection mosaics if cover was updated
    if (updateData.coverHash) {
      onSeriesCoverChanged(seriesId).catch((err) => {
        logger.warn({ seriesId, error: err }, 'Failed to trigger collection mosaic refresh');
      });
    }

    return {
      success: true,
      series: updatedSeries,
      fieldsUpdated,
    };
  } catch (err) {
    logger.error({ err, seriesId }, 'Failed to apply metadata');
    return {
      success: false,
      fieldsUpdated: [],
      error: err instanceof Error ? err.message : 'Failed to apply metadata',
    };
  }
}

/**
 * Unlink series from external metadata source
 */
export async function unlinkExternalId(
  seriesId: string,
  source: MetadataSource
): Promise<{ success: boolean; error?: string }> {
  const db = getDatabase();

  try {
    const updateData: Record<string, null> = {};

    if (source === 'comicvine') {
      updateData.comicVineId = null;
    } else if (source === 'metron') {
      updateData.metronId = null;
    }

    await db.series.update({
      where: { id: seriesId },
      data: updateData,
    });

    logger.info({ seriesId, source }, 'Unlinked external ID');

    return { success: true };
  } catch (err) {
    logger.error({ err, seriesId, source }, 'Failed to unlink external ID');
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to unlink',
    };
  }
}

// =============================================================================
// Sync Functions
// =============================================================================

/**
 * Sync series data to series.json file
 */
export async function syncToSeriesJson(seriesId: string): Promise<void> {
  const series = await getSeries(seriesId);

  if (!series || !series.primaryFolder) {
    logger.debug({ seriesId }, 'Cannot sync to series.json - no primary folder');
    return;
  }

  const metadata: SeriesMetadata = {
    seriesName: series.name,
    startYear: series.startYear ?? undefined,
    endYear: series.endYear ?? undefined,
    publisher: series.publisher ?? undefined,
    comicVineSeriesId: series.comicVineId ?? undefined,
    metronSeriesId: series.metronId ?? undefined,
    issueCount: series.issueCount ?? undefined,
    deck: series.deck ?? undefined,
    summary: series.summary ?? undefined,
    coverUrl: series.coverUrl ?? undefined,
    genres: series.genres?.split(',').map((g) => g.trim()) ?? undefined,
    tags: series.tags?.split(',').map((t) => t.trim()) ?? undefined,
    characters: series.characters?.split(',').map((c) => c.trim()) ?? undefined,
    teams: series.teams?.split(',').map((t) => t.trim()) ?? undefined,
    storyArcs: series.storyArcs?.split(',').map((s) => s.trim()) ?? undefined,
    locations: series.locations?.split(',').map((l) => l.trim()) ?? undefined,
    userNotes: series.userNotes ?? undefined,
    volume: series.volume ?? undefined,
    type: series.type as 'western' | 'manga' | undefined,
    ageRating: series.ageRating ?? undefined,
    languageISO: series.languageISO ?? undefined,
    lastUpdated: new Date().toISOString(),
  };

  try {
    await writeSeriesJson(series.primaryFolder, metadata);
    logger.debug({ seriesId, folder: series.primaryFolder }, 'Synced to series.json');
  } catch (err) {
    logger.error({ err, seriesId }, 'Failed to sync to series.json');
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert raw API metadata to SeriesMetadataPayload
 */
function convertRawMetadata(
  raw: Record<string, unknown>,
  source: MetadataSource
): SeriesMetadataPayload {
  const payload: SeriesMetadataPayload = {};

  // Standard fields
  if (raw.seriesName) payload.seriesName = String(raw.seriesName);
  if (raw.publisher) payload.publisher = String(raw.publisher);
  if (raw.startYear) payload.startYear = Number(raw.startYear);
  if (raw.endYear) payload.endYear = Number(raw.endYear);
  if (raw.issueCount) payload.issueCount = Number(raw.issueCount);
  if (raw.description) payload.description = String(raw.description);
  if (raw.deck) payload.deck = String(raw.deck);
  if (raw.coverUrl) payload.coverUrl = String(raw.coverUrl);
  if (raw.seriesType) payload.seriesType = String(raw.seriesType);

  // External IDs
  if (source === 'comicvine' && raw.comicVineSeriesId) {
    payload.comicVineSeriesId = String(raw.comicVineSeriesId);
  }
  if (source === 'metron' && raw.metronSeriesId) {
    payload.metronSeriesId = String(raw.metronSeriesId);
  }

  // Array fields (from extended ComicVine data)
  if (Array.isArray(raw.characters)) {
    payload.characters = raw.characters.map((c) =>
      typeof c === 'object' && c !== null && 'name' in c ? String(c.name) : String(c)
    );
  }
  if (Array.isArray(raw.locations)) {
    payload.locations = raw.locations.map((l) =>
      typeof l === 'object' && l !== null && 'name' in l ? String(l.name) : String(l)
    );
  }
  if (Array.isArray(raw.storyArcs)) {
    payload.storyArcs = raw.storyArcs.map((s) =>
      typeof s === 'object' && s !== null && 'name' in s ? String(s.name) : String(s)
    );
  }
  if (Array.isArray(raw.creators)) {
    payload.creators = raw.creators.map((c) =>
      typeof c === 'object' && c !== null && 'name' in c ? String(c.name) : String(c)
    );
  }
  if (Array.isArray(raw.aliases)) {
    payload.aliases = raw.aliases.map((a) => String(a));
  }

  return payload;
}

/**
 * Format a value for display in preview
 */
function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : null;
  }
  if (typeof value === 'string') {
    return value.trim() || null;
  }
  return String(value);
}
