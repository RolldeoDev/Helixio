/**
 * Smart Collection Service
 *
 * Handles automatic evaluation and population of smart collections.
 * Smart collections auto-populate based on filter criteria with support for:
 * - Series-level or file-level matching
 * - Whitelist (manual includes that persist)
 * - Blacklist (manual excludes that persist)
 * - Incremental updates on data changes
 * - Full refresh on demand
 */

import { getDatabase } from './database.service.js';
import { createServiceLogger } from './logger.service.js';
import { recalculateCollectionMetadata } from './collection.service.js';

const logger = createServiceLogger('smart-collection');

// =============================================================================
// Types (matching SmartFilterContext structure)
// =============================================================================

export type FilterOperator = 'AND' | 'OR';

export type FilterField =
  | 'filename'
  | 'series'
  | 'title'
  | 'number'
  | 'volume'
  | 'year'
  | 'publisher'
  | 'writer'
  | 'penciller'
  | 'genre'
  | 'characters'
  | 'teams'
  | 'locations'
  | 'storyArc'
  | 'status'
  | 'path'
  // Smart collection fields
  | 'readStatus'
  | 'dateAdded'
  | 'lastReadAt'
  | 'rating'
  | 'pageCount'
  | 'fileSize'
  | 'libraryId'
  // External rating fields
  | 'externalRating'    // Any external rating (max across sources)
  | 'communityRating'   // Community ratings only (max across sources)
  | 'criticRating'      // Critic ratings only (max across sources)
  // Additional metadata fields
  | 'imprint'           // Publisher sub-brand (Vertigo, MAX, etc.)
  | 'ageRating'         // Content rating
  | 'format'            // Issue/TPB/Omnibus/etc.
  | 'language'          // Language code (maps to languageISO)
  | 'inker'             // Inker creator role
  | 'colorist'          // Colorist creator role
  | 'letterer'          // Letterer creator role
  | 'editor'            // Editor creator role
  | 'count';            // Total issues in series

export type FilterComparison =
  | 'contains'
  | 'not_contains'
  | 'equals'
  | 'not_equals'
  | 'starts_with'
  | 'ends_with'
  | 'is_empty'
  | 'is_not_empty'
  | 'greater_than'
  | 'less_than'
  | 'between'
  // New comparisons for dates
  | 'within_days'
  | 'before'
  | 'after';

export interface FilterCondition {
  id: string;
  field: FilterField;
  comparison: FilterComparison;
  value: string;
  value2?: string; // For 'between' comparison
}

export interface FilterGroup {
  id: string;
  operator: FilterOperator;
  conditions: FilterCondition[];
}

export interface SmartFilter {
  id: string;
  name?: string;
  rootOperator: FilterOperator;
  groups: FilterGroup[];
  // Sorting options
  sortBy?: SortField;
  sortOrder?: SortOrder;
}

// Sorting types for smart collections
export type SortField =
  | 'name'
  | 'title'
  | 'year'
  | 'dateAdded'
  | 'lastReadAt'
  | 'number'
  | 'publisher'
  | 'rating'
  | 'externalRating';

export type SortOrder = 'asc' | 'desc';

export type SmartScope = 'series' | 'files';

interface SmartCollectionInfo {
  id: string;
  userId: string;
  smartScope: SmartScope;
  filterDefinition: SmartFilter;
}

// =============================================================================
// Filter Evaluation
// =============================================================================

/**
 * Evaluate a single condition against an item
 */
