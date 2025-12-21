/**
 * Series Routes
 *
 * API endpoints for Series management:
 * - Series CRUD operations
 * - Issue listing within series
 * - Cover management
 * - Metadata sync
 * - Field locking
 * - Alias management
 * - Continue reading support
 * - Admin bulk operations
 */

import { Router, Request, Response } from 'express';
import { getDatabase } from '../services/database.service.js';
import {
  createSeries,
  getSeries,
  getSeriesList,
  updateSeries,
  deleteSeries,
  searchSeries,
  getSeriesCover,
  setSeriesCoverFromIssue,
  setSeriesCoverFromUrl,
  lockField,
  unlockField,
  getFieldSources,
  addAlias,
  removeAlias,
  getSeriesProgress,
  getNextUnreadIssue,
  updateSeriesProgress,
  syncSeriesToSeriesJson,
  syncSeriesFromSeriesJson,
  findPotentialDuplicates,
  findPotentialDuplicatesEnhanced,
  mergeSeries,
  mergeSeriesEnhanced,
  previewMerge,
  bulkRelinkFiles,
  getAllPublishers,
  getAllGenres,
  SeriesListOptions,
  type DuplicateConfidence,
} from '../services/series.service.js';
import {
  linkFileToSeries,
  unlinkFileFromSeries,
  suggestSeriesForFile,
  autoLinkAllFiles,
  getFilesNeedingConfirmation,
  confirmNotDuplicate,
} from '../services/series-matcher.service.js';
import {
  inheritMetadataToAllIssues,
  getFilesNeedingInheritance,
} from '../services/series-inheritance.service.js';
import {
  fetchSeriesMetadataById,
  fetchMetadataByExternalId,
  previewMetadataChanges,
  applyMetadataToSeries,
  unlinkExternalId,
  type SeriesMetadataPayload,
} from '../services/series-metadata-fetch.service.js';
import { searchSeries as searchExternalSeries, type MetadataSource } from '../services/metadata-search.service.js';
import { invalidateSeriesData } from '../services/metadata-invalidation.service.js';
import { processExistingFiles } from '../services/scanner.service.js';
import { createServiceLogger } from '../services/logger.service.js';
import {
  sendSuccess,
  sendBadRequest,
  sendNotFound,
  sendInternalError,
  asyncHandler,
} from '../middleware/response.middleware.js';

const router = Router();
const logger = createServiceLogger('series-routes');

// =============================================================================
// Series CRUD
// =============================================================================

/**
 * GET /api/series
 * List series with pagination, filtering, and sorting
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const options: SeriesListOptions = {
    page: parseInt(req.query.page as string) || 1,
    limit: parseInt(req.query.limit as string) || 50,
    sortBy: (req.query.sortBy as SeriesListOptions['sortBy']) || 'name',
    sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'asc',
    search: req.query.search as string | undefined,
    publisher: req.query.publisher as string | undefined,
    type: req.query.type as 'western' | 'manga' | undefined,
    genres: req.query.genres ? (req.query.genres as string).split(',') : undefined,
    hasUnread: req.query.hasUnread ? req.query.hasUnread === 'true' : undefined,
  };

  const result = await getSeriesList(options);

  logger.debug({
    page: options.page,
    limit: options.limit,
    total: result.total,
  }, 'Listed series');

  sendSuccess(res, { series: result.series }, {
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      pages: result.totalPages,
    },
  });
}));

/**
 * GET /api/series/search
 * Quick search for series (for autocomplete)
 */
router.get('/search', asyncHandler(async (req: Request, res: Response) => {
  const query = req.query.q as string;
  const limit = parseInt(req.query.limit as string) || 10;

  if (!query || query.length < 2) {
    sendBadRequest(res, 'Query must be at least 2 characters');
    return;
  }

  const results = await searchSeries(query, limit);
  sendSuccess(res, { series: results });
}));

/**
 * GET /api/series/publishers
 * Get all unique publishers for filtering
 */
router.get('/publishers', asyncHandler(async (_req: Request, res: Response) => {
  const publishers = await getAllPublishers();
  sendSuccess(res, { publishers });
}));

/**
 * GET /api/series/genres
 * Get all unique genres for filtering
 */
