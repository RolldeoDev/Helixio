/**
 * Series Merge Service
 *
 * Duplicate detection and merge operations for Series.
 */

import { getDatabase } from '../database.service.js';
import type { Series } from '@prisma/client';
import type {
  DuplicateConfidence,
  DuplicateReason,
  DuplicateGroup,
  SeriesForMerge,
  MergePreview,
  MergeResult,
} from '../../types/series-merge.types.js';

// =============================================================================
// Name Normalization & Similarity
// =============================================================================

/**
 * Normalize a series name for comparison.
 * Removes case, special characters, parentheticals like (2019), and common prefixes.
 */
export function normalizeSeriesName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/^the\s+/i, '') // Remove leading "The"
    .replace(/\s*\d{4}\s*$/g, ''); // Remove trailing year like "2019"
}

/**
 * Calculate Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1, // substitution
          matrix[i]![j - 1]! + 1, // insertion
          matrix[i - 1]![j]! + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length]![a.length]!;
}

/**
 * Calculate similarity score between two series names (0 to 1).
 */
export function calculateNameSimilarity(name1: string, name2: string): number {
  const norm1 = normalizeSeriesName(name1);
  const norm2 = normalizeSeriesName(name2);

  if (norm1 === norm2) return 1;

  const distance = levenshteinDistance(norm1, norm2);
  const maxLength = Math.max(norm1.length, norm2.length);

  if (maxLength === 0) return 1;

  return 1 - distance / maxLength;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert a Series to SeriesForMerge format with issue counts.
 */
async function seriesToMergeFormat(series: Series): Promise<SeriesForMerge> {
  const db = getDatabase();

  const issueCount = await db.comicFile.count({
    where: { seriesId: series.id },
  });

  return {
    id: series.id,
    name: series.name,
    publisher: series.publisher,
    startYear: series.startYear,
    endYear: series.endYear,
    issueCount: series.issueCount,
    ownedIssueCount: issueCount,
    comicVineId: series.comicVineId,
    metronId: series.metronId,
    coverUrl: series.coverUrl,
    coverHash: series.coverHash,
    coverFileId: series.coverFileId,
    aliases: series.aliases,
    summary: series.summary,
    type: series.type,
    createdAt: series.createdAt,
    updatedAt: series.updatedAt,
  };
}

// =============================================================================
// Duplicate Detection
// =============================================================================

/**
 * Get potential duplicate series for review.
 * Excludes soft-deleted series.
 */
export async function findPotentialDuplicates(): Promise<
  Array<{ series: Series[]; reason: string }>
> {
  const db = getDatabase();

  // Find series with same name (exclude soft-deleted)
  const allSeries = await db.series.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
  });

  const duplicateGroups: Array<{ series: Series[]; reason: string }> = [];
  const nameGroups = new Map<string, Series[]>();

  for (const series of allSeries) {
    const normalizedName = series.name.toLowerCase().trim();
    const existing = nameGroups.get(normalizedName);
    if (existing) {
      existing.push(series);
    } else {
      nameGroups.set(normalizedName, [series]);
    }
  }

  for (const [, group] of nameGroups) {
    if (group.length > 1) {
      duplicateGroups.push({
        series: group,
        reason: 'Same name',
      });
    }
  }

  return duplicateGroups;
}

/**
 * Find potential duplicate series with confidence scoring.
 * Uses multiple detection strategies:
 * - HIGH: Same normalized name, same external IDs
 * - MEDIUM: Fuzzy name match, same publisher + similar name
 * Excludes soft-deleted series.
 */
export async function findPotentialDuplicatesEnhanced(): Promise<
  DuplicateGroup[]
