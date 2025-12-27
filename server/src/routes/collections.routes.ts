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
} from '../services/collection.service.js';

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
    console.error('Error getting collections:', error);
    res.status(500).json({
      error: 'Failed to get collections',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/collections/for-item
 * Get all collections containing a specific series or file for the current user
 */
router.get('/for-item', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { seriesId, fileId } = req.query as { seriesId?: string; fileId?: string };

    const collections = await getCollectionsForItem(userId, seriesId, fileId);
    res.json({ collections });
  } catch (error) {
    console.error('Error getting collections for item:', error);
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
    console.error('Error getting system collection:', error);
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
    console.error('Error getting promoted collections:', error);
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
    console.error('Error getting expanded collection:', error);
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
    console.error('Error getting collection:', error);
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
    const { name, description, iconName, color } = req.body as {
      name: string;
      description?: string;
      iconName?: string;
      color?: string;
    };

    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const collection = await createCollection(userId, { name, description, iconName, color });
    res.status(201).json(collection);
  } catch (error) {
    console.error('Error creating collection:', error);
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
    const { name, description, iconName, color, sortOrder } = req.body as {
      name?: string;
      description?: string;
      iconName?: string;
      color?: string;
      sortOrder?: number;
    };

    const collection = await updateCollection(userId, id!, { name, description, iconName, color, sortOrder });
    res.json(collection);
  } catch (error) {
    console.error('Error updating collection:', error);
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
    console.error('Error deleting collection:', error);
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
    console.error('Error adding items to collection:', error);
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
    console.error('Error removing items from collection:', error);
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
    console.error('Error reordering collection items:', error);
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
    console.error('Error checking collection membership:', error);
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
    console.error('Error toggling favorite:', error);
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
    console.error('Error toggling want to read:', error);
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
    console.error('Error bulk toggling favorites:', error);
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
    console.error('Error bulk toggling want to read:', error);
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
    console.error('Error getting unavailable count:', error);
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
    console.error('Error removing unavailable items:', error);
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
    console.error('Error toggling collection promotion:', error);
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
    console.error('Error updating collection cover:', error);
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

    console.log(`Uploaded custom cover for collection ${collectionId}: ${result.coverHash}`);
    return res.json({ collection, coverHash: result.coverHash });
  } catch (error) {
    console.error('Error uploading collection cover:', error);
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

    console.log(`Set cover from URL for collection ${collectionId}: ${result.coverHash}`);
    return res.json({ collection, coverHash: result.coverHash });
  } catch (error) {
    console.error('Error setting collection cover from URL:', error);
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
    console.error('Error generating collection cover preview:', error);
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
    console.error('Error getting collection progress:', error);
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
    console.error('Error updating collection metadata:', error);
    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    return res.status(500).json({
      error: 'Failed to update collection metadata',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