function evaluateCondition(
  condition: FilterCondition,
  item: Record<string, unknown>,
  scope: SmartScope
): boolean {
  const { field, comparison, value, value2 } = condition;

  // Get the field value from the item
  let fieldValue: unknown;

  // Handle field mapping based on scope
  if (scope === 'series') {
    fieldValue = getSeriesFieldValue(item, field);
  } else {
    fieldValue = getFileFieldValue(item, field);
  }

  // Convert to string/number for comparison
  const stringValue = fieldValue?.toString()?.toLowerCase() ?? '';
  const numericValue = typeof fieldValue === 'number' ? fieldValue : parseFloat(stringValue);
  const compareValue = value?.toLowerCase() ?? '';
  const compareValue2 = value2?.toLowerCase() ?? '';

  switch (comparison) {
    case 'contains':
      return stringValue.includes(compareValue);
    case 'not_contains':
      return !stringValue.includes(compareValue);
    case 'equals':
      return stringValue === compareValue;
    case 'not_equals':
      return stringValue !== compareValue;
    case 'starts_with':
      return stringValue.startsWith(compareValue);
    case 'ends_with':
      return stringValue.endsWith(compareValue);
    case 'is_empty':
      return fieldValue === null || fieldValue === undefined || stringValue === '';
    case 'is_not_empty':
      return fieldValue !== null && fieldValue !== undefined && stringValue !== '';
    case 'greater_than': {
      const compareNum = parseFloat(compareValue);
      if (isNaN(numericValue) || isNaN(compareNum)) return false;
      return numericValue > compareNum;
    }
    case 'less_than': {
      const compareNum = parseFloat(compareValue);
      if (isNaN(numericValue) || isNaN(compareNum)) return false;
      return numericValue < compareNum;
    }
    case 'between': {
      const minNum = parseFloat(compareValue);
      const maxNum = parseFloat(compareValue2);
      if (isNaN(numericValue) || isNaN(minNum) || isNaN(maxNum)) return false;
      return numericValue >= minNum && numericValue <= maxNum;
    }
    case 'within_days': {
      // For date fields - check if within N days of now
      const dateValue = fieldValue instanceof Date ? fieldValue : new Date(String(fieldValue));
      if (isNaN(dateValue.getTime())) return false;
      const daysNum = parseInt(value ?? '0', 10);
      if (isNaN(daysNum)) return false;
      const now = new Date();
      const daysAgo = new Date(now.getTime() - daysNum * 24 * 60 * 60 * 1000);
      return dateValue >= daysAgo;
    }
    case 'before': {
      const dateValue = fieldValue instanceof Date ? fieldValue : new Date(String(fieldValue));
      if (isNaN(dateValue.getTime())) return false;
      // Use original value for date parsing to preserve proper formatting
      const compareDate = new Date(value ?? '');
      if (isNaN(compareDate.getTime())) return false;
      return dateValue < compareDate;
    }
    case 'after': {
      const dateValue = fieldValue instanceof Date ? fieldValue : new Date(String(fieldValue));
      if (isNaN(dateValue.getTime())) return false;
      // Use original value for date parsing to preserve proper formatting
      const compareDate = new Date(value ?? '');
      if (isNaN(compareDate.getTime())) return false;
      return dateValue > compareDate;
    }
    default:
      return false;
  }
}

/**
 * Get field value from a series record
 */
function getSeriesFieldValue(series: Record<string, unknown>, field: FilterField): unknown {
  switch (field) {
    case 'series':
      return series.name;
    case 'publisher':
      return series.publisher;
    case 'year':
      return series.startYear;
    case 'genre':
      return series.genres;
    case 'writer':
      return series.writer;
    case 'penciller':
      return series.penciller;
    case 'characters':
      return series.characters;
    case 'teams':
      return series.teams;
    case 'locations':
      return series.locations;
    case 'storyArc':
      return series.storyArcs;
    case 'dateAdded':
      return series.createdAt;
    case 'libraryId':
      // Series don't have libraryId directly, need to check via files
      return null;
    case 'readStatus':
      // Derived from progress
      return series.readStatus;
    case 'lastReadAt':
      return series.lastReadAt;
    case 'rating':
      return series.rating;
    case 'externalRating':
      // Max of all external ratings (normalized to 0-10)
      return series.externalRatingMax;
    case 'communityRating':
      // Max of community ratings only
      return series.communityRatingMax;
    case 'criticRating':
      // Max of critic ratings only
      return series.criticRatingMax;
    // Additional metadata fields
    case 'imprint':
      return null; // Series doesn't have imprint directly
    case 'ageRating':
      return series.ageRating;
    case 'format':
      return null; // Series doesn't have format directly
    case 'language':
      return series.languageISO;
    case 'inker':
      return series.inker;
    case 'colorist':
      return series.colorist;
    case 'letterer':
      return series.letterer;
    case 'editor':
      return series.editor;
    case 'count':
      return series.issueCount;
    default:
      return series[field];
  }
}

