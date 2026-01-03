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
import multer from 'multer';
import { getDatabase } from '../services/database.service.js';
import { optionalAuth, requireAuth } from '../middleware/auth.middleware.js';
import { cachePresets } from '../middleware/cache.middleware.js';
import {
  createSeries,
  getSeries,
  getSeriesList,
  getSeriesBrowseList,
  getUnifiedGridItems,
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
  getDeletedSeries,
  restoreSeries,
  toggleSeriesHidden,
  setSeriesHidden,
  getHiddenSeries,
  bulkSetSeriesHidden,
  bulkUpdateSeries,
  bulkMarkSeriesRead,
  bulkMarkSeriesUnread,
  findEmptySeries,
  cleanupEmptySeries,
  SeriesListOptions,
  type UnifiedGridOptions,
  type DuplicateConfidence,
  type BulkSeriesUpdateInput,
  type SeriesBrowseOptions,
} from '../services/series/index.js';
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
  addChildSeries,
  removeChildSeries,
  getSeriesRelationships,
  reorderChildSeries,
  updateRelationshipType,
  bulkAddChildSeries,
  type RelationshipType,
} from '../services/series-relationship.service.js';
import {
  fetchSeriesMetadataById,
  fetchMetadataByExternalId,
  previewMetadataChanges,
  applyMetadataToSeries,
  unlinkExternalId,
  type SeriesMetadataPayload,
} from '../services/series-metadata-fetch.service.js';
import { searchSeries as searchExternalSeries, type MetadataSource, type LibraryType } from '../services/metadata-search.service.js';
import {
  invalidateSeriesData,
  findMismatchedSeriesFiles,
  repairSeriesLinkages,
  syncFileMetadataToSeries,
  batchSyncFileMetadataToSeries,
} from '../services/metadata-invalidation.service.js';
import {
  aggregateCreatorRolesFromIssues,
  aggregateCreatorsFromLocalIssues,
  creatorsToJson,
  creatorsToRoleFields,
  hasAnyCreators,
} from '../services/creator-aggregation.service.js';
import { processExistingFiles } from '../services/scanner.service.js';
import { onSeriesCoverChanged } from '../services/collection/index.js';
import { createServiceLogger } from '../services/logger.service.js';
import { getSimilarSeriesRecommendations } from '../services/recommendation-engine.service.js';
import { getCachedSimilarSeries, setCachedSimilarSeries } from '../services/recommendation-cache.service.js';
import { markSmartCollectionsDirty } from '../services/smart-collection-dirty.service.js';
import {
  sendSuccess,
  sendBadRequest,
  sendNotFound,
  sendInternalError,
  asyncHandler,
} from '../middleware/response.middleware.js';

const router = Router();
const logger = createServiceLogger('series-routes');

// Configure multer for image uploads
const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
  ) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (validTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPG, PNG, WebP, GIF) are allowed'));
    }
  },
});

// =============================================================================
// Series CRUD
// =============================================================================

/**
 * GET /api/series
 * List series with pagination, filtering, and sorting
 */
router.get('/', optionalAuth, asyncHandler(async (req: Request, res: Response) => {
  const fetchAll = req.query.all === 'true';
  const options: SeriesListOptions = {
    page: fetchAll ? 1 : (parseInt(req.query.page as string) || 1),
    limit: fetchAll ? undefined : (parseInt(req.query.limit as string) || 50),
    sortBy: (req.query.sortBy as SeriesListOptions['sortBy']) || 'name',
    sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'asc',
    search: req.query.search as string | undefined,
    publisher: req.query.publisher as string | undefined,
    type: req.query.type as 'western' | 'manga' | undefined,
    genres: req.query.genres ? (req.query.genres as string).split(',') : undefined,
    hasUnread: req.query.hasUnread ? req.query.hasUnread === 'true' : undefined,
    libraryId: req.query.libraryId as string | undefined,
    includeHidden: req.query.includeHidden === 'true' ? true : undefined,
    userId: req.user?.id,  // Filter progress by current user
  };

  const result = await getSeriesList(options);

  logger.debug({
    page: options.page,
    limit: options.limit,
    total: result.total,
    fetchAll,
  }, 'Listed series');

  // Transform progress arrays to single objects for backward compatibility
  // When filtered by userId, progress is an array with 0 or 1 elements
  const transformedSeries = result.series.map((s) => ({
    ...s,
    progress: Array.isArray(s.progress) ? s.progress[0] ?? null : s.progress,
  }));

  sendSuccess(res, { series: transformedSeries }, {
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      pages: result.totalPages,
    },
  });
}));

/**
 * GET /api/series/grid
 * Get unified grid items (series + promoted collections) with filtering and sorting.
 * Requires authentication to get user-specific promoted collections.
 */
