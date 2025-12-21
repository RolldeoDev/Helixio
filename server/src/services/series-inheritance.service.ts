/**
 * Series Inheritance Service
 *
 * Handles metadata inheritance from Series to issue ComicInfo.xml files.
 * Part of the Series-Centric Architecture.
 *
 * Design Principles (from SERIES_REWRITE.md):
 * - Full metadata inheritance: Series data flows DOWN to each issue's ComicInfo.xml
 * - User edits are sacred: Don't overwrite user-edited fields
 * - ComicInfo.xml is source of truth for portability
 */

import { getDatabase } from './database.service.js';
import { getSeries } from './series.service.js';
import { ComicInfo, mergeComicInfo, readComicInfo } from './comicinfo.service.js';
import { createServiceLogger } from './logger.service.js';
import { markDirtyForMetadataChange } from './stats-dirty.service.js';
import { triggerDirtyStatsProcessing } from './stats-scheduler.service.js';

const logger = createServiceLogger('series-inheritance');

// =============================================================================
// Types
// =============================================================================

export interface InheritanceResult {
  success: boolean;
  fileId: string;
  filename: string;
  updated: boolean;
  fieldsInherited: string[];
  error?: string;
}

export interface BatchInheritanceResult {
  seriesId: string;
  seriesName: string;
  totalFiles: number;
  updated: number;
  skipped: number;
  errors: number;
  results: InheritanceResult[];
}

export interface InheritableFields {
  publisher: boolean;
  genres: boolean;
  tags: boolean;
  characters: boolean;
  teams: boolean;
  locations: boolean;
  storyArcs: boolean;
  ageRating: boolean;
  languageISO: boolean;
  summary: boolean; // Only if issue has no summary
}

const DEFAULT_INHERITABLE_FIELDS: InheritableFields = {
  publisher: true,
  genres: true,
  tags: true,
  characters: true,
  teams: true,
  locations: true,
  storyArcs: true,
  ageRating: true,
  languageISO: true,
  summary: false, // Don't inherit summary by default (issue summaries should be unique)
};

// =============================================================================
// Core Inheritance Functions
// =============================================================================

/**
 * Inherit series metadata to a single issue's ComicInfo.xml.
 */