/**
 * Get field value from a file record (with metadata)
 */
function getFileFieldValue(file: Record<string, unknown>, field: FilterField): unknown {
  const metadata = file.metadata as Record<string, unknown> | null;

  switch (field) {
    case 'filename':
      return file.filename;
    case 'path':
      return file.relativePath;
    case 'series':
      return metadata?.series;
    case 'title':
      return metadata?.title;
    case 'number':
      return metadata?.number;
    case 'volume':
      return metadata?.volume;
    case 'year':
      return metadata?.year;
    case 'publisher':
      return metadata?.publisher;
    case 'writer':
      return metadata?.writer;
    case 'penciller':
      return metadata?.penciller;
    case 'genre':
      return metadata?.genre;
    case 'characters':
      return metadata?.characters;
    case 'teams':
      return metadata?.teams;
    case 'locations':
      return metadata?.locations;
    case 'storyArc':
      return metadata?.storyArc;
    case 'status':
      return file.status;
    case 'pageCount':
      return metadata?.pageCount;
    case 'fileSize':
      return file.size;
    case 'libraryId':
      return file.libraryId;
    case 'dateAdded':
      return file.createdAt;
    case 'readStatus':
      // Derived from progress
      return file.readStatus;
    case 'lastReadAt':
      return file.lastReadAt;
    case 'rating':
      return file.rating;
    // Additional metadata fields
    case 'imprint':
      return metadata?.imprint;
    case 'ageRating':
      return metadata?.ageRating;
    case 'format':
      return metadata?.format;
    case 'language':
      return metadata?.languageISO;
    case 'inker':
      return metadata?.inker;
    case 'colorist':
      return metadata?.colorist;
    case 'letterer':
      return metadata?.letterer;
    case 'editor':
      return metadata?.editor;
    case 'count':
      return metadata?.count;
    // External ratings for files
    case 'externalRating':
      return file.externalRatingMax;
    case 'communityRating':
      return file.communityRatingMax;
    case 'criticRating':
      return file.criticRatingMax;
    default:
      return metadata?.[field] ?? file[field];
  }
}

/**
 * Evaluate a filter group (AND/OR of conditions)
 */
function evaluateGroup(
  group: FilterGroup,
  item: Record<string, unknown>,
  scope: SmartScope
): boolean {
  if (group.conditions.length === 0) {
    return true; // Empty group matches all
  }

  if (group.operator === 'AND') {
    return group.conditions.every((condition) => evaluateCondition(condition, item, scope));
  } else {
    return group.conditions.some((condition) => evaluateCondition(condition, item, scope));
  }
}

/**
 * Evaluate a complete filter against an item
 */
function evaluateFilter(
  filter: SmartFilter,
  item: Record<string, unknown>,
  scope: SmartScope
): boolean {
  if (filter.groups.length === 0) {
    return true; // Empty filter matches all
  }

  if (filter.rootOperator === 'AND') {
    return filter.groups.every((group) => evaluateGroup(group, item, scope));
  } else {
    return filter.groups.some((group) => evaluateGroup(group, item, scope));
  }
}

// =============================================================================
// Smart Collection Operations
// =============================================================================

/**
 * Get all smart collections for a user
 */
export async function getSmartCollections(userId: string): Promise<SmartCollectionInfo[]> {
  const db = getDatabase();

  // Get smart collections that have either embedded filter or linked preset
  const collections = await db.collection.findMany({
    where: {
      userId,
      isSmart: true,
      OR: [
        { filterDefinition: { not: null } },
        { filterPresetId: { not: null } },
      ],
    },
    select: {
      id: true,
      userId: true,
      smartScope: true,
      filterDefinition: true,
      filterPresetId: true,
      filterPreset: {
        select: {
          filterDefinition: true,
        },
      },
    },
  });

  return collections
    .filter((c) => c.smartScope && (c.filterDefinition || c.filterPreset?.filterDefinition))
    .map((c) => {
      // Resolve filter from preset or embedded definition
      const filterJson = c.filterPreset?.filterDefinition || c.filterDefinition!;
      return {
        id: c.id,
        userId: c.userId,
        smartScope: c.smartScope as SmartScope,
        filterDefinition: JSON.parse(filterJson) as SmartFilter,
      };
    });
}