router.get('/grid', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    sendBadRequest(res, 'User ID required');
    return;
  }

  const fetchAll = req.query.all === 'true';
  const options: UnifiedGridOptions = {
    page: fetchAll ? 1 : (parseInt(req.query.page as string) || 1),
    limit: fetchAll ? undefined : (parseInt(req.query.limit as string) || 50),
    sortBy: (req.query.sortBy as SeriesListOptions['sortBy']) || 'name',
    sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'asc',
    search: req.query.search as string | undefined,
    publisher: req.query.publisher as string | undefined,
    type: req.query.type as 'western' | 'manga' | undefined,
    genres: req.query.genres ? (req.query.genres as string).split(',') : undefined,
    hasUnread: req.query.hasUnread ? req.query.hasUnread === 'true' : undefined,
    libraryId: req.query.libraryId as string | undefined,
    userId,
    includePromotedCollections: req.query.includePromotedCollections !== 'false', // Default true
    includeHidden: req.query.includeHidden === 'true' ? true : undefined,
  };

  const result = await getUnifiedGridItems(options);

  logger.debug({
    page: options.page,
    limit: options.limit,
    total: result.total,
    fetchAll,
    includeCollections: options.includePromotedCollections,
  }, 'Listed unified grid items');

  sendSuccess(res, { items: result.items }, {
    pagination: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      pages: result.totalPages,
    },
  });
}));

/**
 * GET /api/series/browse
 * Cursor-based paginated series list for infinite scroll.
 * Optimized for large datasets (5000+ series) with minimal payload.
 */