router.get('/genres', asyncHandler(async (_req: Request, res: Response) => {
  const genres = await getAllGenres();
  sendSuccess(res, { genres });
}));

/**
 * GET /api/series/duplicates
 * Get potential duplicate series for review
 */
router.get('/duplicates', asyncHandler(async (_req: Request, res: Response) => {
  const duplicates = await findPotentialDuplicates();
  sendSuccess(res, { duplicateGroups: duplicates });
}));

/**
 * GET /api/series/duplicates/enhanced
 * Get potential duplicates with confidence scoring
 */
router.get('/duplicates/enhanced', asyncHandler(async (req: Request, res: Response) => {
  const minConfidence = req.query.minConfidence as DuplicateConfidence | undefined;

  const duplicates = await findPotentialDuplicatesEnhanced();

  // Filter by minimum confidence if specified
  const confidenceOrder: Record<DuplicateConfidence, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  let filtered = duplicates;
  if (minConfidence) {
    const minLevel = confidenceOrder[minConfidence];
    filtered = duplicates.filter((d) => confidenceOrder[d.confidence] <= minLevel);
  }

  sendSuccess(res, {
    duplicateGroups: filtered,
    totalGroups: filtered.length,
    byConfidence: {
      high: filtered.filter((d) => d.confidence === 'high').length,
      medium: filtered.filter((d) => d.confidence === 'medium').length,
      low: filtered.filter((d) => d.confidence === 'low').length,
    },
  });
}));

/**
 * POST /api/series/merge/preview
 * Preview a merge operation without executing it
 */
router.post('/merge/preview', asyncHandler(async (req: Request, res: Response) => {
  const { sourceIds, targetId } = req.body;

  if (!Array.isArray(sourceIds) || !targetId) {
    sendBadRequest(res, 'sourceIds (array) and targetId are required');
    return;
  }

  try {
    const preview = await previewMerge(sourceIds, targetId);
    sendSuccess(res, { preview });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      sendNotFound(res, error.message);
    } else {
      throw error;
    }
  }
}));

/**
 * POST /api/series/confirm-not-duplicate
 * Confirm two series are not duplicates
 */
router.post('/confirm-not-duplicate', asyncHandler(async (req: Request, res: Response) => {
  const { seriesId1, seriesId2 } = req.body;

  if (!seriesId1 || !seriesId2) {
    sendBadRequest(res, 'seriesId1 and seriesId2 are required');
    return;
  }

  await confirmNotDuplicate(seriesId1, seriesId2);
  sendSuccess(res, { message: 'Marked as not duplicates' });
}));

/**
 * POST /api/series
 * Create a new series
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { name, ...rest } = req.body;

  if (!name) {
    sendBadRequest(res, 'Series name is required');
    return;
  }

  try {
    const series = await createSeries({ name, ...rest });
    logger.info({ seriesId: series.id, name }, 'Created series');
    sendSuccess(res, { series }, undefined, 201);
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      sendBadRequest(res, error.message);
    } else {
      throw error;
    }
  }
}));

/**
 * GET /api/series/search-external
 * Search external metadata sources (ComicVine, Metron, GCD) for series
 * Optional source param to limit search to a specific source
 */
router.get('/search-external', asyncHandler(async (req: Request, res: Response) => {
  const query = req.query.q as string;
  const limit = parseInt(req.query.limit as string) || 10;
  const source = req.query.source as string | undefined;

  if (!query || query.length < 2) {
    sendBadRequest(res, 'Query must be at least 2 characters');
    return;
  }

  // Validate source if provided
  const validSources: MetadataSource[] = ['comicvine', 'metron', 'gcd'];
  if (source && !validSources.includes(source as MetadataSource)) {
    sendBadRequest(res, `Invalid source. Must be one of: ${validSources.join(', ')}`);
    return;
  }

  const searchOptions: { limit: number; sources?: MetadataSource[] } = { limit };
  if (source) {
    searchOptions.sources = [source as MetadataSource];
  }

  const results = await searchExternalSeries({ series: query }, searchOptions);
  sendSuccess(res, {
    series: results.series,
    sources: results.sources,
  });
}));