/**
 * Evaluate a single smart collection and update its items
 * This is a full refresh - evaluates all items against the filter
 */
export async function refreshSmartCollection(
  collectionId: string,
  userId: string
): Promise<{ added: number; removed: number }> {
  const db = getDatabase();

  // Get the collection with its filter (include linked preset if any)
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    include: {
      items: true,
      filterPreset: true, // Include linked preset
    },
  });

  if (!collection || collection.userId !== userId || !collection.isSmart) {
    throw new Error('Smart collection not found');
  }

  // Resolve filter from preset or embedded definition
  let filter: SmartFilter;
  let scope: SmartScope;

  if (collection.filterPresetId && collection.filterPreset) {
    // Using linked preset
    filter = JSON.parse(collection.filterPreset.filterDefinition) as SmartFilter;
    scope = (collection.smartScope || 'series') as SmartScope;
  } else if (collection.filterDefinition && collection.smartScope) {
    // Using embedded filter
    filter = JSON.parse(collection.filterDefinition) as SmartFilter;
    scope = collection.smartScope as SmartScope;
  } else {
    throw new Error('Smart collection has no filter definition');
  }

  // Get current items (for whitelist/blacklist tracking)
  const currentItems = collection.items;
  const whitelistedIds = new Set(
    currentItems.filter((i) => i.isWhitelisted).map((i) => i.seriesId || i.fileId)
  );
  const blacklistedIds = new Set(
    currentItems.filter((i) => i.isBlacklisted).map((i) => i.seriesId || i.fileId)
  );

  let matchingIds: Set<string>;

  if (scope === 'series') {
    // Get all series with reading progress, user data, and external ratings
    const series = await db.series.findMany({
      where: { deletedAt: null, isHidden: false },
      include: {
        progress: {
          where: { userId },
          take: 1,
        },
        userData: {
          where: { userId },
          take: 1,
        },
        externalRatings: true,
      },
    });

    // Evaluate filter against each series
    matchingIds = new Set(
      series
        .filter((s) => {
          // Augment series with progress data and user data
          const progress = s.progress[0];
          const userData = s.userData[0];

          // Compute max external ratings
          const externalRatings = s.externalRatings || [];
          const communityRatings = externalRatings.filter((r) => r.ratingType === 'community');
          const criticRatings = externalRatings.filter((r) => r.ratingType === 'critic');

          const externalRatingMax = externalRatings.length > 0
            ? Math.max(...externalRatings.map((r) => r.ratingValue))
            : null;
          const communityRatingMax = communityRatings.length > 0
            ? Math.max(...communityRatings.map((r) => r.ratingValue))
            : null;
          const criticRatingMax = criticRatings.length > 0
            ? Math.max(...criticRatings.map((r) => r.ratingValue))
            : null;

          const augmentedSeries = {
            ...s,
            readStatus: progress
              ? progress.totalRead === progress.totalOwned
                ? 'completed'
                : progress.totalRead > 0
                  ? 'reading'
                  : 'unread'
              : 'unread',
            lastReadAt: progress?.lastReadAt,
            rating: userData?.rating,
            externalRatingMax,
            communityRatingMax,
            criticRatingMax,
          };
          return evaluateFilter(filter, augmentedSeries as unknown as Record<string, unknown>, scope);
        })
        .map((s) => s.id)
    );
  } else {
    // Get all files with metadata, reading progress, and external ratings
    const files = await db.comicFile.findMany({
      where: { status: 'indexed' },
      include: {
        metadata: true,
        userReadingProgress: {
          where: { userId },
          take: 1,
        },
        externalRatings: true,
      },
    });

    // Evaluate filter against each file
    matchingIds = new Set(
      files
        .filter((f) => {
          const progress = f.userReadingProgress[0];

          // Compute max external ratings for files
          const externalRatings = f.externalRatings || [];
          const communityRatings = externalRatings.filter((r) => r.ratingType === 'community');
          const criticRatings = externalRatings.filter((r) => r.ratingType === 'critic');

          const externalRatingMax = externalRatings.length > 0
            ? Math.max(...externalRatings.map((r) => r.ratingValue))
            : null;
          const communityRatingMax = communityRatings.length > 0
            ? Math.max(...communityRatings.map((r) => r.ratingValue))
            : null;
          const criticRatingMax = criticRatings.length > 0
            ? Math.max(...criticRatings.map((r) => r.ratingValue))
            : null;

          const augmentedFile = {
            ...f,
            readStatus: progress
              ? progress.completed
                ? 'completed'
                : progress.currentPage > 0
                  ? 'reading'
                  : 'unread'
              : 'unread',
            lastReadAt: progress?.lastReadAt,
            rating: progress?.rating,
            externalRatingMax,
            communityRatingMax,
            criticRatingMax,
          };
          return evaluateFilter(filter, augmentedFile as unknown as Record<string, unknown>, scope);
        })
        .map((f) => f.id)
    );
  }

  // Add whitelisted items that aren't in matching set
  Array.from(whitelistedIds).forEach((id) => {
    if (id) matchingIds.add(id);
  });

  // Remove blacklisted items
  Array.from(blacklistedIds).forEach((id) => {
    if (id) matchingIds.delete(id);
  });

  // Calculate items to add and remove
  const currentItemIds = new Set(currentItems.map((i) => i.seriesId || i.fileId));
  const toAdd = Array.from(matchingIds).filter((id) => id && !currentItemIds.has(id));
  const toRemove = currentItems.filter((i) => {
    const itemId = i.seriesId || i.fileId;
    // Don't remove whitelisted items
    if (i.isWhitelisted) return false;
    // Remove if not in matching set
    return itemId && !matchingIds.has(itemId);
  });

  // Perform database updates in transaction
  await db.$transaction(async (tx) => {
    // Remove items that no longer match (except whitelisted)
    if (toRemove.length > 0) {
      await tx.collectionItem.deleteMany({
        where: {
          id: { in: toRemove.map((i) => i.id) },
        },
      });
    }

    // Add new matching items
    const maxPosition = currentItems.length > 0
      ? Math.max(...currentItems.map((i) => i.position))
      : -1;

    for (let i = 0; i < toAdd.length; i++) {
      const itemId = toAdd[i];
      if (scope === 'series') {
        await tx.collectionItem.create({
          data: {
            collectionId,
            seriesId: itemId,
            position: maxPosition + 1 + i,
            isWhitelisted: false,
            isBlacklisted: false,
          },
        });
      } else {
        await tx.collectionItem.create({
          data: {
            collectionId,
            fileId: itemId,
            position: maxPosition + 1 + i,
            isWhitelisted: false,
            isBlacklisted: false,
          },
        });
      }
    }

    // Update lastEvaluatedAt
    await tx.collection.update({
      where: { id: collectionId },
      data: { lastEvaluatedAt: new Date() },
    });
  });

  logger.info(`Refreshed smart collection ${collectionId}: added ${toAdd.length}, removed ${toRemove.length}`);

  // Recalculate collection metadata from children if items changed
  if (toAdd.length > 0 || toRemove.length > 0) {
    recalculateCollectionMetadata(collectionId, userId).catch((err) => {
      logger.error(`Failed to recalculate metadata for collection ${collectionId}:`, err);
    });
  }

  return { added: toAdd.length, removed: toRemove.length };
}