router.get('/browse', optionalAuth, asyncHandler(async (req: Request, res: Response) => {
  const options: SeriesBrowseOptions = {
    cursor: req.query.cursor as string | undefined,
    limit: Math.min(parseInt(req.query.limit as string) || 100, 200),
    sortBy: (req.query.sortBy as SeriesBrowseOptions['sortBy']) || 'name',
    sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'asc',
    libraryId: req.query.libraryId as string | undefined,
    userId: req.user?.id,
    // Filter options
    search: req.query.search as string | undefined,
    publisher: req.query.publisher as string | undefined,
    type: (req.query.type as 'western' | 'manga') || undefined,
    genres: req.query.genres ? (req.query.genres as string).split(',') : undefined,
    readStatus: (req.query.readStatus as 'unread' | 'reading' | 'completed') || undefined,
  };

  const result = await getSeriesBrowseList(options);

  logger.debug({
    cursor: options.cursor ? '[cursor]' : undefined,
    limit: options.limit,
    hasMore: result.hasMore,
    itemCount: result.items.length,
    totalCount: result.totalCount,
  }, 'Browse series');

  sendSuccess(res, result);
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
router.get('/publishers', cachePresets.static, asyncHandler(async (_req: Request, res: Response) => {
  const publishers = await getAllPublishers();
  sendSuccess(res, { publishers });
}));

/**
 * GET /api/series/genres
 * Get all unique genres for filtering
 */
router.get('/genres', cachePresets.static, asyncHandler(async (_req: Request, res: Response) => {
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
 * Search external metadata sources for series
 * Optional source param to limit search to a specific source
 * Optional libraryType param to prioritize sources (manga prioritizes AniList/MAL)
 */
router.get('/search-external', asyncHandler(async (req: Request, res: Response) => {
  const query = req.query.q as string;
  const limit = parseInt(req.query.limit as string) || 10;
  const offset = parseInt(req.query.offset as string) || 0;
  const source = req.query.source as string | undefined;
  const libraryType = req.query.libraryType as LibraryType | undefined;

  if (!query || query.length < 2) {
    sendBadRequest(res, 'Query must be at least 2 characters');
    return;
  }

  // Validate source if provided - includes all metadata sources
  const validSources: MetadataSource[] = ['comicvine', 'metron', 'gcd', 'anilist', 'mal'];
  if (source && !validSources.includes(source as MetadataSource)) {
    sendBadRequest(res, `Invalid source. Must be one of: ${validSources.join(', ')}`);
    return;
  }

  const searchOptions: { limit: number; offset: number; sources?: MetadataSource[]; libraryType?: LibraryType } = { limit, offset };
  if (source) {
    searchOptions.sources = [source as MetadataSource];
  }
  if (libraryType) {
    searchOptions.libraryType = libraryType;
  }

  const results = await searchExternalSeries({ series: query }, searchOptions);
  sendSuccess(res, {
    series: results.series,
    sources: results.sources,
    pagination: results.pagination,
  });
}));

/**
 * GET /api/series/:id
 * Get a single series with issue count and progress
 */
router.get('/:id', optionalAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const series = await getSeries(req.params.id!, { userId });

  if (!series) {
    sendNotFound(res, 'Series not found');
    return;
  }

  // Transform progress array to single object for backward compatibility
  // When filtered by userId, progress is an array with 0 or 1 elements
  const transformedSeries = {
    ...series,
    progress: Array.isArray(series.progress) ? series.progress[0] ?? null : series.progress,
  };

  sendSuccess(res, { series: transformedSeries });
}));

/**
 * GET /api/series/:id/similar
 * Get similar series recommendations
 *
 * Query params:
 * - limit (optional): Number of similar series (default: 10)
 * - userId (optional): User ID to exclude already-read series
 * - noCache (optional): Skip cache if 'true'
 */
router.get('/:id/similar', optionalAuth, asyncHandler(async (req: Request, res: Response) => {
  const seriesId = req.params.id!;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
  const userId = req.query.userId as string | undefined ?? req.user?.id;
  const noCache = req.query.noCache === 'true';

  // Check cache first
  if (!noCache) {
    const cached = getCachedSimilarSeries(seriesId, userId);
    if (cached) {
      return sendSuccess(res, { similar: cached, cached: true });
    }
  }

  try {
    // Get similar series
    const similar = await getSimilarSeriesRecommendations(seriesId, limit, userId);

    // Cache the results
    setCachedSimilarSeries(seriesId, userId, similar);

    sendSuccess(res, { similar, cached: false });
  } catch (error) {
    logger.error({ error, seriesId }, 'Failed to get similar series');
    // Return empty results instead of 500 error - similarity data may not exist yet
    sendSuccess(res, { similar: [], cached: false });
  }
}));

/**
 * PATCH /api/series/:id
 * Update a series (respects locked fields)
 */
router.patch('/:id', asyncHandler(async (req: Request, res: Response) => {
  try {
    const changedFields = Object.keys(req.body);
    const series = await updateSeries(req.params.id!, req.body);
    logger.info({ seriesId: series.id, changedFields, primaryFolder: series.primaryFolder }, 'Updated series');

    // Invalidate related data (sync to series.json, etc.)
    // Determine if we should sync to files based on what fields changed
    const inheritableFields = ['publisher', 'genres', 'ageRating', 'languageISO'];
    const shouldSyncToFiles = changedFields.some((f) => inheritableFields.includes(f));

    const invalidationResult = await invalidateSeriesData(series.id, {
      syncToSeriesJson: true,
      syncToIssueFiles: shouldSyncToFiles,
      inheritableFields: changedFields.filter((f) => inheritableFields.includes(f)),
    });

    if (invalidationResult.seriesJsonSynced) {
      logger.info({ seriesId: series.id }, 'Successfully synced series.json after edit');
    } else if (invalidationResult.errors && invalidationResult.errors.length > 0) {
      logger.warn({ seriesId: series.id, errors: invalidationResult.errors }, 'Errors during series.json sync');
    } else if (!series.primaryFolder) {
      logger.debug({ seriesId: series.id }, 'Skipped series.json sync - no primaryFolder');
    }

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
 * GET /api/series/:id/issues
 * List issues in a series with pagination
 */
router.get('/:id/issues', optionalAuth, asyncHandler(async (req: Request, res: Response) => {
  const db = getDatabase();
  const fetchAll = req.query.all === 'true';
  const page = fetchAll ? 1 : (parseInt(req.query.page as string) || 1);
  const limit = fetchAll ? undefined : (parseInt(req.query.limit as string) || 100);
  const sortBy = (req.query.sortBy as string) || 'number';
  const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'asc';
  const userId = req.user?.id;

  // Verify series exists
  const series = await db.series.findUnique({
    where: { id: req.params.id },
  });

  if (!series) {
    sendNotFound(res, 'Series not found');
    return;
  }

  // Build userReadingProgress include - only filter by userId if authenticated
  const userProgressInclude = userId ? {
    userReadingProgress: {
      where: { userId },
      select: {
        currentPage: true,
        totalPages: true,
        completed: true,
        lastReadAt: true,
      },
    },
  } : {};

  // Helper to transform userReadingProgress array to readingProgress single object for backward compatibility
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transformIssueProgress = (issue: any) => {
    const progress = issue.userReadingProgress?.[0] ?? null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { userReadingProgress, ...rest } = issue;
    return { ...rest, readingProgress: progress };
  };

  // For number sorting, use issueNumberSort column for proper numeric ordering
  if (sortBy === 'number') {
    const [issuesRaw, total] = await Promise.all([
      db.comicFile.findMany({
        where: { seriesId: req.params.id },
        ...(fetchAll ? {} : { skip: (page - 1) * limit!, take: limit! }),
        orderBy: [
          // Primary: numeric sort key (nulls sort to end)
          { metadata: { issueNumberSort: { sort: sortOrder, nulls: 'last' } } },
          // Secondary: filename for ties and null values
          { filename: sortOrder },
        ],
        include: {
          metadata: true,
          ...userProgressInclude,
        },
      }),
      db.comicFile.count({ where: { seriesId: req.params.id } }),
    ]);

    // Transform userReadingProgress to readingProgress for backward compatibility
    const issues = userId ? issuesRaw.map(transformIssueProgress) : issuesRaw;

    sendSuccess(res, { issues }, {
      pagination: {
        page,
        limit: limit || total,
        total,
        pages: limit ? Math.ceil(total / limit) : 1,
      },
    });
    return;
  }

  // For other sort fields, use Prisma's ordering
  const orderBy = { [sortBy]: sortOrder };

  // If fetchAll, get all issues; otherwise paginate
  if (fetchAll) {
    const [issuesRaw, total] = await Promise.all([
      db.comicFile.findMany({
        where: { seriesId: req.params.id },
        orderBy,
        include: {
          metadata: true,
          ...userProgressInclude,
        },
      }),
      db.comicFile.count({ where: { seriesId: req.params.id } }),
    ]);

    // Transform userReadingProgress to readingProgress for backward compatibility
    const issues = userId ? issuesRaw.map(transformIssueProgress) : issuesRaw;

    sendSuccess(res, { issues }, {
      pagination: {
        page: 1,
        limit: total,
        total,
        pages: 1,
      },
    });
    return;
  }

  const [issuesRaw, total] = await Promise.all([
    db.comicFile.findMany({
      where: { seriesId: req.params.id },
      skip: (page - 1) * (limit || 100),
      take: limit || 100,
      orderBy,
      include: {
        metadata: true,
        ...userProgressInclude,
      },
    }),
    db.comicFile.count({ where: { seriesId: req.params.id } }),
  ]);

  // Transform userReadingProgress to readingProgress for backward compatibility
  const issues = userId ? issuesRaw.map(transformIssueProgress) : issuesRaw;

  sendSuccess(res, { issues }, {
    pagination: {
      page,
      limit: limit || 100,
      total,
      pages: Math.ceil(total / (limit || 100)),
    },
  });
}));

/**
 * GET /api/series/:id/next-issue
 * Get next unread issue (for Continue Series feature)
 * Requires authentication to know which user's progress to check
 */
router.get('/:id/next-issue', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const nextIssue = await getNextUnreadIssue(userId, req.params.id!);

  if (!nextIssue) {
    sendSuccess(res, { nextIssue: null, message: 'No unread issues' });
    return;
  }

  sendSuccess(res, { nextIssue });
}));

/**
 * POST /api/series/:id/continue
 * Get continue reading info (same as next-issue, semantic endpoint)
 * Requires authentication to know which user's progress to check
 */
router.post('/:id/continue', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const nextIssue = await getNextUnreadIssue(userId, req.params.id!);

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
 * GET /api/series/:id/cover-image
 * Returns the actual cover image (not JSON) using pre-computed resolution.
 * This is the primary endpoint for series covers - all client code should use this.
 */
router.get('/:id/cover-image', asyncHandler(async (req: Request, res: Response) => {
  const db = getDatabase();
  const seriesId = req.params.id!;

  const series = await db.series.findUnique({
    where: { id: seriesId },
    select: {
      resolvedCoverHash: true,
      resolvedCoverSource: true,
      resolvedCoverFileId: true,
      resolvedCoverUpdatedAt: true,
      // Fallback fields for when resolved cover isn't set yet
      coverSource: true,
      coverHash: true,
      coverFileId: true,
    },
  });

  if (!series) {
    return res.status(404).json({ error: 'Series not found' });
  }

  // If resolved cover exists, use it
  let coverSource = series.resolvedCoverSource;
  let coverHash = series.resolvedCoverHash;
  let coverFileId = series.resolvedCoverFileId;

  // Fallback to legacy resolution if no resolved cover (for backward compatibility)
  if (!coverSource) {
    if (series.coverSource === 'api' && series.coverHash) {
      coverSource = 'api';
      coverHash = series.coverHash;
    } else if (series.coverSource === 'user' && series.coverFileId) {
      coverSource = 'user';
      coverFileId = series.coverFileId;
    } else if (series.coverHash) {
      coverSource = 'api';
      coverHash = series.coverHash;
    } else if (series.coverFileId) {
      coverSource = 'user';
      coverFileId = series.coverFileId;
    } else {
      coverSource = 'none';
    }
  }

  // No cover available
  if (coverSource === 'none' || (!coverHash && !coverFileId)) {
    return res.status(404).json({ error: 'No cover available' });
  }

  // Determine format preference from Accept header
  const acceptWebP = req.headers.accept?.includes('image/webp') ?? false;

  if (coverSource === 'api' && coverHash) {
    // Serve from series-covers cache
    const { getSeriesCoverData } = await import('../services/cover.service.js');
    const coverData = await getSeriesCoverData(coverHash, acceptWebP);

    if (!coverData) {
      return res.status(404).json({ error: 'Cover file not found' });
    }

    res.setHeader('Content-Type', coverData.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', `"${coverHash}"`);
    if (coverData.blurPlaceholder) {
      res.setHeader('X-Blur-Placeholder', coverData.blurPlaceholder);
    }

    return res.send(coverData.data);
  }

  if (coverSource === 'user' || coverSource === 'firstIssue') {
    // Validate the file still exists before redirecting
    if (coverFileId) {
      const fileExists = await db.comicFile.findUnique({
        where: { id: coverFileId },
        select: { id: true },
      });

      if (!fileExists) {
        // File was deleted - trigger cover recalculation for next request
        const { recalculateSeriesCover } = await import('../services/cover.service.js');
        await recalculateSeriesCover(req.params.id!);
        return res.status(404).json({ error: 'Cover file no longer available' });
      }
    }

    // Redirect to file cover endpoint (preserves existing caching)
    return res.redirect(302, `/api/covers/${coverFileId}`);
  }

  return res.status(404).json({ error: 'No cover available' });
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
      // Recalculate resolved cover
      const { onCoverSourceChanged } = await import('../services/cover.service.js');
      await onCoverSourceChanged('series', seriesId);
    }
  } else if (source === 'user' && fileId) {
    // User selected an issue cover
    try {
      await setSeriesCoverFromIssue(seriesId, fileId);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          sendNotFound(res, error.message);
          return;
        }
        if (error.message.includes('does not belong')) {
          sendBadRequest(res, error.message);
          return;
        }
      }
      throw error;
    }
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
    // Recalculate resolved cover
    const { onCoverSourceChanged } = await import('../services/cover.service.js');
    await onCoverSourceChanged('series', seriesId);
  } else if (fileId) {
    // Legacy: just fileId provided (backwards compatibility)
    try {
      await setSeriesCoverFromIssue(seriesId, fileId);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('not found')) {
          sendNotFound(res, error.message);
          return;
        }
        if (error.message.includes('does not belong')) {
          sendBadRequest(res, error.message);
          return;
        }
      }
      throw error;
    }
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

  // Trigger cascade refresh for collection mosaics that include this series
  onSeriesCoverChanged(seriesId).catch((err) => {
    logger.warn({ seriesId, error: err }, 'Failed to trigger collection mosaic refresh');
  });

  sendSuccess(res, { cover });
}));

/**
 * POST /api/series/:id/cover/upload
 * Upload a custom cover image from file
 * Multipart form data with 'cover' field
 */
router.post('/:id/cover/upload', coverUpload.single('cover'), asyncHandler(async (req: Request, res: Response) => {
  const seriesId = req.params.id!;
  const db = getDatabase();

  // Check series exists and get current cover hash
  const series = await db.series.findUnique({
    where: { id: seriesId },
    select: { id: true, coverHash: true },
  });

  if (!series) {
    sendNotFound(res, 'Series not found');
    return;
  }

  const file = req.file as Express.Multer.File | undefined;
  if (!file) {
    sendBadRequest(res, 'No file uploaded');
    return;
  }

  // Import cover functions
  const { saveUploadedCover, deleteSeriesCover } = await import('../services/cover.service.js');

  // Delete old cover if exists to prevent stale cache
  if (series.coverHash) {
    try {
      await deleteSeriesCover(series.coverHash);
    } catch {
      // Log but continue - old cover cleanup is not critical
    }
  }

  // Save the uploaded image
  const result = await saveUploadedCover(file.buffer);

  if (!result.success || !result.coverHash) {
    sendBadRequest(res, result.error || 'Failed to process uploaded image');
    return;
  }

  // Update series with new cover hash
  await db.series.update({
    where: { id: seriesId },
    data: {
      coverSource: 'api',  // Stored locally, same as API covers
      coverUrl: null,       // No URL for uploaded files
      coverHash: result.coverHash,
      coverFileId: null,
    },
  });

  // Recalculate resolved cover
  const { onCoverSourceChanged } = await import('../services/cover.service.js');
  await onCoverSourceChanged('series', seriesId);

  const cover = await getSeriesCover(seriesId);
  logger.info({ seriesId, coverHash: result.coverHash }, 'Uploaded custom series cover');

  // Trigger cascade refresh for collection mosaics that include this series
  onSeriesCoverChanged(seriesId).catch((err) => {
    logger.warn({ seriesId, error: err }, 'Failed to trigger collection mosaic refresh');
  });

  sendSuccess(res, { cover, coverHash: result.coverHash });
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
 * POST /api/series/:id/aggregate-creators
 * Aggregate creator roles from issue-level ComicVine data
 */
router.post('/:id/aggregate-creators', asyncHandler(async (req: Request, res: Response) => {
  const prisma = getDatabase();
  const series = await getSeries(req.params.id!);

  if (!series) {
    sendNotFound(res, 'Series not found');
    return;
  }

  if (!series.comicVineId) {
    sendBadRequest(res, 'Series has no ComicVine ID. Link to ComicVine first.');
    return;
  }

  const volumeId = parseInt(series.comicVineId, 10);
  if (isNaN(volumeId)) {
    sendBadRequest(res, 'Invalid ComicVine ID');
    return;
  }

  // Aggregate creator roles from issues
  const creatorsWithRoles = await aggregateCreatorRolesFromIssues(volumeId);

  if (!hasAnyCreators(creatorsWithRoles)) {
    sendSuccess(res, {
      message: 'No creator data found in issues',
      creatorsWithRoles,
    });
    return;
  }

  // Update series with aggregated creator data
  const roleFields = creatorsToRoleFields(creatorsWithRoles);
  await prisma.series.update({
    where: { id: req.params.id! },
    data: {
      creatorsJson: creatorsToJson(creatorsWithRoles),
      // Also sync individual role fields for backward compatibility
      ...(roleFields.writer && { writer: roleFields.writer }),
      ...(roleFields.penciller && { penciller: roleFields.penciller }),
      ...(roleFields.inker && { inker: roleFields.inker }),
      ...(roleFields.colorist && { colorist: roleFields.colorist }),
      ...(roleFields.letterer && { letterer: roleFields.letterer }),
      ...(roleFields.coverArtist && { coverArtist: roleFields.coverArtist }),
      ...(roleFields.editor && { editor: roleFields.editor }),
    },
  });

  logger.info(
    { seriesId: req.params.id, writers: creatorsWithRoles.writer.length },
    'Aggregated creator roles from issues'
  );

  sendSuccess(res, {
    message: 'Creator roles aggregated successfully',
    creatorsWithRoles,
  });
}));

/**
 * GET /api/series/:id/creators-from-issues
 * Aggregate creators from local FileMetadata (not from external API)
 * Returns structured creator data and coverage statistics
 */
router.get('/:id/creators-from-issues', asyncHandler(async (req: Request, res: Response) => {
  const seriesId = req.params.id!;
  const result = await aggregateCreatorsFromLocalIssues(seriesId);

  if (!result.success) {
    if (result.error?.includes('not found')) {
      sendNotFound(res, result.error);
    } else {
      sendBadRequest(res, result.error || 'Failed to aggregate creators');
    }
    return;
  }

  sendSuccess(res, {
    creatorsWithRoles: result.creatorsWithRoles,
    coverage: result.coverage,
    source: 'issues',
  });
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
        orderBy: [
          { metadata: { issueNumberSort: { sort: 'asc', nulls: 'last' } } },
          { filename: 'asc' },
        ],
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

// =============================================================================
// Series Linkage Repair Endpoints
// =============================================================================

/**
 * GET /api/admin/series/mismatched
 * Get files where FileMetadata.series doesn't match their linked Series.name
 */
router.get('/admin/mismatched', asyncHandler(async (_req: Request, res: Response) => {
  const mismatched = await findMismatchedSeriesFiles();
  sendSuccess(res, {
    count: mismatched.length,
    files: mismatched,
  });
}));

/**
 * POST /api/admin/series/repair
 * Repair mismatched series linkages
 * Re-links files to the correct series based on their FileMetadata.series,
 * creating new series if needed.
 *
 * Optional body: { fileIds: string[] } - If provided, only repair these specific files.
 */
router.post('/admin/repair', asyncHandler(async (req: Request, res: Response) => {
  const { fileIds } = req.body as { fileIds?: string[] };
  logger.info({ fileIds: fileIds?.length }, 'Starting series linkage repair');
  const result = await repairSeriesLinkages({ fileIds });
  logger.info(
    {
      totalMismatched: result.totalMismatched,
      repaired: result.repaired,
      newSeriesCreated: result.newSeriesCreated,
      errors: result.errors.length,
    },
    'Series linkage repair complete'
  );
  sendSuccess(res, result);
}));

/**
 * POST /api/admin/series/sync-metadata/:fileId
 * Sync a single file's metadata to match its linked series.
 * Use when the file is in the correct series but the metadata is wrong.
 */
router.post('/admin/sync-metadata/:fileId', asyncHandler(async (req: Request, res: Response) => {
  const { fileId } = req.params;
  if (!fileId) {
    return sendBadRequest(res, 'fileId is required');
  }

  const result = await syncFileMetadataToSeries(fileId);

  if (!result.success) {
    return sendBadRequest(res, result.error || 'Failed to sync metadata');
  }

  sendSuccess(res, result);
}));

/**
 * POST /api/admin/series/sync-metadata-batch
 * Batch sync file metadata to match their linked series.
 */
router.post('/admin/sync-metadata-batch', asyncHandler(async (req: Request, res: Response) => {
  const { fileIds } = req.body as { fileIds: string[] };

  if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
    return sendBadRequest(res, 'fileIds array is required');
  }

  logger.info({ count: fileIds.length }, 'Starting batch metadata sync to series');
  const result = await batchSyncFileMetadataToSeries(fileIds);
  logger.info(
    { total: result.total, synced: result.synced, errors: result.errors.length },
    'Batch metadata sync complete'
  );
  sendSuccess(res, result);
}));

// =============================================================================
// Empty Series Cleanup
// =============================================================================

/**
 * GET /api/series/admin/empty
 * Get all series with no issues (empty series).
 */
router.get('/admin/empty', asyncHandler(async (_req: Request, res: Response) => {
  const emptySeries = await findEmptySeries();
  sendSuccess(res, {
    count: emptySeries.length,
    series: emptySeries,
  });
}));

/**
 * POST /api/series/admin/cleanup-empty
 * Soft-delete all empty series (series with no issues).
 */
router.post('/admin/cleanup-empty', asyncHandler(async (_req: Request, res: Response) => {
  logger.info('Starting empty series cleanup');
  const result = await cleanupEmptySeries();
  logger.info(
    { deletedCount: result.deletedCount },
    'Empty series cleanup complete'
  );
  sendSuccess(res, result);
}));

// =============================================================================
// Soft-Deleted Series Management
// =============================================================================

/**
 * GET /api/series/admin/deleted
 * Get all soft-deleted series.
 */
router.get('/admin/deleted', asyncHandler(async (_req: Request, res: Response) => {
  const deleted = await getDeletedSeries();
  sendSuccess(res, { series: deleted, count: deleted.length });
}));

/**
 * POST /api/series/:id/restore
 * Restore a soft-deleted series.
 */
router.post('/:id/restore', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return sendBadRequest(res, 'Series ID is required');
  }

  try {
    const series = await restoreSeries(id);
    logger.info({ seriesId: id }, 'Restored soft-deleted series');
    sendSuccess(res, { series });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return sendNotFound(res, error.message);
    }
    throw error;
  }
}));

// =============================================================================
// Series Visibility (Hidden Flag)
// =============================================================================

/**
 * GET /api/series/admin/hidden
 * Get all hidden series.
 */
router.get('/admin/hidden', asyncHandler(async (_req: Request, res: Response) => {
  const hidden = await getHiddenSeries();
  sendSuccess(res, { series: hidden, count: hidden.length });
}));

/**
 * PATCH /api/series/:id/hidden
 * Toggle or set the hidden status of a series.
 * Body: { hidden?: boolean } - If provided, sets to that value. If not, toggles.
 */
router.patch('/:id/hidden', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { hidden } = req.body;

  if (!id) {
    return sendBadRequest(res, 'Series ID is required');
  }

  try {
    let series;
    if (hidden !== undefined) {
      series = await setSeriesHidden(id, hidden);
      logger.info({ seriesId: id, hidden }, 'Set series hidden status');
    } else {
      series = await toggleSeriesHidden(id);
      logger.info({ seriesId: id, isHidden: series.isHidden }, 'Toggled series hidden status');
    }
    sendSuccess(res, { series });
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return sendNotFound(res, error.message);
    }
    throw error;
  }
}));

// =============================================================================
// Series Relationships (Parent/Child)
// =============================================================================

/**
 * POST /api/series/bulk-link
 * Link multiple series as children to a single parent series.
 * Body: {
 *   targetSeriesId: string,
 *   children: Array<{ seriesId: string, relationshipType?: RelationshipType }>
 * }
 */
router.post('/bulk-link', asyncHandler(async (req: Request, res: Response) => {
  const { targetSeriesId, children } = req.body;

  if (!targetSeriesId) {
    return sendBadRequest(res, 'targetSeriesId is required');
  }

  if (!Array.isArray(children) || children.length === 0) {
    return sendBadRequest(res, 'children array is required and must not be empty');
  }

  if (children.length > 10) {
    return sendBadRequest(res, 'Maximum 10 series per bulk link operation');
  }

  // Validate relationship types
  const validTypes = ['related', 'spinoff', 'prequel', 'sequel', 'bonus'];
  for (const child of children) {
    if (!child.seriesId) {
      return sendBadRequest(res, 'Each child must have a seriesId');
    }
    if (child.relationshipType && !validTypes.includes(child.relationshipType)) {
      return sendBadRequest(res, `Invalid relationship type: ${child.relationshipType}`);
    }
  }

  const result = await bulkAddChildSeries({
    parentSeriesId: targetSeriesId,
    children: children.map((c: { seriesId: string; relationshipType?: string }) => ({
      childSeriesId: c.seriesId,
      relationshipType: (c.relationshipType || 'related') as RelationshipType,
    })),
  });

  logger.info(
    { targetSeriesId, childCount: children.length, successful: result.successful },
    'Bulk linked series'
  );

  sendSuccess(res, result);
}));

/**
 * GET /api/series/:id/relationships
 * Get all parent and child relationships for a series.
 */
router.get('/:id/relationships', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return sendBadRequest(res, 'Series ID is required');
  }

  try {
    const relationships = await getSeriesRelationships(id);
    sendSuccess(res, relationships);
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return sendNotFound(res, error.message);
    }
    throw error;
  }
}));