/**
 * GET /api/series/:id
 * Get a single series with issue count
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const series = await getSeries(req.params.id!);

  if (!series) {
    sendNotFound(res, 'Series not found');
    return;
  }

  sendSuccess(res, { series });
}));

/**
 * PATCH /api/series/:id
 * Update a series (respects locked fields)
 */
router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  try {
    const changedFields = Object.keys(req.body);
    const series = await updateSeries(req.params.id!, req.body);
    logger.info({ seriesId: series.id }, 'Updated series');

    // Invalidate related data (sync to series.json, etc.)
    // Determine if we should sync to files based on what fields changed
    const inheritableFields = ['publisher', 'genres', 'ageRating', 'languageISO'];
    const shouldSyncToFiles = changedFields.some((f) => inheritableFields.includes(f));

    await invalidateSeriesData(series.id, {
      syncToSeriesJson: true,
      syncToIssueFiles: shouldSyncToFiles,
      inheritableFields: changedFields.filter((f) => inheritableFields.includes(f)),
    });

    sendSuccess(res, { series });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      sendNotFound(res, error.message);
    } else {
      throw error;
    }
  }
}));

/**
 * DELETE /api/series/:id
 * Delete a series (issues retain their metadata)
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  try {
    await deleteSeries(req.params.id!);
    logger.info({ seriesId: req.params.id }, 'Deleted series');
    sendSuccess(res, { message: 'Series deleted' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      sendNotFound(res, error.message);
    } else {
      throw error;
    }
  }
}));

// =============================================================================
// Issues within Series
// =============================================================================

/**
 * Parse issue number string to a sortable numeric value.
 * Handles formats like: "1", "1.5", "Annual 1", "Special", etc.
 * Returns { numericValue, hasNumber } where numericValue is the parsed number
 * and hasNumber indicates if a number was found.
 */
function parseIssueNumber(numberStr: string | null | undefined): { numericValue: number; hasNumber: boolean } {
  if (!numberStr) {
    return { numericValue: Infinity, hasNumber: false };
  }

  // Try direct number parse first (handles "1", "1.5", "10", etc.)
  const directParse = parseFloat(numberStr);
  if (!isNaN(directParse)) {
    return { numericValue: directParse, hasNumber: true };
  }

  // Try extracting number from string (handles "Annual 1", "Issue #5", etc.)
  const match = numberStr.match(/(\d+(?:\.\d+)?)/);
  if (match && match[1]) {
    return { numericValue: parseFloat(match[1]), hasNumber: true };
  }

  // No number found
  return { numericValue: Infinity, hasNumber: false };
}

/**
 * GET /api/series/:id/issues
 * List issues in a series with pagination
 */
