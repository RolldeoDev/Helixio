/**
 * Library Routes
 *
 * API endpoints for library management:
 * - CRUD operations for libraries
 * - Library scanning and file discovery
 * - File listing and statistics
 */

import { Router, Request, Response } from 'express';
import { getDatabase } from '../services/database.service.js';
import {
  scanLibrary,
  applyScanResults,
  verifyLibraryPath,
  getLibraryStats,
  getAllLibraryStats,
  ScanResult,
} from '../services/scanner.service.js';
import { getLibraryCoverDir } from '../services/app-paths.service.js';
import { renameFolder } from '../services/file-operations.service.js';
import { createScanJob } from '../services/library-scan-job.service.js';
import { enqueueScanJob } from '../services/library-scan-queue.service.js';
import { mkdir } from 'fs/promises';
import { createServiceLogger, logError } from '../services/logger.service.js';
import { validateBody, validateQuery } from '../middleware/validation.middleware.js';
import {
  sendSuccess,
  sendBadRequest,
  sendNotFound,
  sendConflict,
  sendInternalError,
  asyncHandler,
} from '../middleware/response.middleware.js';
import { cachePresets } from '../middleware/cache.middleware.js';
import {
  CreateLibrarySchema,
  UpdateLibrarySchema,
  ListFilesQuerySchema,
  RenameFolderSchema,
} from '../schemas/library.schemas.js';

const router = Router();
const logger = createServiceLogger('library-routes');

// Store pending scan results for confirmation workflow
const pendingScanResults = new Map<string, ScanResult>();

// =============================================================================
// Library CRUD
// =============================================================================

/**
 * GET /api/libraries
 * List all libraries with their stats
 */
router.get('/', cachePresets.shortTerm, asyncHandler(async (_req: Request, res: Response) => {
  const db = getDatabase();

  // Fetch libraries and all stats in parallel (2 queries instead of N+1)
  const [libraries, statsMap] = await Promise.all([
    db.library.findMany({ orderBy: { name: 'asc' } }),
    getAllLibraryStats(),
  ]);

  // Merge stats into library objects
  const librariesWithStats = libraries.map((library) => ({
    ...library,
    stats: statsMap.get(library.id) ?? {
      total: 0,
      pending: 0,
      indexed: 0,
      orphaned: 0,
      quarantined: 0,
    },
  }));

  logger.info({ count: librariesWithStats.length }, 'Listed libraries');
  sendSuccess(res, { libraries: librariesWithStats });
}));

// =============================================================================
// All-Libraries Endpoints (must be before /:id routes)
// =============================================================================

/**
 * GET /api/libraries/files
 * List files from ALL libraries with pagination
 */
