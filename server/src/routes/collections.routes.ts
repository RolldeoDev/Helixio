/**
 * Collections Routes
 *
 * API endpoints for collection management:
 * - CRUD operations for collections
 * - Add/remove items from collections
 * - Query collections for items
 * - Toggle system collections (Favorites, Want to Read)
 *
 * All routes require authentication as collections are user-scoped.
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.middleware.js';
import { logError, logInfo } from '../services/logger.service.js';
import {
  getCollections,
  getCollection,
  getCollectionExpanded,
  createCollection,
  updateCollection,
  deleteCollection,
  addItemsToCollection,
  removeItemsFromCollection,
  reorderItems,
  getCollectionsForItem,
  isInCollection,
  toggleSystemCollection,
  bulkToggleSystemCollection,
  getSystemCollection,
  getUnavailableItemCount,
  removeUnavailableItems,
  getPromotedCollections,
  toggleCollectionPromotion,
  updateCollectionCover,
  setCollectionCoverHash,
  updateCollectionMetadata,
  getCollectionReadingProgress,
  regenerateMosaicSync,
} from '../services/collection.service.js';
import {
  refreshSmartCollection,
  updateSmartFilter,
  convertToSmartCollection,
  convertToRegularCollection,
  toggleWhitelist,
  toggleBlacklist,
  getSmartCollectionOverrides,
  type SmartFilter,
  type SmartScope,
} from '../services/smart-collection.service.js';

const router = Router();

// Configure multer for cover image uploads
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
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.'));
    }
  },
});

// All collection routes require authentication
router.use(requireAuth);

// =============================================================================
// Collection CRUD
// =============================================================================

/**
 * GET /api/collections
 * Get all collections with item counts for the current user
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const collections = await getCollections(userId);
    res.json({ collections });
  } catch (error) {
    logError('collections.routes', error, { operation: 'getCollections' });
    res.status(500).json({
      error: 'Failed to get collections',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/collections/for-item
 * Get all collections containing a specific series or file for the current user
 *
 * Query params:
 *   - seriesId: Filter by series ID
 *   - fileId: Filter by file ID
 *   - includeSeriesFiles: When 'true' and seriesId is provided, also includes collections
 *     containing individual files from that series
 */