router.get('/:id/issues', asyncHandler(async (req: Request, res: Response) => {
  const db = getDatabase();
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 100;
  const sortBy = (req.query.sortBy as string) || 'number';
  const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'asc';

  // Verify series exists
  const series = await db.series.findUnique({
    where: { id: req.params.id },
  });

  if (!series) {
    sendNotFound(res, 'Series not found');
    return;
  }

  // For number sorting, we need to fetch all and sort in JS due to string vs numeric sorting
  if (sortBy === 'number') {
    // Fetch all issues for this series
    const allIssues = await db.comicFile.findMany({
      where: { seriesId: req.params.id },
      include: {
        metadata: true,
        readingProgress: {
          select: {
            currentPage: true,
            totalPages: true,
            completed: true,
            lastReadAt: true,
          },
        },
      },
    });

    // Sort issues: numeric issues first (by number), then non-numeric (alphabetically by filename)
    const sortedIssues = allIssues.sort((a, b) => {
      const aNum = parseIssueNumber(a.metadata?.number);
      const bNum = parseIssueNumber(b.metadata?.number);

      // Both have numbers - sort numerically
      if (aNum.hasNumber && bNum.hasNumber) {
        const diff = aNum.numericValue - bNum.numericValue;
        return sortOrder === 'asc' ? diff : -diff;
      }

      // One has number, one doesn't - numbered issues come first
      if (aNum.hasNumber !== bNum.hasNumber) {
        return aNum.hasNumber ? -1 : 1;
      }

      // Neither has number - sort alphabetically by filename
      const cmp = a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: 'base' });
      return sortOrder === 'asc' ? cmp : -cmp;
    });

    // Apply pagination
    const total = sortedIssues.length;
    const paginatedIssues = sortedIssues.slice((page - 1) * limit, page * limit);

    sendSuccess(res, { issues: paginatedIssues }, {
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
    return;
  }

  // For other sort fields, use Prisma's ordering
  const orderBy = { [sortBy]: sortOrder };

  const [issues, total] = await Promise.all([
    db.comicFile.findMany({
      where: { seriesId: req.params.id },
      skip: (page - 1) * limit,
      take: limit,
      orderBy,
      include: {
        metadata: true,
        readingProgress: {
          select: {
            currentPage: true,
            totalPages: true,
            completed: true,
            lastReadAt: true,
          },
        },
      },
    }),
    db.comicFile.count({ where: { seriesId: req.params.id } }),
  ]);

  sendSuccess(res, { issues }, {
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}));

/**
 * GET /api/series/:id/next-issue
 * Get next unread issue (for Continue Series feature)
 */
router.get('/:id/next-issue', asyncHandler(async (req: Request, res: Response) => {
  const nextIssue = await getNextUnreadIssue(req.params.id!);

  if (!nextIssue) {
    sendSuccess(res, { nextIssue: null, message: 'No unread issues' });
    return;
  }

  sendSuccess(res, { nextIssue });
}));

/**
 * POST /api/series/:id/continue
 * Get continue reading info (same as next-issue, semantic endpoint)
 */
router.post('/:id/continue', asyncHandler(async (req: Request, res: Response) => {
  const nextIssue = await getNextUnreadIssue(req.params.id!);

  if (!nextIssue) {
    sendSuccess(res, {
      continueReading: null,
      message: 'Series complete or no issues found',
    });
    return;
  }

  sendSuccess(res, {
    continueReading: {
      fileId: nextIssue.id,
      path: nextIssue.path,
    },
  });
}));

// =============================================================================
// Cover Management
// =============================================================================

/**
 * GET /api/series/:id/cover
 * Get series cover with smart fallback
 */
router.get('/:id/cover', asyncHandler(async (req: Request, res: Response) => {
  const cover = await getSeriesCover(req.params.id!);
  sendSuccess(res, { cover });
}));

/**
 * POST /api/series/:id/cover
 * Set series cover from issue, URL, or reset to API cover
 *
 * Supported operations:
 * - { source: 'api' } - Use existing API cover (coverHash must already exist)
 * - { source: 'user', fileId: '...' } - Use cover from an issue
 * - { source: 'user', url: '...' } - Download and use cover from URL
 * - { source: 'auto' } - Reset to automatic fallback
 */
router.post('/:id/cover', asyncHandler(async (req: Request, res: Response) => {
  const { source, fileId, url } = req.body;
  const db = getDatabase();
  const seriesId = req.params.id!;

  // Handle source-based switching
  if (source === 'api') {
    // Switch to API cover mode - verify coverHash exists
    const series = await db.series.findUnique({
      where: { id: seriesId },
      select: { coverHash: true, coverUrl: true },
    });

    if (!series) {
      sendNotFound(res, 'Series not found');
      return;
    }

    if (!series.coverHash && !url) {
      // No existing API cover and no URL provided
      sendBadRequest(res, 'No API cover available. Fetch metadata first to get an API cover.');
      return;
    }

    // If URL provided, download it as new API cover
    if (url) {
      const result = await setSeriesCoverFromUrl(seriesId, url);
      if (!result.success) {
        sendBadRequest(res, result.error || 'Failed to download cover from URL');
        return;
      }
    } else {
      // Just set coverSource to 'api' to use existing coverHash
      await db.series.update({
        where: { id: seriesId },
        data: { coverSource: 'api', coverFileId: null },
      });
    }
  } else if (source === 'user' && fileId) {
    // User selected an issue cover
    await setSeriesCoverFromIssue(seriesId, fileId);
  } else if (source === 'user' && url) {
    // User provided a custom URL - download and use it
    const result = await setSeriesCoverFromUrl(seriesId, url);
    if (!result.success) {
      sendBadRequest(res, result.error || 'Failed to download cover from URL');
      return;
    }
  } else if (source === 'auto') {
    // Reset to automatic fallback
    await db.series.update({
      where: { id: seriesId },
      data: { coverSource: 'auto', coverFileId: null },
    });
  } else if (fileId) {
    // Legacy: just fileId provided (backwards compatibility)
    await setSeriesCoverFromIssue(seriesId, fileId);
  } else if (url) {
    // Legacy: just url provided (backwards compatibility)
    const result = await setSeriesCoverFromUrl(seriesId, url);
    if (!result.success) {
      sendBadRequest(res, result.error || 'Failed to download cover from URL');
      return;
    }
  } else {
    sendBadRequest(res, 'Invalid request. Provide source with fileId/url, or provide fileId/url directly.');
    return;
  }

  const cover = await getSeriesCover(seriesId);
  logger.info({ seriesId, source, fileId: fileId || null, url: url ? '[provided]' : null }, 'Updated series cover');
  sendSuccess(res, { cover });
}));

// =============================================================================
// Metadata Operations
// =============================================================================

/**
 * POST /api/series/:id/sync
 * Sync series to series.json file
 */
router.post('/:id/sync', asyncHandler(async (req: Request, res: Response) => {
  const series = await getSeries(req.params.id!);

  if (!series) {
    sendNotFound(res, 'Series not found');
    return;
  }

  if (!series.primaryFolder) {
    sendBadRequest(res, 'Series has no primary folder set');
    return;
  }

  await syncSeriesToSeriesJson(req.params.id!);
  logger.info({ seriesId: req.params.id }, 'Synced series to series.json');
  sendSuccess(res, { message: 'Series synced to series.json' });
}));

/**
 * POST /api/series/:id/inherit
 * Trigger metadata inheritance to issue files
 */
router.post('/:id/inherit', asyncHandler(async (req: Request, res: Response) => {
  const series = await getSeries(req.params.id!);

  if (!series) {
    sendNotFound(res, 'Series not found');
    return;
  }

  // Check for fields to inherit from request body
  const fields = req.body.fields;

  const result = await inheritMetadataToAllIssues(req.params.id!, fields);
  logger.info({
    seriesId: req.params.id,
    updated: result.updated,
    errors: result.errors,
  }, 'Inherited metadata to issues');

  sendSuccess(res, result);
}));

/**
 * GET /api/series/:id/needs-inheritance
 * Get files that need inheritance update
 */
router.get('/:id/needs-inheritance', asyncHandler(async (req: Request, res: Response) => {
  const fileIds = await getFilesNeedingInheritance(req.params.id!);
  sendSuccess(res, { fileIds, count: fileIds.length });
}));

// =============================================================================
// Field Locking & Sources
// =============================================================================

/**
 * GET /api/series/:id/field-sources
 * Get source info for all fields
 */
router.get('/:id/field-sources', asyncHandler(async (req: Request, res: Response) => {
  try {
    const sources = await getFieldSources(req.params.id!);
    sendSuccess(res, { fieldSources: sources });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      sendNotFound(res, error.message);
    } else {
      throw error;
    }
  }
}));

/**
 * POST /api/series/:id/lock-field
 * Lock a field from auto-updates
 */
router.post('/:id/lock-field', asyncHandler(async (req: Request, res: Response) => {
  const { fieldName } = req.body;

  if (!fieldName) {
    sendBadRequest(res, 'fieldName is required');
    return;
  }

  try {
    await lockField(req.params.id!, fieldName);
    logger.info({ seriesId: req.params.id, fieldName }, 'Locked field');
    sendSuccess(res, { message: `Field "${fieldName}" locked` });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      sendNotFound(res, error.message);
    } else {
      throw error;
    }
  }
}));