/**
 * POST /api/series/:id/children
 * Add a child series to this series.
 * Body: { childSeriesId: string, relationshipType?: 'related' | 'spinoff' | 'prequel' | 'sequel' | 'bonus' }
 */
router.post('/:id/children', asyncHandler(async (req: Request, res: Response) => {
  const { id: parentSeriesId } = req.params;
  const { childSeriesId, relationshipType = 'related' } = req.body;

  if (!parentSeriesId) {
    return sendBadRequest(res, 'Parent series ID is required');
  }

  if (!childSeriesId) {
    return sendBadRequest(res, 'Child series ID is required');
  }

  try {
    const relationship = await addChildSeries(
      parentSeriesId,
      childSeriesId,
      relationshipType as RelationshipType
    );
    logger.info({ parentSeriesId, childSeriesId, relationshipType }, 'Added child series');
    sendSuccess(res, { relationship }, undefined, 201);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return sendNotFound(res, error.message);
      }
      if (error.message.includes('circular') || error.message.includes('itself')) {
        return sendBadRequest(res, error.message);
      }
      // Unique constraint violation = already exists
      if (error.message.includes('Unique constraint')) {
        return sendBadRequest(res, 'This relationship already exists');
      }
    }
    throw error;
  }
}));

/**
 * DELETE /api/series/:id/children/:childId
 * Remove a child series from this series.
 */