export async function inheritMetadataToIssue(
  fileId: string,
  fields: InheritableFields = DEFAULT_INHERITABLE_FIELDS
): Promise<InheritanceResult> {
  const db = getDatabase();

  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    include: {
      series: true,
      metadata: true,
    },
  });

  if (!file) {
    return {
      success: false,
      fileId,
      filename: 'unknown',
      updated: false,
      fieldsInherited: [],
      error: 'File not found',
    };
  }

  if (!file.series) {
    return {
      success: false,
      fileId,
      filename: file.filename,
      updated: false,
      fieldsInherited: [],
      error: 'File is not linked to a series',
    };
  }

  const series = file.series;
  const fieldsInherited: string[] = [];

  // Build the update object from series data
  const updates: Partial<ComicInfo> = {};

  // Series name and year are always set
  updates.Series = series.name;
  fieldsInherited.push('Series');

  if (series.startYear) {
    updates.Year = series.startYear;
    fieldsInherited.push('Year');
  }

  if (series.volume) {
    updates.Volume = series.volume;
    fieldsInherited.push('Volume');
  }

  // Conditional inheritance based on fields config
  if (fields.publisher && series.publisher) {
    updates.Publisher = series.publisher;
    fieldsInherited.push('Publisher');
  }

  if (fields.genres && series.genres) {
    updates.Genre = series.genres;
    fieldsInherited.push('Genre');
  }

  if (fields.tags && series.tags) {
    updates.Tags = series.tags;
    fieldsInherited.push('Tags');
  }

  if (fields.characters && series.characters) {
    updates.Characters = series.characters;
    fieldsInherited.push('Characters');
  }

  if (fields.teams && series.teams) {
    updates.Teams = series.teams;
    fieldsInherited.push('Teams');
  }

  if (fields.locations && series.locations) {
    updates.Locations = series.locations;
    fieldsInherited.push('Locations');
  }

  if (fields.storyArcs && series.storyArcs) {
    updates.StoryArc = series.storyArcs;
    fieldsInherited.push('StoryArc');
  }

  if (fields.ageRating && series.ageRating) {
    updates.AgeRating = series.ageRating;
    fieldsInherited.push('AgeRating');
  }

  if (fields.languageISO && series.languageISO) {
    updates.LanguageISO = series.languageISO;
    fieldsInherited.push('LanguageISO');
  }

  // Only inherit summary if the issue doesn't have one and field is enabled
  if (fields.summary && series.summary) {
    const existingComicInfo = await readComicInfo(file.path);
    if (existingComicInfo.success && !existingComicInfo.comicInfo?.Summary) {
      updates.Summary = series.summary;
      fieldsInherited.push('Summary');
    }
  }

  // Set Manga flag if series is manga
  if (series.type === 'manga') {
    updates.Manga = 'YesAndRightToLeft';
    fieldsInherited.push('Manga');
  }

  // Write to ComicInfo.xml
  try {
    const result = await mergeComicInfo(file.path, updates);

    if (result.success) {
      // Update FileMetadata to track inheritance
      await db.fileMetadata.update({
        where: { comicId: fileId },
        data: {
          seriesInherited: true,
          lastInheritedAt: new Date(),
          seriesSource: 'api', // Indicates series-level data
          // Update cached fields
          series: series.name,
          publisher: series.publisher ?? file.metadata?.publisher,
          year: series.startYear ?? file.metadata?.year,
          genre: fields.genres ? series.genres : file.metadata?.genre,
          tags: fields.tags ? series.tags : file.metadata?.tags,
          characters: fields.characters ? series.characters : file.metadata?.characters,
          teams: fields.teams ? series.teams : file.metadata?.teams,
          locations: fields.locations ? series.locations : file.metadata?.locations,
          ageRating: fields.ageRating ? series.ageRating : file.metadata?.ageRating,
          languageISO: fields.languageISO ? series.languageISO : file.metadata?.languageISO,
        },
      });

      // Mark stats as dirty for recalculation
      await markDirtyForMetadataChange(fileId);

      logger.info(
        { fileId, filename: file.filename, fieldsInherited },
        'Inherited metadata to issue'
      );

      return {
        success: true,
        fileId,
        filename: file.filename,
        updated: true,
        fieldsInherited,
      };
    } else {
      return {
        success: false,
        fileId,
        filename: file.filename,
        updated: false,
        fieldsInherited: [],
        error: result.error,
      };
    }
  } catch (err) {
    return {
      success: false,
      fileId,
      filename: file.filename,
      updated: false,
      fieldsInherited: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Inherit series metadata to all issues in a series.
 */
export async function inheritMetadataToAllIssues(
  seriesId: string,
  fields: InheritableFields = DEFAULT_INHERITABLE_FIELDS
): Promise<BatchInheritanceResult> {
  const db = getDatabase();

  const series = await getSeries(seriesId);
  if (!series) {
    return {
      seriesId,
      seriesName: 'Unknown',
      totalFiles: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      results: [],
    };
  }

  const issues = await db.comicFile.findMany({
    where: { seriesId },
    select: { id: true },
  });

  const results: InheritanceResult[] = [];
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const issue of issues) {
    const result = await inheritMetadataToIssue(issue.id, fields);
    results.push(result);

    if (result.success && result.updated) {
      updated++;
    } else if (result.success && !result.updated) {
      skipped++;
    } else {
      errors++;
    }
  }

  logger.info(
    { seriesId, seriesName: series.name, totalFiles: issues.length, updated, skipped, errors },
    'Completed batch inheritance'
  );

  // Trigger immediate stats recalculation if any files were updated
  if (updated > 0) {
    triggerDirtyStatsProcessing().catch((err) => {
      logger.error({ err }, 'Failed to trigger stats processing after inheritance');
    });
  }

  return {
    seriesId,
    seriesName: series.name,
    totalFiles: issues.length,
    updated,
    skipped,
    errors,
    results,
  };
}

/**
 * Check if a file needs inheritance update.
 * Returns true if the file hasn't been inherited from since the series was updated.
 */
export async function needsInheritanceUpdate(fileId: string): Promise<boolean> {
  const db = getDatabase();

  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    include: {
      series: true,
      metadata: true,
    },
  });

  if (!file || !file.series) {
    return false;
  }

  // If never inherited, needs update
  if (!file.metadata?.seriesInherited || !file.metadata.lastInheritedAt) {
    return true;
  }

  // If series updated after last inheritance, needs update
  return file.series.updatedAt > file.metadata.lastInheritedAt;
}