/**
 * DELETE /api/series/:id/lock-field
 * Unlock a field for auto-updates
 */
router.delete('/:id/lock-field', asyncHandler(async (req: Request, res: Response) => {
  const fieldName = req.query.fieldName as string;

  if (!fieldName) {
    sendBadRequest(res, 'fieldName query parameter is required');
    return;
  }

  try {
    await unlockField(req.params.id!, fieldName);
    logger.info({ seriesId: req.params.id, fieldName }, 'Unlocked field');
    sendSuccess(res, { message: `Field "${fieldName}" unlocked` });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      sendNotFound(res, error.message);
    } else {
      throw error;
    }
  }
}));

// =============================================================================
// Alias Management
// =============================================================================

/**
 * POST /api/series/:id/aliases
 * Add an alias for fuzzy matching
 */
router.post('/:id/aliases', asyncHandler(async (req: Request, res: Response) => {
  const { alias } = req.body;

  if (!alias) {
    sendBadRequest(res, 'alias is required');
    return;
  }

  try {
    await addAlias(req.params.id!, alias);
    logger.info({ seriesId: req.params.id, alias }, 'Added alias');
    sendSuccess(res, { message: `Alias "${alias}" added` });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      sendNotFound(res, error.message);
    } else {
      throw error;
    }
  }
}));