> {
  const db = getDatabase();

  const allSeries = await db.series.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
  });

  const duplicateGroups: DuplicateGroup[] = [];
  const processedPairs = new Set<string>();

  // Helper to create a pair key
  const pairKey = (id1: string, id2: string) =>
    [id1, id2].sort().join('|');

  // Build normalized name map
  const nameMap = new Map<string, Series[]>();
  for (const series of allSeries) {
    const normalized = normalizeSeriesName(series.name);
    const existing = nameMap.get(normalized);
    if (existing) {
      existing.push(series);
    } else {
      nameMap.set(normalized, [series]);
    }
  }

  // 1. HIGH: Same normalized name
  for (const [, group] of nameMap) {
    if (group.length > 1) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const s1 = group[i];
          const s2 = group[j];
          if (s1 && s2) {
            const key = pairKey(s1.id, s2.id);
            if (!processedPairs.has(key)) {
              processedPairs.add(key);
            }
          }
        }
      }

      const dupGroup: DuplicateGroup = {
        id: `dup-name-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        series: [], // Will populate below
        confidence: 'high',
        reasons: ['same_name'],
        primaryReason: 'same_name',
      };

      for (const s of group) {
        dupGroup.series.push(await seriesToMergeFormat(s));
      }

      duplicateGroups.push(dupGroup);
    }
  }

  // 2. HIGH: Same ComicVine ID
  const comicVineMap = new Map<string, Series[]>();
  for (const series of allSeries) {
    if (series.comicVineId) {
      const existing = comicVineMap.get(series.comicVineId);
      if (existing) {
        existing.push(series);
      } else {
        comicVineMap.set(series.comicVineId, [series]);
      }
    }
  }

  for (const [, group] of comicVineMap) {
    if (group.length > 1) {
      // Check if already in a group
      const alreadyGrouped = group.every((s) =>
        duplicateGroups.some((dg) => dg.series.some((ds) => ds.id === s.id))
      );

      if (!alreadyGrouped) {
        const dupGroup: DuplicateGroup = {
          id: `dup-cv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          series: [],
          confidence: 'high',
          reasons: ['same_comicvine_id'],
          primaryReason: 'same_comicvine_id',
        };

        for (const s of group) {
          dupGroup.series.push(await seriesToMergeFormat(s));
        }

        duplicateGroups.push(dupGroup);
      } else {
        // Add reason to existing group
        for (const dg of duplicateGroups) {
          if (dg.series.some((ds) => group.some((s) => s.id === ds.id))) {
            if (!dg.reasons.includes('same_comicvine_id')) {
              dg.reasons.push('same_comicvine_id');
            }
          }
        }
      }
    }
  }

  // 3. HIGH: Same Metron ID
  const metronMap = new Map<string, Series[]>();
  for (const series of allSeries) {
    if (series.metronId) {
      const existing = metronMap.get(series.metronId);
      if (existing) {
        existing.push(series);
      } else {
        metronMap.set(series.metronId, [series]);
      }
    }
  }

  for (const [, group] of metronMap) {
    if (group.length > 1) {
      const alreadyGrouped = group.every((s) =>
        duplicateGroups.some((dg) => dg.series.some((ds) => ds.id === s.id))
      );

      if (!alreadyGrouped) {
        const dupGroup: DuplicateGroup = {
          id: `dup-metron-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          series: [],
          confidence: 'high',
          reasons: ['same_metron_id'],
          primaryReason: 'same_metron_id',
        };

        for (const s of group) {
          dupGroup.series.push(await seriesToMergeFormat(s));
        }

        duplicateGroups.push(dupGroup);
      } else {
        for (const dg of duplicateGroups) {
          if (dg.series.some((ds) => group.some((s) => s.id === ds.id))) {
            if (!dg.reasons.includes('same_metron_id')) {
              dg.reasons.push('same_metron_id');
            }
          }
        }
      }
    }
  }

  // 4. MEDIUM: Fuzzy name match (similarity > 0.8 but not exact)
  for (let i = 0; i < allSeries.length; i++) {
    for (let j = i + 1; j < allSeries.length; j++) {
      const s1 = allSeries[i];
      const s2 = allSeries[j];
      if (!s1 || !s2) continue;

      const key = pairKey(s1.id, s2.id);

      if (processedPairs.has(key)) continue;

      const similarity = calculateNameSimilarity(s1.name, s2.name);

      if (similarity >= 0.8 && similarity < 1) {
        processedPairs.add(key);

        // Check if either is already in a group
        const existingGroup = duplicateGroups.find(
          (dg) =>
            dg.series.some((ds) => ds.id === s1.id) ||
            dg.series.some((ds) => ds.id === s2.id)
        );

        if (existingGroup) {
          // Add to existing group
          if (!existingGroup.series.some((ds) => ds.id === s1.id)) {
            existingGroup.series.push(await seriesToMergeFormat(s1));
          }
          if (!existingGroup.series.some((ds) => ds.id === s2.id)) {
            existingGroup.series.push(await seriesToMergeFormat(s2));
          }
          if (!existingGroup.reasons.includes('similar_name')) {
            existingGroup.reasons.push('similar_name');
          }
          // Downgrade confidence if it was high
          if (existingGroup.confidence === 'high') {
            existingGroup.confidence = 'medium';
          }
        } else {
          const dupGroup: DuplicateGroup = {
            id: `dup-fuzzy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            series: [
              await seriesToMergeFormat(s1),
              await seriesToMergeFormat(s2),
            ],
            confidence: 'medium',
            reasons: ['similar_name'],
            primaryReason: 'similar_name',
          };
          duplicateGroups.push(dupGroup);
        }
      }
    }
  }

  // 5. MEDIUM: Same publisher + similar name (similarity > 0.6)
  const publisherMap = new Map<string, Series[]>();
  for (const series of allSeries) {
    if (series.publisher) {
      const existing = publisherMap.get(series.publisher);
      if (existing) {
        existing.push(series);
      } else {
        publisherMap.set(series.publisher, [series]);
      }
    }
  }

  for (const [, group] of publisherMap) {
    if (group.length > 1) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const s1 = group[i];
          const s2 = group[j];
          if (!s1 || !s2) continue;

          const key = pairKey(s1.id, s2.id);

          if (processedPairs.has(key)) continue;

          const similarity = calculateNameSimilarity(s1.name, s2.name);

          if (similarity >= 0.6 && similarity < 0.8) {
            processedPairs.add(key);

            const existingGroup = duplicateGroups.find(
              (dg) =>
                dg.series.some((ds) => ds.id === s1.id) ||
                dg.series.some((ds) => ds.id === s2.id)
            );

            if (existingGroup) {
              if (!existingGroup.series.some((ds) => ds.id === s1.id)) {
                existingGroup.series.push(await seriesToMergeFormat(s1));
              }
              if (!existingGroup.series.some((ds) => ds.id === s2.id)) {
                existingGroup.series.push(await seriesToMergeFormat(s2));
              }
              if (!existingGroup.reasons.includes('same_publisher_similar_name')) {
                existingGroup.reasons.push('same_publisher_similar_name');
              }
            } else {
              const dupGroup: DuplicateGroup = {
                id: `dup-pub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                series: [
                  await seriesToMergeFormat(s1),
                  await seriesToMergeFormat(s2),
                ],
                confidence: 'medium',
                reasons: ['same_publisher_similar_name'],
                primaryReason: 'same_publisher_similar_name',
              };
              duplicateGroups.push(dupGroup);
            }
          }
        }
      }
    }
  }

  // Sort by confidence (high first)
  const confidenceOrder: Record<DuplicateConfidence, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  duplicateGroups.sort(
    (a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]
  );

  return duplicateGroups;
}

// =============================================================================
// Merge Operations
// =============================================================================

/**
 * Preview a merge operation without executing it.
 */
export async function previewMerge(
  sourceIds: string[],
  targetId: string
): Promise<MergePreview> {
  const db = getDatabase();

  // Get target series
  const targetSeries = await db.series.findUnique({
    where: { id: targetId },
  });

  if (!targetSeries) {
    throw new Error(`Target series ${targetId} not found`);
  }

  // Get source series
  const sourceSeries: SeriesForMerge[] = [];
  const warnings: string[] = [];
  let totalSourceIssues = 0;

  for (const sourceId of sourceIds) {
    if (sourceId === targetId) continue;

    const series = await db.series.findUnique({
      where: { id: sourceId },
    });

    if (!series) {
      warnings.push(`Source series ${sourceId} not found`);
      continue;
    }

    const mergeFormat = await seriesToMergeFormat(series);
    sourceSeries.push(mergeFormat);
    totalSourceIssues += mergeFormat.ownedIssueCount;

    // Check for potential issues
    if (series.publisher && targetSeries.publisher && series.publisher !== targetSeries.publisher) {
      warnings.push(
        `"${series.name}" has different publisher (${series.publisher}) than target (${targetSeries.publisher})`
      );
    }
  }

  // Calculate resulting aliases
  const existingAliases = targetSeries.aliases
    ? targetSeries.aliases.split(',').map((a) => a.trim())
    : [];

  const newAliases = sourceSeries
    .map((s) => s.name)
    .filter((name) => name !== targetSeries.name && !existingAliases.includes(name));

  const resultingAliases = [...existingAliases, ...newAliases];

  // Get target issue count
  const targetIssueCount = await db.comicFile.count({
    where: { seriesId: targetId },
  });

  return {
    targetSeries: await seriesToMergeFormat(targetSeries),
    sourceSeries,
    resultingAliases,
    totalIssuesAfterMerge: targetIssueCount + totalSourceIssues,
    warnings,
  };
}

/**
 * Merge multiple series into one.
 * Moves all issues and collection items from source series to target, then deletes sources.
 */
export async function mergeSeries(
  sourceIds: string[],
  targetId: string
): Promise<void> {
  const db = getDatabase();

  // Verify target exists
  const target = await db.series.findUnique({
    where: { id: targetId },
  });

  if (!target) {
    throw new Error(`Target series ${targetId} not found`);
  }

  // Import updateSeriesProgress dynamically to avoid circular dependency
  const { updateSeriesProgress } = await import('./series-progress.service.js');

  // Move all issues and collection items from source series to target
  for (const sourceId of sourceIds) {
    if (sourceId === targetId) continue;

    // Move comic files to target series
    await db.comicFile.updateMany({
      where: { seriesId: sourceId },
      data: { seriesId: targetId },
    });

    // Move collection items to target series (prevents orphaned references)
    // First, get existing collection items for target series per collection
    const targetItems = await db.collectionItem.findMany({
      where: { seriesId: targetId },
      select: { collectionId: true },
    });
    const targetCollectionIds = new Set(targetItems.map((i) => i.collectionId));

    // Update collection items from source to target, but only if target doesn't already have that series in the collection
    const sourceItems = await db.collectionItem.findMany({
      where: { seriesId: sourceId },
    });

    for (const item of sourceItems) {
      if (targetCollectionIds.has(item.collectionId)) {
        // Target series already in this collection - delete the duplicate source item
        await db.collectionItem.delete({
          where: { id: item.id },
        });
      } else {
        // Move item to target series
        await db.collectionItem.update({
          where: { id: item.id },
          data: { seriesId: targetId },
        });
        targetCollectionIds.add(item.collectionId);
      }
    }

    // Move reading progress records to target series
    // First, get existing progress for target series per user
    const targetProgress = await db.seriesProgress.findMany({
      where: { seriesId: targetId },
      select: { userId: true },
    });
    const targetUserIds = new Set(targetProgress.map((p) => p.userId));

    // Delete source progress if user already has target progress, otherwise move it
    const sourceProgress = await db.seriesProgress.findMany({
      where: { seriesId: sourceId },
    });

    for (const progress of sourceProgress) {
      if (targetUserIds.has(progress.userId)) {
        // User already has progress for target - delete duplicate
        await db.seriesProgress.delete({
          where: { id: progress.id },
        });
      } else {
        // Move progress to target series
        await db.seriesProgress.update({
          where: { id: progress.id },
          data: { seriesId: targetId },
        });
        targetUserIds.add(progress.userId);
      }
    }

    // Preserve reader settings: copy from first source that has settings if target has none.
    // If target already has settings, they take precedence (user may have customized them).
    // This intentionally discards source settings when target has existing settings.
    const targetSettings = await db.seriesReaderSettingsNew.findUnique({
      where: { seriesId: targetId },
    });

    if (!targetSettings) {
      // Target has no settings - check if source has settings to preserve
      const sourceSettings = await db.seriesReaderSettingsNew.findUnique({
        where: { seriesId: sourceId },
      });

      if (sourceSettings) {
        // Copy settings to target (exclude id, seriesId, timestamps)
        const { id: _id, seriesId: _seriesId, createdAt: _createdAt, updatedAt: _updatedAt, ...settingsData } = sourceSettings;
        await db.seriesReaderSettingsNew.create({
          data: {
            seriesId: targetId,
            ...settingsData,
          },
        });
      }
    }

    // Delete source reader settings explicitly (prevents cascade issues)
    await db.seriesReaderSettingsNew.deleteMany({
      where: { seriesId: sourceId },
    });

    // Delete source series
    await db.series.delete({
      where: { id: sourceId },
    });
  }

  // Update progress for target series
  await updateSeriesProgress(targetId);
}

/**
 * Merge multiple series into one with enhanced functionality.
 * - Moves all issues from source series to target
 * - Adds source series names as aliases to target
 * - Returns detailed result
 */
export async function mergeSeriesEnhanced(
  sourceIds: string[],
  targetId: string
): Promise<MergeResult> {
  const db = getDatabase();

  // Verify target exists
  const target = await db.series.findUnique({
    where: { id: targetId },
  });

  if (!target) {
    return {
      success: false,
      targetSeriesId: targetId,
      mergedSourceIds: [],
      issuesMoved: 0,
      aliasesAdded: [],
      error: `Target series ${targetId} not found`,
    };
  }

  // Import updateSeriesProgress dynamically to avoid circular dependency
  const { updateSeriesProgress } = await import('./series-progress.service.js');

  const mergedSourceIds: string[] = [];
  const aliasesAdded: string[] = [];
  let totalIssuesMoved = 0;

  // Get existing aliases
  const existingAliases = target.aliases
    ? target.aliases.split(',').map((a) => a.trim())
    : [];

  // Process each source series
  for (const sourceId of sourceIds) {
    if (sourceId === targetId) continue;

    const source = await db.series.findUnique({
      where: { id: sourceId },
    });

    if (!source) continue;

    // Count issues being moved
    const issueCount = await db.comicFile.count({
      where: { seriesId: sourceId },
    });

    // Move all issues from source to target
    await db.comicFile.updateMany({
      where: { seriesId: sourceId },
      data: { seriesId: targetId },
    });

    totalIssuesMoved += issueCount;

    // Add source name as alias if not already present
    if (source.name !== target.name && !existingAliases.includes(source.name)) {
      existingAliases.push(source.name);
      aliasesAdded.push(source.name);
    }

    // Also add any aliases from the source
    if (source.aliases) {
      for (const alias of source.aliases.split(',').map((a) => a.trim())) {
        if (!existingAliases.includes(alias)) {
          existingAliases.push(alias);
          aliasesAdded.push(alias);
        }
      }
    }

    // Preserve reader settings: copy from first source that has settings if target has none.
    // If target already has settings, they take precedence (user may have customized them).
    // This intentionally discards source settings when target has existing settings.
    const targetSettings = await db.seriesReaderSettingsNew.findUnique({
      where: { seriesId: targetId },
    });

    if (!targetSettings) {
      const sourceSettings = await db.seriesReaderSettingsNew.findUnique({
        where: { seriesId: sourceId },
      });

      if (sourceSettings) {
        const { id: _id, seriesId: _seriesId, createdAt: _createdAt, updatedAt: _updatedAt, ...settingsData } = sourceSettings;
        await db.seriesReaderSettingsNew.create({
          data: {
            seriesId: targetId,
            ...settingsData,
          },
        });
      }
    }

    // Delete source reader settings explicitly
    await db.seriesReaderSettingsNew.deleteMany({
      where: { seriesId: sourceId },
    });

    // Delete source series
    await db.series.delete({
      where: { id: sourceId },
    });

    mergedSourceIds.push(sourceId);
  }

  // Update target with new aliases
  if (aliasesAdded.length > 0) {
    await db.series.update({
      where: { id: targetId },
      data: {
        aliases: existingAliases.join(','),
      },
    });
  }

  // Update progress for target series
  await updateSeriesProgress(targetId);

  return {
    success: true,
    targetSeriesId: targetId,
    mergedSourceIds,
    issuesMoved: totalIssuesMoved,
    aliasesAdded,
  };
}

/**
 * Bulk relink files to a series.
 */
export async function bulkRelinkFiles(
  fileIds: string[],
  seriesId: string
): Promise<number> {
  const db = getDatabase();

  // Import updateSeriesProgress dynamically to avoid circular dependency
  const { updateSeriesProgress } = await import('./series-progress.service.js');

  const result = await db.comicFile.updateMany({
    where: {
      id: { in: fileIds },
    },
    data: { seriesId },
  });

  // Update series progress
  await updateSeriesProgress(seriesId);

  return result.count;
}