router.get('/files',
  validateQuery(ListFilesQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const fetchAll = req.query.all === 'true';
    const { page: rawPage, limit: rawLimit, status, folder, sort, order, groupBy } = req.query as unknown as {
      page: number;
      limit: number;
      status?: string;
      folder?: string;
      sort: 'filename' | 'size' | 'number' | 'title' | 'year' | 'status';
      order: 'asc' | 'desc';
      groupBy?: 'series' | 'publisher' | 'year' | 'genre' | 'writer' | 'penciller' | 'firstLetter';
    };

    const page = fetchAll ? 1 : rawPage;
    const limit = fetchAll ? undefined : rawLimit;
    const skip = fetchAll ? undefined : (page - 1) * limit!;
    const db = getDatabase();

    // Build filter (no libraryId filter - gets files from all libraries)
    const where: {
      status?: string;
      relativePath?: { startsWith: string };
    } = {};

    if (status) {
      where.status = status;
    }

    if (folder) {
      where.relativePath = { startsWith: folder };
    }

    // Build orderBy
    type OrderByItem = { [key: string]: 'asc' | 'desc' | { sort: 'asc' | 'desc'; nulls: 'last' } } | { metadata: { [key: string]: 'asc' | 'desc' } };
    let orderBy: OrderByItem[];

    const metadataSortFields = ['number', 'title', 'year'];
    const isMetadataSort = metadataSortFields.includes(sort);
    const sortOrderBy: OrderByItem = isMetadataSort
      ? { metadata: { [sort]: order } }
      : { [sort]: order };

    if (groupBy) {
      const groupOrderBy: OrderByItem = groupBy === 'firstLetter'
        ? { filename: 'asc' }
        : { metadata: { [groupBy]: 'asc' } };
      orderBy = [groupOrderBy, sortOrderBy];
    } else {
      orderBy = [sortOrderBy];
    }

    const [files, total] = await Promise.all([
      db.comicFile.findMany({
        where,
        ...(fetchAll ? {} : { skip, take: limit }),
        orderBy,
        select: {
          id: true,
          libraryId: true,
          path: true,
          relativePath: true,
          filename: true,
          size: true,
          hash: true,
          status: true,
          modifiedAt: true,
          createdAt: true,
          updatedAt: true,
          seriesId: true,
          metadata: {
            select: {
              series: true,
              number: true,
              title: true,
              volume: true,
              year: true,
              publisher: true,
              writer: true,
              penciller: true,
              genre: true,
              characters: true,
              teams: true,
              locations: true,
              storyArc: true,
            },
          },
        },
      }),
      db.comicFile.count({ where }),
    ]);

    const returnLimit = fetchAll ? total : limit!;
    logger.info({ total, fetchAll }, 'Listed files from all libraries');
    sendSuccess(res, { files }, {
      pagination: {
        page,
        limit: returnLimit,
        total,
        pages: fetchAll ? 1 : Math.ceil(total / limit!),
      },
    });
  })
);

/**
 * GET /api/libraries/folders
 * Get folder structure for ALL libraries
 */
router.get('/folders', asyncHandler(async (_req: Request, res: Response) => {
  const db = getDatabase();

  // Get all libraries with their files' folder paths
  const libraries = await db.library.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      type: true,
    },
  });

  // Get folders for each library
  const librariesWithFolders = await Promise.all(
    libraries.map(async (library) => {
      const files = await db.comicFile.findMany({
        where: { libraryId: library.id },
        select: { relativePath: true },
      });

      // Extract unique folders
      const folders = new Set<string>();
      for (const file of files) {
        const parts = file.relativePath.split('/');
        let folderPath = '';
        for (let i = 0; i < parts.length - 1; i++) {
          const part = parts[i]!;
          folderPath = folderPath ? `${folderPath}/${part}` : part;
          folders.add(folderPath);
        }
      }

      return {
        id: library.id,
        name: library.name,
        type: library.type,
        folders: Array.from(folders).sort(),
      };
    })
  );

  logger.info({ libraryCount: librariesWithFolders.length }, 'Listed folders from all libraries');
  sendSuccess(res, { libraries: librariesWithFolders });
}));

/**
 * GET /api/libraries/:id
 * Get a single library by ID
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDatabase();
  const library = await db.library.findUnique({
    where: { id: req.params.id },
  });

  if (!library) {
    sendNotFound(res, 'Library not found');
    return;
  }

  const stats = await getLibraryStats(library.id);

  logger.debug({ libraryId: library.id }, 'Retrieved library');
  sendSuccess(res, { ...library, stats });
}));

/**
 * POST /api/libraries
 * Create a new library
 */