router.delete('/:id/children/:childId', asyncHandler(async (req: Request, res: Response) => {
  const { id: parentSeriesId, childId: childSeriesId } = req.params;

  if (!parentSeriesId || !childSeriesId) {
    return sendBadRequest(res, 'Parent and child series IDs are required');
  }

  try {
    await removeChildSeries(parentSeriesId, childSeriesId);
    logger.info({ parentSeriesId, childSeriesId }, 'Removed child series');
    sendSuccess(res, { message: 'Child series removed' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      return sendNotFound(res, 'Relationship not found');
    }
    throw error;
  }
}));

/**
 * PUT /api/series/:id/children/reorder
 * Reorder child series within a parent.
 * Body: { orderedChildIds: string[] }
 */
router.put('/:id/children/reorder', asyncHandler(async (req: Request, res: Response) => {
  const { id: parentSeriesId } = req.params;
  const { orderedChildIds } = req.body;

  if (!parentSeriesId) {
    return sendBadRequest(res, 'Parent series ID is required');
  }

  if (!orderedChildIds || !Array.isArray(orderedChildIds)) {
    return sendBadRequest(res, 'orderedChildIds must be an array');
  }

  try {
    await reorderChildSeries(parentSeriesId, orderedChildIds);
    logger.info({ parentSeriesId, count: orderedChildIds.length }, 'Reordered child series');
    sendSuccess(res, { message: 'Order updated' });
  } catch (error) {
    throw error;
  }
}));

/**
 * PATCH /api/series/:id/children/:childId
 * Update the relationship type between parent and child.
 * Body: { relationshipType: 'related' | 'spinoff' | 'prequel' | 'sequel' | 'bonus' }
 */
router.patch('/:id/children/:childId', asyncHandler(async (req: Request, res: Response) => {
  const { id: parentSeriesId, childId: childSeriesId } = req.params;
  const { relationshipType } = req.body;

  if (!parentSeriesId || !childSeriesId) {
    return sendBadRequest(res, 'Parent and child series IDs are required');
  }

  if (!relationshipType) {
    return sendBadRequest(res, 'Relationship type is required');
  }

  const validTypes = ['related', 'spinoff', 'prequel', 'sequel', 'bonus'];
  if (!validTypes.includes(relationshipType)) {
    return sendBadRequest(res, `Invalid relationship type. Must be one of: ${validTypes.join(', ')}`);
  }

  try {
    const relationship = await updateRelationshipType(
      parentSeriesId,
      childSeriesId,
      relationshipType as RelationshipType
    );
    logger.info({ parentSeriesId, childSeriesId, relationshipType }, 'Updated relationship type');
    sendSuccess(res, { relationship });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      return sendNotFound(res, 'Relationship not found');
    }
    throw error;
  }
}));