/**
 * DELETE /api/series/:id/aliases/:alias
 * Remove an alias
 */
router.delete('/:id/aliases/:alias', asyncHandler(async (req: Request, res: Response) => {
  try {
    await removeAlias(req.params.id!, req.params.alias!);
    logger.info({ seriesId: req.params.id, alias: req.params.alias }, 'Removed alias');
    sendSuccess(res, { message: `Alias "${req.params.alias}" removed` });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      sendNotFound(res, error.message);
    } else {
      throw error;
    }
  }
}));

// =============================================================================
// Reading Order
// =============================================================================

/**
 * GET /api/series/:id/reading-order
 * Get custom reading order (or default)
 */
router.get('/:id/reading-order', asyncHandler(async (req: Request, res: Response) => {
  const db = getDatabase();
  const series = await db.series.findUnique({
    where: { id: req.params.id },
    include: {
      issues: {
        orderBy: {
          metadata: { number: 'asc' },
        },
        include: {
          metadata: {
            select: { number: true, title: true },
          },
        },
      },
    },
  });

  if (!series) {
    sendNotFound(res, 'Series not found');
    return;
  }

  const hasCustomOrder = !!series.customReadingOrder;
  let orderedIssues = series.issues;

  if (series.customReadingOrder) {
    const customOrder = JSON.parse(series.customReadingOrder) as string[];
    const issueMap = new Map(series.issues.map((i) => [i.id, i]));
    orderedIssues = customOrder
      .map((id) => issueMap.get(id))
      .filter((i): i is typeof series.issues[0] => i !== undefined);
  }

  sendSuccess(res, {
    hasCustomOrder,
    issues: orderedIssues.map((i) => ({
      fileId: i.id,
      number: i.metadata?.number,
      title: i.metadata?.title,
    })),
  });
}));

/**
 * POST /api/series/:id/reading-order
 * Set custom reading order
 */
router.post('/:id/reading-order', asyncHandler(async (req: Request, res: Response) => {
  const db = getDatabase();
  const { order } = req.body; // Array of fileIds

  if (!Array.isArray(order)) {
    sendBadRequest(res, 'order must be an array of file IDs');
    return;
  }

  await db.series.update({
    where: { id: req.params.id },
    data: {
      customReadingOrder: JSON.stringify(order),
    },
  });

  logger.info({ seriesId: req.params.id }, 'Set custom reading order');
  sendSuccess(res, { message: 'Reading order updated' });
}));

// =============================================================================
// Reader Settings
// =============================================================================

/**
 * GET /api/series/:id/reader-settings
 * Get series reader settings
 */
router.get('/:id/reader-settings', asyncHandler(async (req: Request, res: Response) => {
  const db = getDatabase();
  const settings = await db.seriesReaderSettingsNew.findUnique({
    where: { seriesId: req.params.id },
  });

  sendSuccess(res, { settings: settings || {} });
}));

/**
 * PATCH /api/series/:id/reader-settings
 * Update series reader settings
 */
router.patch('/:id/reader-settings', asyncHandler(async (req: Request, res: Response) => {
  const db = getDatabase();

  const settings = await db.seriesReaderSettingsNew.upsert({
    where: { seriesId: req.params.id },
    create: {
      seriesId: req.params.id!,
      ...req.body,
    },
    update: req.body,
  });

  logger.info({ seriesId: req.params.id }, 'Updated reader settings');
  sendSuccess(res, { settings });
}));

// =============================================================================
// File-Series Linking
// =============================================================================

/**
 * POST /api/files/:fileId/link-series
 * Link a file to a series
 */
