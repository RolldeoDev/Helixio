/**
 * Collections Routes
 *
 * API endpoints for collection management:
 * - CRUD operations for collections
 * - Add/remove items from collections
 * - Query collections for items
 * - Toggle system collections (Favorites, Want to Read)
 */

import { Router, Request, Response } from 'express';
import {
  getCollections,
  getCollection,
  createCollection,
  updateCollection,
  deleteCollection,
  addItemsToCollection,
  removeItemsFromCollection,
  reorderItems,
  getCollectionsForItem,
  isInCollection,
  toggleSystemCollection,
  getSystemCollection,
  getUnavailableItemCount,
  removeUnavailableItems,
} from '../services/collection.service.js';

const router = Router();

// =============================================================================
// Collection CRUD
// =============================================================================

/**
 * GET /api/collections
 * Get all collections with item counts
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const collections = await getCollections();
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
 * Get all collections containing a specific series or file
 */
router.get('/for-item', async (req: Request, res: Response) => {
  try {
    const { seriesId, fileId } = req.query as { seriesId?: string; fileId?: string };

    const collections = await getCollectionsForItem(seriesId, fileId);
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
 * Get a system collection by key
 */
router.get('/system/:systemKey', async (req: Request, res: Response) => {
  try {
    const { systemKey } = req.params;

    if (systemKey !== 'favorites' && systemKey !== 'want-to-read') {
      res.status(400).json({ error: 'Invalid system key. Must be "favorites" or "want-to-read"' });
      return;
    }

    const collection = await getSystemCollection(systemKey);

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
 * GET /api/collections/:id
 * Get a single collection with items
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const collection = await getCollection(id!);

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
 * Create a new collection
 */
router.post('/', async (req: Request, res: Response) => {
  try {
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

    const collection = await createCollection({ name, description, iconName, color });
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
    const { id } = req.params;
    const { name, description, iconName, color, sortOrder } = req.body as {
      name?: string;
      description?: string;
      iconName?: string;
      color?: string;
      sortOrder?: number;
    };

    const collection = await updateCollection(id!, { name, description, iconName, color, sortOrder });
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
    const { id } = req.params;
    await deleteCollection(id!);
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
    const { id } = req.params;
    const { items } = req.body as {
      items: Array<{ seriesId?: string; fileId?: string; notes?: string }>;
    };

    if (!items || !Array.isArray(items)) {
      res.status(400).json({ error: 'items must be an array' });
      return;
    }

    const added = await addItemsToCollection(id!, items);
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
    const { id } = req.params;
    const { items } = req.body as {
      items: Array<{ seriesId?: string; fileId?: string }>;
    };

    if (!items || !Array.isArray(items)) {
      res.status(400).json({ error: 'items must be an array' });
      return;
    }

    const removed = await removeItemsFromCollection(id!, items);
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
    const { id } = req.params;
    const { itemIds } = req.body as { itemIds: string[] };

    if (!itemIds || !Array.isArray(itemIds)) {
      res.status(400).json({ error: 'itemIds must be an array' });
      return;
    }

    await reorderItems(id!, itemIds);
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
    const { id } = req.params;
    const { seriesId, fileId } = req.query as { seriesId?: string; fileId?: string };

    const inCollection = await isInCollection(id!, seriesId, fileId);
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
 * Toggle an item in the Favorites collection
 */
router.post('/toggle-favorite', async (req: Request, res: Response) => {
  try {
    const { seriesId, fileId } = req.body as { seriesId?: string; fileId?: string };

    if (!seriesId && !fileId) {
      res.status(400).json({ error: 'Either seriesId or fileId is required' });
      return;
    }

    const result = await toggleSystemCollection('favorites', seriesId, fileId);
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
 * Toggle an item in the Want to Read collection
 */
router.post('/toggle-want-to-read', async (req: Request, res: Response) => {
  try {
    const { seriesId, fileId } = req.body as { seriesId?: string; fileId?: string };

    if (!seriesId && !fileId) {
      res.status(400).json({ error: 'Either seriesId or fileId is required' });
      return;
    }

    const result = await toggleSystemCollection('want-to-read', seriesId, fileId);
    res.json(result);
  } catch (error) {
    console.error('Error toggling want to read:', error);
    res.status(400).json({
      error: 'Failed to toggle want to read',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// =============================================================================
// Unavailable Items Management
// =============================================================================

/**
 * GET /api/collections/unavailable-count
 * Get count of unavailable items across all collections.
 * Items become unavailable when their referenced file/series is deleted.
 */
router.get('/unavailable-count', async (_req: Request, res: Response) => {
  try {
    const count = await getUnavailableItemCount();
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
 * Remove all unavailable items from all collections.
 * Call this to clean up orphaned collection references.
 */
router.delete('/unavailable', async (_req: Request, res: Response) => {
  try {
    const removed = await removeUnavailableItems();
    res.json({ removed });
  } catch (error) {
    console.error('Error removing unavailable items:', error);
    res.status(500).json({
      error: 'Failed to remove unavailable items',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