// =============================================================================
// Bulk Operations
// =============================================================================

/**
 * PATCH /api/series/bulk
 * Bulk update metadata fields across multiple series.
 * Only updates fields that are explicitly provided.
 */
router.patch('/bulk', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const { seriesIds, updates } = req.body as {
    seriesIds: string[];
    updates: BulkSeriesUpdateInput;
  };

  if (!seriesIds || !Array.isArray(seriesIds) || seriesIds.length === 0) {
    return sendBadRequest(res, 'seriesIds must be a non-empty array');
  }

  if (!updates || typeof updates !== 'object') {
    return sendBadRequest(res, 'updates must be an object');
  }

  const result = await bulkUpdateSeries(seriesIds, updates);
  logger.info({ count: seriesIds.length, successful: result.successful }, 'Bulk updated series');
  sendSuccess(res, result);
}));

/**
 * POST /api/series/bulk-mark-read
 * Mark all issues in the specified series as read for the current user.
 */
router.post('/bulk-mark-read', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { seriesIds } = req.body as { seriesIds: string[] };

  if (!seriesIds || !Array.isArray(seriesIds) || seriesIds.length === 0) {
    return sendBadRequest(res, 'seriesIds must be a non-empty array');
  }

  const result = await bulkMarkSeriesRead(seriesIds, userId);
  logger.info({ userId, count: seriesIds.length, successful: result.successful }, 'Bulk marked series as read');

  // Mark smart collections dirty for reading progress changes
  if (result.successful > 0) {
    markSmartCollectionsDirty({
      userId,
      seriesIds,
      reason: 'reading_progress',
    }).catch(() => {
      // Non-critical, errors logged inside
    });
  }

  sendSuccess(res, result);
}));