router.post('/files/:fileId/link-series', asyncHandler(async (req: Request, res: Response) => {
  const { seriesId } = req.body;

  if (!seriesId) {
    sendBadRequest(res, 'seriesId is required');
    return;
  }

  await linkFileToSeries(req.params.fileId!, seriesId);
  logger.info({ fileId: req.params.fileId, seriesId }, 'Linked file to series');
  sendSuccess(res, { message: 'File linked to series' });
}));

/**
 * DELETE /api/files/:fileId/unlink-series
 * Unlink a file from its series
 */
router.delete('/files/:fileId/unlink-series', asyncHandler(async (req: Request, res: Response) => {
  await unlinkFileFromSeries(req.params.fileId!);
  logger.info({ fileId: req.params.fileId }, 'Unlinked file from series');
  sendSuccess(res, { message: 'File unlinked from series' });
}));

/**
 * GET /api/files/:fileId/suggest-series
 * Get series suggestions for a file
 */
router.get('/files/:fileId/suggest-series', asyncHandler(async (req: Request, res: Response) => {
  const suggestions = await suggestSeriesForFile(req.params.fileId!);
  sendSuccess(res, { suggestions });
}));

// =============================================================================
// External Metadata Fetch
// =============================================================================

/**
 * POST /api/series/:id/fetch-metadata
 * Fetch metadata from external API using stored external ID
 * Returns metadata for preview, does not apply automatically
 */
router.post('/:id/fetch-metadata', asyncHandler(async (req: Request, res: Response) => {
  const seriesId = req.params.id!;

  const result = await fetchSeriesMetadataById(seriesId);

  if (!result.success) {
    if (result.needsSearch) {
      // No external ID - client should show search modal
      sendSuccess(res, {
        needsSearch: true,
        message: result.error,
      });
      return;
    }

    sendBadRequest(res, result.error || 'Failed to fetch metadata');
    return;
  }

  sendSuccess(res, {
    metadata: result.metadata,
    source: result.source,
    externalId: result.externalId,
  });
}));

/**
 * POST /api/series/:id/fetch-metadata-by-id
 * Fetch metadata for a specific external ID (used after search selection)
 */
router.post('/:id/fetch-metadata-by-id', asyncHandler(async (req: Request, res: Response) => {
  const { source, externalId } = req.body as { source?: MetadataSource; externalId?: string };

  if (!source || !externalId) {
    sendBadRequest(res, 'source and externalId are required');
    return;
  }

  const result = await fetchMetadataByExternalId(source, externalId);

  if (!result.success) {
    sendBadRequest(res, result.error || 'Failed to fetch metadata');
    return;
  }

  sendSuccess(res, {
    metadata: result.metadata,
    source: result.source,
    externalId: result.externalId,
  });
}));

/**
 * POST /api/series/:id/preview-metadata
 * Generate a preview of changes comparing current data with API metadata
 */
router.post('/:id/preview-metadata', asyncHandler(async (req: Request, res: Response) => {
  const seriesId = req.params.id!;
  const { metadata, source, externalId } = req.body as {
    metadata?: SeriesMetadataPayload;
    source?: MetadataSource;
    externalId?: string;
  };

  if (!metadata || !source || !externalId) {
    sendBadRequest(res, 'metadata, source, and externalId are required');
    return;
  }

  try {
    const preview = await previewMetadataChanges(seriesId, metadata, source, externalId);
    sendSuccess(res, { preview });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      sendNotFound(res, error.message);
    } else {
      throw error;
    }
  }
}));

/**
 * POST /api/series/:id/apply-metadata
 * Apply selected metadata fields to series
 */
router.post('/:id/apply-metadata', asyncHandler(async (req: Request, res: Response) => {
  const seriesId = req.params.id!;
  const { metadata, source, externalId, fields } = req.body as {
    metadata?: SeriesMetadataPayload;
    source?: MetadataSource;
    externalId?: string | null;
    fields?: string[];
  };

  if (!metadata || !source || !fields || !Array.isArray(fields)) {
    sendBadRequest(res, 'metadata, source, and fields array are required');
    return;
  }

  const result = await applyMetadataToSeries(seriesId, metadata, source, externalId || null, fields);

  if (!result.success) {
    sendBadRequest(res, result.error || 'Failed to apply metadata');
    return;
  }

  logger.info({ seriesId, fieldsUpdated: result.fieldsUpdated }, 'Applied external metadata');
  sendSuccess(res, {
    series: result.series,
    fieldsUpdated: result.fieldsUpdated,
  });
}));