router.post('/',
  validateBody(CreateLibrarySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, rootPath, type } = req.body;

    // Verify path exists and is a directory
    const pathCheck = await verifyLibraryPath(rootPath);
    if (!pathCheck.valid) {
      sendBadRequest(res, 'Invalid library path', { reason: pathCheck.error });
      return;
    }

    const db = getDatabase();

    // Check for duplicate path
    const existingLibrary = await db.library.findUnique({
      where: { rootPath },
    });

    if (existingLibrary) {
      sendConflict(res, 'Library path already exists', {
        existingLibrary: {
          id: existingLibrary.id,
          name: existingLibrary.name,
        },
      });
      return;
    }

    // Create the library
    const library = await db.library.create({
      data: {
        name,
        rootPath,
        type,
      },
    });

    // Create the cover cache directory for this library
    try {
      await mkdir(getLibraryCoverDir(library.id), { recursive: true });
    } catch {
      // Ignore if already exists
    }

    // Auto-start a full scan for the new library
    let scanJobId: string | null = null;
    try {
      scanJobId = await createScanJob(library.id);
      enqueueScanJob(scanJobId);
      logger.info({ libraryId: library.id, scanJobId }, 'Auto-started scan for new library');
    } catch (scanError) {
      // Log but don't fail library creation if scan fails to start
      logger.warn({ libraryId: library.id, err: scanError }, 'Failed to auto-start scan for new library');
    }

    logger.info({ libraryId: library.id, name, rootPath, type }, 'Created library');
    sendSuccess(res, {
      ...library,
      scanJobId,
      stats: {
        total: 0,
        pending: 0,
        indexed: 0,
        orphaned: 0,
        quarantined: 0,
      },
    }, undefined, 201);
  })
);

/**
 * PATCH /api/libraries/:id
 * Update a library's name or type
 */
router.patch('/:id',
  validateBody(UpdateLibrarySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, type } = req.body;
    const db = getDatabase();

    // Check library exists
    const existing = await db.library.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      sendNotFound(res, 'Library not found');
      return;
    }

    // Update
    const library = await db.library.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(type && { type }),
      },
    });

    const stats = await getLibraryStats(library.id);

    logger.info({ libraryId: library.id, name, type }, 'Updated library');
    sendSuccess(res, { ...library, stats });
  })
);

/**
 * DELETE /api/libraries/:id
 * Delete a library (files remain on disk, only DB records removed)
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const db = getDatabase();

  // Check library exists
  const existing = await db.library.findUnique({
    where: { id: req.params.id },
  });

  if (!existing) {
    sendNotFound(res, 'Library not found');
    return;
  }

  // Delete library (cascades to ComicFile records via Prisma)
  await db.library.delete({
    where: { id: req.params.id },
  });

  logger.info({ libraryId: req.params.id }, 'Deleted library');
  sendSuccess(res, {
    message: 'Library deleted',
    id: req.params.id,
    note: 'Files on disk were not removed',
  });
}));

// =============================================================================
// Library Scanning
// =============================================================================

/**
 * POST /api/libraries/:id/scan
 * Initiate a library scan and return detected changes
 */
router.post('/:id/scan', asyncHandler(async (req: Request, res: Response) => {
  const db = getDatabase();

  // Check library exists
  const library = await db.library.findUnique({
    where: { id: req.params.id },
  });

  if (!library) {
    sendNotFound(res, 'Library not found');
    return;
  }

  // Verify path is still accessible
  const pathCheck = await verifyLibraryPath(library.rootPath);
  if (!pathCheck.valid) {
    sendBadRequest(res, 'Library path not accessible', { reason: pathCheck.error });
    return;
  }

  // Perform the scan
  logger.info({ libraryId: req.params.id }, 'Starting library scan');
  const scanResult = await scanLibrary(req.params.id!);

  // Store result for later confirmation
  const scanId = `scan_${Date.now()}_${req.params.id!}`;
  pendingScanResults.set(scanId, scanResult);

  // Auto-expire after 30 minutes
  setTimeout(() => {
    pendingScanResults.delete(scanId);
  }, 30 * 60 * 1000);

  logger.info({
    libraryId: req.params.id,
    scanId,
    newFiles: scanResult.newFiles.length,
    movedFiles: scanResult.movedFiles.length,
    orphanedFiles: scanResult.orphanedFiles.length,
    duration: scanResult.scanDuration,
  }, 'Library scan completed');

  // Check if there are any changes including existing orphaned files that need cleanup
  const hasChanges = scanResult.newFiles.length > 0 ||
                     scanResult.movedFiles.length > 0 ||
                     scanResult.orphanedFiles.length > 0 ||
                     scanResult.existingOrphanedCount > 0;

  sendSuccess(res, {
    scanId,
    libraryId: scanResult.libraryId,
    libraryPath: scanResult.libraryPath,
    scanDuration: scanResult.scanDuration,
    summary: {
      totalFilesScanned: scanResult.totalFilesScanned,
      newFiles: scanResult.newFiles.length,
      movedFiles: scanResult.movedFiles.length,
      orphanedFiles: scanResult.orphanedFiles.length,
      existingOrphanedFiles: scanResult.existingOrphanedCount, // Files already marked orphaned, will be deleted
      unchangedFiles: scanResult.unchangedFiles,
      errors: scanResult.errors.length,
    },
    changes: {
      newFiles: scanResult.newFiles.map((f) => ({
        path: f.relativePath,
        filename: f.filename,
        size: f.size,
      })),
      movedFiles: scanResult.movedFiles.map((m) => ({
        oldPath: m.oldPath,
        newPath: m.newPath,
      })),
      orphanedFiles: scanResult.orphanedFiles.map((o) => ({
        path: o.path,
      })),
    },
    errors: scanResult.errors,
    autoApplied: !hasChanges,
  });
}));