/**
 * POST /api/series/bulk-mark-unread
 * Mark all issues in the specified series as unread for the current user.
 */
router.post('/bulk-mark-unread', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { seriesIds } = req.body as { seriesIds: string[] };

  if (!seriesIds || !Array.isArray(seriesIds) || seriesIds.length === 0) {
    return sendBadRequest(res, 'seriesIds must be a non-empty array');
  }

  const result = await bulkMarkSeriesUnread(seriesIds, userId);
  logger.info({ userId, count: seriesIds.length, successful: result.successful }, 'Bulk marked series as unread');

  // Mark smart collections dirty for reading progress changes
  if (result.successful > 0) {
    markSmartCollectionsDirty({
      userId,
      seriesIds,
      reason: 'reading_progress',
    }).catch(() => {
      // Non-critical, errors logged inside
    });
  }

  sendSuccess(res, result);
}));

/**
 * POST /api/series/bulk-set-hidden
 * Set the hidden status for multiple series.
 */
router.post('/bulk-set-hidden', asyncHandler(async (req: Request, res: Response) => {
  const { seriesIds, hidden } = req.body as { seriesIds: string[]; hidden: boolean };

  if (!seriesIds || !Array.isArray(seriesIds) || seriesIds.length === 0) {
    return sendBadRequest(res, 'seriesIds must be a non-empty array');
  }

  if (typeof hidden !== 'boolean') {
    return sendBadRequest(res, 'hidden must be a boolean');
  }

  const result = await bulkSetSeriesHidden(seriesIds, hidden);
  logger.info({ count: seriesIds.length, hidden, successful: result.successful }, 'Bulk set series hidden status');
  sendSuccess(res, result);
}));

export default router;