/**
 * Evaluate changed items against all smart collections
 * Called when items are added, modified, or have reading progress updated
 */
export async function evaluateChangedItems(
  userId: string,
  changedSeriesIds: string[],
  changedFileIds: string[]
): Promise<void> {
  const db = getDatabase();

  // Get all smart collections for this user
  const smartCollections = await getSmartCollections(userId);

  if (smartCollections.length === 0) {
    return;
  }

  // Process series-scoped collections
  if (changedSeriesIds.length > 0) {
    const seriesCollections = smartCollections.filter((c) => c.smartScope === 'series');

    if (seriesCollections.length > 0) {
      // Get the changed series with progress and user data
      const changedSeries = await db.series.findMany({
        where: { id: { in: changedSeriesIds } },
        include: {
          progress: {
            where: { userId },
            take: 1,
          },
          userData: {
            where: { userId },
            take: 1,
          },
        },
      });

      for (const collection of seriesCollections) {
        await evaluateSeriesAgainstCollection(collection, changedSeries, userId);
      }
    }
  }

  // Process file-scoped collections
  if (changedFileIds.length > 0) {
    const fileCollections = smartCollections.filter((c) => c.smartScope === 'files');

    if (fileCollections.length > 0) {
      // Get the changed files with metadata, progress, and external ratings
      const changedFiles = await db.comicFile.findMany({
        where: { id: { in: changedFileIds } },
        include: {
          metadata: true,
          userReadingProgress: {
            where: { userId },
            take: 1,
          },
          externalRatings: true,
        },
      });

      for (const collection of fileCollections) {
        await evaluateFilesAgainstCollection(collection, changedFiles, userId);
      }
    }
  }
}