/**
 * DELETE /api/series/:id/external-link
 * Unlink series from external metadata source
 */
router.delete('/:id/external-link', asyncHandler(async (req: Request, res: Response) => {
  const seriesId = req.params.id!;
  const source = req.query.source as MetadataSource;

  if (!source || (source !== 'comicvine' && source !== 'metron')) {
    sendBadRequest(res, 'source query parameter must be "comicvine" or "metron"');
    return;
  }

  const result = await unlinkExternalId(seriesId, source);

  if (!result.success) {
    sendBadRequest(res, result.error || 'Failed to unlink');
    return;
  }

  logger.info({ seriesId, source }, 'Unlinked external metadata source');
  sendSuccess(res, { message: `Unlinked from ${source}` });
}));

// =============================================================================
// Admin Bulk Operations
// =============================================================================

/**
 * POST /api/admin/series/merge
 * Merge multiple series into one (enhanced with alias handling)
 */
router.post('/admin/merge', asyncHandler(async (req: Request, res: Response) => {
  const { sourceIds, targetId } = req.body;

  if (!Array.isArray(sourceIds) || !targetId) {
    sendBadRequest(res, 'sourceIds (array) and targetId are required');
    return;
  }

  const result = await mergeSeriesEnhanced(sourceIds, targetId);

  if (!result.success) {
    if (result.error?.includes('not found')) {
      sendNotFound(res, result.error);
    } else {
      sendBadRequest(res, result.error || 'Merge failed');
    }
    return;
  }

  logger.info({
    sourceIds: result.mergedSourceIds,
    targetId: result.targetSeriesId,
    issuesMoved: result.issuesMoved,
    aliasesAdded: result.aliasesAdded,
  }, 'Merged series');

  sendSuccess(res, { result });
}));

/**
 * POST /api/admin/series/bulk-relink
 * Relink multiple files to a series
 */
router.post('/admin/bulk-relink', asyncHandler(async (req: Request, res: Response) => {
  const { fileIds, seriesId } = req.body;

  if (!Array.isArray(fileIds) || !seriesId) {
    sendBadRequest(res, 'fileIds (array) and seriesId are required');
    return;
  }

  const count = await bulkRelinkFiles(fileIds, seriesId);
  logger.info({ count, seriesId }, 'Bulk relinked files');
  sendSuccess(res, { relinked: count });
}));

/**
 * DELETE /api/admin/series/bulk
 * Bulk delete series
 */
router.delete('/admin/bulk', asyncHandler(async (req: Request, res: Response) => {
  const { seriesIds } = req.body;

  if (!Array.isArray(seriesIds)) {
    sendBadRequest(res, 'seriesIds (array) is required');
    return;
  }

  let deleted = 0;
  for (const id of seriesIds) {
    try {
      await deleteSeries(id);
      deleted++;
    } catch {
      // Skip if not found
    }
  }

  logger.info({ deleted }, 'Bulk deleted series');
  sendSuccess(res, { deleted });
}));

/**
 * POST /api/admin/series/auto-link
 * Auto-link all unlinked files
 */
router.post('/admin/auto-link', asyncHandler(async (req: Request, res: Response) => {
  const result = await autoLinkAllFiles();
  logger.info(result, 'Auto-linked files');
  sendSuccess(res, result);
}));

/**
 * POST /api/admin/series/process-files
 * Process existing files - extract metadata and create/link series
 * This is useful for files that were added before the series system was enabled
 */
router.post('/admin/process-files', asyncHandler(async (req: Request, res: Response) => {
  const { libraryId } = req.body as { libraryId?: string };
  const result = await processExistingFiles(libraryId);
  logger.info(result, 'Processed existing files');
  sendSuccess(res, result);
}));

/**
 * GET /api/admin/series/needs-confirmation
 * Get files that need series confirmation
 */
router.get('/admin/needs-confirmation', asyncHandler(async (_req: Request, res: Response) => {
  const files = await getFilesNeedingConfirmation();
  sendSuccess(res, { files });
}));

export default router;