router.get('/for-item', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { seriesId, fileId, includeSeriesFiles } = req.query as {
      seriesId?: string;
      fileId?: string;
      includeSeriesFiles?: string;
    };

    const collections = await getCollectionsForItem(userId, seriesId, fileId, {
      includeSeriesFiles: includeSeriesFiles === 'true',
    });
    res.json({ collections });
  } catch (error) {
    logError('collections.routes', error, { operation: 'getCollectionsForItem' });
    res.status(500).json({
      error: 'Failed to get collections for item',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/collections/system/:systemKey
 * Get a system collection by key for the current user
 */
router.get('/system/:systemKey', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { systemKey } = req.params;

    if (systemKey !== 'favorites' && systemKey !== 'want-to-read') {
      res.status(400).json({ error: 'Invalid system key. Must be "favorites" or "want-to-read"' });
      return;
    }

    const collection = await getSystemCollection(userId, systemKey);

    if (!collection) {
      res.status(404).json({ error: 'System collection not found' });
      return;
    }

    res.json(collection);
  } catch (error) {
    logError('collections.routes', error, { operation: 'getSystemCollection' });
    res.status(500).json({
      error: 'Failed to get system collection',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/collections/promoted
 * Get all promoted collections for the current user (for Series page display).
 * Returns collections with aggregated metadata and series covers for mosaic.
 */
router.get('/promoted', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const collections = await getPromotedCollections(userId);
    res.json({ collections });
  } catch (error) {
    logError('collections.routes', error, { operation: 'getPromotedCollections' });
    res.status(500).json({
      error: 'Failed to get promoted collections',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/collections/:id/expanded
 * Get a collection with all expanded issues, aggregate stats, and next issue.
 * This is optimized for the collection detail page.
 */
router.get('/:id/expanded', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const data = await getCollectionExpanded(userId, id!);

    if (!data) {
      res.status(404).json({ error: 'Collection not found' });
      return;
    }

    res.json(data);
  } catch (error) {
    logError('collections.routes', error, { operation: 'getCollectionExpanded' });
    res.status(500).json({
      error: 'Failed to get expanded collection',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/collections/:id
 * Get a single collection with items
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const collection = await getCollection(userId, id!);

    if (!collection) {
      res.status(404).json({ error: 'Collection not found' });
      return;
    }

    res.json(collection);
  } catch (error) {
    logError('collections.routes', error, { operation: 'getCollection' });
    res.status(500).json({
      error: 'Failed to get collection',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/collections
 * Create a new collection for the current user
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, description, deck, rating, notes, visibility, readingMode, tags } = req.body as {
      name: string;
      description?: string;
      deck?: string;
      rating?: number;
      notes?: string;
      visibility?: 'public' | 'private' | 'unlisted';
      readingMode?: 'single' | 'double' | 'webtoon';
      tags?: string;
    };

    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const collection = await createCollection(userId, { name, description, deck, rating, notes, visibility, readingMode, tags });
    res.status(201).json(collection);
  } catch (error) {
    logError('collections.routes', error, { operation: 'createCollection' });
    res.status(400).json({
      error: 'Failed to create collection',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/collections/:id
 * Update a collection
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const {
      name, description, deck, sortOrder,
      // Lock flags
      lockName, lockDeck, lockDescription, lockPublisher, lockStartYear, lockEndYear, lockGenres,
      // Override metadata
      overridePublisher, overrideStartYear, overrideEndYear, overrideGenres,
      // New fields
      rating, notes, visibility, readingMode, tags
    } = req.body as {
      name?: string;
      description?: string;
      deck?: string;
      sortOrder?: number;
      // Lock flags
      lockName?: boolean;
      lockDeck?: boolean;
      lockDescription?: boolean;
      lockPublisher?: boolean;
      lockStartYear?: boolean;
      lockEndYear?: boolean;
      lockGenres?: boolean;
      // Override metadata
      overridePublisher?: string | null;
      overrideStartYear?: number | null;
      overrideEndYear?: number | null;
      overrideGenres?: string | null;
      // New fields
      rating?: number | null;
      notes?: string | null;
      visibility?: 'public' | 'private' | 'unlisted';
      readingMode?: 'single' | 'double' | 'webtoon' | null;
      tags?: string | null;
    };

    const collection = await updateCollection(userId, id!, {
      name, description, deck, sortOrder,
      lockName, lockDeck, lockDescription, lockPublisher, lockStartYear, lockEndYear, lockGenres,
      overridePublisher, overrideStartYear, overrideEndYear, overrideGenres,
      rating, notes, visibility, readingMode, tags
    });
    res.json(collection);
  } catch (error) {
    logError('collections.routes', error, { operation: 'updateCollection' });
    res.status(400).json({
      error: 'Failed to update collection',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/collections/:id
 * Delete a collection (fails for system collections)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    await deleteCollection(userId, id!);
    res.json({ success: true });
  } catch (error) {
    logError('collections.routes', error, { operation: 'deleteCollection' });
    res.status(400).json({
      error: 'Failed to delete collection',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Collection Items
// =============================================================================

/**
 * POST /api/collections/:id/items
 * Add items to a collection
 */
router.post('/:id/items', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { items } = req.body as {
      items: Array<{ seriesId?: string; fileId?: string; notes?: string }>;
    };

    if (!items || !Array.isArray(items)) {
      res.status(400).json({ error: 'items must be an array' });
      return;
    }

    const added = await addItemsToCollection(userId, id!, items);
    res.status(201).json({ added: added.length, items: added });
  } catch (error) {
    logError('collections.routes', error, { operation: 'addItemsToCollection' });
    res.status(400).json({
      error: 'Failed to add items to collection',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/collections/:id/items
 * Remove items from a collection
 */
router.delete('/:id/items', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { items } = req.body as {
      items: Array<{ seriesId?: string; fileId?: string }>;
    };

    if (!items || !Array.isArray(items)) {
      res.status(400).json({ error: 'items must be an array' });
      return;
    }

    const removed = await removeItemsFromCollection(userId, id!, items);
    res.json({ removed });
  } catch (error) {
    logError('collections.routes', error, { operation: 'removeItemsFromCollection' });
    res.status(400).json({
      error: 'Failed to remove items from collection',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/collections/:id/items/reorder
 * Reorder items within a collection
 */
router.put('/:id/items/reorder', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { itemIds } = req.body as { itemIds: string[] };

    if (!itemIds || !Array.isArray(itemIds)) {
      res.status(400).json({ error: 'itemIds must be an array' });
      return;
    }

    await reorderItems(userId, id!, itemIds);
    res.json({ success: true });
  } catch (error) {
    logError('collections.routes', error, { operation: 'reorderItems' });
    res.status(400).json({
      error: 'Failed to reorder collection items',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/collections/:id/check
 * Check if a series or file is in a collection
 */
router.get('/:id/check', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { seriesId, fileId } = req.query as { seriesId?: string; fileId?: string };

    const inCollection = await isInCollection(userId, id!, seriesId, fileId);
    res.json({ inCollection });
  } catch (error) {
    logError('collections.routes', error, { operation: 'isInCollection' });
    res.status(500).json({
      error: 'Failed to check collection membership',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// System Collection Shortcuts
// =============================================================================

/**
 * POST /api/collections/toggle-favorite
 * Toggle an item in the Favorites collection for the current user
 */
router.post('/toggle-favorite', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { seriesId, fileId } = req.body as { seriesId?: string; fileId?: string };

    if (!seriesId && !fileId) {
      res.status(400).json({ error: 'Either seriesId or fileId is required' });
      return;
    }

    const result = await toggleSystemCollection(userId, 'favorites', seriesId, fileId);
    res.json(result);
  } catch (error) {
    logError('collections.routes', error, { operation: 'toggleFavorite' });
    res.status(400).json({
      error: 'Failed to toggle favorite',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/collections/toggle-want-to-read
 * Toggle an item in the Want to Read collection for the current user
 */
router.post('/toggle-want-to-read', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { seriesId, fileId } = req.body as { seriesId?: string; fileId?: string };

    if (!seriesId && !fileId) {
      res.status(400).json({ error: 'Either seriesId or fileId is required' });
      return;
    }

    const result = await toggleSystemCollection(userId, 'want-to-read', seriesId, fileId);
    res.json(result);
  } catch (error) {
    logError('collections.routes', error, { operation: 'toggleWantToRead' });
    res.status(400).json({
      error: 'Failed to toggle want to read',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/collections/bulk-toggle-favorite
 * Bulk add or remove multiple series from the Favorites collection
 */
router.post('/bulk-toggle-favorite', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { seriesIds, action } = req.body as { seriesIds: string[]; action: 'add' | 'remove' };

    if (!seriesIds || !Array.isArray(seriesIds) || seriesIds.length === 0) {
      res.status(400).json({ error: 'seriesIds must be a non-empty array' });
      return;
    }

    if (action !== 'add' && action !== 'remove') {
      res.status(400).json({ error: 'action must be "add" or "remove"' });
      return;
    }

    const result = await bulkToggleSystemCollection(userId, 'favorites', seriesIds, action);
    res.json(result);
  } catch (error) {
    logError('collections', error, { action: 'bulk-toggle-favorites' });
    res.status(400).json({
      error: 'Failed to bulk toggle favorites',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/collections/bulk-toggle-want-to-read
 * Bulk add or remove multiple series from the Want to Read collection
 */
router.post('/bulk-toggle-want-to-read', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { seriesIds, action } = req.body as { seriesIds: string[]; action: 'add' | 'remove' };

    if (!seriesIds || !Array.isArray(seriesIds) || seriesIds.length === 0) {
      res.status(400).json({ error: 'seriesIds must be a non-empty array' });
      return;
    }

    if (action !== 'add' && action !== 'remove') {
      res.status(400).json({ error: 'action must be "add" or "remove"' });
      return;
    }

    const result = await bulkToggleSystemCollection(userId, 'want-to-read', seriesIds, action);
    res.json(result);
  } catch (error) {
    logError('collections', error, { action: 'bulk-toggle-want-to-read' });
    res.status(400).json({
      error: 'Failed to bulk toggle want to read',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Unavailable Items Management
// =============================================================================

/**
 * GET /api/collections/unavailable-count
 * Get count of unavailable items across all collections for the current user.
 * Items become unavailable when their referenced file/series is deleted.
 */
router.get('/unavailable-count', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const count = await getUnavailableItemCount(userId);
    res.json({ count });
  } catch (error) {
    logError('collections', error, { action: 'get-unavailable-count' });
    res.status(500).json({
      error: 'Failed to get unavailable count',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/collections/unavailable
 * Remove all unavailable items from all collections for the current user.
 * Call this to clean up orphaned collection references.
 */
router.delete('/unavailable', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const removed = await removeUnavailableItems(userId);
    res.json({ removed });
  } catch (error) {
    logError('collections', error, { action: 'remove-unavailable-items' });
    res.status(500).json({
      error: 'Failed to remove unavailable items',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/collections/:id/promote
 * Toggle promotion status for a collection.
 */
router.post('/:id/promote', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id: collectionId } = req.params;

    if (!collectionId) {
      return res.status(400).json({ error: 'Collection ID is required' });
    }

    const collection = await toggleCollectionPromotion(userId, collectionId);
    return res.json({ collection });
  } catch (error) {
    logError('collections', error, { action: 'toggle-promotion' });
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({
      error: 'Failed to toggle collection promotion',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/collections/:id/cover
 * Update collection cover source.
 * Body: { coverType: 'auto' | 'series' | 'issue' | 'custom', sourceId?: string }
 */
router.put('/:id/cover', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id: collectionId } = req.params;
    const { coverType, sourceId } = req.body;

    if (!collectionId) {
      return res.status(400).json({ error: 'Collection ID is required' });
    }

    if (!coverType) {
      return res.status(400).json({ error: 'Cover type is required' });
    }

    const validTypes = ['auto', 'series', 'issue', 'custom'];
    if (!validTypes.includes(coverType)) {
      return res.status(400).json({
        error: `Invalid cover type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    const collection = await updateCollectionCover(
      userId,
      collectionId,
      coverType,
      sourceId
    );
    return res.json({ collection });
  } catch (error) {
    logError('collections', error, { action: 'update-cover' });
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({
      error: 'Failed to update collection cover',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/collections/:id/cover/upload
 * Upload a custom cover image from file.
 * Multipart form data with 'cover' field.
 */
router.post('/:id/cover/upload', coverUpload.single('cover'), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id: collectionId } = req.params;

    if (!collectionId) {
      return res.status(400).json({ error: 'Collection ID is required' });
    }

    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Import cover service dynamically to avoid circular dependencies
    const { saveUploadedCover } = await import('../services/cover.service.js');

    // Save the uploaded image
    const result = await saveUploadedCover(file.buffer);

    if (!result.success || !result.coverHash) {
      return res.status(400).json({ error: result.error || 'Failed to process uploaded image' });
    }

    // Update collection with the new cover hash
    const collection = await setCollectionCoverHash(userId, collectionId, result.coverHash);

    logInfo('collections', `Uploaded custom cover for collection ${collectionId}: ${result.coverHash}`);
    return res.json({ collection, coverHash: result.coverHash });
  } catch (error) {
    logError('collections', error, { action: 'upload-cover' });
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({
      error: 'Failed to upload collection cover',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/collections/:id/cover/url
 * Set collection cover from a URL.
 * Body: { url: string }
 */
router.post('/:id/cover/url', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id: collectionId } = req.params;
    const { url } = req.body;

    if (!collectionId) {
      return res.status(400).json({ error: 'Collection ID is required' });
    }

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Import cover service dynamically
    const { downloadApiCover } = await import('../services/cover.service.js');

    // Download and save the cover from URL
    const result = await downloadApiCover(url);

    if (!result.success || !result.coverHash) {
      return res.status(400).json({ error: result.error || 'Failed to download cover from URL' });
    }

    // Update collection with the new cover hash
    const collection = await setCollectionCoverHash(userId, collectionId, result.coverHash);

    logInfo('collections', `Set cover from URL for collection ${collectionId}: ${result.coverHash}`);
    return res.json({ collection, coverHash: result.coverHash });
  } catch (error) {
    logError('collections', error, { action: 'set-cover-from-url' });
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({
      error: 'Failed to set collection cover from URL',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/collections/:id/cover/preview
 * Generate a preview of the auto-mosaic cover for this collection.
 * Returns the image directly (not cached) for settings drawer preview.
 */
router.get('/:id/cover/preview', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id: collectionId } = req.params;

    if (!collectionId) {
      return res.status(400).json({ error: 'Collection ID is required' });
    }

    // Get collection to verify ownership
    const collection = await getCollection(userId, collectionId);
    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    // Import cover service dynamically
    const { generateMosaicPreview } = await import('../services/cover.service.js');
    const { getDatabase } = await import('../services/database.service.js');
    const db = getDatabase();

    // Get first 4 series from collection items
    const seriesItems = await db.collectionItem.findMany({
      where: {
        collectionId,
        seriesId: { not: null },
        isAvailable: true,
      },
      orderBy: { position: 'asc' },
      take: 4,
      select: { seriesId: true },
    });

    // Get series cover data for each
    const seriesCovers: Array<{
      id: string;
      coverHash?: string | null;
      coverFileId?: string | null;
      firstIssueId?: string | null;
    }> = [];

    for (const item of seriesItems) {
      if (item.seriesId) {
        const series = await db.series.findUnique({
          where: { id: item.seriesId },
          select: {
            id: true,
            coverHash: true,
            coverFileId: true,
          },
        });

        if (series) {
          // Get first issue separately (ordered by filename)
          const firstIssue = await db.comicFile.findFirst({
            where: { seriesId: item.seriesId },
            orderBy: [{ filename: 'asc' }],
            select: { id: true },
          });

          seriesCovers.push({
            id: series.id,
            coverHash: series.coverHash,
            coverFileId: series.coverFileId,
            firstIssueId: firstIssue?.id ?? null,
          });
        }
      }
    }

    // Generate preview
    const previewBuffer = await generateMosaicPreview(seriesCovers);

    if (!previewBuffer) {
      return res.status(404).json({ error: 'No series covers available for preview' });
    }

    // Return image directly
    res.set({
      'Content-Type': 'image/jpeg',
      'Content-Length': previewBuffer.length.toString(),
      'Cache-Control': 'no-store', // Don't cache preview
    });
    return res.send(previewBuffer);
  } catch (error) {
    logError('collections', error, { action: 'generate-cover-preview' });
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({
      error: 'Failed to generate collection cover preview',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/collections/:id/progress
 * Get aggregate reading progress for a collection.
 */
router.get('/:id/progress', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id: collectionId } = req.params;

    if (!collectionId) {
      return res.status(400).json({ error: 'Collection ID is required' });
    }

    const progress = await getCollectionReadingProgress(userId, collectionId);
    return res.json(progress);
  } catch (error) {
    logError('collections', error, { action: 'get-progress' });
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({
      error: 'Failed to get collection progress',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/collections/:id/metadata
 * Update collection metadata overrides.
 * Body: { overridePublisher?, overrideStartYear?, overrideEndYear?, overrideGenres? }
 */
router.put('/:id/metadata', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id: collectionId } = req.params;
    const { overridePublisher, overrideStartYear, overrideEndYear, overrideGenres } =
      req.body;

    if (!collectionId) {
      return res.status(400).json({ error: 'Collection ID is required' });
    }

    const collection = await updateCollectionMetadata(userId, collectionId, {
      overridePublisher,
      overrideStartYear,
      overrideEndYear,
      overrideGenres,
    });
    return res.json({ collection });
  } catch (error) {
    logError('collections', error, { action: 'update-metadata' });
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({
      error: 'Failed to update collection metadata',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Smart Collection Routes
// =============================================================================

/**
 * POST /api/collections/:id/smart/refresh
 * Manually refresh a smart collection (full re-evaluation)
 * Waits for cover regeneration and returns full collection data
 */
router.post('/:id/smart/refresh', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id: collectionId } = req.params;

    if (!collectionId) {
      return res.status(400).json({ error: 'Collection ID is required' });
    }

    const result = await refreshSmartCollection(collectionId, userId);

    // Wait for cover regeneration if items changed
    if (result.added > 0 || result.removed > 0) {
      await regenerateMosaicSync(collectionId);
    }

    // Return full collection data with updated coverHash
    const collection = await getCollectionExpanded(userId, collectionId);

    return res.json({
      success: true,
      added: result.added,
      removed: result.removed,
      collection,
    });
  } catch (error) {
    logError('collections', error, { action: 'smart-refresh' });
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({
      error: 'Failed to refresh smart collection',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * PUT /api/collections/:id/smart/filter
 * Update the smart filter definition for a collection
 */
router.put('/:id/smart/filter', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id: collectionId } = req.params;
    const { filter, scope } = req.body as { filter: SmartFilter; scope: SmartScope };

    if (!collectionId) {
      return res.status(400).json({ error: 'Collection ID is required' });
    }

    if (!filter || !scope) {
      return res.status(400).json({ error: 'Filter and scope are required' });
    }

    if (!['series', 'files'].includes(scope)) {
      return res.status(400).json({ error: 'Scope must be "series" or "files"' });
    }

    await updateSmartFilter(collectionId, userId, filter, scope);
    return res.json({ success: true });
  } catch (error) {
    logError('collections', error, { action: 'update-smart-filter' });
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({
      error: 'Failed to update smart filter',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/collections/:id/smart/convert
 * Convert a regular collection to a smart collection
 */
router.post('/:id/smart/convert', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id: collectionId } = req.params;
    const { filter, scope } = req.body as { filter: SmartFilter; scope: SmartScope };

    if (!collectionId) {
      return res.status(400).json({ error: 'Collection ID is required' });
    }

    if (!filter || !scope) {
      return res.status(400).json({ error: 'Filter and scope are required' });
    }

    const result = await convertToSmartCollection(collectionId, userId, filter, scope);
    return res.json({
      success: true,
      added: result.added,
      removed: result.removed,
    });
  } catch (error) {
    logError('collections', error, { action: 'convert-to-smart' });
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({
      error: 'Failed to convert to smart collection',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * DELETE /api/collections/:id/smart
 * Convert a smart collection back to a regular collection
 */
router.delete('/:id/smart', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id: collectionId } = req.params;

    if (!collectionId) {
      return res.status(400).json({ error: 'Collection ID is required' });
    }

    await convertToRegularCollection(collectionId, userId);
    return res.json({ success: true });
  } catch (error) {
    logError('collections', error, { action: 'convert-to-regular' });
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({
      error: 'Failed to convert to regular collection',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/collections/:id/smart/whitelist
 * Toggle whitelist status for an item in a smart collection
 * Returns updated collection data
 */
router.post('/:id/smart/whitelist', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id: collectionId } = req.params;
    const { seriesId, fileId } = req.body as { seriesId?: string; fileId?: string };

    if (!collectionId) {
      return res.status(400).json({ error: 'Collection ID is required' });
    }

    if (!seriesId && !fileId) {
      return res.status(400).json({ error: 'Either seriesId or fileId is required' });
    }

    const isWhitelisted = await toggleWhitelist(collectionId, userId, seriesId, fileId);

    // Return full collection data with updated items
    const collection = await getCollectionExpanded(userId, collectionId);

    return res.json({ success: true, isWhitelisted, collection });
  } catch (error) {
    logError('collections', error, { action: 'toggle-whitelist' });
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({
      error: 'Failed to toggle whitelist',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/collections/:id/smart/blacklist
 * Toggle blacklist status for an item in a smart collection
 * Returns updated collection data
 */
router.post('/:id/smart/blacklist', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id: collectionId } = req.params;
    const { seriesId, fileId } = req.body as { seriesId?: string; fileId?: string };

    if (!collectionId) {
      return res.status(400).json({ error: 'Collection ID is required' });
    }

    if (!seriesId && !fileId) {
      return res.status(400).json({ error: 'Either seriesId or fileId is required' });
    }

    const isBlacklisted = await toggleBlacklist(collectionId, userId, seriesId, fileId);

    // Return full collection data with updated items
    const collection = await getCollectionExpanded(userId, collectionId);

    return res.json({ success: true, isBlacklisted, collection });
  } catch (error) {
    logError('collections', error, { action: 'toggle-blacklist' });
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({
      error: 'Failed to toggle blacklist',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/collections/:id/smart/overrides
 * Get whitelist and blacklist items for a smart collection
 */
router.get('/:id/smart/overrides', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id: collectionId } = req.params;

    if (!collectionId) {
      return res.status(400).json({ error: 'Collection ID is required' });
    }

    const overrides = await getSmartCollectionOverrides(collectionId, userId);
    return res.json(overrides);
  } catch (error) {
    logError('collections', error, { action: 'get-overrides' });
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({
      error: 'Failed to get smart collection overrides',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