/**
 * Evaluate series against a single smart collection
 */
async function evaluateSeriesAgainstCollection(
  collection: SmartCollectionInfo,
  series: Array<{
    id: string;
    progress: Array<{ totalRead: number; totalOwned: number; lastReadAt: Date | null }>;
    userData: Array<{ rating: number | null }>;
    [key: string]: unknown;
  }>,
  userId: string
): Promise<void> {
  const db = getDatabase();

  // Get current collection items for these series
  const existingItems = await db.collectionItem.findMany({
    where: {
      collectionId: collection.id,
      seriesId: { in: series.map((s) => s.id) },
    },
  });

  const existingMap = new Map(existingItems.map((i) => [i.seriesId, i]));

  let itemsChanged = false;

  for (const s of series) {
    const existing = existingMap.get(s.id);
    const progress = s.progress[0];
    const userData = s.userData[0];

    // Augment series with read status and user data
    const augmentedSeries = {
      ...s,
      readStatus: progress
        ? progress.totalRead === progress.totalOwned
          ? 'completed'
          : progress.totalRead > 0
            ? 'reading'
            : 'unread'
        : 'unread',
      lastReadAt: progress?.lastReadAt,
      rating: userData?.rating,
    };

    const matches = evaluateFilter(
      collection.filterDefinition,
      augmentedSeries as unknown as Record<string, unknown>,
      'series'
    );

    if (matches && !existing) {
      // Add to collection
      const maxPosition = await db.collectionItem.aggregate({
        where: { collectionId: collection.id },
        _max: { position: true },
      });

      await db.collectionItem.create({
        data: {
          collectionId: collection.id,
          seriesId: s.id,
          position: (maxPosition._max.position ?? -1) + 1,
        },
      });

      itemsChanged = true;
      logger.debug(`Added series ${s.id} to smart collection ${collection.id}`);
    } else if (!matches && existing && !existing.isWhitelisted) {
      // Remove from collection (unless whitelisted)
      await db.collectionItem.delete({
        where: { id: existing.id },
      });

      itemsChanged = true;
      logger.debug(`Removed series ${s.id} from smart collection ${collection.id}`);
    }
  }

  // Update lastEvaluatedAt
  await db.collection.update({
    where: { id: collection.id },
    data: { lastEvaluatedAt: new Date() },
  });

  // Recalculate collection metadata from children if items changed
  if (itemsChanged) {
    recalculateCollectionMetadata(collection.id, userId).catch((err) => {
      logger.error(`Failed to recalculate metadata for collection ${collection.id}:`, err);
    });
  }
}

/**
 * Evaluate files against a single smart collection
 */