/**
 * POST /api/libraries/:id/scan/:scanId/apply
 * Apply the changes from a pending scan
 */
router.post('/:id/scan/:scanId/apply', asyncHandler(async (req: Request, res: Response) => {
  const scanId = req.params.scanId!;

  const scanResult = pendingScanResults.get(scanId);
  if (!scanResult) {
    sendNotFound(res, 'Scan not found - may have expired or already been applied');
    return;
  }

  // Apply the changes
  const result = await applyScanResults(scanResult);

  // Remove from pending
  pendingScanResults.delete(scanId);

  logger.info({
    scanId,
    added: result.added,
    moved: result.moved,
    orphaned: result.orphaned,
  }, 'Applied scan results');

  sendSuccess(res, {
    applied: result,
    message: `Added ${result.added} files, updated ${result.moved} moved files, marked ${result.orphaned} as orphaned`,
  });
}));

/**
 * DELETE /api/libraries/:id/scan/:scanId
 * Cancel/discard a pending scan
 */
router.delete('/:id/scan/:scanId', asyncHandler(async (req: Request, res: Response) => {
  const scanId = req.params.scanId!;

  if (pendingScanResults.has(scanId)) {
    pendingScanResults.delete(scanId);
    logger.info({ scanId }, 'Scan discarded');
    sendSuccess(res, { message: 'Scan discarded' });
  } else {
    sendNotFound(res, 'Scan not found');
  }
}));

// =============================================================================
// Library Files
// =============================================================================

/**
 * GET /api/libraries/:id/files
 * List files in a library with pagination
 */