/**
 * Get files in a series that need inheritance update.
 */
export async function getFilesNeedingInheritance(seriesId: string): Promise<string[]> {
  const db = getDatabase();

  const series = await db.series.findUnique({
    where: { id: seriesId },
    include: {
      issues: {
        include: {
          metadata: true,
        },
      },
    },
  });

  if (!series) {
    return [];
  }

  const needsUpdate: string[] = [];

  for (const issue of series.issues) {
    // If never inherited, needs update
    if (!issue.metadata?.seriesInherited || !issue.metadata.lastInheritedAt) {
      needsUpdate.push(issue.id);
      continue;
    }

    // If series updated after last inheritance, needs update
    if (series.updatedAt > issue.metadata.lastInheritedAt) {
      needsUpdate.push(issue.id);
    }
  }

  return needsUpdate;
}

// =============================================================================
// Selective Inheritance
// =============================================================================

/**
 * Inherit only specific fields to an issue.
 */
export async function inheritSpecificFields(
  fileId: string,
  fieldNames: (keyof InheritableFields)[]
): Promise<InheritanceResult> {
  const fields: InheritableFields = {
    publisher: false,
    genres: false,
    tags: false,
    characters: false,
    teams: false,
    locations: false,
    storyArcs: false,
    ageRating: false,
    languageISO: false,
    summary: false,
  };

  for (const fieldName of fieldNames) {
    fields[fieldName] = true;
  }

  return inheritMetadataToIssue(fileId, fields);
}

/**
 * Preview what would be inherited without making changes.
 */
export async function previewInheritance(
  fileId: string,
  fields: InheritableFields = DEFAULT_INHERITABLE_FIELDS
): Promise<{
  wouldInherit: Partial<ComicInfo>;
  currentValues: Partial<ComicInfo>;
  changes: string[];
}> {
  const db = getDatabase();

  const file = await db.comicFile.findUnique({
    where: { id: fileId },
    include: {
      series: true,
      metadata: true,
    },
  });

  if (!file || !file.series) {
    return {
      wouldInherit: {},
      currentValues: {},
      changes: [],
    };
  }

  const series = file.series;
  const wouldInherit: Partial<ComicInfo> = {};
  const changes: string[] = [];

  // Read current ComicInfo
  const currentResult = await readComicInfo(file.path);
  const currentValues = currentResult.comicInfo || {};

  // Series name and year
  if (series.name && series.name !== currentValues.Series) {
    wouldInherit.Series = series.name;
    changes.push(`Series: "${currentValues.Series || ''}" → "${series.name}"`);
  }

  if (series.startYear && series.startYear !== currentValues.Year) {
    wouldInherit.Year = series.startYear;
    changes.push(`Year: ${currentValues.Year || 'none'} → ${series.startYear}`);
  }

  if (fields.publisher && series.publisher && series.publisher !== currentValues.Publisher) {
    wouldInherit.Publisher = series.publisher;
    changes.push(`Publisher: "${currentValues.Publisher || ''}" → "${series.publisher}"`);
  }

  if (fields.genres && series.genres && series.genres !== currentValues.Genre) {
    wouldInherit.Genre = series.genres;
    changes.push(`Genre: "${currentValues.Genre || ''}" → "${series.genres}"`);
  }

  if (fields.tags && series.tags && series.tags !== currentValues.Tags) {
    wouldInherit.Tags = series.tags;
    changes.push(`Tags: "${currentValues.Tags || ''}" → "${series.tags}"`);
  }

  // Add other fields similarly...

  return {
    wouldInherit,
    currentValues,
    changes,
  };
}

// =============================================================================
// Revert Inheritance
// =============================================================================

/**
 * Mark a file as manually edited (prevents future auto-inheritance).
 */
export async function markAsManuallyEdited(fileId: string): Promise<void> {
  const db = getDatabase();

  await db.fileMetadata.update({
    where: { comicId: fileId },
    data: {
      seriesSource: 'manual',
    },
  });
}

/**
 * Clear inheritance tracking for a file (allows re-inheritance).
 */
export async function clearInheritanceTracking(fileId: string): Promise<void> {
  const db = getDatabase();

  await db.fileMetadata.update({
    where: { comicId: fileId },
    data: {
      seriesInherited: false,
      lastInheritedAt: null,
      seriesSource: 'comicinfo',
    },
  });
}