async function evaluateFilesAgainstCollection(
  collection: SmartCollectionInfo,
  files: Array<{
    id: string;
    metadata: { [key: string]: unknown } | null;
    userReadingProgress: Array<{ completed: boolean; currentPage: number; lastReadAt: Date | null; rating: number | null }>;
    externalRatings?: Array<{ ratingType: string; ratingValue: number }>;
    [key: string]: unknown;
  }>,
  userId: string
): Promise<void> {
  const db = getDatabase();

  // Get current collection items for these files
  const existingItems = await db.collectionItem.findMany({
    where: {
      collectionId: collection.id,
      fileId: { in: files.map((f) => f.id) },
    },
  });

  const existingMap = new Map(existingItems.map((i) => [i.fileId, i]));

  let itemsChanged = false;

  for (const f of files) {
    const existing = existingMap.get(f.id);
    const progress = f.userReadingProgress[0];

    // Compute max external ratings for files
    const externalRatings = f.externalRatings || [];
    const communityRatings = externalRatings.filter((r) => r.ratingType === 'community');
    const criticRatings = externalRatings.filter((r) => r.ratingType === 'critic');

    const externalRatingMax = externalRatings.length > 0
      ? Math.max(...externalRatings.map((r) => r.ratingValue))
      : null;
    const communityRatingMax = communityRatings.length > 0
      ? Math.max(...communityRatings.map((r) => r.ratingValue))
      : null;
    const criticRatingMax = criticRatings.length > 0
      ? Math.max(...criticRatings.map((r) => r.ratingValue))
      : null;

    // Augment file with read status and external ratings
    const augmentedFile = {
      ...f,
      readStatus: progress
        ? progress.completed
          ? 'completed'
          : progress.currentPage > 0
            ? 'reading'
            : 'unread'
        : 'unread',
      lastReadAt: progress?.lastReadAt,
      rating: progress?.rating,
      externalRatingMax,
      communityRatingMax,
      criticRatingMax,
    };

    const matches = evaluateFilter(
      collection.filterDefinition,
      augmentedFile as unknown as Record<string, unknown>,
      'files'
    );

    if (matches && !existing) {
      // Add to collection
      const maxPosition = await db.collectionItem.aggregate({
        where: { collectionId: collection.id },
        _max: { position: true },
      });

      await db.collectionItem.create({
        data: {
          collectionId: collection.id,
          fileId: f.id,
          position: (maxPosition._max.position ?? -1) + 1,
        },
      });

      itemsChanged = true;
      logger.debug(`Added file ${f.id} to smart collection ${collection.id}`);
    } else if (!matches && existing && !existing.isWhitelisted) {
      // Remove from collection (unless whitelisted)
      await db.collectionItem.delete({
        where: { id: existing.id },
      });

      itemsChanged = true;
      logger.debug(`Removed file ${f.id} from smart collection ${collection.id}`);
    }
  }

  // Update lastEvaluatedAt
  await db.collection.update({
    where: { id: collection.id },
    data: { lastEvaluatedAt: new Date() },
  });

  // Recalculate collection metadata from children if items changed
  if (itemsChanged) {
    recalculateCollectionMetadata(collection.id, userId).catch((err) => {
      logger.error(`Failed to recalculate metadata for collection ${collection.id}:`, err);
    });
  }
}

/**
 * Toggle whitelist status for an item in a smart collection
 */
export async function toggleWhitelist(
  collectionId: string,
  userId: string,
  seriesId?: string,
  fileId?: string
): Promise<boolean> {
  const db = getDatabase();

  // Verify collection ownership and smart status
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
  });

  if (!collection || collection.userId !== userId || !collection.isSmart) {
    throw new Error('Smart collection not found');
  }

  // Find or create the item
  const whereClause = seriesId
    ? { collectionId_seriesId: { collectionId, seriesId } }
    : { collectionId_fileId: { collectionId, fileId: fileId! } };

  const existing = await db.collectionItem.findUnique({
    where: whereClause,
  });

  if (existing) {
    // Toggle whitelist
    const newValue = !existing.isWhitelisted;
    await db.collectionItem.update({
      where: { id: existing.id },
      data: {
        isWhitelisted: newValue,
        // Clear blacklist if whitelisting
        isBlacklisted: newValue ? false : existing.isBlacklisted,
      },
    });
    return newValue;
  } else {
    // Create as whitelisted
    const maxPosition = await db.collectionItem.aggregate({
      where: { collectionId },
      _max: { position: true },
    });

    await db.collectionItem.create({
      data: {
        collectionId,
        seriesId,
        fileId,
        position: (maxPosition._max.position ?? -1) + 1,
        isWhitelisted: true,
      },
    });
    return true;
  }
}

/**
 * Toggle blacklist status for an item in a smart collection
 */