router.get('/:id/files',
  validateQuery(ListFilesQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const fetchAll = req.query.all === 'true';
    const { page: rawPage, limit: rawLimit, status, folder, sort, order, groupBy } = req.query as unknown as {
      page: number;
      limit: number;
      status?: string;
      folder?: string;
      sort: 'filename' | 'size' | 'number' | 'title' | 'year' | 'status';
      order: 'asc' | 'desc';
      groupBy?: 'series' | 'publisher' | 'year' | 'genre' | 'writer' | 'penciller' | 'firstLetter';
    };

    const page = fetchAll ? 1 : rawPage;
    const limit = fetchAll ? undefined : rawLimit;
    const skip = fetchAll ? undefined : (page - 1) * limit!;
    const db = getDatabase();

    // Build filter
    const where: {
      libraryId: string;
      status?: string;
      relativePath?: { startsWith: string };
    } = {
      libraryId: req.params.id!,
    };

    if (status) {
      where.status = status;
    }

    if (folder) {
      where.relativePath = { startsWith: folder };
    }

    // Build orderBy - when groupBy is active, sort by group field first, then by user's sort field
    // This ensures all items from one group appear together before pagination moves to the next
    type OrderByItem = { [key: string]: 'asc' | 'desc' | { sort: 'asc' | 'desc'; nulls: 'last' } } | { metadata: { [key: string]: 'asc' | 'desc' } };
    let orderBy: OrderByItem[];

    // Metadata fields need nested orderBy
    const metadataSortFields = ['number', 'title', 'year'];
    const isMetadataSort = metadataSortFields.includes(sort);
    const sortOrderBy: OrderByItem = isMetadataSort
      ? { metadata: { [sort]: order } }
      : { [sort]: order };

    if (groupBy) {
      // Map groupBy to the appropriate field for sorting
      const groupOrderBy: OrderByItem = groupBy === 'firstLetter'
        ? { filename: 'asc' } // Sort by filename for first letter grouping
        : { metadata: { [groupBy]: 'asc' } }; // Sort by metadata field

      orderBy = [groupOrderBy, sortOrderBy];
    } else {
      orderBy = [sortOrderBy];
    }

    const [files, total] = await Promise.all([
      db.comicFile.findMany({
        where,
        ...(fetchAll ? {} : { skip, take: limit }),
        orderBy,
        select: {
          id: true,
          libraryId: true,
          path: true,
          relativePath: true,
          filename: true,
          size: true,
          hash: true,
          status: true,
          modifiedAt: true,
          createdAt: true,
          updatedAt: true,
          seriesId: true,
          metadata: {
            select: {
              series: true,
              number: true,
              title: true,
              volume: true,
              year: true,
              publisher: true,
              writer: true,
              penciller: true,
              genre: true,
              characters: true,
              teams: true,
              locations: true,
              storyArc: true,
            },
          },
        },
      }),
      db.comicFile.count({ where }),
    ]);

    const returnLimit = fetchAll ? total : limit!;
    sendSuccess(res, { files }, {
      pagination: {
        page,
        limit: returnLimit,
        total,
        pages: fetchAll ? 1 : Math.ceil(total / limit!),
      },
    });
  })
);

/**
 * GET /api/libraries/:id/folders
 * Get folder structure for a library
 */
router.get('/:id/folders', asyncHandler(async (req: Request, res: Response) => {
  const db = getDatabase();

  // Get all unique folder paths
  const files = await db.comicFile.findMany({
    where: { libraryId: req.params.id },
    select: { relativePath: true },
  });

  // Extract unique folders
  const folders = new Set<string>();
  for (const file of files) {
    const parts = file.relativePath.split('/');
    let folderPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      folderPath = folderPath ? `${folderPath}/${part}` : part;
      folders.add(folderPath);
    }
  }

  // Sort and return
  const sortedFolders = Array.from(folders).sort();

  sendSuccess(res, { folders: sortedFolders });
}));

/**
 * POST /api/libraries/:id/folders/rename
 * Rename a folder within a library
 */
router.post('/:id/folders/rename',
  validateBody(RenameFolderSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { folderPath, newName } = req.body;
    const trimmedName = newName.trim();

    const db = getDatabase();

    // Check library exists
    const library = await db.library.findUnique({
      where: { id: req.params.id },
    });

    if (!library) {
      sendNotFound(res, 'Library not found');
      return;
    }

    // Perform the rename
    const result = await renameFolder(req.params.id!, folderPath, trimmedName);

    if (result.success) {
      logger.info({
        libraryId: req.params.id,
        oldPath: result.oldPath,
        newPath: result.newPath,
        filesUpdated: result.filesUpdated,
      }, 'Renamed folder');
      sendSuccess(res, {
        oldPath: result.oldPath,
        newPath: result.newPath,
        filesUpdated: result.filesUpdated,
        logId: result.logId,
      });
    } else {
      sendBadRequest(res, result.error || 'Failed to rename folder');
    }
  })
);

/**
 * GET /api/libraries/:id/quarantine
 * List quarantined files in a library
 */
router.get('/:id/quarantine', asyncHandler(async (req: Request, res: Response) => {
  const db = getDatabase();

  const files = await db.comicFile.findMany({
    where: {
      libraryId: req.params.id,
      status: 'quarantined',
    },
    orderBy: { updatedAt: 'desc' },
  });

  sendSuccess(res, {
    count: files.length,
    files,
  });
}));

export default router;