export async function toggleBlacklist(
  collectionId: string,
  userId: string,
  seriesId?: string,
  fileId?: string
): Promise<boolean> {
  const db = getDatabase();

  // Verify collection ownership and smart status
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
  });

  if (!collection || collection.userId !== userId || !collection.isSmart) {
    throw new Error('Smart collection not found');
  }

  // Find the item
  const whereClause = seriesId
    ? { collectionId_seriesId: { collectionId, seriesId } }
    : { collectionId_fileId: { collectionId, fileId: fileId! } };

  const existing = await db.collectionItem.findUnique({
    where: whereClause,
  });

  if (existing) {
    const newValue = !existing.isBlacklisted;
    await db.collectionItem.update({
      where: { id: existing.id },
      data: {
        isBlacklisted: newValue,
        // Clear whitelist if blacklisting
        isWhitelisted: newValue ? false : existing.isWhitelisted,
      },
    });
    return newValue;
  } else {
    // Create as blacklisted (item not in collection, but excluded)
    const maxPosition = await db.collectionItem.aggregate({
      where: { collectionId },
      _max: { position: true },
    });

    await db.collectionItem.create({
      data: {
        collectionId,
        seriesId,
        fileId,
        position: (maxPosition._max.position ?? -1) + 1,
        isBlacklisted: true,
      },
    });
    return true;
  }
}

/**
 * Update smart collection filter definition
 */
export async function updateSmartFilter(
  collectionId: string,
  userId: string,
  filter: SmartFilter,
  scope: SmartScope
): Promise<void> {
  const db = getDatabase();

  // Verify collection ownership
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
  });

  if (!collection || collection.userId !== userId) {
    throw new Error('Collection not found');
  }

  await db.collection.update({
    where: { id: collectionId },
    data: {
      isSmart: true,
      smartScope: scope,
      filterDefinition: JSON.stringify(filter),
    },
  });

  logger.info(`Updated smart filter for collection ${collectionId}`);
}

/**
 * Convert a regular collection to a smart collection
 */
export async function convertToSmartCollection(
  collectionId: string,
  userId: string,
  filter: SmartFilter,
  scope: SmartScope
): Promise<{ added: number; removed: number }> {
  await updateSmartFilter(collectionId, userId, filter, scope);
  return refreshSmartCollection(collectionId, userId);
}

/**
 * Convert a smart collection back to a regular collection
 * Keeps current items but removes smart criteria
 */
export async function convertToRegularCollection(
  collectionId: string,
  userId: string
): Promise<void> {
  const db = getDatabase();

  // Verify collection ownership
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
  });

  if (!collection || collection.userId !== userId) {
    throw new Error('Collection not found');
  }

  await db.$transaction(async (tx) => {
    // Clear whitelist/blacklist flags from all items
    await tx.collectionItem.updateMany({
      where: { collectionId },
      data: {
        isWhitelisted: false,
        isBlacklisted: false,
      },
    });

    // Remove smart properties from collection
    await tx.collection.update({
      where: { id: collectionId },
      data: {
        isSmart: false,
        smartScope: null,
        filterDefinition: null,
        lastEvaluatedAt: null,
      },
    });
  });

  logger.info(`Converted smart collection ${collectionId} to regular collection`);
}

/**
 * Get whitelist and blacklist items for a smart collection
 */
export async function getSmartCollectionOverrides(
  collectionId: string,
  userId: string
): Promise<{
  whitelist: Array<{ seriesId?: string; fileId?: string }>;
  blacklist: Array<{ seriesId?: string; fileId?: string }>;
}> {
  const db = getDatabase();

  // Verify collection ownership
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
  });

  if (!collection || collection.userId !== userId || !collection.isSmart) {
    throw new Error('Smart collection not found');
  }

  const items = await db.collectionItem.findMany({
    where: {
      collectionId,
      OR: [{ isWhitelisted: true }, { isBlacklisted: true }],
    },
    select: {
      seriesId: true,
      fileId: true,
      isWhitelisted: true,
      isBlacklisted: true,
    },
  });

  return {
    whitelist: items
      .filter((i) => i.isWhitelisted)
      .map((i) => ({ seriesId: i.seriesId ?? undefined, fileId: i.fileId ?? undefined })),
    blacklist: items
      .filter((i) => i.isBlacklisted)
      .map((i) => ({ seriesId: i.seriesId ?? undefined, fileId: i.fileId ?? undefined })),
  };
}
